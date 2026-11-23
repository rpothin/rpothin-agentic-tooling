# Standalone skills

Place each canonical skill in `<name>/SKILL.md`. Its frontmatter requires `name`, `description`, and `metadata.client`; the name must match the directory. Plugins may declare copies of these sources for materialization into their own `skills/` directories. See [contributing](../CONTRIBUTING.md).

For repository-local canvas plugin authoring, direct the agent to read `skills/build-canvas-plugin/SKILL.md`. Root skill sources are not automatically installed into the client.
