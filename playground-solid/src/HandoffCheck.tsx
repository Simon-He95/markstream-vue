import MarkdownRender from 'markstream-solid'
import { createSignal } from 'solid-js'
import './handoff.css'

const markdown = [
  '# Pre → Highlight Line Number Handoff',
  '',
  '```ts',
  'export function chunk(input: string) {',
  '  const lines = input.split(/\\r?\\n/)',
  `  return lines.map((line, index) => ({ index, value: line.trim(), description: '${'handoff-description-'.repeat(24)}' }))`,
  '}',
  '',
  'for (const item of chunk(\'alpha\\nbeta\\ngamma\')) {',
  '  console.log(item.index, item.value)',
  '}',
  '',
  'function done() {',
  '  return true',
  '}',
  'done()',
  '```',
].join('\n')

export default function HandoffCheck() {
  const [dark, setDark] = createSignal(new URLSearchParams(location.search).get('theme') === 'dark')
  const overflow = new URLSearchParams(location.search).get('codeOverflow') === 'scroll' ? 'scroll' : 'wrap'
  return (
    <div class="handoff-check" classList={{ dark: dark() }}>
      <header>
        <h1>Pre → Highlight Line Number Handoff</h1>
        <button type="button" onClick={() => setDark(value => !value)}>Toggle dark</button>
      </header>
      <h2>1) Highlight (stream-diffs, default)</h2>
      <section class="col" data-handoff-case="enhanced"><MarkdownRender content={markdown} final isDark={dark()} codeBlockOptions={{ overflow }} codeBlockDarkTheme="vitesse-dark" codeBlockLightTheme="vitesse-light" /></section>
      <h2>2) Pre fallback (render-code-blocks-as-pre)</h2>
      <section class="col" data-handoff-case="pre"><MarkdownRender content={markdown} final isDark={dark()} renderCodeBlocksAsPre codeBlockOptions={{ overflow }} codeBlockProps={{ showLineNumbers: true }} codeBlockDarkTheme="vitesse-dark" codeBlockLightTheme="vitesse-light" /></section>
    </div>
  )
}
