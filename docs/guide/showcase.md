---
description: Showcase demos for markstream-vue 1.0 across streaming chat, long documents, code review, diagrams, custom components, and safe repro workflows.
---

# Showcase

Use these demos when evaluating or presenting `markstream-vue@1.0`. The stable 1.0 scope is the Vue 3 renderer; cross-framework labs remain experimental comparison surfaces.

| Demo | What it shows | Entry |
| --- | --- | --- |
| AI Chat Streaming | Typewriter pacing, smooth streaming, reverse-flex chat scroll, retry/pause controls. | [Playground](https://markstream-vue.simonhe.me/) |
| Diagnostic Studio | Shareable repro links, render-mode switching, sample switching, annotations, PDF export, sandbox checks. | [Test Lab](https://markstream-vue.simonhe.me/test) |
| Code Review / Diff | Monaco diff rendering, MarkdownCodeBlock fallback, streaming code block behavior. | [Test Lab diff sample](https://markstream-vue.simonhe.me/test?sample=diff) |
| Diagram Heavy | Progressive Mermaid, D2, Infographic, and heavy-block viewport scheduling. | [Test Lab baseline sample](https://markstream-vue.simonhe.me/test?sample=baseline) |
| Thinking / Custom Components | Trusted `<thinking>` tags, nested Markdown, custom Vue components inside Markdown. | [Test Lab thinking sample](https://markstream-vue.simonhe.me/test?sample=thinking) |
| Safe HTML / Repro Lab | Safe HTML policy, escaped unsafe content, issue-ready reproduction input. | [Test Lab stress sample](https://markstream-vue.simonhe.me/test?sample=stress) |
| Mermaid Export Override | Override Mermaid rendering and intercept export events. | [Mermaid export demo](https://markstream-vue.simonhe.me/mermaid-export-demo) |
| CDN Peer Loading | KaTeX and Mermaid loaded from CDN peers with worker setup. | [CDN peers demo](https://markstream-vue.simonhe.me/cdn-peers) |

## 1.0 launch path

For launch material, start with:

- [Playground](https://markstream-vue.simonhe.me/) for the primary streaming story.
- [Test Lab](https://markstream-vue.simonhe.me/test) for reproducible examples and share links.
- [1.0 Benchmark Report](/guide/benchmark-1-0) for measured performance evidence.

When sharing benchmark claims, cite a generated report from `pnpm benchmark:1.0` or the `1.0 Benchmark` GitHub Actions artifact.
