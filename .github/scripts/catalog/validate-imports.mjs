import { builtinModules } from 'node:module';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));

export async function validateImports(packageRoot, directory) {
  const packagePath = await realpath(packageRoot);
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(file);
      } else if (entry.isFile() && /\.(?:mjs|js|cjs)$/.test(entry.name)) {
        const text = await readFile(file, 'utf8');
        if (/\b(?:require|createRequire)\s*\(/.test(text)) throw new Error(`${file}: require/createRequire is unsupported; review and use literal ESM imports`);
        const imports = /\b(?:import\s*(?:\(\s*([^)]*?)\s*\)|(?:[\w*$\s{},]*?\s+from\s*)?(['"])([^'"]+)\2)|export\s+(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s*(['"])([^'"]+)\4)/g;
        for (const match of text.matchAll(imports)) {
          let specifier = match[3] ?? match[5];
          if (match[1] !== undefined) {
            const literal = /^(['"])([^'"]+)\1$/.exec(match[1]);
            if (!literal) throw new Error(`${file}: dynamic import must use a literal specifier`);
            specifier = literal[2];
          }
          if (specifier === '@github/copilot-sdk/extension' || builtins.has(specifier.replace(/^node:/, ''))) continue;
          if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
            throw new Error(`${file}: unsupported import ${specifier}`);
          }
          const target = path.resolve(path.dirname(file), specifier);
          const rel = path.relative(packagePath, target);
          if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
            throw new Error(`${file}: import escapes package root: ${specifier}`);
          }
          const stat = await lstat(target);
          if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${file}: import is not a contained file: ${specifier}`);
          const resolved = path.relative(packagePath, await realpath(target));
          if (resolved === '..' || resolved.startsWith(`..${path.sep}`) || path.isAbsolute(resolved)) {
            throw new Error(`${file}: import escapes package root: ${specifier}`);
          }
        }
      }
    }
  }
  await visit(directory);
}
