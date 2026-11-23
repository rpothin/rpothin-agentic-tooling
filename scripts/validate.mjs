import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectResources, renderReadme } from './resources.mjs';
import { buildPlugin } from '../.github/scripts/catalog/materialize-plugins.mjs';

try {
  const resources = await collectResources(process.cwd());
  const expected = renderReadme(resources);
  const actual = await readFile('README.md', 'utf8');
  if (actual !== expected) throw new Error('README.md is stale; run npm run build');
  if (resources.plugins.length) {
    const stage = await mkdtemp(path.join(os.tmpdir(), 'agentic-plugin-validation-'));
    try {
      for (const plugin of resources.plugins) await buildPlugin(process.cwd(), plugin.name, path.join(stage, plugin.name));
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
  console.log('Resource metadata, marketplace, and README index are valid.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
