import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const root = path.resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(path.join(tmpdir(), 'markstream-solid-smoke-'))
try {
  const tarballs = []
  for (const directory of ['packages/markdown-parser', 'packages/markstream-core', 'packages/markstream-solid']) {
    const manifest = JSON.parse(await readFile(path.join(root, directory, 'package.json'), 'utf8'))
    execFileSync('pnpm', ['pack', '--pack-destination', temporary], { cwd: path.join(root, directory), stdio: 'pipe' })
    tarballs.push(path.join(temporary, `${manifest.name}-${manifest.version}.tgz`))
  }
  await writeFile(path.join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  execFileSync('npm', ['install', '--ignore-scripts', '--omit=optional', '--no-audit', '--no-fund', '--legacy-peer-deps', ...tarballs, 'solid-js@^1.9.0'], { cwd: temporary, stdio: 'pipe' })
  const require = createRequire(path.join(temporary, 'package.json'))
  assert.equal(existsSync(path.join(temporary, 'node_modules/vue')), false)
  assert.equal(existsSync(path.join(temporary, 'node_modules/react')), false)
  const manifest = JSON.parse(await readFile(path.join(temporary, 'node_modules/markstream-solid/package.json'), 'utf8'))
  for (const entry of Object.values(manifest.exports)) {
    for (const target of typeof entry === 'string' ? [entry] : Object.values(entry))
      assert.ok(existsSync(path.resolve(temporary, 'node_modules/markstream-solid', target)), `Missing export: ${target}`)
  }
  assert.ok(require.resolve('markstream-solid'))
  await writeFile(path.join(temporary, 'consumer.tsx'), `
    import type { Component } from 'solid-js'
    import type { CustomComponentMap, MarkdownRenderProps } from 'markstream-solid'
    import MarkdownRender, { useSmoothMarkdownStream, CodeBlockNode, MathBlockNode, MermaidBlockNode, MarkstreamProvider, MarkstreamVirtualTimeline } from 'markstream-solid'
    import { getKaTeXWorkerLoad } from 'markstream-solid/workers/katexWorkerClient'
    import { parseMarkdownToStructure } from 'markstream-solid/utils'
    const components: CustomComponentMap = { thinking: props => <aside>{String(props.node.content)}</aside> }
    const Renderer: Component<MarkdownRenderProps> = MarkdownRender
    const element = <Renderer content="**packed**" final customComponents={components} />
    const codeNode = { type: 'code_block' as const, code: 'const x = 1', language: 'ts', raw: '', loading: false }
    const toolbar = <CodeBlockNode node={codeNode} headerLeft={<strong>Custom title</strong>} showCopyButton htmlPreviewSandbox="allow-forms" />
    const math = <MathBlockNode node={{ type: 'math_block', content: 'x^2', raw: '$x^2$' }} cacheScope="consumer" />
    const diagram = <MermaidBlockNode node={codeNode} showZoomControls onCopy={event => event.preventDefault()} />
    const provider = <MarkstreamProvider defaultI18nMap={{ 'common.copy': 'Copy locally' }}><Renderer content="scoped" /></MarkstreamProvider>
    const timeline = <MarkstreamVirtualTimeline items={[{ id: 1, kind: 'markdown', content: 'history', final: true }]} ref={handle => handle.scrollToIndex(0)} />
    function Stream() {
      const stream = useSmoothMarkdownStream()
      stream.enqueue('chunk')
      return <Renderer content={stream.snapshot().visible} final={stream.snapshot().final} />
    }
  `)
  const rootRequire = createRequire(path.join(root, 'package.json'))
  execFileSync(process.execPath, [rootRequire.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'ESNext', '--moduleResolution', 'bundler', '--target', 'ES2022', '--jsx', 'preserve', '--jsxImportSource', 'solid-js', 'consumer.tsx'], { cwd: temporary, stdio: 'pipe' })
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    import { renderToString } from 'solid-js/web'
    import MarkdownRender, { renderMarkdownToHtml } from 'markstream-solid'
    assert.equal(renderMarkdownToHtml({ content: '# packed', final: true }), '<h1>packed</h1>')
    const html = renderToString(() => MarkdownRender({ content: '# packed\\n\\n**works**', final: true }))
    assert.ok(html.includes('packed') && html.includes('works'))
    console.log('Packed Solid package: SSR, exports and framework isolation passed')
  `], { cwd: temporary, encoding: 'utf8' })
  console.log(output.trim())
}
finally {
  await rm(temporary, { recursive: true, force: true })
}
