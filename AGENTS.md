# Agent guidance

This repository curates reusable tooling for GitHub Copilot and other AI coding agents.

## Commands

- `npm ci`: install the locked Node dependencies.
- `npm run build`: regenerate the root resource index.
- `npm run validate`: run tests, resource validation, Markdown lint, and codespell.

Node.js 22 and npm are required; validation also requires Python and codespell 2.4.1.

## Boundaries

- ✅ Always: keep standalone skills separate from self-contained plugin skills; update the index when resources change.
- ⚠️ Ask first: introduce new resource categories or alter public conventions.
- 🚫 Never: copy content from the archived private commercial repository or commit credentials.

See `CONTRIBUTING.md` for resource conventions and validation requirements.
