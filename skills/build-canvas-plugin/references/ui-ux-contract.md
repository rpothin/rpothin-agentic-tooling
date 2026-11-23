# Canvas UI/UX contract

Design for a GitHub-like experience in the Copilot App, not pixel parity with
another product. The canvas is an isolated document: it receives the
documented App theme contract, not the App's full stylesheet or component
library. Follow the installed `create-canvas` skill's **App theme tokens**
section as the authority for supported attributes and variables. Do not depend
on undocumented App or Primer variables, selectors, or bundled styles.

## Defaults

- Use documented semantic background, text, border, focus and typography
  tokens. Let theme changes update the document; do not hardcode a light-only
  palette. Check any fallback colors for contrast in the contexts they serve.
- Use restrained spacing, borders and surfaces. Prefer a focused list/detail
  layout when the scenario needs selection; avoid adding navigation or panels
  without a purpose.
- Make the primary action clear; distinguish secondary and destructive actions
  through labels and placement as well as color. Never imply that a visual
  control grants authorization for an external operation.
- Distinguish loading, empty, error, partial and stale states when applicable.
  Show evidence coverage and scope when relevant; keep last usable data visibly
  labeled when a refresh fails.
- Use semantic controls, keyboard navigation, visible focus and sufficient
  contrast. Preserve focus and editable drafts during unrelated updates.
  Adapt layouts to narrow panels without clipping essential content or actions.
- Aim for WCAG 2.2 AA contrast: at least 4.5:1 for normal text, 3:1 for
  large text, and 3:1 for visual information needed to identify controls and
  focus indicators against adjacent colors. Decorative borders alone need not
  identify controls.

This illustrative starting point uses documented tokens; fallback values,
spacing and radius are local defaults, not host-provided design tokens. The
color fallbacks are light-only and apply only when the corresponding host
tokens are absent; provide suitable alternatives if supporting that case.

```css
:root {
  --status-bar-color: var(--background-color-default, #ffffff);
}

body {
  margin: 0;
  background: var(--background-color-default, #ffffff);
  color: var(--text-color-default, #1f2328);
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--text-body-medium, 14px);
  line-height: var(--leading-body-medium, 20px);
}

.surface {
  padding: 1rem;
  border: 1px solid var(--border-color-default, #d1d9e0);
  border-radius: 0.375rem;
}

:focus-visible {
  outline: 2px solid var(--color-focus-outline, #0969da);
  outline-offset: 2px;
}
```

The example surface border is decorative, not a sufficient sole boundary for
an interactive control.

## Rendered UI checks

- Inspect the actual canvas in light and dark modes and after an App theme
  change; check contrast and visible focus in each. For standalone canvases,
  check the header color as well. The documented `data-color-mode` and
  `data-dark-theme` attributes can help diagnose theme propagation.
- Exercise a narrow panel and keyboard navigation, including selection and
  actions; verify focus and drafts survive relevant updates.
- Exercise applicable loading, empty, error, partial and stale states and
  confirm their meaning and recovery are clear.
- Briefly compare the rendered experience to the GitHub reference below.
  Record actual results and deviations; a package or discovery check is not
  visual validation.

## Reference and limits

The pinned [GitHub Security canvas overview](https://github.com/github/awesome-copilot/blob/f10fdb8b2660ce85c98f220b2f1ca24653768a5c/extensions/github-security/README.md)
illustrates a focused findings list and actions. Its pinned
[bundled CSS](https://github.com/github/awesome-copilot/blob/f10fdb8b2660ce85c98f220b2f1ca24653768a5c/extensions/github-security/client/assets/index-D4k0QXEX.css)
contains implementation-specific Primer styling; it is an example, not a
dependency or a documented host API. Use it for visual comparison, not as a
stylesheet to copy.

This contract supplies guidance and authoring defaults, not enforced visual
consistency. The initial materialized-fixture discovery smoke did not validate
a renderer, theme behavior, keyboard interaction, or visual appearance.
