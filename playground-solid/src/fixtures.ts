export const sample = `# Markstream for Solid

Streaming Markdown, 原生 Solid 响应式更新 🚀

This is **bold**, *emphasis*, and \`inline code\`. Open a [safe link](https://solidjs.com).

- Incremental Markdown
- Pause and resume
  - Nested lists
- Restore complete conversation history

> A finished stream should match a complete document.

| Scenario | Expected |
| --- | --- |
| Streaming | Stable nodes |
| Restore | Complete output |

\`\`\`typescript
import { createSignal } from 'solid-js'
import MarkdownRender from 'markstream-solid'

const [content, setContent] = createSignal('Hello')
\`\`\`

Inline math: $E = mc^2$.

\`\`\`mermaid
flowchart LR
  Stream --> Parse --> Solid --> DOM
\`\`\`

<thinking>Custom **Solid components** can render reasoning.</thinking>

Done.
`

export function createDocument(sections = 250) {
  return Array.from({ length: sections }, (_, index) => `## Section ${index}\n\nParagraph ${index}: 中文 streaming 🚀 with **stable text** and [links](https://example.com/${index}).\n\n- First ${index}\n- Second ${index}\n\n\`\`\`ts\nconst value${index} = ${index}\n\`\`\``).join('\n\n')
}

export const paritySample = [
  '# Vue 3 parity fixtures',
  '## HTML preview',
  '```html\n<h1 id="preview-title">Sandboxed preview</h1>\n<script>document.body.dataset.scriptRan = "yes"</script>\n```',
  '## SVG artifact',
  '```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><text x="4" y="24">SVG preview</text></svg>\n```',
  '## Diff toolbar',
  '```diff ts:answer.ts\n-const answer = 41\n+const answer = 42\n```',
  '## Mermaid',
  '```mermaid\nflowchart LR\nA --> B\n```',
  '## D2',
  '```d2\nA -> B: Stream\n```',
  '## Infographic',
  '```infographic\ninfographic list-row-simple-horizontal-arrow\ndata\n  items\n    - label Parse\n      desc Markdown\n    - label Render\n      desc Solid\n```',
].join('\n\n')
