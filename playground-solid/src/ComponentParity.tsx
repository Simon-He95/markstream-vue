import type { MarkdownRenderProps } from 'markstream-solid'
import MarkdownRender, { enableInfographic, MarkstreamProvider } from 'markstream-solid'
import { createSignal, onCleanup, onMount } from 'solid-js'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'
import { createApp, h, shallowRef } from 'vue'
import { paritySample } from './fixtures'
import VueBaseline from './VueBaseline.vue'

enableInfographic(() => import('@antv/infographic'))

const sample = [
  '# Heading one',
  '## Heading two',
  '### Heading three',
  '#### Heading four',
  '##### Heading five',
  '###### Heading six',
  'Paragraph with **strong**, *emphasis*, ~~strike~~, ==highlight==, ++insert++, H~2~O, x^2^ and `inline code`.',
  '> A quoted paragraph.\n>\n> - Nested item',
  '>>>I\'ll create a simple Electron + Vue chat application demo. Here\'s the structure:',
  '- First item\n- Second item\n  - Nested item',
  '3. Third item\n4. Fourth item',
  '- [x] Completed task\n- [ ] Pending task',
  'Term\n: Definition',
  '---',
  '[Link](https://example.com "Link title") and [reference][ref].\n\n[ref]: https://example.com/ref',
  'Footnote[^note].\n\n[^note]: Footnote text.',
  '| Name | Value |\n| --- | --- |\n| Alpha | **42** |',
  '![Pixel](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAAFUlEQVR4nGNQm9LynxLMMGrAcDAAAG5GHpA8hmePAAAAAElFTkSuQmCC "Static image")',
  '<kbd>Enter</kbd> <sup>HTML inline</sup>',
  '<div class="fixture-html">HTML block <b>content</b></div>',
  'Inline math $E=mc^2$ and display-inline $$x^2$$.',
  '$$\n\\frac{a+b}{c} = \\sqrt{x^2+y^2}\n$$',
  '::: warning Notice\nAdmonition content.\n:::',
  paritySample,
].join('\n\n')
const chinese = { 'common.preview': '预览', 'common.source': '源代码', 'common.copy': '复制', 'common.copied': '已复制', 'common.export': '导出', 'common.collapse': '折叠', 'common.expand': '展开', 'common.open': '打开', 'common.close': '关闭', 'common.minimize': '最小化', 'common.zoomIn': '放大', 'common.zoomOut': '缩小', 'common.resetZoom': '重置缩放' }

declare global {
  interface Window {
    __markstreamComponentParity: { update: (props: Partial<MarkdownRenderProps> & { locale?: 'en' | 'zh' }) => void }
  }
}
export default function ComponentParity() {
  const nodes = [...parseMarkdownToStructure(sample, getMarkdown('component-parity'), { final: true }), { type: 'checkbox', checked: true, raw: '[x]' }, { type: 'checkbox', checked: false, raw: '[ ]' }, { type: 'reference', id: 'ref-1', raw: '[ref-1]' }, { type: 'emoji', name: '🙂', content: '🙂', raw: '🙂' }, { type: 'admonition', kind: 'warning', title: 'Warning', raw: '', collapsible: true, children: [{ type: 'paragraph', raw: '', children: [{ type: 'text', content: 'Warning content', raw: 'Warning content' }] }] }]
  nodes.push({ type: 'vmr_container', name: 'card', raw: '::: card\nContainer content\n:::', children: [{ type: 'paragraph', raw: 'Container content', children: [{ type: 'text', content: 'Container content', raw: 'Container content' }] }] })
  const defaults: MarkdownRenderProps = { content: sample, nodes, final: true, smoothStreaming: false, batchRendering: false, maxLiveNodes: 0, viewportPriority: false, deferNodesUntilVisible: false, htmlPolicy: 'trusted' }
  const [props, setProps] = createSignal(defaults)
  const [locale, setLocale] = createSignal<'en' | 'zh'>('en')
  const vueProps = shallowRef(defaults)
  const translations = shallowRef<Record<string, string>>({})
  let vueRoot!: HTMLDivElement
  onMount(() => {
    const app = createApp({ render: () => h(VueBaseline, { ...vueProps.value, ref: undefined }) })
    app.config.globalProperties.$t = (key: string) => translations.value[key] ?? key
    app.config.globalProperties.$te = (key: string) => key in translations.value
    app.mount(vueRoot)
    onCleanup(() => app.unmount())
  })
  window.__markstreamComponentParity = {
    update(next) {
      if (next.content !== undefined && !Object.prototype.hasOwnProperty.call(next, 'nodes'))
        next.nodes = undefined
      if (next.isDark !== undefined)
        document.documentElement.classList.toggle('dark', next.isDark)
      if (next.locale) {
        setLocale(next.locale)
        translations.value = next.locale === 'zh' ? chinese : {}
      }
      setProps(previous => ({ ...previous, ...next }))
      vueProps.value = { ...vueProps.value, ...next }
    },
  }
  return (
    <main class="component-parity" classList={{ dark: props().isDark }}>
      <header>
        <h1>Vue 3 / Solid component parity</h1>
        <button onClick={() => window.__markstreamComponentParity.update({ isDark: !props().isDark })}>Toggle dark</button>
        <button onClick={() => window.__markstreamComponentParity.update({ locale: locale() === 'en' ? 'zh' : 'en' })}>Toggle language</button>
      </header>
      <div class="component-parity-columns">
        <section>
          <h2>Vue 3</h2>
          <div ref={vueRoot} data-framework="vue3" />
        </section>
        <section>
          <h2>Solid</h2>
          <div data-framework="solid"><MarkstreamProvider defaultI18nMap={locale() === 'zh' ? chinese : {}}><MarkdownRender {...props()} /></MarkstreamProvider></div>
        </section>
      </div>
    </main>
  )
}
