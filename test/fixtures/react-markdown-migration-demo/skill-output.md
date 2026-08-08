# Demo Skill Output

This folder is an isolated demo for the `react-markdown-to-markstream-react` skill.
The main repository is not a real `react-markdown` consumer, so this fixture exists to show what a meaningful audit and migration result would look like.

## Audit Summary

- Found 2 `react-markdown` call sites in this demo fixture.
- Classified 1 call site as direct migration and 1 as advanced/plugin-heavy migration.
- Safe direct migrations were applied in `after-basic.tsx` and `after-advanced.tsx`.
- Manual review is still required for HTML policy and element allowlisting.

## Call Sites

| File | Classification | Why |
|---|---|---|
| `before-basic.tsx` | direct | Plain `<Markdown>{markdown}</Markdown>` usage |
| `before-advanced.tsx` | renderer-custom + plugin-heavy + security-heavy | Uses `components`, `remark-gfm`, `rehype-raw`, `allowedElements`, and `urlTransform` |

## Direct Mappings Applied

| `react-markdown` usage | `markstream-react` migration |
|---|---|
| `children` | `content` |
| `components.h1` | `setCustomComponents('migration-demo', { heading })` with `node.level` |
| `components.a` | custom `link` renderer |
| `components.code` | default `code_block` renderer (stream-diffs powered) |
| `urlTransform` | link rewrite logic moved into the custom `link` renderer |

## Manual Review Items

### `rehypeRaw`

`markstream-react` does not expose a public `rehype` stage.
If the old app relied on `rehypeRaw` for standard HTML rendering, verify the new HTML behavior.
If it relied on trusted custom tags, prefer `customHtmlTags` plus `setCustomComponents`.

### `allowedElements`

There is no direct `allowedElements` prop in `markstream-react`.
If exact allowlisting still matters, filter the parsed node tree before rendering.

### Security parity

The new renderer sanitizes blocked tags, dangerous event-handler attributes, and unsafe URLs in built-in HTML renderers, but it is still not a byte-for-byte replacement for a repo-specific `rehype` sanitization stack.

## Suggested User-Facing Skill Result

1. Replace `react-markdown` with `markstream-react` for direct call sites first.
2. Convert HTML-tag-based `components` overrides into node-type-based `setCustomComponents`.
3. Remove `remark-gfm` only after checking rendered tables, task lists, and other edge cases.
4. Revisit any `rehype`-based HTML and security logic before claiming migration completeness.
5. Adopt `nodes` + `parseMarkdownToStructure` later only if the app actually needs streaming updates.
