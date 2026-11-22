import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectResources, renderReadme } from './resources.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentic-tooling-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp('.schemas', path.join(root, '.schemas'), { recursive: true });
  for (const dir of ['agents', 'instructions', 'skills', 'plugins', '.github/plugin']) {
    await mkdir(path.join(root, dir), { recursive: true });
  }
  await writeFile(path.join(root, '.github/plugin/marketplace.json'), JSON.stringify({ name: 'rpothin-agentic-tooling', plugins: [] }));
  return root;
}

async function addPlugin(root) {
  const dir = path.join(root, 'plugins', 'sample');
  await mkdir(dir, { recursive: true });
  const manifest = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'sample',
    description: 'Sample plugin',
    extensions: { 'io.github.rpothin.agentic-tooling': { client: 'portable' } }
  };
  await writeFile(path.join(dir, 'plugin.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, '.github/plugin/marketplace.json'), JSON.stringify({
    name: 'rpothin-agentic-tooling',
    plugins: [{ name: 'sample', source: 'plugins/sample', description: 'Sample plugin' }]
  }));
  return dir;
}

test('empty repository yields explicit placeholders', async (t) => {
  const resources = await collectResources(await fixture(t));
  assert.match(renderReadme(resources), /## Agents\n\nNo resources yet\./);
  assert.deepEqual(resources.plugins, []);
});

test('validation rejects a stale index', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'README.md'), 'Outdated\n');
  const script = path.resolve('scripts', 'validate.mjs');
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /README.md is stale/);
  await writeFile(path.join(root, 'README.md'), renderReadme(await collectResources(root)));
  const valid = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
});

test('indexes standalone and plugin skills with client labels', async (t) => {
  const root = await fixture(t);
  const plugin = await addPlugin(root);
  await mkdir(path.join(root, 'skills', 'standalone'));
  await mkdir(path.join(plugin, 'skills', 'bundled'), { recursive: true });
  await writeFile(path.join(root, 'skills', 'standalone', 'SKILL.md'), '---\nname: standalone\ndescription: Standalone skill\nmetadata:\n  client: portable\n---\nContent\n');
  await writeFile(path.join(plugin, 'skills', 'bundled', 'SKILL.md'), '---\nname: bundled\ndescription: Bundled skill\nmetadata:\n  client: copilot-only\n---\nBundled content\n');
  const index = renderReadme(await collectResources(root));
  assert.match(index, /\[standalone\]\(skills\/standalone\/SKILL.md\).*portable/);
  assert.match(index, /\[bundled\]\(plugins\/sample\/skills\/bundled\/SKILL.md\).*copilot-only/);
  assert.match(index, /\[sample\]\(plugins\/sample\/plugin.json\).*portable/);
});

test('rejects invalid skill name and missing client label', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'skills', 'sample'));
  await writeFile(path.join(root, 'skills', 'sample', 'SKILL.md'), '---\nname: wrong\ndescription: A skill\nmetadata:\n  client: portable\n---\n');
  await assert.rejects(collectResources(root), /name must match directory/);
  await writeFile(path.join(root, 'skills', 'sample', 'SKILL.md'), '---\nname: sample\ndescription: A skill\n---\n');
  await assert.rejects(collectResources(root), /metadata/);
});

test('rejects missing marketplace entries and escaping plugin links', async (t) => {
  const root = await fixture(t);
  const plugin = await addPlugin(root);
  await writeFile(path.join(root, '.github/plugin/marketplace.json'), JSON.stringify({ name: 'rpothin-agentic-tooling', plugins: [] }));
  await assert.rejects(collectResources(root), /missing from marketplace/);
  await addPlugin(root);
  await mkdir(path.join(plugin, 'skills', 'sample-skill'), { recursive: true });
  await writeFile(path.join(plugin, 'skills', 'sample-skill', 'SKILL.md'), '---\nname: sample-skill\ndescription: A skill\nmetadata:\n  client: portable\n---\n[escape](../../../../.github/plugin/marketplace.json)\n');
  await assert.rejects(collectResources(root), /escapes plugin root/);
});

test('rejects invalid manifest and MCP configuration', async (t) => {
  const root = await fixture(t);
  const plugin = await addPlugin(root);
  await writeFile(path.join(plugin, 'mcp.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { bad: { type: 'stdio', command: '../outside' } } }));
  await assert.rejects(collectResources(root), /command must be plugin-relative/);
  await writeFile(path.join(plugin, 'plugin.json'), JSON.stringify({ name: 'sample', description: 'Missing schema' }));
  await assert.rejects(collectResources(root), /schema/);
});

test('requires a closing frontmatter delimiter for every resource type', async (t) => {
  const root = await fixture(t);
  const plugin = await addPlugin(root);
  await mkdir(path.join(root, 'skills', 'example'));
  await mkdir(path.join(plugin, 'skills', 'example'), { recursive: true });
  const cases = [
    [path.join(root, 'agents', 'example.agent.md'), 'name: Example\ndescription: Example\nclient: portable\n'],
    [path.join(root, 'instructions', 'example.instructions.md'), 'name: Example\ndescription: Example\nclient: portable\napplyTo: "**"\n'],
    [path.join(root, 'skills', 'example', 'SKILL.md'), 'name: example\ndescription: Example\nmetadata:\n  client: portable\n'],
    [path.join(plugin, 'skills', 'example', 'SKILL.md'), 'name: example\ndescription: Example\nmetadata:\n  client: portable\n']
  ];
  for (const [file, header] of cases) {
    await writeFile(file, `---\n${header}`);
    await assert.rejects(collectResources(root), /missing closing YAML frontmatter delimiter/);
    await rm(file);
    if (file.endsWith('SKILL.md')) await rm(path.dirname(file), { recursive: true });
  }
});

test('supports Copilot default, string, and array agent tools', async (t) => {
  const root = await fixture(t);
  const file = path.join(root, 'agents', 'example.agent.md');
  const header = '---\nname: Example\ndescription: Example\nclient: copilot-only\n';
  for (const tools of ['', 'tools: read, search\n', 'tools: []\n', 'tools: [read, search]\n']) {
    await writeFile(file, `${header}${tools}---\nAgent instructions\n`);
    assert.equal((await collectResources(root)).agents.length, 1);
  }
  await writeFile(file, `${header}tools: 42\n---\nAgent instructions\n`);
  await assert.rejects(collectResources(root), /tools/);
});

test('rejects duplicated standalone and plugin skills by name or instruction body', async (t) => {
  const root = await fixture(t);
  const plugin = await addPlugin(root);
  const standalone = path.join(root, 'skills', 'example');
  const bundled = path.join(plugin, 'skills', 'example');
  await mkdir(standalone);
  await mkdir(bundled, { recursive: true });
  const skill = (name, body) => `---\nname: ${name}\ndescription: Example\nmetadata:\n  client: portable\n---\n${body}\n`;
  await writeFile(path.join(standalone, 'SKILL.md'), skill('example', 'Shared instructions'));
  await writeFile(path.join(bundled, 'SKILL.md'), skill('example', 'Different instructions'));
  await assert.rejects(collectResources(root), /duplicates plugin skill/);
  const renamed = path.join(plugin, 'skills', 'renamed');
  await mkdir(renamed);
  await rm(bundled, { recursive: true });
  await writeFile(path.join(renamed, 'SKILL.md'), skill('renamed', 'Shared instructions'));
  await assert.rejects(collectResources(root), /duplicates plugin skill/);
  await writeFile(path.join(renamed, 'SKILL.md'), skill('renamed', 'Different instructions'));
  assert.equal((await collectResources(root)).skills.length, 2);
});

test('ignores non-skills in the plugin discovery directory', async (t) => {
  const root = await fixture(t);
  const plugin = await addPlugin(root);
  const skillsDir = path.join(plugin, 'skills');
  await mkdir(path.join(skillsDir, 'not-a-skill'), { recursive: true });
  await writeFile(path.join(skillsDir, '.gitkeep'), '');
  await writeFile(path.join(skillsDir, 'README.md'), 'Discovery notes\n');
  assert.deepEqual((await collectResources(root)).skills, []);
});

test('checks real Markdown links but ignores code examples', async (t) => {
  const root = await fixture(t);
  const plugin = await addPlugin(root);
  const readme = path.join(plugin, 'README.md');
  await writeFile(readme, '# Examples\n\n`[inline](missing.md)`\n\n```markdown\n[fenced](missing.md)\n```\n');
  await mkdir(path.join(plugin, 'skills', 'sample-skill'), { recursive: true });
  await writeFile(path.join(plugin, 'skills', 'sample-skill', 'SKILL.md'), '---\nname: sample-skill\ndescription: "[example](missing.md)"\nmetadata:\n  client: portable\n---\nSkill instructions\n');
  await collectResources(root);
  await writeFile(readme, '# Links\n\n[reference][outside]\n\n[outside]: ../../.github/plugin/marketplace.json\n');
  await assert.rejects(collectResources(root), /escapes plugin root/);
});

test('rejects MCP data cwd escapes on Windows and POSIX', async (t) => {
  const root = await fixture(t);
  const plugin = await addPlugin(root);
  const mcp = path.join(plugin, 'mcp.json');
  const config = (cwd) => JSON.stringify({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { server: { type: 'stdio', command: 'node', cwd } }
  });
  for (const cwd of ['${PLUGIN_DATA}/..\\outside', '${PLUGIN_DATA}/nested/../../outside', '${PLUGIN_DATA}/nested\\..\\..\\outside']) {
    await writeFile(mcp, config(cwd));
    await assert.rejects(collectResources(root), /cwd escapes PLUGIN_DATA/);
  }
  for (const cwd of ['${PLUGIN_DATA}', '${PLUGIN_DATA}/nested/../inside', '${PLUGIN_DATA}/nested\\inside']) {
    await writeFile(mcp, config(cwd));
    await collectResources(root);
  }
});

test('checks explicit MCP argument paths without interpreting opaque arguments', async (t) => {
  const root = await fixture(t);
  const plugin = await addPlugin(root);
  const mcp = path.join(plugin, 'mcp.json');
  const config = (args, cwd) => JSON.stringify({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { server: { type: 'stdio', command: 'node', args, ...(cwd && { cwd }) } }
  });
  for (const arg of ['${PLUGIN_ROOT}/../../outside.mjs', '..', '../../outside.mjs', 'config/../../../outside.mjs', '..\\..\\outside.mjs', 'C:\\outside.mjs', '/outside.mjs', '${PLUGIN_DATA}/..\\outside']) {
    await writeFile(mcp, config([arg]));
    await assert.rejects(collectResources(root), /MCP argument/);
  }
  await writeFile(mcp, config(['./server.mjs', '${PLUGIN_ROOT}/data/config.json', '${PLUGIN_DATA}/cache', '--port=8080', '@scope/package', 'https://example.com']));
  await collectResources(root);
  await writeFile(mcp, config(['../outside'], '${PLUGIN_DATA}/nested'));
  await collectResources(root);
});
