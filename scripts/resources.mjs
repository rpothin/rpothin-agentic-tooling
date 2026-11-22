import { readdir, readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

const namespace = 'io.github.rpothin.agentic-tooling';
const labels = new Set(['copilot-only', 'portable']);
const fileName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const markdownParser = new MarkdownIt();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

async function assertContained(root, file) {
  const resolvedRoot = await realpath(root);
  const resolvedFile = await realpath(file);
  const rel = path.relative(resolvedRoot, resolvedFile);
  assert(rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel),
    `${file}: path escapes plugin root`);
}

async function inspectPluginFiles(root, dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    const stat = await lstat(file);
    assert(!stat.isSymbolicLink(), `${file}: symbolic links are not allowed in plugins`);
    if (stat.isDirectory()) await inspectPluginFiles(root, file);
    else if (stat.isFile() && file.endsWith('.md')) {
      const text = await readFile(file, 'utf8');
      await validateLinks(root, file, entry.name === 'SKILL.md' ? matter(text).content : text);
    }
  }
}

async function validateLinks(pluginRoot, file, text) {
  const tokens = markdownParser.parse(text, {});
  const links = tokens.flatMap((token) => token.children ?? [])
    .filter((token) => token.type === 'link_open' || token.type === 'image')
    .map((token) => token.attrGet(token.type === 'image' ? 'src' : 'href'));
  for (const link of links) {
    const target = link.split('#')[0].split('?')[0];
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
    assert(!path.isAbsolute(target) && !target.includes('\\'), `${file}: invalid link ${target}`);
    await assertContained(pluginRoot, path.resolve(path.dirname(file), decodeURIComponent(target)));
  }
}

function containedPortablePath(base, target, root, message) {
  const resolved = path.posix.resolve(base, target.replace(/\\/g, '/'));
  assert(resolved === root || resolved.startsWith(`${root}/`), message);
  return resolved;
}

function validateMcpArguments(server, cwd, file) {
  const dataRoot = '/plugin-data';
  const pluginRoot = '/plugin-root';
  const base = cwd ?? pluginRoot;
  for (const arg of server.args ?? []) {
    const normalized = arg.replace(/\\/g, '/');
    let target = normalized;
    let referenceBase = base;
    let allowedRoot = base === dataRoot || base.startsWith(`${dataRoot}/`) ? dataRoot : pluginRoot;
    if (/^\$\{PLUGIN_ROOT\}(?:\/|$)/.test(normalized)) {
      target = normalized.slice('${PLUGIN_ROOT}'.length).replace(/^\//, '');
      referenceBase = pluginRoot;
      allowedRoot = pluginRoot;
    } else if (/^\$\{PLUGIN_DATA\}(?:\/|$)/.test(normalized)) {
      target = normalized.slice('${PLUGIN_DATA}'.length).replace(/^\//, '');
      referenceBase = dataRoot;
      allowedRoot = dataRoot;
    } else if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.startsWith('~/')) {
      throw new Error(`${file}: absolute MCP argument path is not portable: ${arg}`);
    } else if (normalized.startsWith('-') || /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
      (!normalized.includes('/') && normalized !== '..')) {
      continue;
    }
    containedPortablePath(referenceBase, target, allowedRoot, `${file}: MCP argument escapes ${allowedRoot === dataRoot ? 'PLUGIN_DATA' : 'plugin root'}: ${arg}`);
  }
}

function localPaths(value, callback) {
  if (typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'))) callback(value);
  else if (Array.isArray(value)) value.forEach((v) => localPaths(v, callback));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => localPaths(v, callback));
}

export async function collectResources(root) {
  const ajv = new Ajv({ allErrors: true });
  const ajv2020 = new Ajv2020({ allErrors: true });
  const validators = {};
  for (const type of ['agent', 'instruction', 'skill']) {
    validators[type] = ajv.compile(await readJson(path.join(root, '.schemas', `${type}.schema.json`)));
  }
  validators.plugin = ajv2020.compile(await readJson(path.join(root, '.schemas', 'plugin.schema.json')));
  validators.mcp = ajv2020.compile(await readJson(path.join(root, '.schemas', 'mcp.schema.json')));

  const result = { agents: [], instructions: [], skills: [], plugins: [] };
  const standaloneSkills = [];
  const pluginSkills = [];
  function check(type, data, file) {
    const validate = validators[type];
    assert(validate(data), `${file}: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
  }
  async function markdown(file, type) {
    const text = await readFile(file, 'utf8');
    assert(/^---\r?\n/.test(text), `${file}: missing YAML frontmatter`);
    assert(/^---[ \t]*\r?$/m.test(text.slice(text.indexOf('\n') + 1)), `${file}: missing closing YAML frontmatter delimiter`);
    const { data, content } = matter(text);
    check(type, data, file);
    return { data, content };
  }
  async function skills(dir, pluginRoot) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'README.md' && !pluginRoot && entry.isFile()) continue;
      if (pluginRoot && !entry.isDirectory()) continue;
      if (pluginRoot && !(await readdir(path.join(dir, entry.name))).includes('SKILL.md')) continue;
      assert(entry.isDirectory() && fileName.test(entry.name), `${dir}: unexpected entry ${entry.name}`);
      const file = path.join(dir, entry.name, 'SKILL.md');
      const { data, content } = await markdown(file, 'skill');
      assert(data.name === entry.name, `${file}: name must match directory`);
      result.skills.push({ name: data.name, description: data.description, client: data.metadata.client, file: relative(root, file) });
      (pluginRoot ? pluginSkills : standaloneSkills).push({ name: data.name, file, content: content.replace(/\r\n/g, '\n').trim() });
    }
  }
  for (const [dir, type, suffix] of [['agents', 'agent', '.agent.md'], ['instructions', 'instruction', '.instructions.md']]) {
    for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
      if (entry.name === 'README.md' && entry.isFile()) continue;
      assert(entry.isFile() && entry.name.endsWith(suffix) && fileName.test(entry.name.slice(0, -suffix.length)),
        `${dir}: unexpected entry ${entry.name}`);
      const file = path.join(root, dir, entry.name);
      const { data } = await markdown(file, type);
      result[dir].push({ ...data, file: relative(root, file) });
    }
  }
  await skills(path.join(root, 'skills'));
  for (const entry of await readdir(path.join(root, 'plugins'), { withFileTypes: true })) {
    if (entry.name === 'README.md' && entry.isFile()) continue;
    assert(entry.isDirectory(), `plugins: unexpected entry ${entry.name}`);
    const dir = path.join(root, 'plugins', entry.name);
    await inspectPluginFiles(dir, dir);
    const file = path.join(dir, 'plugin.json');
    const data = await readJson(file);
    check('plugin', data, file);
    assert(data.name === entry.name, `${file}: name must match directory`);
    assert(typeof data.description === 'string' && data.description.trim(), `${file}: description is required`);
    const client = data.extensions?.[namespace]?.client;
    assert(labels.has(client), `${file}: missing or invalid ${namespace}.client`);
    const paths = [];
    localPaths(data.extensions, (p) => paths.push(p));
    for (const p of paths) await assertContained(dir, path.resolve(dir, p));
    const entries = await readdir(dir, { withFileTypes: true });
    const mcpFile = entries.find((e) => e.name === 'mcp.json');
    if (mcpFile) {
      assert(mcpFile.isFile(), `${dir}/mcp.json must be a file`);
      const mcp = await readJson(path.join(dir, 'mcp.json'));
      check('mcp', mcp, path.join(dir, 'mcp.json'));
      for (const [name, server] of Object.entries(mcp.mcpServers)) {
        if (server.type !== 'stdio') {
          const url = new URL(server.url);
          assert(!url.username && !url.password && !url.hash &&
            (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))),
          `${dir}/mcp.json: invalid URL for ${name}`);
          continue;
        }
        assert(!/\s/.test(server.command), `${dir}/mcp.json: command must be one token`);
        if (server.command.startsWith('./')) await assertContained(dir, path.resolve(dir, server.command));
        else assert(!/[\\/]/.test(server.command), `${dir}/mcp.json: command must be plugin-relative or a bare executable`);
        let argumentCwd;
        if (server.cwd) {
          const cwd = server.cwd.replace(/^\$\{PLUGIN_ROOT\}/, '.');
          if (cwd.startsWith('${PLUGIN_DATA}')) {
            argumentCwd = containedPortablePath('/plugin-data', cwd.slice('${PLUGIN_DATA}'.length).replace(/^\//, ''), '/plugin-data', `${dir}/mcp.json: cwd escapes PLUGIN_DATA`);
          } else {
            const portableCwd = cwd.replace(/\\/g, '/');
            argumentCwd = containedPortablePath('/plugin-root', portableCwd, '/plugin-root', `${dir}/mcp.json: cwd escapes plugin root`);
            await assertContained(dir, path.resolve(dir, portableCwd));
          }
        }
        validateMcpArguments(server, argumentCwd, path.join(dir, 'mcp.json'));
      }
    }
    const skillDir = entries.find((e) => e.name === 'skills');
    if (skillDir) {
      assert(skillDir.isDirectory(), `${dir}/skills must be a directory`);
      await skills(path.join(dir, 'skills'), dir);
    }
    result.plugins.push({ name: data.name, description: data.description, client, file: relative(root, file) });
  }
  for (const standalone of standaloneSkills) {
    for (const bundled of pluginSkills) {
      assert(standalone.name !== bundled.name && (!standalone.content || standalone.content !== bundled.content),
        `${standalone.file}: duplicates plugin skill ${bundled.file}`);
    }
  }
  const marketplace = await readJson(path.join(root, '.github', 'plugin', 'marketplace.json'));
  assert(marketplace.name === 'rpothin-agentic-tooling' && Array.isArray(marketplace.plugins), 'Invalid marketplace name or plugins array');
  const seen = new Set();
  for (const entry of marketplace.plugins) {
    assert(entry && typeof entry === 'object' && typeof entry.name === 'string', 'Invalid marketplace entry');
    const plugin = result.plugins.find((item) => item.name === entry.name);
    assert(plugin && entry.source === `plugins/${entry.name}` && entry.description === plugin.description,
      `Marketplace entry ${entry.name} does not match a local plugin`);
    assert(!seen.has(entry.name), `Duplicate marketplace entry ${entry.name}`);
    seen.add(entry.name);
  }
  for (const plugin of result.plugins) assert(seen.has(plugin.name), `Plugin ${plugin.name} is missing from marketplace`);
  for (const items of Object.values(result)) items.sort((a, b) => a.file.localeCompare(b.file, 'en'));
  return result;
}

const escape = (text) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function renderReadme(resources) {
  const sections = [['Agents', 'agents'], ['Instructions', 'instructions'], ['Skills', 'skills'], ['Plugins', 'plugins']];
  const lines = [
    '# rpothin-agentic-tooling', '',
    "Raphaël Pothin's personal collection of agents, skills, instructions, and plugins for GitHub Copilot and other AI coding agents. Inspired by [awesome-copilot](https://github.com/github/awesome-copilot), maintained by one person, and open to ideas and feedback.", '',
    '<!-- Generated by npm run build; do not edit this file directly. -->', ''
  ];
  for (const [title, key] of sections) {
    lines.push(`## ${title}`, '');
    if (!resources[key].length) lines.push('No resources yet.', '');
    else {
      lines.push('| Name | Description | Client |', '| --- | --- | --- |');
      for (const item of resources[key]) lines.push(`| [${escape(item.name)}](${encodeURI(item.file)}) | ${escape(item.description)} | ${item.client} |`);
      lines.push('');
    }
  }
  lines.push('See [CONTRIBUTING.md](CONTRIBUTING.md) to propose a change and run validation.', '');
  return lines.join('\n');
}
