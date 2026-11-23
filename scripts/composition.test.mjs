import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPlugin } from '../.github/scripts/catalog/materialize-plugins.mjs';
import { collectResources } from './resources.mjs';

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'canvas-composition-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'repo');
  await mkdir(root);
  await cp('.schemas', path.join(root, '.schemas'), { recursive: true });
  for (const dir of ['agents', 'instructions', 'skills/sample/references', 'extensions/panel', 'plugins/sample', '.github/plugin']) {
    await mkdir(path.join(root, dir), { recursive: true });
  }
  const manifest = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'sample', description: 'Synthetic package',
    extensions: {
      'io.github.rpothin.agentic-tooling': {
        client: 'copilot-only', note: 'keep', skills: ['./skills/sample'], extensions: ['./extensions/panel']
      },
      'com.example.client': { setting: true }
    }
  };
  await writeFile(path.join(root, 'plugins/sample/plugin.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, '.github/plugin/marketplace.json'), JSON.stringify({
    name: 'rpothin-agentic-tooling', plugins: [{ name: 'sample', source: 'plugins/sample', description: manifest.description }]
  }));
  await writeFile(path.join(root, 'skills/sample/SKILL.md'), '---\nname: sample\ndescription: Sample\nmetadata:\n  client: copilot-only\n---\n[Reference](references/example.md)\n');
  await writeFile(path.join(root, 'skills/sample/references/example.md'), 'Example\n');
  await writeFile(path.join(root, 'extensions/panel/extension.mjs'), 'export const fixture = true;\n');
  return { base, root, manifest, output: path.join(base, 'output') };
}

test('materializes contained source trees and preserves manifest metadata', async (t) => {
  const { root, manifest, output } = await fixture(t);
  const original = await readFile(path.join(root, 'plugins/sample/plugin.json'), 'utf8');
  await buildPlugin(root, 'sample', output);
  assert.equal(await readFile(path.join(root, 'plugins/sample/plugin.json'), 'utf8'), original);
  assert.equal(await readFile(path.join(output, 'skills/sample/references/example.md'), 'utf8'), 'Example\n');
  assert.equal(await readFile(path.join(output, 'com.github.copilot/extensions/panel/extension.mjs'), 'utf8'), 'export const fixture = true;\n');
  const served = JSON.parse(await readFile(path.join(output, 'plugin.json'), 'utf8'));
  assert.deepEqual(served.extensions['io.github.rpothin.agentic-tooling'], { client: 'copilot-only', note: 'keep' });
  assert.deepEqual(served.extensions['com.example.client'], manifest.extensions['com.example.client']);
  await assert.rejects(buildPlugin(root, 'sample', output), /exist/i);
});

test('rejects invalid and missing composition sources without touching output', async (t) => {
  const { root, manifest, output } = await fixture(t);
  const file = path.join(root, 'plugins/sample/plugin.json');
  for (const value of ['../skills/sample', './skills/../sample', './skills/sample/nested', './skills/missing', './skills\\sample']) {
    manifest.extensions['io.github.rpothin.agentic-tooling'].skills = [value];
    await writeFile(file, JSON.stringify(manifest));
    await assert.rejects(buildPlugin(root, 'sample', output));
  }
  manifest.extensions['io.github.rpothin.agentic-tooling'].skills = ['./skills/sample', './skills/sample'];
  await writeFile(file, JSON.stringify(manifest));
  await assert.rejects(collectResources(root), /duplicate/);
});

test('rejects collision and source or output escape', async (t) => {
  const { root, manifest, output } = await fixture(t);
  await assert.rejects(buildPlugin(root, 'sample', path.join(root, 'output')), /outside/);
  await mkdir(path.join(root, 'plugins/sample/skills/sample'), { recursive: true });
  await assert.rejects(collectResources(root), /collision/);
  await rm(path.join(root, 'plugins/sample/skills'), { recursive: true });
  manifest.extensions['com.example.client'].file = '../../skills/sample/SKILL.md';
  await writeFile(path.join(root, 'plugins/sample/plugin.json'), JSON.stringify(manifest));
  await assert.rejects(collectResources(root), /escapes plugin root/);
  delete manifest.extensions['com.example.client'].file;
  await writeFile(path.join(root, 'plugins/sample/plugin.json'), JSON.stringify(manifest));
  await symlink(path.join(root, 'skills/sample'), path.join(root, 'extensions/panel/link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(buildPlugin(root, 'sample', output), /symbolic links/);
});

test('validates supported literal imports in the served package', async (t) => {
  const { root, output } = await fixture(t);
  const dir = path.join(root, 'extensions/panel');
  await writeFile(path.join(dir, 'helper.mjs'), 'export const value = 1;\n');
  const file = path.join(dir, 'extension.mjs');
  for (const [source, expected] of [
    ["import './missing.mjs';", /ENOENT/],
    ["import '../../../../outside.mjs';", /escapes package root/],
    ["export * as escaped from '../../../../outside.mjs';", /escapes package root/],
    ["import dependency from 'other-package';", /unsupported import/],
    ['import(computed);', /dynamic import must use a literal/],
    ["require('./helper.mjs');", /require\/createRequire is unsupported/]
  ]) {
    await writeFile(file, source);
    await assert.rejects(buildPlugin(root, 'sample', output), expected);
  }
  await writeFile(file, "import './helper.mjs';\nimport { readFile } from 'node:fs/promises';\n");
  await buildPlugin(root, 'sample', output);
});

test('follows reachable package-local JavaScript imports without looping', async (t) => {
  const { root, output } = await fixture(t);
  const extension = path.join(root, 'extensions/panel/extension.mjs');
  const helper = path.join(root, 'plugins/sample/helper.mjs');
  await writeFile(extension, "import '../../../helper.mjs';\n");
  await writeFile(helper, "export * from '../outside.mjs';\n");
  await assert.rejects(buildPlugin(root, 'sample', output), /helper\.mjs: import escapes package root/);
  await writeFile(helper, "import './helper.mjs';\nexport const value = true;\n");
  await buildPlugin(root, 'sample', output);
});

test('rejects independently authored duplicate plugin skills without root skills', async (t) => {
  const { root, manifest } = await fixture(t);
  manifest.extensions['io.github.rpothin.agentic-tooling'].skills = undefined;
  await writeFile(path.join(root, 'plugins/sample/plugin.json'), JSON.stringify(manifest));
  await rm(path.join(root, 'skills/sample'), { recursive: true });
  for (const name of ['one', 'two']) {
    await mkdir(path.join(root, 'plugins/sample/skills', name), { recursive: true });
    await writeFile(path.join(root, 'plugins/sample/skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: Example\nmetadata:\n  client: portable\n---\nSame instructions\n`);
  }
  await assert.rejects(collectResources(root), /duplicates plugin skill/);
});

test('rejects a junction at the plugin source root', async (t) => {
  const { base, root, output } = await fixture(t);
  const outside = path.join(base, 'outside-plugins');
  await cp(path.join(root, 'plugins'), outside, { recursive: true });
  await rm(path.join(root, 'plugins'), { recursive: true });
  await symlink(outside, path.join(root, 'plugins'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(buildPlugin(root, 'sample', output), /invalid source root/);
});

test('allows two products to compose the same canonical skill without duplicate index entries', async (t) => {
  const { base, root, manifest, output } = await fixture(t);
  const other = { ...manifest, name: 'other', description: 'Another product' };
  await mkdir(path.join(root, 'plugins/other'));
  await writeFile(path.join(root, 'plugins/other/plugin.json'), JSON.stringify(other));
  await writeFile(path.join(root, '.github/plugin/marketplace.json'), JSON.stringify({
    name: 'rpothin-agentic-tooling',
    plugins: [
      { name: 'sample', source: 'plugins/sample', description: manifest.description },
      { name: 'other', source: 'plugins/other', description: other.description }
    ]
  }));
  assert.equal((await collectResources(root)).skills.length, 1);
  await buildPlugin(root, 'sample', output);
  await buildPlugin(root, 'other', path.join(base, 'other-output'));
  assert.deepEqual(await readFile(path.join(output, 'skills/sample/SKILL.md')),
    await readFile(path.join(base, 'other-output/skills/sample/SKILL.md')));
});
