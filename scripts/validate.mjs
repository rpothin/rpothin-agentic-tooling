import { readFile } from 'node:fs/promises';
import { collectResources, renderReadme } from './resources.mjs';

try {
  const expected = renderReadme(await collectResources(process.cwd()));
  const actual = await readFile('README.md', 'utf8');
  if (actual !== expected) throw new Error('README.md is stale; run npm run build');
  console.log('Resource metadata, marketplace, and README index are valid.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
