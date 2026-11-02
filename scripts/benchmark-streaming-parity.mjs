import assert from 'node:assert/strict'
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'
import { build, preview } from 'vite'

const root = process.cwd()
const output = path.join(root, '.tmp/streaming-parity')
const names = (process.env.PARITY_FRAMEWORKS || 'vue,vue2,vue26,react,octane,svelte,solid,angular').split(',')
const defaults = { fade: true, batchRendering: false, deferNodesUntilVisible: false, viewportPriority: false, maxLiveNodes: 0, renderCodeBlocksAsPre: true, typewriter: false }
const common = `const defaults = ${JSON.stringify(defaults)}; const host = document.getElementById('app');`
const fixtures = {
  vue: `import { createApp, h, shallowRef, nextTick } from 'vue'; import Renderer from 'library'; ${common}
const props = shallowRef({ ...defaults, content: '', final: false, smoothStreaming: false }); createApp({ setup: () => () => h(Renderer, props.value) }).mount(host);
window.set = async (content, final = false, smoothStreaming = false) => { props.value = { ...defaults, content, final, smoothStreaming }; await nextTick(); };`,
  vue2: `import Vue from 'vue'; import Renderer from 'library'; ${common}
const app = new Vue({ data: () => ({ current: { ...defaults, content: '', final: false, smoothStreaming: false } }), render(h) { return h(Renderer, { props: this.current }); } }).$mount(); host.appendChild(app.$el);
window.set = async (content, final = false, smoothStreaming = false) => { app.current = { ...defaults, content, final, smoothStreaming }; await Vue.nextTick(); };`,
  react: `import { createElement } from 'react'; import { flushSync } from 'react-dom'; import { createRoot } from 'react-dom/client'; import { NodeRenderer } from 'library'; ${common}
const app = createRoot(host); window.set = async (content, final = false, smoothStreaming = false) => { flushSync(() => app.render(createElement(NodeRenderer, { ...defaults, content, final, smoothStreaming }))); await new Promise(resolve => setTimeout(resolve, 0)); }; await window.set('');`,
  octane: `import { createElement, createRoot, flushSync } from 'octane'; import { NodeRenderer } from 'library'; ${common}
const app = createRoot(host); window.set = async (content, final = false, smoothStreaming = false) => { flushSync(() => app.render(createElement(NodeRenderer, { ...defaults, content, final, smoothStreaming }))); await new Promise(resolve => setTimeout(resolve, 0)); }; await window.set('');`,
  solid: `import { createSignal } from 'solid-js'; import { render } from 'solid-js/web'; import { NodeRenderer } from 'library'; ${common}
const [props, setProps] = createSignal({ ...defaults, content: '', final: false, smoothStreaming: false }); render(() => <NodeRenderer {...props()} />, host);
window.set = async (content, final = false, smoothStreaming = false) => { setProps({ ...defaults, content, final, smoothStreaming }); };`,
  svelte: `import { mount, tick } from 'svelte'; import App from './App.svelte'; mount(App, { target: document.getElementById('app') }); await tick();`,
  angular: `import '@angular/compiler'; import { Component, enableProdMode, provideZonelessChangeDetection } from '@angular/core'; import { bootstrapApplication } from '@angular/platform-browser'; import { NodeRenderer } from 'library'; ${common}
class App { content = ''; final = false; smooth = false; }
Component({ selector: 'parity-app', standalone: true, imports: [NodeRenderer], template: '<markstream-angular [content]="content" [final]="final" [smoothStreaming]="smooth" [typewriter]="false" [maxLiveNodes]="0" [batchRendering]="false" [deferNodesUntilVisible]="false" [viewportPriority]="false" />' })(App);
enableProdMode(); host.innerHTML = '<parity-app></parity-app>'; const app = await bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }); const component = app.components[0];
window.set = async (content, final = false, smoothStreaming = false) => { Object.assign(component.instance, { content, final, smooth: smoothStreaming }); component.changeDetectorRef.detectChanges(); await Promise.resolve(); };`,
}
fixtures.vue26 = fixtures.vue2.replace('import Renderer from \'library\';', 'import Renderer, { VueRendererMarkdown } from \'library\'; import CompositionApi from \'@vue/composition-api\'; Vue.use(CompositionApi); Vue.use(VueRendererMarkdown);')
mkdirSync(output, { recursive: true })
for (const name of names.filter(name => !process.env.PARITY_BUILD_ONLY || process.env.PARITY_BUILD_ONLY.split(',').includes(name))) {
  const pkg = name === 'vue' ? root : path.join(root, `packages/markstream-${name === 'vue26' ? 'vue2' : name}`)
  const require = createRequire(path.join(pkg, 'package.json'))
  const fixture = path.join(output, 'fixtures', name)
  mkdirSync(fixture, { recursive: true })
  if (!existsSync(path.join(fixture, 'node_modules')))
    symlinkSync(path.join(pkg, 'node_modules'), path.join(fixture, 'node_modules'))
  const entry = name === 'solid' ? 'main.tsx' : 'main.js'
  writeFileSync(path.join(fixture, 'index.html'), `<html><head><meta charset="UTF-8"><style>body{font:16px/1.6 system-ui;margin:24px}#app{max-width:960px}</style></head><body><div id="app"></div><script type="module" src="./${entry}"></script></body></html>`)
  writeFileSync(path.join(fixture, entry), `import '${path.join(pkg, 'dist/index.css')}';\n${fixtures[name]}\nwindow.ready = true;`)
  const plugins = []
  if (name === 'solid') {
    const { default: solid } = await import(require.resolve('vite-plugin-solid'))
    plugins.push(solid({ hot: false }))
  }
  if (name === 'svelte') {
    const { svelte } = await import(require.resolve('@sveltejs/vite-plugin-svelte'))
    plugins.push(svelte())
    writeFileSync(path.join(fixture, 'App.svelte'), `<script>import { tick } from 'svelte'; import { NodeRenderer } from 'library'; let content = $state(''); let final = $state(false); let smooth = $state(false); const defaults = ${JSON.stringify(defaults)}; window.set = async (value, done = false, pacing = false) => { content = value; final = done; smooth = pacing; await tick(); };</script><NodeRenderer {...defaults} {content} {final} smoothStreaming={smooth} />`)
  }
  const entries = { solid: 'dist/client/index.js', octane: 'dist/client/index.js', angular: 'dist/fesm2022/markstream-angular.mjs' }
  const alias = [{ find: 'library', replacement: path.join(pkg, entries[name] || 'dist/index.js') }]
  if (name === 'angular') {
    const appRequire = createRequire(path.join(root, 'playground-angular/package.json'))
    alias.push({ find: '@angular/platform-browser', replacement: appRequire.resolve('@angular/platform-browser') })
  }
  if (name === 'vue26') {
    const legacyRequire = createRequire(path.join(root, 'playground-vue2-cli/package.json'))
    alias.push({ find: /^vue$/, replacement: legacyRequire.resolve('vue/dist/vue.runtime.esm.js') })
    alias.push({ find: 'vue-demi', replacement: require.resolve('vue-demi/lib/v2/index.mjs') })
    alias.push({ find: '@vue/composition-api', replacement: path.dirname(legacyRequire.resolve('@vue/composition-api/package.json')) })
  }
  if (name === 'vue2') {
    alias.push({ find: /^vue$/, replacement: require.resolve('vue/dist/vue.runtime.esm.js') })
    alias.push({ find: 'vue-demi', replacement: require.resolve('vue-demi/lib/v2.7/index.mjs') })
  }
  await build({ configFile: false, root: fixture, base: `/${name}/`, logLevel: 'error', plugins, resolve: { alias, conditions: ['browser'] }, build: { target: 'esnext', outDir: path.join(output, 'site', name), emptyOutDir: true } })
  console.log(`Built ${name}`)
}
if (process.argv.includes('--build-only'))
  process.exit(0)
const server = await preview({ configFile: false, root, logLevel: 'error', build: { outDir: path.join(output, 'site') }, preview: { host: '127.0.0.1', port: 4213, strictPort: true } })
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const results = []
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  for (const name of names) {
    await page.goto(`http://127.0.0.1:4213/${name}/`)
    await page.waitForFunction(() => window.ready)
    const fade = await page.evaluate(async () => {
      await window.set('Hello')
      await window.set('Hello one tw')
      const words = [...document.querySelectorAll('.text-node-stream-delta')]
      const style = words[0] && getComputedStyle(words[0])
      const timing = { duration: style?.animationDuration, easing: style?.animationTimingFunction, words: words.map(node => node.textContent) }
      await window.set('Hello one two three')
      timing.stable = document.querySelectorAll('.text-node-stream-delta')[1] === words[1]
      await window.set('Hello one two three', true)
      timing.activeAfterFinal = document.querySelectorAll('.text-node-stream-delta').length
      return timing
    })
    assert.deepEqual(fade.words, ['one ', 'tw'], `${name}: words`)
    assert.equal(fade.duration, '0.7s', `${name}: duration`)
    assert.equal(fade.easing, 'cubic-bezier(0.37, 0.55, 0.86, 0.88)', `${name}: curve`)
    assert.equal(fade.stable, true, `${name}: word identity`)
    assert.equal(fade.activeAfterFinal, 0, `${name}: final fade`)
    const selection = await page.evaluate(async () => {
      await window.set('Hello')
      await window.set('Hello world')
      const text = document.querySelector('.text-node-stream-delta').firstChild
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 5)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      await window.set('Hello world final tail', true)
      const result = { selected: selection.toString(), text: document.getElementById('app').textContent }
      selection.removeAllRanges()
      return result
    })
    assert.equal(selection.selected, 'world', `${name}: final selection`)
    assert.ok(selection.text.includes('Hello world final tail'), `${name}: selected final tail`)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(async () => {
      await window.set('Reduced')
      await window.set('Reduced motion')
    })
    await page.waitForFunction(() => !document.querySelector('.text-node-stream-delta'))
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    console.log(`${name}: fade OK`)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const sentence = '中文 long text remains readable，流式输入完成后显示剩余内容。'
    const scenarios = [
      { id: '1000', chunks: ['字'.repeat(1000)] },
      { id: 'plain-20k', chunks: [sentence.repeat(600).slice(0, 20000)] },
      { id: 'bursts-24k', chunks: Array.from({ length: 3 }, () => (`## Heading\n\n${sentence.repeat(4)} **bold** and \`code\`.\n\n`).repeat(40)) },
    ]
    for (const scenario of scenarios) {
      await page.goto(`http://127.0.0.1:4213/${name}/`)
      await page.waitForFunction(() => window.ready)
      const run = await page.evaluate(async ({ chunks }) => {
        const full = `Seed\n\n${chunks.join('')}`
        await window.set(full, true, false)
        await new Promise(resolve => setTimeout(resolve, 100))
        const expected = document.getElementById('app').textContent
        await window.set('Seed\n\n', false, true)
        await new Promise(resolve => setTimeout(resolve, 100))
        let content = 'Seed\n\n'
        for (const chunk of chunks) {
          content += chunk
          await window.set(content, false, true)
          if (chunks.length > 1)
            await new Promise(resolve => setTimeout(resolve, 200))
        }
        const longTasks = []
        const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration }))))
        observer.observe({ type: 'longtask' })
        let last = performance.now()
        let maxFrame = 0
        let framesOver32 = 0
        let raf
        const frame = (now) => {
          const delta = now - last
          maxFrame = Math.max(maxFrame, delta)
          if (delta > 32)
            framesOver32++
          last = now
          raf = requestAnimationFrame(frame)
        }
        raf = requestAnimationFrame(frame)
        const start = performance.now()
        await window.set(content, true, true)
        const initialCommitMs = performance.now() - start
        const immediate = document.getElementById('app').textContent === expected
        let complete = immediate
        while (!complete && performance.now() - start < 30000) {
          await new Promise(resolve => setTimeout(resolve, 50))
          complete = document.getElementById('app').textContent === expected
        }
        const completionMs = performance.now() - start
        await new Promise(resolve => setTimeout(resolve, 100))
        cancelAnimationFrame(raf)
        observer.disconnect()
        return { chars: full.length, immediate, complete, initialCommitMs, completionMs, maxFrame, framesOver32, longTasks: longTasks.filter(task => task.start >= start), activeFade: document.querySelectorAll('.text-node-stream-delta').length }
      }, scenario)
      assert.equal(run.complete, true, `${name}/${scenario.id}: exact output`)
      assert.equal(run.activeFade, 0, `${name}/${scenario.id}: final fade`)
      if (scenario.id === '1000')
        assert.equal(run.immediate, true, `${name}: 1000-character flush`)
      results.push({ framework: name, scenario: scenario.id, cpuRate: 4, fade, ...run })
      console.log(JSON.stringify(results.at(-1)))
      writeFileSync(path.join(output, 'results.json'), JSON.stringify({ browser: browser.version(), results, errors }, null, 2))
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  }
  assert.deepEqual(errors, [])
}
finally {
  await browser.close()
  server.httpServer.close()
}
