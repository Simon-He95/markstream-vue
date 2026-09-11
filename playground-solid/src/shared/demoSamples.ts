import { TEST_LAB_SAMPLES } from '../../../playground-shared/testLabFixtures'
import { streamContent } from '../markdown'

export type SolidDemoId
  = 'mixed'
    | 'smooth'
    | 'controller'
    | 'code-identity'
    | 'scoped'
    | 'diagrams'
    | 'batch'

export interface SolidDemoCard {
  id: SolidDemoId
  label: string
  hint: string
  content: string
}

const LONG_CODE_LINES = Array.from({ length: 48 }, (_, index) => `  line_${String(index + 1).padStart(2, '0')}: ${index * 3},`).join('\n')

export const SMOOTH_SAMPLE = `# Smooth streaming

This paragraph is meant to stay on screen while later tokens arrive.

The already-visible words must not fade in again as a whole block.

Incomplete markdown such as **bold and a list:

- alpha
- beta
- ga`

export const CODE_IDENTITY_SAMPLE = `# Code-block identity

Select some of the code, scroll the block, then append. Ordinary append should keep the same DOM shell.

\`\`\`ts
export const table = {
${LONG_CODE_LINES}
}
\`\`\`
`

export const DIAGRAMS_SAMPLE = `# Charts, formulas, workers

Inline math $E = mc^2$ and a block:

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

\`\`\`mermaid
flowchart LR
  Prompt --> Parser --> Renderer
\`\`\`

\`\`\`d2
App -> Parser -> Renderer
\`\`\`

\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label Input
      desc markdown
    - label Render
      desc incremental
    - label Observe
      desc Solid playground
\`\`\`
`

export const SCOPED_SAMPLE = `# Isolated custom components

<thinking>
Nested **markdown** and a list:

- stays inside this renderer
- should not leak into the sibling
</thinking>

Outer paragraph after thinking.
`

export const SOLID_DEMOS: readonly SolidDemoCard[] = [
  {
    id: 'mixed',
    label: '默认混合流',
    hint: 'Start / pause / resume / stop / reset the default mixed Markdown stream.',
    content: streamContent,
  },
  {
    id: 'smooth',
    label: '平滑输出 / 追平',
    hint: 'Transport-complete is distinct from display catch-up. Already-shown text must not re-fade.',
    content: SMOOTH_SAMPLE,
  },
  {
    id: 'controller',
    label: 'Solid controller',
    hint: 'Reads source(), visible(), pendingChars(), caughtUp(), final() from useSmoothMarkdownStream.',
    content: 'Controller demo uses enqueue rather than the network-cadence simulator.',
  },
  {
    id: 'code-identity',
    label: '代码块实例保留',
    hint: 'Ordinary append keeps the code-block DOM shell. Language / diff rebuilds are separate.',
    content: CODE_IDENTITY_SAMPLE,
  },
  {
    id: 'scoped',
    label: '隔离自定义组件',
    hint: 'Two renderers plus ThinkingNode. Unmounting one owner must not pollute the other.',
    content: SCOPED_SAMPLE,
  },
  {
    id: 'diagrams',
    label: '图表与公式',
    hint: 'Real Mermaid / D2 / Infographic SVG and KaTeX. Stale async must not overwrite newer input.',
    content: DIAGRAMS_SAMPLE,
  },
  {
    id: 'batch',
    label: '批量渲染',
    hint: 'Completed-state batch render of the stress sample. Not a virtual list.',
    content: TEST_LAB_SAMPLES.find(sample => sample.id === 'stress')?.content ?? '# Stress',
  },
] as const

export function getSolidDemo(id: SolidDemoId) {
  return SOLID_DEMOS.find(demo => demo.id === id) ?? SOLID_DEMOS[0]
}
