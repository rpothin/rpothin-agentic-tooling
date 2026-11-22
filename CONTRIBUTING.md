# Contributing

This is a personal, curated collection. Ideas and feedback are welcome. Before opening a pull request, please open an issue to discuss the proposed change. The maintainer reviews each PR case by case and may merge it, rework it, or implement the idea separately with credit.

## Resource conventions

Use descriptive lowercase hyphenated filenames. Agents use `agents/<name>.agent.md`, instructions use `instructions/<name>.instructions.md`, and standalone skills use `skills/<name>/SKILL.md`. Plugin skills belong inside `plugins/<plugin-name>/skills/<name>/SKILL.md`, never in the root skills directory. Plugin packages must be self-contained and use Agent Plugins v1 fixed locations.

Each agent and instruction has YAML frontmatter with nonempty `name`, `description`, and `client` (`copilot-only` or `portable`). Instructions also require `applyTo`. Agents may specify `tools` as a string or an array; omitting it allows the client defaults, while an empty array disables tools in GitHub Copilot. Skill frontmatter requires `name`, `description`, and `metadata.client` with the same label values. The skill name must match its folder and follow the Agent Skills specification. Standalone and plugin skills must not share a name or the same Markdown instruction body.

Each plugin has a root `plugin.json` conforming to the [Agent Plugins v1 specification](https://agent-plugins.org/specification), with nonempty `description` and `extensions["io.github.rpothin.agentic-tooling"].client` set to the client label. The plugin name matches its folder. Add a corresponding entry to `.github/plugin/marketplace.json` using `name`, `source: "plugins/<name>"`, and `description`, matching the manifest. No plugin may reference files outside its own folder.

The validator checks explicit path-shaped MCP arguments and `${PLUGIN_ROOT}` or `${PLUGIN_DATA}` references for containment. MCP arguments can also be opaque strings, flags, or runtime-generated paths, so review those manually for external dependencies. `${PLUGIN_DATA}` is reserved for client-managed writable data, not bundled plugin files. Symbolic links are not allowed in plugin packages.

## Local checks

Install Node.js 22 and Python, then run `npm ci` and `python -m pip install codespell==2.4.1`. Run `npm run build` after changing resource metadata, then run `npm run validate`. Validation checks metadata schemas, plugin and marketplace consistency, the generated index, Markdown, spelling, and focused validator tests.

Participation is subject to the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are covered by the repository's [MIT license](LICENSE).
