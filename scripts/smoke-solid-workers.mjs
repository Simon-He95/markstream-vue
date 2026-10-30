import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { build, preview } from 'vite'

const root = path.resolve(import.meta.dirname, '..')
const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'markstream-solid-workers-')))
const output = path.join(root, '.tmp/solid')
const require = createRequire(path.join(root, 'packages/markstream-solid/package.json'))
const pluginModule = await import(pathToFileURL(require.resolve('vite-plugin-solid')).href)
const solid = pluginModule.default?.default ?? pluginModule.default
let browser
let server
try {
  const tarballs = []
  const versions = {}
  for (const name of ['markdown-parser', 'markstream-core', 'markstream-solid']) {
    const directory = path.join(root, 'packages', name)
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
    versions[manifest.name] = manifest.version
    execFileSync('pnpm', ['pack', '--pack-destination', temporary], { cwd: directory, stdio: 'pipe' })
    tarballs.push(path.join(temporary, `${manifest.name}-${manifest.version}.tgz`))
  }
  const solidVersion = JSON.parse(await readFile(require.resolve('solid-js/package.json'), 'utf8')).version
  await writeFile(path.join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  execFileSync('npm', ['install', '--ignore-scripts', '--omit=optional', '--legacy-peer-deps', '--no-audit', '--no-fund', ...tarballs, `solid-js@${solidVersion}`], { cwd: temporary, stdio: 'pipe' })
  // Peers come from the installed store; all library code comes from external tarballs.
  for (const peer of ['katex', 'mermaid'])
    await symlink(await realpath(path.join(root, 'node_modules', peer)), path.join(temporary, 'node_modules', peer), process.platform === 'win32' ? 'junction' : 'dir')
  const packed = JSON.parse(await readFile(path.join(temporary, 'node_modules/markstream-solid/package.json'), 'utf8'))
  for (const name of ['markstream-core', 'stream-markdown-parser'])
    assert.equal(packed.dependencies[name], versions[name], 'packed dependencies use the new workspace versions')
  assert.equal(existsSync(path.join(temporary, 'node_modules/vue')), false)
  assert.equal(existsSync(path.join(temporary, 'node_modules/react')), false)
  await writeFile(path.join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="/main.tsx"></script>')
  await writeFile(path.join(temporary, 'main.tsx'), String.raw`
import { render } from 'solid-js/web'
import { MathBlockNode, MathInlineNode, MermaidBlockNode, canParseOffthread, renderKaTeXWithBackpressure, setKaTeXWorker, setMermaidWorker } from 'markstream-solid'
import KatexWorker from 'markstream-solid/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-solid/workers/mermaidParser.worker?worker'
import 'markstream-solid/index.css'
import 'katex/dist/katex.min.css'
setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
window.__packedWorkers = { pending: true }
const html = await renderKaTeXWithBackpressure('\\ce{H2O}', true, { timeout: 10000, waitTimeout: 10000 })
const parsed = await canParseOffthread('flowchart LR\nA --> B', 'light', 10000)
render(() => <><MathBlockNode node={{ type: 'math_block', content: 'x^2+y^2=z^2', raw: '$$x^2+y^2=z^2$$' }} /><MathInlineNode node={{ type: 'math_inline', content: 'E=mc^2', raw: '$E=mc^2$' }} /><MermaidBlockNode node={{ type: 'code_block', language: 'mermaid', code: 'flowchart LR\nA --> B', raw: '', loading: false }} /></>, document.getElementById('root'))
window.__packedWorkers = { pending: false, chemistry: html.includes('katex'), mermaidParse: parsed }
`)
  const config = { root: temporary, configFile: false, logLevel: 'warn', plugins: [solid({ ssr: true })], worker: { format: 'es' }, build: { target: 'esnext' } }
  await build(config)
  server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } })
  const executablePath = [process.env.PLAYWRIGHT_CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value))
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : { channel: 'chrome' }) })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`)
  await page.waitForFunction(() => window.__packedWorkers?.pending === false && document.querySelector('.math-block .katex') && document.querySelector('.math-inline .katex') && document.querySelector('.diagram-content svg'), null, { timeout: 30000 })
  const result = await page.evaluate(() => ({ ...window.__packedWorkers, blockMath: !!document.querySelector('.math-block .katex'), inlineMath: !!document.querySelector('.math-inline .katex'), mermaidSvg: !!document.querySelector('.diagram-content svg') }))
  assert.equal(result.chemistry, true)
  assert.equal(result.mermaidParse, true)
  assert.deepEqual(errors, [])
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'packed-workers.json'), `${JSON.stringify({ browser: await browser.version(), versions, peerSource: 'installed store', ...result, errors }, null, 2)}\n`)
  console.log('Packed Solid browser: emitted KaTeX/mhchem and Mermaid workers, block/inline math and diagram passed')
}
finally {
  await browser?.close()
  if (server)
    await new Promise(resolve => server.httpServer.close(resolve))
  await rm(temporary, { recursive: true, force: true })
}
