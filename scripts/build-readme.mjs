import { writeFile } from 'node:fs/promises';
import { collectResources, renderReadme } from './resources.mjs';

const root = process.cwd();
try {
  const readme = renderReadme(await collectResources(root));
  await writeFile('README.md', readme);
  console.log('Generated README.md');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
