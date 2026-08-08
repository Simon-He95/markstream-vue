/**
 * @vitest-environment node
 */

import katex from 'katex'
import { afterEach, describe, expect, it } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CodeBlockNode from '../src/components/CodeBlockNode'
import { disableD2, enableD2 } from '../src/components/D2BlockNode/d2'
import HtmlBlockNode from '../src/components/HtmlBlockNode/HtmlBlockNode.vue'
import { disableInfographic } from '../src/components/InfographicBlockNode/infographic'
import MathBlockNode from '../src/components/MathBlockNode'
import MathInlineNode from '../src/components/MathInlineNode'
import { disableKatex, enableKatex, setKatexLoader } from '../src/components/MathInlineNode/katex'
import { disableMermaid, enableMermaid } from '../src/components/MermaidBlockNode/mermaid'
import MarkdownRender from '../src/components/NodeRenderer'
import { VueRendererMarkdown } from '../src/exports'
import { setLanguageIconResolver } from '../src/utils/languageIcon'
import { clearGlobalCustomComponents, removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'

const BASIC_SCOPE = 'ssr-render-basic'
async function renderComponent(component: any, props: Record<string, any>) {
  const app = createSSRApp({
    render: () => h(component, props),
  })
  return renderToString(app)
}

async function renderMarkdown(content: string, props: Record<string, any> = {}) {
  return renderComponent(MarkdownRender, {
    content,
    final: true,
    ...props,
  })
}

function textNode(content: string) {
  return {
    type: 'text',
    content,
    raw: content,
  }
}

function paragraphNode(children: any[], raw?: string) {
  return {
    type: 'paragraph',
    children,
    raw: raw ?? children.map(child => String(child?.raw ?? child?.content ?? '')).join(''),
  }
}

function inlineWrapper(type: string, content: string, raw: string) {
  return {
    type,
    children: [textNode(content)],
    raw,
  }
}

function linkNode(content: string, href: string) {
  return {
    type: 'link',
    href,
    title: href,
    text: content,
    raw: `[${content}](${href})`,
    children: [textNode(content)],
  }
}

describe('ssr renderToString coverage', () => {
  afterEach(() => {
    clearGlobalCustomComponents()
    enableKatex()
    enableMermaid()
    enableD2()
    disableInfographic()
    setLanguageIconResolver(null)
  })

  it('renders basic markdown, HTML, and custom HTML tags on the server', async () => {
    setCustomComponents(BASIC_SCOPE, {
      'ssr-badge': defineComponent({
        name: 'SsrBadgeNode',
        setup(_, { slots }) {
          return () => h('span', { 'data-ssr-custom': 'badge' }, slots.default?.() ?? [])
        },
      }),
    })

    const html = await renderMarkdown(`
# SSR Basics

Inline HTML: <mark data-ssr-inline-html="1">inline html</mark>

Trusted custom tag: <ssr-badge>server custom tag</ssr-badge>

- [x] done
- [ ] pending

| Name | Role |
| --- | --- |
| Markstream | Renderer |

Visit [Vue](https://vuejs.org).

![Markstream icon](/vue-markdown-icon.svg "Markstream icon")

<div data-ssr-html-block="1"><strong>HTML block</strong> is present.</div>

Footnotes are server-rendered.[^1]

[^1]: Footnote body
    `.trim(), {
      customHtmlTags: ['ssr-badge'],
      customId: BASIC_SCOPE,
    })

    expect(html).toContain('<h1')
    expect(html).toContain('data-ssr-inline-html="1"')
    expect(html).toContain('data-ssr-html-block="1"')
    expect(html).toContain('data-ssr-custom="badge"')
    expect(html).toContain('<table')
    expect(html).toContain('href="https://vuejs.org"')
    expect(html).toContain('src="/vue-markdown-icon.svg"')
    expect(html).not.toContain('<figure')
    expect(html).toContain('Footnote body')
  })

  it('uses virtual sessionKey as the default index prefix on the server', async () => {
    const scopeId = 'ssr-render-virtual-prefix'

    setCustomComponents(scopeId, {
      probe: defineComponent({
        name: 'SsrVirtualPrefixProbeNode',
        props: {
          node: { type: Object, required: true },
          indexKey: { type: [String, Number], required: true },
        },
        setup(props) {
          return () => h('div', { 'data-ssr-index-key': String(props.indexKey) }, 'probe')
        },
      }) as any,
    })

    const html = await renderComponent(MarkdownRender, {
      customId: scopeId,
      nodes: [{ type: 'probe', raw: '<probe />', content: '' }],
      final: true,
      virtualScroll: {
        enabled: true,
        sessionKey: 'ssr-session',
      },
    })

    expect(html).toContain('data-ssr-index-key="virtual-ssr-session-0"')

    removeCustomComponents(scopeId)
  })

  it('uses full DOM during SSR when minimal DOM mode will batch on the client', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'

    try {
      const html = await renderComponent(MarkdownRender, {
        domMode: 'minimal',
        final: false,
        mode: 'minimal',
        nodes: [
          paragraphNode([textNode('SSR minimal batching')]),
        ],
      })

      expect(html).toContain('class="node-slot"')
      expect(html).toContain('class="node-content"')
      expect(html).toContain('SSR minimal batching')
    }
    finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('uses full DOM during SSR when host virtual scroll is requested in minimal DOM mode', async () => {
    const html = await renderComponent(MarkdownRender, {
      batchRendering: false,
      deferNodesUntilVisible: false,
      domMode: 'minimal',
      fade: false,
      final: true,
      nodeVirtual: false,
      nodes: [
        paragraphNode([textNode('SSR minimal host virtual scroll')]),
      ],
      typewriter: false,
      viewportPriority: false,
      virtualScroll: {
        enabled: true,
        sessionKey: 'ssr-minimal-host-virtual-scroll',
      },
    })

    expect(html).toContain('class="node-slot"')
    expect(html).toContain('class="node-content"')
    expect(html).toContain('SSR minimal host virtual scroll')
  })

  it('keeps plugin custom components scoped to each SSR app instance', async () => {
    const ThinkingNode = defineComponent({
      name: 'SsrThinkingNode',
      props: {
        node: {
          type: Object,
          required: true,
        },
      },
      setup(props) {
        return () => h('aside', { 'data-ssr-thinking': 'tenant-a' }, String((props.node as any).content ?? ''))
      },
    })

    const appA = createSSRApp({
      render: () => h(MarkdownRender, {
        content: '<thinking>tenant A</thinking>',
        final: true,
      }),
    })
    appA.use(VueRendererMarkdown, {
      components: {
        thinking: ThinkingNode,
      },
    })

    const appB = createSSRApp({
      render: () => h(MarkdownRender, {
        content: '<thinking>tenant B</thinking>',
        final: true,
      }),
    })
    appB.use(VueRendererMarkdown)

    const htmlA = await renderToString(appA)
    const htmlB = await renderToString(appB)

    expect(htmlA).toContain('data-ssr-thinking="tenant-a"')
    expect(htmlA).toContain('tenant A')
    expect(htmlB).not.toContain('data-ssr-thinking')
    expect(htmlB).toContain('tenant B')
  })

  it('keeps plugin language icon resolvers scoped to each SSR app instance', async () => {
    const node = {
      type: 'code_block',
      language: 'ts',
      code: 'const answer = 42',
      raw: '```ts\nconst answer = 42\n```',
      loading: false,
    }
    const renderApp = async (tenant: string) => {
      const app = createSSRApp({
        render: () => h(CodeBlockNode, {
          node,
          loading: false,
          stream: false,
        }),
      })
      app.use(VueRendererMarkdown, {
        languageIconResolver: lang => `<svg data-ssr-language-icon="${tenant}-${lang}"></svg>`,
      })
      return renderToString(app)
    }

    const htmlA = await renderApp('tenant-a')
    const htmlB = await renderApp('tenant-b')

    expect(htmlA).toContain('data-ssr-language-icon="tenant-a-typescript"')
    expect(htmlA).not.toContain('tenant-b-typescript')
    expect(htmlB).toContain('data-ssr-language-icon="tenant-b-typescript"')
    expect(htmlB).not.toContain('tenant-a-typescript')
  })

  it('falls back to theme icons instead of the global resolver on app-scoped resolver misses', async () => {
    setLanguageIconResolver(lang => `<svg data-ssr-global-language-icon="${lang}"></svg>`)

    const node = {
      type: 'code_block',
      language: 'ts',
      code: 'const answer = 42',
      raw: '```ts\nconst answer = 42\n```',
      loading: false,
    }
    const app = createSSRApp({
      render: () => h(CodeBlockNode, {
        node,
        loading: false,
        stream: false,
      }),
    })
    app.use(VueRendererMarkdown, {
      languageIconResolver: () => null,
    })

    const html = await renderToString(app)

    expect(html).not.toContain('data-ssr-global-language-icon')
  })

  it('renders app-scoped custom tags registered with PascalCase keys', async () => {
    const ThinkingNode = defineComponent({
      name: 'PascalCaseThinkingNode',
      props: {
        node: {
          type: Object,
          required: true,
        },
      },
      setup(props) {
        return () => h('aside', { 'data-ssr-thinking': 'pascal' }, String((props.node as any).content ?? ''))
      },
    })
    const AnswerBox = defineComponent({
      name: 'AnswerBox',
      setup(_, { slots }) {
        return () => h('section', { 'data-ssr-answer-box': 'pascal' }, slots.default?.())
      },
    })

    const app = createSSRApp({
      render: () => h(MarkdownRender, {
        content: '<thinking>Pascal tag</thinking>\n\n<answer-box>**ok**</answer-box>',
        final: true,
      }),
    })
    app.use(VueRendererMarkdown, {
      components: {
        AnswerBox,
        Thinking: ThinkingNode,
      },
    })

    const html = await renderToString(app)

    expect(html).toContain('data-ssr-thinking="pascal"')
    expect(html).toContain('Pascal tag')
    expect(html).toContain('data-ssr-answer-box="pascal"')
    expect(html).toContain('class="strong-node"')
    expect(html).toContain('ok')
  })

  it('uses scoped custom components as SSR app override and custom-tag source', async () => {
    const scopeId = 'ssr-render-scoped-over-app-components'
    const AppThinkingNode = defineComponent({
      name: 'SsrAppThinkingNode',
      props: {
        node: {
          type: Object,
          required: true,
        },
      },
      setup(props) {
        return () => h('aside', { 'data-ssr-thinking': 'app' }, String((props.node as any).content ?? ''))
      },
    })
    const ScopedThinkingNode = defineComponent({
      name: 'SsrScopedThinkingNode',
      props: {
        node: {
          type: Object,
          required: true,
        },
      },
      setup(props) {
        return () => h('aside', { 'data-ssr-thinking': 'scoped' }, String((props.node as any).content ?? ''))
      },
    })

    setCustomComponents(scopeId, {
      thinking: ScopedThinkingNode,
    })

    try {
      const app = createSSRApp({
        render: () => h(MarkdownRender, {
          content: '<thinking>scoped tenant</thinking>',
          customId: scopeId,
          final: true,
        }),
      })
      app.use(VueRendererMarkdown, {
        components: {
          thinking: AppThinkingNode,
        },
      })

      const html = await renderToString(app)

      expect(html).toContain('data-ssr-thinking="scoped"')
      expect(html).not.toContain('data-ssr-thinking="app"')
      expect(html).toContain('scoped tenant')
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('auto-registers scoped custom component keys as SSR custom tags', async () => {
    const scopeId = 'ssr-render-scoped-auto-tags'
    const ScopedThinkingNode = defineComponent({
      name: 'SsrScopedAutoTagThinkingNode',
      props: {
        node: {
          type: Object,
          required: true,
        },
      },
      setup(props) {
        return () => h('aside', { 'data-ssr-auto-tag-thinking': '1' }, String((props.node as any).content ?? ''))
      },
    })

    setCustomComponents(scopeId, {
      thinking: ScopedThinkingNode,
    })

    try {
      const html = await renderMarkdown('<thinking>scoped only</thinking>', {
        customId: scopeId,
      })

      expect(html).toContain('data-ssr-auto-tag-thinking="1"')
      expect(html).toContain('scoped only')
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('does not auto-register built-in renderer override keys as custom tags', async () => {
    const scopeId = 'ssr-render-reserved-auto-tags'
    const CodeBlockNode = defineComponent({
      name: 'SsrReservedCodeBlockNode',
      props: {
        node: {
          type: Object,
          required: true,
        },
      },
      setup(props) {
        return () => h('pre', { 'data-ssr-code-block-override': '1' }, String((props.node as any).code ?? (props.node as any).content ?? ''))
      },
    })
    const ThinkingNode = defineComponent({
      name: 'SsrReservedThinkingNode',
      props: {
        node: {
          type: Object,
          required: true,
        },
      },
      setup(props) {
        return () => h('aside', { 'data-ssr-thinking': '1' }, String((props.node as any).content ?? ''))
      },
    })

    setCustomComponents(scopeId, {
      code_block: CodeBlockNode,
      thinking: ThinkingNode,
    })

    try {
      const html = await renderMarkdown([
        '```js',
        'console.log(1)',
        '```',
        '',
        '<code_block>not trusted</code_block>',
        '',
        '<thinking>trusted</thinking>',
      ].join('\n'), {
        customId: scopeId,
      })

      expect(html.match(/data-ssr-code-block-override/g)?.length).toBe(1)
      expect(html).toContain('console.log(1)')
      expect(html).toContain('data-ssr-thinking="1"')
      expect(html).toContain('trusted')
      expect(html).toContain('&lt;code_block&gt;not trusted&lt;/code_block&gt;')
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('does not auto-register standard or hard-blocked html tag component keys', async () => {
    const SpanOverride = defineComponent({
      name: 'SsrSpanOverride',
      setup() {
        return () => h('strong', { 'data-ssr-span-override': '1' }, 'span override')
      },
    })
    const AnchorOverride = defineComponent({
      name: 'SsrAnchorOverride',
      setup() {
        return () => h('strong', { 'data-ssr-anchor-override': '1' }, 'anchor override')
      },
    })
    const ScriptOverride = defineComponent({
      name: 'SsrScriptOverride',
      setup() {
        return () => h('strong', { 'data-ssr-script-override': '1' }, 'script override')
      },
    })
    const IframeOverride = defineComponent({
      name: 'SsrIframeOverride',
      setup() {
        return () => h('strong', { 'data-ssr-iframe-override': '1' }, 'iframe override')
      },
    })

    const app = createSSRApp({
      render: () => h(MarkdownRender, {
        content: [
          '<span>safe span</span>',
          '<a href="https://example.com">safe anchor</a>',
          '<script>alert(1)</script>',
          '<iframe src="https://example.com"></iframe>',
        ].join('\n'),
        final: true,
      }),
    })
    app.use(VueRendererMarkdown, {
      components: {
        span: SpanOverride,
        a: AnchorOverride,
        script: ScriptOverride,
        iframe: IframeOverride,
      },
    })

    const html = await renderToString(app)

    expect(html).not.toContain('data-ssr-span-override')
    expect(html).not.toContain('data-ssr-anchor-override')
    expect(html).not.toContain('data-ssr-script-override')
    expect(html).not.toContain('data-ssr-iframe-override')
    expect(html).toContain('<span>safe span</span>')
    expect(html).toContain('href="https://example.com"')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<iframe')
  })

  it('renders structured html wrappers on the server without duplicating nested markdown or keeping safe-policy style attrs', async () => {
    const html = await renderMarkdown(`<span style="font-size: 12px;">

- alpha
- beta

    </span>`)

    expect(html).toContain('<span')
    expect(html).not.toContain('font-size:12px;')
    expect(html).toContain('<ul')
    expect(html.match(/alpha/g)?.length ?? 0).toBe(1)
    expect(html.match(/beta/g)?.length ?? 0).toBe(1)
  })

  it('renders nested structured html wrappers on the server', async () => {
    const html = await renderMarkdown(`<div>
<div>

- alpha

</div>
</div>`)

    expect(html.match(/<ul/g)?.length ?? 0).toBe(1)
    expect(html.match(/alpha/g)?.length ?? 0).toBe(1)
  })

  it('renders structured details html blocks without wrapper nodes before summary', async () => {
    const html = await renderComponent(HtmlBlockNode, {
      node: {
        type: 'html_block',
        tag: 'details',
        content: '<details open><summary>展开看一段 HTML</summary><p>body</p></details>',
        attrs: [['open', '']],
        children: [
          {
            type: 'html_block',
            tag: 'summary',
            content: '<summary>展开看一段 HTML</summary>',
            children: [
              {
                type: 'text',
                content: '展开看一段 HTML',
                raw: '展开看一段 HTML',
              },
            ],
          },
          {
            type: 'paragraph',
            raw: 'body',
            children: [{ type: 'text', content: 'body', raw: 'body' }],
          },
        ],
      },
    })

    expect(html).toMatch(/<details[^>]*class="html-block-node"[^>]*>(?:<!--\[-->|<!--\]-->)*<summary[^>]*>/)
    expect(html).not.toContain('<summary class="html-block-node"><p')
    expect(html).not.toContain('class="markstream-vue markdown-renderer"')
    expect(html).not.toContain('node-slot')
    expect(html).not.toContain('data-node-index=')
    expect(html).not.toContain('<template>')
    expect(html).toMatch(/<p dir="auto" class="paragraph-node"[^>]*>.*?<span[^>]*><span[^>]*>body<\/span>/)
  })

  it('renders closed details summary synchronously before structured body nodes', async () => {
    const html = await renderComponent(HtmlBlockNode, {
      node: {
        type: 'html_block',
        tag: 'details',
        content: '<details><summary>Optional advanced setup</summary><p>body</p></details>',
        attrs: [],
        children: [
          {
            type: 'html_block',
            tag: 'summary',
            content: '<summary>Optional advanced setup</summary>',
            children: [
              {
                type: 'text',
                content: 'Optional advanced setup',
                raw: 'Optional advanced setup',
              },
            ],
          },
          {
            type: 'paragraph',
            raw: 'body',
            children: [{ type: 'text', content: 'body', raw: 'body' }],
          },
        ],
      },
    })

    expect(html).toMatch(/<details[^>]*class="html-block-node"[^>]*>(?:<!--\[-->|<!--\]-->)*<summary[^>]*>Optional advanced setup<\/summary>/)
    expect(html).not.toContain('<summary class="html-block-node"')
    expect(html).toMatch(/<p dir="auto" class="paragraph-node"[^>]*>.*?<span[^>]*><span[^>]*>body<\/span>/)
  })

  it('does not bind DOM content override attrs on synchronized details summary', async () => {
    const html = await renderComponent(HtmlBlockNode, {
      node: {
        type: 'html_block',
        tag: 'details',
        content: '<details><summary innerHTML="<img src=x onerror=alert(1)>" class="safe">Safe summary</summary><p>body</p></details>',
        attrs: [],
        children: [
          {
            type: 'html_block',
            tag: 'summary',
            content: '<summary innerHTML="<img src=x onerror=alert(1)>" class="safe">Safe summary</summary>',
            attrs: [['innerHTML', '<img src=x onerror=alert(1)>'], ['class', 'safe']],
            children: [
              {
                type: 'text',
                content: 'Safe summary',
                raw: 'Safe summary',
              },
            ],
          },
          {
            type: 'paragraph',
            raw: 'body',
            children: [{ type: 'text', content: 'body', raw: 'body' }],
          },
        ],
      },
    })

    expect(html).toMatch(/<summary class="safe"[^>]*>Safe summary<\/summary>/)
    expect(html).not.toContain('innerHTML')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<img')
  })

  it('renders an explicit SSR matrix for the lighter built-in node components', async () => {
    const matrixNodes = [
      {
        type: 'heading',
        level: 2,
        text: 'SSR Matrix Heading',
        raw: '## SSR Matrix Heading',
        attrs: { id: 'ssr-matrix-heading' },
        children: [
          textNode('SSR Matrix '),
          { type: 'emoji', name: '😄', markup: ':smile:', raw: ':smile:' },
          textNode(' Heading'),
        ],
      },
      paragraphNode([
        textNode('Inline matrix: '),
        inlineWrapper('strong', 'bold', '**bold**'),
        textNode(' '),
        inlineWrapper('emphasis', 'italic', '*italic*'),
        textNode(' '),
        inlineWrapper('strikethrough', 'strike', '~~strike~~'),
        textNode(' '),
        inlineWrapper('highlight', 'mark', '==mark=='),
        textNode(' '),
        inlineWrapper('insert', 'inserted', '++inserted++'),
        textNode(' H'),
        inlineWrapper('subscript', '2', '~2~'),
        textNode('O x'),
        inlineWrapper('superscript', '2', '^2^'),
        textNode(' '),
        { type: 'inline_code', code: 'const x = 1', raw: '`const x = 1`' },
        textNode(' '),
        linkNode('Example link', 'https://example.com'),
        textNode(' '),
        {
          type: 'html_inline',
          content: '<mark data-ssr-inline-node="1">inline html</mark>',
          raw: '<mark data-ssr-inline-node="1">inline html</mark>',
          loading: false,
        },
        textNode(' '),
        { type: 'reference', id: '7', raw: '[7]' },
        textNode(' '),
        { type: 'footnote_reference', id: 'matrix-1', raw: '[^matrix-1]' },
        { type: 'hardbreak', raw: '  \n' },
        textNode('After hard break'),
      ]),
      {
        type: 'blockquote',
        cite: 'https://example.com/source',
        raw: '> Quoted block content',
        children: [
          paragraphNode([textNode('Quoted block content')]),
        ],
      },
      {
        type: 'list',
        ordered: true,
        start: 3,
        raw: '3. Checked task item\n4. Ordered second item',
        items: [
          {
            type: 'list_item',
            raw: '[x] Checked task item',
            children: [
              paragraphNode([
                { type: 'checkbox', checked: true, raw: '[x]' },
                textNode(' Checked task item'),
              ]),
            ],
          },
          {
            type: 'list_item',
            raw: 'Ordered second item',
            children: [
              paragraphNode([textNode('Ordered second item')]),
            ],
          },
        ],
      },
      {
        type: 'definition_list',
        raw: 'SSR term: SSR definition',
        items: [
          {
            type: 'definition_item',
            raw: 'SSR term: SSR definition',
            term: [textNode('SSR term')],
            definition: [paragraphNode([textNode('SSR definition')])],
          },
        ],
      },
      {
        type: 'table',
        raw: '| Column | Value |\n| --- | --- |\n| SSR | Stable |',
        loading: false,
        header: {
          type: 'table_row',
          raw: '| Column | Value |',
          cells: [
            { type: 'table_cell', header: true, raw: 'Column', children: [textNode('Column')] },
            { type: 'table_cell', header: true, raw: 'Value', children: [textNode('Value')] },
          ],
        },
        rows: [
          {
            type: 'table_row',
            raw: '| SSR | Stable |',
            cells: [
              { type: 'table_cell', header: false, raw: 'SSR', children: [textNode('SSR')] },
              { type: 'table_cell', header: false, raw: 'Stable', children: [textNode('Stable')] },
            ],
          },
        ],
      },
      {
        type: 'footnote',
        id: 'matrix-1',
        raw: '[^matrix-1]: Footnote body',
        children: [
          paragraphNode([
            textNode('Footnote body'),
            { type: 'footnote_anchor', id: 'matrix-1', raw: '↩︎' },
          ]),
        ],
      },
      {
        type: 'admonition',
        kind: 'tip',
        title: 'SSR Tip',
        raw: '::: tip SSR Tip\nAdmonition body\n:::',
        children: [
          paragraphNode([textNode('Admonition body')]),
        ],
      },
      {
        type: 'vmr_container',
        name: 'callout',
        raw: '::: callout\nContainer body\n:::',
        attrs: { 'data-ssr-container': '1' },
        children: [
          paragraphNode([textNode('Container body')]),
        ],
      },
      {
        type: 'thematic_break',
        raw: '---',
      },
    ]

    const html = await renderMarkdown('', {
      nodes: matrixNodes,
    })

    expect(html).toContain('id="ssr-matrix-heading"')
    expect(html).toContain('class="paragraph-node"')
    expect(html).toContain('class="strong-node"')
    expect(html).toContain('class="emphasis-node"')
    expect(html).toContain('class="strikethrough-node"')
    expect(html).toContain('class="highlight-node"')
    expect(html).toContain('class="insert-node"')
    expect(html).toContain('class="subscript-node"')
    expect(html).toContain('class="superscript-node"')
    expect(html).toContain('class="emoji-node"')
    expect(html).toContain('data-ssr-inline-node="1"')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('class="reference-node')
    expect(html).toContain('class="footnote-reference"')
    expect(html).toContain('class="hard-break"')
    expect(html).toContain('<blockquote')
    expect(html).toContain('class="checkbox-node"')
    expect(html).toContain('<ol')
    expect(html).toContain('<dl')
    expect(html).toContain('<table')
    expect(html).toContain('class="footnote-anchor')
    expect(html).toContain('class="admonition admonition-tip')
    expect(html).toContain('data-ssr-container="1"')
    expect(html).toContain('class="vmr-container vmr-container-callout"')
    expect(html).toContain('<hr class="hr-node"')
    expect(html).toContain('After hard break')
  })

  it('renders code blocks with an SSR pre fallback inside the code shell', async () => {
    const html = await renderMarkdown(`
\`\`\`diff
--- a/file.txt
+++ b/file.txt
@@
- old line
+ new line
\`\`\`

\`\`\`ts
export const greet = (name: string) => \`hello \${name}\`
\`\`\`
    `.trim())

    expect(html).toContain('data-markstream-code-block="1"')
    expect(html).toContain('data-markstream-enhanced="false"')
    expect(html).toContain('data-markstream-pre="1"')
    expect(html).toContain('@@')
    expect(html).toContain('new line')
    expect(html).toContain('hello ' + '$' + '{name}')
  })

  it('renders the standalone CodeBlockNode shell during SSR', async () => {
    const html = await renderComponent(CodeBlockNode, {
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'const value = "<safe>"',
        raw: '```ts\nconst value = "<safe>"\n```',
      },
      loading: false,
      stream: false,
    })

    expect(html).toContain('code-block-container')
    expect(html).toContain('code-block-header')
    expect(html).toContain('code-editor-layer')
    expect(html).toContain('Typescript')
    expect(html).toContain('markstream-pre--line-numbers')
    expect(html).toContain('const value = &quot;&lt;safe&gt;&quot;')
  })

  it('renders KaTeX HTML during SSR when a sync loader is configured', async () => {
    enableKatex(() => katex)

    const html = await renderMarkdown(`
Inline math: $E = mc^2$.

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$
    `.trim())

    expect(html).toContain('data-markstream-math="inline"')
    expect(html).toContain('data-markstream-math="block"')
    expect(html).toContain('data-markstream-mode="katex"')
    expect(html).toContain('class="katex')
  })

  it('renders HTML and diagram fallbacks in the raw SSR response', async () => {
    const html = await renderMarkdown(`
Inline HTML stays visible: <mark data-ssr-inline-html="1">inline html</mark>.

<div data-ssr-html-block="1"><strong>HTML block</strong> is present.</div>

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

\`\`\`d2
client -> server: request
\`\`\`

\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label SSR
      desc First paint
\`\`\`
    `.trim())

    expect(html).toContain('data-ssr-inline-html="1"')
    expect(html).toContain('data-ssr-html-block="1"')
    expect(html).toContain('data-markstream-mermaid="1"')
    expect(html).toContain('data-markstream-d2="1"')
    expect(html).toContain('data-markstream-infographic="1"')
    expect(html).toContain('data-markstream-mode="fallback"')
    expect(html).toContain('graph TD')
    expect(html).toContain('client -&gt; server: request')
    expect(html).toContain('label SSR')
  })

  it('keeps diagram SSR fallbacks stable when optional loaders are unavailable', async () => {
    disableMermaid()
    disableD2()
    disableInfographic()

    const html = await renderMarkdown(`
\`\`\`mermaid
graph LR
  Raw --> Stable
\`\`\`

\`\`\`d2
stable -> fallback
\`\`\`

\`\`\`infographic
infographic list-row-simple-horizontal-arrow
data
  items
    - label Disabled
      desc Static fallback
\`\`\`
    `.trim())

    expect(html).toContain('data-markstream-mermaid="1"')
    expect(html).toContain('data-markstream-d2="1"')
    expect(html).toContain('data-markstream-infographic="1"')
    expect(html).toContain('data-markstream-mode="fallback"')
    expect(html).toContain('Raw --&gt; Stable')
    expect(html).toContain('stable -&gt; fallback')
    expect(html).toContain('label Disabled')
  })

  it('renders scoped custom overrides, custom node types, and trusted custom tags during SSR', async () => {
    const scopeId = 'ssr-render-custom-components'

    const CustomListItem = defineComponent({
      name: 'SsrCustomListItem',
      props: {
        node: { type: Object, required: true },
        indexKey: [String, Number],
        customId: String,
      },
      setup(props) {
        return () => h('li', { 'data-ssr-custom-list-item': '1' }, [
          h(MarkdownRender, {
            nodes: (props.node as any).children || [],
            customId: props.customId,
            indexKey: `ssr-custom-list-item-${String(props.indexKey ?? '')}`,
            final: true,
            typewriter: false,
            batchRendering: false,
          }),
        ])
      },
    })

    const CustomNodeCard = defineComponent({
      name: 'SsrCustomNodeCard',
      props: {
        node: { type: Object, required: true },
      },
      setup(props) {
        return () => h('section', { 'data-ssr-custom-node': '1' }, String((props.node as any).content ?? ''))
      },
    })

    const ThinkingNode = defineComponent({
      name: 'SsrThinkingNode',
      props: {
        node: { type: Object, required: true },
      },
      setup(props) {
        return () => h('aside', { 'data-ssr-custom-tag': '1' }, String((props.node as any).content ?? ''))
      },
    })

    setCustomComponents(scopeId, {
      list_item: CustomListItem,
      ssr_card: CustomNodeCard,
      thinking: ThinkingNode,
    })

    const html = await renderMarkdown('', {
      customId: scopeId,
      customHtmlTags: ['thinking'],
      nodes: [
        {
          type: 'list',
          ordered: false,
          raw: '- Override one\n- Override two',
          items: [
            {
              type: 'list_item',
              raw: 'Override one',
              children: [paragraphNode([textNode('Override one')])],
            },
            {
              type: 'list_item',
              raw: 'Override two',
              children: [paragraphNode([textNode('Override two')])],
            },
          ],
        },
        {
          type: 'ssr_card',
          raw: 'Scoped custom node content',
          content: 'Scoped custom node content',
        },
        {
          type: 'html_block',
          tag: 'thinking',
          content: '<thinking>Trusted custom tag content</thinking>',
          raw: '<thinking>Trusted custom tag content</thinking>',
          loading: false,
        },
      ],
    })

    expect(html).toContain('data-ssr-custom-list-item="1"')
    expect(html).toContain('Override one')
    expect(html).toContain('Override two')
    expect(html).toContain('data-ssr-custom-node="1"')
    expect(html).toContain('Scoped custom node content')
    expect(html).toContain('data-ssr-custom-tag="1"')
    expect(html).toContain('Trusted custom tag content')
  })

  it('renders pre-parsed custom node attrs and raw slot content during SSR', async () => {
    const scopeId = 'ssr-render-custom-node-attrs'
    const AttrCard = defineComponent({
      name: 'SsrAttrCard',
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        return () => h('section', { 'data-ssr-attrs-card': '1', ...attrs }, slots.default?.() ?? [])
      },
    })
    const InlineAttr = defineComponent({
      name: 'SsrInlineAttr',
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        return () => h('span', { 'data-ssr-inline-attrs': '1', ...attrs }, slots.default?.() ?? [])
      },
    })

    setCustomComponents(scopeId, {
      ssr_attr_card: AttrCard,
      ssr_inline_attr: InlineAttr,
    })

    try {
      const html = await renderMarkdown('', {
        customId: scopeId,
        nodes: [
          {
            type: 'ssr_attr_card',
            tag: 'ssr_attr_card',
            raw: '**record slot**',
            content: '**record slot**',
            attrs: {
              'id': 'record-card',
              'onclick': 'alert(1)',
              'hidden': false,
              'data-safe': 'ok',
            },
          },
          paragraphNode([
            textNode('before '),
            {
              type: 'ssr_inline_attr',
              tag: 'ssr_inline_attr',
              raw: '<ssr_inline_attr>**inline slot**</ssr_inline_attr>',
              content: '**inline slot**',
              attrs: [
                { name: 'data-inline', value: 'yes' },
                { name: 'onclick', value: 'bad' },
                { name: 'disabled', value: false },
              ],
            },
            textNode(' after'),
          ]),
        ],
      })

      expect(html).toContain('data-ssr-attrs-card="1"')
      expect(html).toContain('id="record-card"')
      expect(html).toContain('data-safe="ok"')
      expect(html).toContain('data-ssr-inline-attrs="1"')
      expect(html).toContain('data-inline="yes"')
      expect(html).toMatch(/<strong[^>]*>[\s\S]*record slot/)
      expect(html).toMatch(/<strong[^>]*>[\s\S]*inline slot/)
      expect(html).not.toContain('onclick')
      expect(html).not.toContain('hidden')
      expect(html).not.toContain('disabled')
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders stable raw math fallback when KaTeX is disabled or unavailable', async () => {
    disableKatex()

    const inlineHtml = await renderComponent(MathInlineNode, {
      node: {
        type: 'math_inline',
        content: 'a^2 + b^2 = c^2',
        raw: '$a^2 + b^2 = c^2$',
        markup: '$',
        loading: false,
      },
    })

    setKatexLoader(() => {
      throw new Error('KaTeX unavailable')
    })

    const blockHtml = await renderComponent(MathBlockNode, {
      node: {
        type: 'math_block',
        content: '\\sum_{n=1}^{3} n = 6',
        raw: '$$\\sum_{n=1}^{3} n = 6$$',
        markup: '$$',
        loading: false,
      },
    })

    expect(inlineHtml).toContain('data-markstream-mode="fallback"')
    expect(inlineHtml).toContain('$a^2 + b^2 = c^2$')
    expect(inlineHtml).not.toContain('class="katex')
    expect(blockHtml).toContain('data-markstream-mode="fallback"')
    expect(blockHtml).toContain('\\sum_{n=1}^{3} n = 6')
    expect(blockHtml).not.toContain('class="katex')
  })
})
