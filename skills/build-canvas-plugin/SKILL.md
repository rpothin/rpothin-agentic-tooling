---
name: build-canvas-plugin
description: "Guides repository-local authoring of a skills and canvas plugin. Use when composing a new canvas plugin in this repository. Do NOT use for deploying plugins, provider authorization, or general canvas-only extensions."
metadata:
  client: copilot-only
---

# Build a canvas plugin

Work in this repository checkout. Capture the scenario's operations, existing
tools, identity and evidence scope, UI states, and promised state lifetime.
Do not assume provider credentials or authorize external writes.
See `references/scenario-brief.md` when defining those decisions.

1. Load the native `create-canvas` skill and its SDK guide. Use its scaffold
   and lifecycle instructions; do not copy the skill or invent host APIs.
2. Author the scenario skill under `skills/<name>/` and the canvas extension
   under `extensions/<id>/`. Keep runtime dependencies and skill references
   inside their respective source directories. Do not rely on repository
   `node_modules` in the installed package.
3. Compose a plugin under `plugins/<name>/` using the repository-owned
   `io.github.rpothin.agentic-tooling` namespace. Its `client` label is
   required; its `skills` and `extensions` arrays refer to root source
   directories, for example `./skills/example` and `./extensions/example`.
   Adapt `assets/plugin-source.json` and add the matching marketplace entry.
4. Run `npm run build`, then `npm run validate`. Materialize into a new
   directory outside the checkout with
   `node .github/scripts/catalog/materialize-plugins.mjs <plugin-name> <new-staging-directory>`.
   Inspect the staged package, including its contained skills, references,
   extension files and manifest. Source composition arrays are build-only;
   the owner/client metadata remains.
5. Validate scenario contracts and native discovery against the staged package.
   Record what was actually checked and any missing capabilities. Native
   canvas behavior, provider authorization, and remote distribution require
   their own evidence; a static package check does not prove them.

Use the installed native guidance for canvas API signatures and security
boundaries. Do not install third-party runtimes merely to follow this recipe.
