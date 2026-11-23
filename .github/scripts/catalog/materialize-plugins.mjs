import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectResources } from '../../../scripts/resources.mjs';
import { composition, materializePlugin } from './composition.mjs';
import { validateImports } from './validate-imports.mjs';

async function compareTrees(source, copy) {
  const entries = (await readdir(source, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  const copied = (await readdir(copy, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length !== copied.length || entries.some((entry, i) => entry.name !== copied[i].name || entry.isDirectory() !== copied[i].isDirectory())) {
    throw new Error(`${copy}: materialized inventory differs from source`);
  }
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(copy, entry.name);
    if (entry.isDirectory()) await compareTrees(from, to);
    else if (!(await readFile(from)).equals(await readFile(to))) throw new Error(`${to}: materialized file differs from source`);
  }
}

export async function buildPlugin(root, pluginName, destination) {
  await collectResources(root);
  const resolvedDestination = path.resolve(destination);
  const parent = await realpath(path.dirname(resolvedDestination));
  const target = path.join(parent, path.basename(resolvedDestination));
  const rootPath = await realpath(root);
  const rel = path.relative(rootPath, target);
  if (!(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))) {
    throw new Error('Staging destination must be outside the source repository');
  }
  const stage = await mkdtemp(path.join(parent, '.canvas-stage-'));
  try {
    await cp(path.join(root, '.schemas'), path.join(stage, '.schemas'), { recursive: true });
    for (const dir of ['agents', 'instructions', 'skills', 'plugins', '.github/plugin']) {
      await mkdir(path.join(stage, dir), { recursive: true });
    }
    const served = path.join(stage, 'plugins', pluginName);
    await materializePlugin(root, pluginName, served);
    const manifest = JSON.parse(await readFile(path.join(root, 'plugins', pluginName, 'plugin.json'), 'utf8'));
    const sources = await composition(root, manifest);
    for (const [kind, entries] of Object.entries(sources)) {
      for (const entry of entries) {
        const copy = kind === 'skills' ? path.join(served, 'skills', entry.name)
          : path.join(served, 'com.github.copilot', 'extensions', entry.name);
        await compareTrees(entry.source, copy);
      }
    }
    await writeFile(path.join(stage, '.github', 'plugin', 'marketplace.json'), JSON.stringify({
      name: 'rpothin-agentic-tooling',
      plugins: [{ name: pluginName, source: `plugins/${pluginName}`, description: manifest.description }]
    }));
    await collectResources(stage);
    const extensionRoot = path.join(served, 'com.github.copilot', 'extensions');
    let extensionRootExists = false;
    try {
      if (!(await lstat(extensionRoot)).isDirectory()) throw new Error(`${extensionRoot}: must be a directory`);
      extensionRootExists = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (extensionRootExists) await validateImports(served, extensionRoot);
    // Reserve the destination atomically; never replace an existing package.
    await mkdir(target);
    try {
      for (const name of await readdir(served)) {
        await cp(path.join(served, name), path.join(target, name), { recursive: true, errorOnExist: true, force: false });
      }
    } catch (error) {
      await rm(target, { recursive: true, force: true });
      throw error;
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [plugin, destination] = process.argv.slice(2);
  if (!plugin || !destination || process.argv.length !== 4) {
    console.error('Usage: node .github/scripts/catalog/materialize-plugins.mjs <plugin-name> <new-staging-directory>');
    process.exitCode = 1;
  } else {
    try {
      await buildPlugin(process.cwd(), plugin, destination);
      console.log(`Materialized ${plugin} at ${destination}`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
