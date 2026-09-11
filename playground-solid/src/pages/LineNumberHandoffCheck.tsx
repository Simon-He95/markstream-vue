import { NodeRenderer } from 'markstream-solid'
import { createSignal } from 'solid-js'

const markdown = [
  '# Pre → Highlight Line Number Handoff',
  '',
  '```ts',
  'export function chunk(input: string) {',
  '  const lines = input.split(/\\r?\\n/)',
  '  return lines.map((line, index) => ({ index, value: line.trim(), block: 1 }))',
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

function getInitialDarkMode() {
  if (typeof window === 'undefined')
    return false
  return new URLSearchParams(window.location.search).get('theme') === 'dark'
}

export function LineNumberHandoffCheck() {
  const [isDark, setIsDark] = createSignal(getInitialDarkMode())

  return (
    <div
      class={`handoff-check markstream-solid${isDark() ? ' dark' : ''}`}
      data-line-number-handoff
      style={{
        'min-height': '100vh',
        'padding': '24px',
        'font-family': 'system-ui, sans-serif',
        'color': isDark() ? '#e2e8f0' : undefined,
        'background': isDark() ? '#0b1220' : '#f5f7fb',
      }}
    >
      <header>
        <h1>Pre → Highlight Line Number Handoff</h1>
        <p>Static side-by-side comparison. This page does not claim async handoff is verified.</p>
        <button type="button" onClick={() => setIsDark(value => !value)}>
          Toggle dark
        </button>
      </header>

      <h2 style={{ 'margin-top': '20px' }}>1) Highlight (default)</h2>
      <section data-handoff-case="enhanced" style={{ 'max-width': '860px', 'margin-bottom': '32px' }}>
        <NodeRenderer
          content={markdown}
          final
          fade={false}
          smoothStreaming={false}
          typewriter={false}
          codeBlockDarkTheme="vitesse-dark"
          codeBlockLightTheme="vitesse-light"
          isDark={isDark()}
        />
      </section>

      <h2 style={{ 'margin-top': '20px' }}>2) Pre fallback (render-code-blocks-as-pre)</h2>
      <section data-handoff-case="pre" style={{ 'max-width': '860px', 'margin-bottom': '32px' }}>
        <NodeRenderer
          content={markdown}
          final
          fade={false}
          smoothStreaming={false}
          typewriter={false}
          codeBlockDarkTheme="vitesse-dark"
          codeBlockLightTheme="vitesse-light"
          isDark={isDark()}
          renderCodeBlocksAsPre
          codeBlockProps={{ showLineNumbers: true }}
        />
      </section>
    </div>
  )
}
