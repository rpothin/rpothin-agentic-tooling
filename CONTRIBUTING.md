# Contributing

This is a personal, curated collection. Ideas and feedback are welcome. Before opening a pull request, please open an issue to discuss the proposed change. The maintainer reviews each PR case by case and may merge it, rework it, or implement the idea separately with credit.

## Resource conventions

Use descriptive lowercase hyphenated filenames. Agents use `agents/<name>.agent.md`, instructions use `instructions/<name>.instructions.md`, and canonical skill sources use `skills/<name>/SKILL.md`. Canvas extension sources use `extensions/<id>/extension.mjs`. Plugin packages must be self-contained and use Agent Plugins v1 fixed locations.

Each agent and instruction has YAML frontmatter with nonempty `name`, `description`, and `client` (`copilot-only` or `portable`). Instructions also require `applyTo`. Agents may specify `tools` as a string or an array; omitting it allows the client defaults, while an empty array disables tools in GitHub Copilot. Skill frontmatter requires `name`, `description`, and `metadata.client` with the same label values. The skill name must match its folder and follow the Agent Skills specification. Independently authored root and plugin skills must not share a name or the same Markdown instruction body.

Each plugin has a root `plugin.json` conforming to the [Agent Plugins v1 specification](https://agent-plugins.org/specification), with nonempty `description` and `extensions["io.github.rpothin.agentic-tooling"].client` set to the client label. The plugin name matches its folder. Add a corresponding entry to `.github/plugin/marketplace.json` using `name`, `source: "plugins/<name>"`, and `description`, matching the manifest.

The repository-owned namespace may declare `skills` and `extensions` arrays of exact source paths such as `./skills/example` and `./extensions/example`. These are build metadata, not client discovery fields. Materialization copies complete declared directories into `skills/<name>` and `com.github.copilot/extensions/<id>` in a staged package, strips only those two arrays, and preserves the remaining metadata. Do not also author those destinations inside the source plugin. Other package paths must remain inside the plugin root. Plugin-local skills not declared for composition remain independently authored and subject to duplicate checks.

Run `node .github/scripts/catalog/materialize-plugins.mjs <plugin-name> <new-staging-directory>` from the repository root. The destination must be a new directory outside the checkout. This does not publish a plugin: a source checkout with composition metadata is not the materialized package. The staged check resolves supported literal imports, permitting Node built-ins and the native extension SDK; computed imports and `require` are unsupported. This bounded scan is not a complete JavaScript import-graph proof: review other syntax and runtime file access manually. Do not rely on repository `node_modules` or other source trees.

The validator checks explicit path-shaped MCP arguments and `${PLUGIN_ROOT}` or `${PLUGIN_DATA}` references for containment. MCP arguments can also be opaque strings, flags, or runtime-generated paths, so review those manually for external dependencies. `${PLUGIN_DATA}` is reserved for client-managed writable data, not bundled plugin files. Symbolic links are not allowed in plugin packages.

## Local checks

Install Node.js 22 and Python, then run `npm ci` and `python -m pip install codespell==2.4.1`. Run `npm run build` after changing resource metadata, then run `npm run validate`. Validation checks metadata schemas, plugin and marketplace consistency, the generated index, Markdown, spelling, and focused validator tests.

Participation is subject to the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are covered by the repository's [MIT license](LICENSE).
