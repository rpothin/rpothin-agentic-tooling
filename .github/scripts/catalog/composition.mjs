import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const namespace = 'io.github.rpothin.agentic-tooling';
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function safeTree(root) {
  const stat = await lstat(root);
  assert(!stat.isSymbolicLink(), `${root}: symbolic links are not allowed`);
  assert(stat.isDirectory() || stat.isFile(), `${root}: unsupported filesystem entry`);
  if (stat.isDirectory()) {
    for (const name of await readdir(root)) await safeTree(path.join(root, name));
  }
}

export async function assertNoCollision(parent, name) {
  let entries;
  try {
    entries = await readdir(parent);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  assert(!entries.some((entry) => entry.toLowerCase() === name.toLowerCase()),
    `${parent}: composition destination collision for ${name}`);
}

export async function composition(root, manifest) {
  const owner = manifest.extensions?.[namespace];
  const result = { skills: [], extensions: [] };
  for (const kind of Object.keys(result)) {
    const values = owner?.[kind];
    if (values === undefined) continue;
    assert(Array.isArray(values) && values.length > 0, `${kind}: composition must be a nonempty array`);
    const names = new Set();
    for (const value of values) {
      assert(typeof value === 'string' && value.startsWith(`./${kind}/`), `${kind}: invalid composition path ${value}`);
      const name = value.slice(kind.length + 3);
      assert(namePattern.test(name) && !names.has(name), `${kind}: invalid or duplicate source ${value}`);
      names.add(name);
      const parent = path.join(root, kind);
      const source = path.join(parent, name);
      const parentStat = await lstat(parent);
      assert(parentStat.isDirectory() && !parentStat.isSymbolicLink(), `${parent}: invalid source root`);
      const stat = await lstat(source);
      assert(stat.isDirectory() && !stat.isSymbolicLink(), `${source}: source must be a real directory`);
      const relative = path.relative(await realpath(parent), await realpath(source));
      assert(relative === name, `${source}: source escapes its declared root`);
      await safeTree(source);
      const entry = path.join(source, kind === 'skills' ? 'SKILL.md' : 'extension.mjs');
      assert((await lstat(entry)).isFile(), `${entry}: required source entry missing`);
      result[kind].push({ name, source });
    }
  }
  return result;
}

export async function materializePlugin(root, pluginName, destination) {
  assert(namePattern.test(pluginName), 'Invalid plugin name');
  const pluginsRoot = path.join(root, 'plugins');
  const parentStat = await lstat(pluginsRoot);
  assert(parentStat.isDirectory() && !parentStat.isSymbolicLink(), `${pluginsRoot}: invalid plugin source root`);
  assert(path.relative(await realpath(root), await realpath(pluginsRoot)) === 'plugins',
    `${pluginsRoot}: plugin source root escapes repository`);
  const plugin = path.join(pluginsRoot, pluginName);
  const realRoot = await realpath(root);
  const resolvedDestination = path.resolve(destination);
  const target = path.join(await realpath(path.dirname(resolvedDestination)), path.basename(resolvedDestination));
  const rel = path.relative(realRoot, target);
  assert(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel),
    'Staging destination must be outside the source repository');
  await safeTree(plugin);
  const manifest = JSON.parse(await readFile(path.join(plugin, 'plugin.json'), 'utf8'));
  assert(manifest.name === pluginName, 'Plugin name does not match directory');
  const sources = await composition(root, manifest);
  for (const [kind, entries] of Object.entries(sources)) {
    for (const { name } of entries) {
      const parent = kind === 'skills'
        ? path.join(plugin, 'skills')
        : path.join(plugin, 'com.github.copilot', 'extensions');
      await assertNoCollision(parent, name);
    }
  }
  await cp(plugin, target, { recursive: true, errorOnExist: true, force: false });
  for (const [kind, entries] of Object.entries(sources)) {
    for (const { name, source } of entries) {
      const dest = kind === 'skills'
        ? path.join(target, 'skills', name)
        : path.join(target, 'com.github.copilot', 'extensions', name);
      await mkdir(path.dirname(dest), { recursive: true });
      await cp(source, dest, { recursive: true, errorOnExist: true, force: false });
    }
  }
  const owner = manifest.extensions?.[namespace];
  if (owner) {
    delete owner.skills;
    delete owner.extensions;
  }
  await writeFile(path.join(target, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
