# Scenario brief

Before authoring, identify:

- The bounded operations, selected existing tools, target scope and credential owner.
- The evidence source, retrieval time and coverage; distinguish partial data from a complete result.
- How asynchronous requests are correlated with work and how stale or wrong-scope results are rejected, when applicable.
- Loading, empty, error, partial and stale UI states, with accessible controls and theme tokens.
- Whether state is ephemeral or persisted, where it belongs, and what recovery is actually promised.

Do not treat UI controls or local request admission as authorization for external writes. Add provider-specific authorization and recovery only when separately designed and verified.
