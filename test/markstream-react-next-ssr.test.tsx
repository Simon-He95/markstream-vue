/**
 * @vitest-environment node
 */

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const packageRequire = createRequire(new URL('../package.json', import.meta.url))
const React = packageRequire('react') as typeof import('react')
const { renderToStaticMarkup } = packageRequire('react-dom/server') as typeof import('react-dom/server')

function textNode(content: string) {
  return {
    type: 'text',
    content,
    raw: content,
  }
}

function paragraphNode(content: string) {
  return {
    type: 'paragraph',
    raw: content,
    children: [textNode(content)],
  }
}

function listItemNode(content: string) {
  return {
    type: 'list_item',
    raw: content,
    children: [paragraphNode(content)],
  }
}

function definitionListNode() {
  return {
    type: 'definition_list',
    items: [
      {
        type: 'definition_item',
        term: [textNode('Term')],
        definition: [paragraphNode('Definition')],
      },
    ],
  }
}

function tableNode() {
  return {
    type: 'table',
    header: {
      cells: [
        { children: [textNode('Name')] },
        { children: [textNode('Value')] },
      ],
    },
    rows: [
      {
        cells: [
          { children: [textNode('Alpha')] },
          { children: [textNode('One')] },
        ],
      },
    ],
  }
}

function vmrContainerNode() {
  return {
    type: 'vmr_container',
    name: 'tip',
    attrs: [['data-kind', 'tip']],
    children: [paragraphNode('Container body')],
  }
}

function insightNode(label: string, body: string) {
  return {
    type: 'insight',
    raw: label,
    label,
    children: [paragraphNode(body)],
  }
}

function customThinkingNode(scope: string, body: string) {
  return {
    type: 'html_block',
    tag: 'thinking',
    attrs: [
      ['data-tone', 'calm'],
      ['data-scope', scope],
    ],
    content: `<thinking data-tone="calm" data-scope="${scope}">${body}</thinking>`,
    raw: `<thinking data-tone="calm" data-scope="${scope}">${body}</thinking>`,
  }
}

function createRenderCtx(serverEntry: any) {
  return {
    customComponents: {},
    events: {},
    typewriter: false,
    codeBlockStream: true,
    showTooltips: false,
    renderCodeBlocksAsPre: false,
    codeBlockThemes: {},
    customId: 'matrix',
    renderNode: serverEntry.renderNode,
  } as any
}

function createMatrixCases(entry: any, serverEntry: any) {
  const ctx = createRenderCtx(serverEntry)
  const withCtx = (props: Record<string, any>) => ({
    ...props,
    ctx,
    renderNode: serverEntry.renderNode,
    indexKey: 'matrix',
    customId: 'matrix',
  })

  return [
    {
      name: 'NodeRenderer',
      expected: 'Matrix Heading',
      element: React.createElement(entry.NodeRenderer, {
        content: '# Matrix Heading\n\nParagraph text',
        final: true,
      }),
    },
    {
      name: 'AdmonitionNode',
      expected: 'Alert body',
      element: React.createElement(entry.AdmonitionNode, withCtx({
        node: {
          type: 'admonition',
          kind: 'note',
          children: [paragraphNode('Alert body')],
        },
      })),
    },
    {
      name: 'BlockquoteNode',
      expected: 'Quoted body',
      element: React.createElement(entry.BlockquoteNode, withCtx({
        node: {
          type: 'blockquote',
          children: [paragraphNode('Quoted body')],
        },
      })),
    },
    {
      name: 'CheckboxNode',
      expected: 'checkbox',
      element: React.createElement(entry.CheckboxNode, {
        node: { type: 'checkbox', checked: true },
      }),
    },
    {
      name: 'CodeBlockNode',
      expected: 'data-ssr-fallback="code-block"',
      element: React.createElement(entry.CodeBlockNode, {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const answer = 42',
          raw: 'const answer = 42',
        },
      }),
    },
    {
      name: 'MarkdownCodeBlockNode',
      expected: 'data-ssr-fallback="markdown-code-block"',
      element: React.createElement(entry.MarkdownCodeBlockNode, {
        node: {
          type: 'code_block',
          language: 'md',
          code: '# nested markdown',
          raw: '# nested markdown',
        },
      }),
    },
    {
      name: 'PreCodeNode',
      expected: 'const fallback = true',
      element: React.createElement(entry.PreCodeNode, {
        node: {
          type: 'code_block',
          language: 'js',
          code: 'const fallback = true',
          raw: 'const fallback = true',
        },
      }),
    },
    {
      name: 'D2BlockNode',
      expected: 'data-ssr-fallback="d2"',
      element: React.createElement(entry.D2BlockNode, {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'x -> y',
          raw: 'x -> y',
        },
      }),
    },
    {
      name: 'MermaidBlockNode',
      expected: 'data-ssr-fallback="mermaid"',
      element: React.createElement(entry.MermaidBlockNode, {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'graph TD;A-->B;',
          raw: 'graph TD;A-->B;',
        },
      }),
    },
    {
      name: 'InfographicBlockNode',
      expected: 'data-ssr-fallback="infographic"',
      element: React.createElement(entry.InfographicBlockNode, {
        node: {
          type: 'code_block',
          language: 'infographic',
          code: '{"title":"Demo"}',
          raw: '{"title":"Demo"}',
        },
      }),
    },
    {
      name: 'DefinitionListNode',
      expected: 'Definition',
      element: React.createElement(entry.DefinitionListNode, withCtx({
        node: definitionListNode(),
      })),
    },
    {
      name: 'EmojiNode',
      expected: 'sparkles',
      element: React.createElement(entry.EmojiNode, {
        node: { type: 'emoji', name: 'sparkles' },
      }),
    },
    {
      name: 'EmphasisNode',
      expected: 'Emphasis',
      element: React.createElement(entry.EmphasisNode, {
        node: { type: 'emphasis' },
        children: 'Emphasis',
      }),
    },
    {
      name: 'StrongNode',
      expected: 'Strong',
      element: React.createElement(entry.StrongNode, {
        node: { type: 'strong' },
        children: 'Strong',
      }),
    },
    {
      name: 'StrikethroughNode',
      expected: 'Strike',
      element: React.createElement(entry.StrikethroughNode, {
        node: { type: 'strikethrough' },
        children: 'Strike',
      }),
    },
    {
      name: 'HighlightNode',
      expected: 'Highlight',
      element: React.createElement(entry.HighlightNode, {
        node: { type: 'highlight' },
        children: 'Highlight',
      }),
    },
    {
      name: 'InsertNode',
      expected: 'Insert',
      element: React.createElement(entry.InsertNode, {
        node: { type: 'insert' },
        children: 'Insert',
      }),
    },
    {
      name: 'SubscriptNode',
      expected: 'Sub',
      element: React.createElement(entry.SubscriptNode, {
        node: { type: 'subscript' },
        children: 'Sub',
      }),
    },
    {
      name: 'SuperscriptNode',
      expected: 'Sup',
      element: React.createElement(entry.SuperscriptNode, {
        node: { type: 'superscript' },
        children: 'Sup',
      }),
    },
    {
      name: 'FootnoteNode',
      expected: 'Footnote body',
      element: React.createElement(entry.FootnoteNode, withCtx({
        node: {
          type: 'footnote',
          id: '1',
          children: [paragraphNode('Footnote body')],
        },
      })),
    },
    {
      name: 'FootnoteReferenceNode',
      expected: 'fnref-1',
      element: React.createElement(entry.FootnoteReferenceNode, {
        node: { type: 'footnote_reference', id: '1' },
      }),
    },
    {
      name: 'FootnoteAnchorNode',
      expected: 'fnref-1',
      element: React.createElement(entry.FootnoteAnchorNode, {
        node: { type: 'footnote_anchor', id: '1' },
      }),
    },
    {
      name: 'HardBreakNode',
      expected: '<br/>',
      element: React.createElement(entry.HardBreakNode, {
        node: { type: 'hardbreak' },
      }),
    },
    {
      name: 'HeadingNode',
      expected: 'Heading',
      element: React.createElement(entry.HeadingNode, {
        node: { type: 'heading', level: 2 },
        children: 'Heading',
      }),
    },
    {
      name: 'ParagraphNode',
      expected: 'Paragraph',
      element: React.createElement(entry.ParagraphNode, {
        node: { type: 'paragraph' },
        children: 'Paragraph',
      }),
    },
    {
      name: 'HtmlBlockNode',
      expected: 'Block HTML',
      element: React.createElement(entry.HtmlBlockNode, {
        node: { type: 'html_block', content: '<div><strong>Block HTML</strong></div>' },
      }),
    },
    {
      name: 'HtmlInlineNode',
      expected: 'Inline HTML',
      element: React.createElement(entry.HtmlInlineNode, {
        node: { type: 'html_inline', content: '<span>Inline HTML</span>' },
      }),
    },
    {
      name: 'ImageNode',
      expected: 'https://example.com/demo.png',
      element: React.createElement(entry.ImageNode, {
        node: {
          type: 'image',
          src: 'https://example.com/demo.png',
          alt: 'Demo image',
          title: 'Demo image',
          raw: '![Demo image](https://example.com/demo.png)',
        },
      }),
    },
    {
      name: 'InlineCodeNode',
      expected: 'inline-demo',
      element: React.createElement(entry.InlineCodeNode, {
        node: { type: 'inline_code', code: 'inline-demo' },
      }),
    },
    {
      name: 'LinkNode',
      expected: 'https://example.com',
      element: React.createElement(entry.LinkNode, {
        node: {
          type: 'link',
          href: 'https://example.com',
          title: 'Example',
          text: 'Example',
          raw: '[Example](https://example.com)',
          children: [textNode('Example')],
        },
        children: 'Example',
      }),
    },
    {
      name: 'ListItemNode',
      expected: 'List item',
      element: React.createElement(entry.ListItemNode, {
        node: { type: 'list_item' },
        children: 'List item',
      }),
    },
    {
      name: 'ListNode',
      expected: 'List body',
      element: React.createElement(entry.ListNode, withCtx({
        node: {
          type: 'list',
          ordered: false,
          items: [listItemNode('List body')],
        },
      })),
    },
    {
      name: 'MathBlockNode',
      expected: 'math-block',
      element: React.createElement(entry.MathBlockNode, {
        node: {
          type: 'math_block',
          content: 'x^2',
          raw: '$$x^2$$',
        },
      }),
    },
    {
      name: 'MathInlineNode',
      expected: 'math-inline-wrapper',
      element: React.createElement(entry.MathInlineNode, {
        node: {
          type: 'math_inline',
          content: 'a+b',
          raw: '$a+b$',
          markup: '$',
        },
      }),
    },
    {
      name: 'ReferenceNode',
      expected: 'ref-1',
      element: React.createElement(entry.ReferenceNode, {
        node: { type: 'reference', id: 'ref-1' },
      }),
    },
    {
      name: 'TableNode',
      expected: 'Alpha',
      element: React.createElement(entry.TableNode, withCtx({
        node: tableNode(),
      })),
    },
    {
      name: 'TextNode',
      expected: 'Text body',
      element: React.createElement(entry.TextNode, {
        node: { type: 'text', content: 'Text body' },
      }),
    },
    {
      name: 'ThematicBreakNode',
      expected: '<hr',
      element: React.createElement(entry.ThematicBreakNode, {
        node: { type: 'thematic_break' },
      }),
    },
    {
      name: 'Tooltip',
      expected: '<section data-ssr-export="Tooltip"></section>',
      element: React.createElement(entry.Tooltip, {
        visible: true,
        anchorEl: null,
        content: 'Tooltip body',
      }),
    },
    {
      name: 'HtmlPreviewFrame',
      expected: '<section data-ssr-export="HtmlPreviewFrame"></section>',
      element: React.createElement(entry.HtmlPreviewFrame, {
        code: '<p>Preview</p>',
      }),
    },
    {
      name: 'VmrContainerNode',
      expected: 'Container body',
      element: React.createElement(entry.VmrContainerNode, withCtx({
        node: vmrContainerNode(),
      })),
    },
    {
      name: 'FallbackComponent',
      expected: 'Unsupported node type',
      element: React.createElement(entry.FallbackComponent, {
        node: { type: 'mystery' },
      }),
    },
  ]
}

function renderExport(name: string, element: React.ReactElement) {
  return renderToStaticMarkup(
    React.createElement('section', { 'data-ssr-export': name }, element),
  )
}

describe('markstream-react next/server SSR', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  afterEach(async () => {
    const serverEntry = await import('../packages/markstream-react/src/server')
    serverEntry.clearGlobalCustomComponents()
    serverEntry.removeCustomComponents?.('next-ssr-lab')
    serverEntry.removeCustomComponents?.('next-ssr-lab-alt')
    serverEntry.removeCustomComponents?.('server-ssr-lab')
    serverEntry.removeCustomComponents?.('server-ssr-lab-alt')
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('keeps root, next, and server entry imports safe', async () => {
    const entries = [
      await import('../packages/markstream-react/src/index'),
      await import('../packages/markstream-react/src/next'),
      await import('../packages/markstream-react/src/server'),
    ]

    expect(typeof entries[0].default).toBe('function')
    expect(typeof entries[1].default).toBe('function')
    expect(typeof entries[2].default).toBe('function')
  }, 15000)

  it('renders the next entry export matrix as SSR-safe HTML', async () => {
    const nextEntry = await import('../packages/markstream-react/src/next')
    const serverEntry = await import('../packages/markstream-react/src/server')

    for (const item of createMatrixCases(nextEntry, serverEntry)) {
      const html = renderExport(item.name, item.element)
      expect(html).toContain(`data-ssr-export="${item.name}"`)
      expect(html).toContain(item.expected)
    }
  })

  it('renders the server entry export matrix as SSR-safe HTML', async () => {
    const serverEntry = await import('../packages/markstream-react/src/server')

    for (const item of createMatrixCases(serverEntry, serverEntry)) {
      const html = renderExport(item.name, item.element)
      expect(html).toContain(`data-ssr-export="${item.name}"`)
      expect(html).toContain(item.expected)
    }
  })

  it('renders footnote exports with the markstream-vue anchor contract', async () => {
    const serverEntry = await import('../packages/markstream-react/src/server')
    const ctx = createRenderCtx(serverEntry)
    const withRenderCtx = (props: Record<string, any>) => ({
      ...props,
      ctx,
      renderNode: serverEntry.renderNode,
      indexKey: 'matrix',
      customId: 'matrix',
    })
    const entries = [
      await import('../packages/markstream-react/src/index'),
      serverEntry,
    ]

    for (const entry of entries) {
      const referenceHtml = renderToStaticMarkup(React.createElement(entry.FootnoteReferenceNode, {
        node: { type: 'footnote_reference', id: '1' },
      }))
      const footnoteHtml = renderToStaticMarkup(React.createElement(entry.FootnoteNode, withRenderCtx({
        node: {
          type: 'footnote',
          id: '1',
          children: [paragraphNode('Footnote body')],
        },
      })))
      const anchorHtml = renderToStaticMarkup(React.createElement(entry.FootnoteAnchorNode, {
        node: { type: 'footnote_anchor', id: '1' },
      }))

      expect(referenceHtml).toContain('id="fnref-1"')
      expect(referenceHtml).toContain('href="#fnref--1"')
      expect(referenceHtml).toContain('title="查看脚注 1"')
      expect(referenceHtml).toContain('class="footnote-link cursor-pointer"')
      expect(referenceHtml).not.toContain('href="#footnote-1"')
      expect(referenceHtml).not.toContain('View footnote')
      expect(footnoteHtml).toContain('id="fnref--1"')
      expect(footnoteHtml).not.toContain('id="footnote-1"')
      expect(anchorHtml).toContain('href="#fnref-1"')
      expect(anchorHtml).toContain('title="返回引用 1"')
      expect(anchorHtml).not.toContain('Back to reference')
    }
  })

  it('drops closed unknown tags in safe mode and still escapes malformed ones in the server entry', async () => {
    const serverEntry = await import('../packages/markstream-react/src/server')

    const closedHtml = renderToStaticMarkup(
      React.createElement(serverEntry.NodeRenderer, {
        content: '<question>ok</question>',
        final: true,
      }),
    )
    expect(closedHtml).not.toContain('<question>')
    expect(closedHtml).not.toContain('ok</question>')

    const malformedHtml = renderToStaticMarkup(
      React.createElement(serverEntry.NodeRenderer, {
        content: '<question>ok',
        final: true,
      }),
    )
    expect(malformedHtml).toContain('&lt;question&gt;ok')
    expect(malformedHtml).not.toContain('&amp;lt;')
  })

  it('renders structured html wrappers on the server without keeping safe-policy style attrs', async () => {
    const serverEntry = await import('../packages/markstream-react/src/server')

    const structuredHtml = renderToStaticMarkup(
      React.createElement(serverEntry.NodeRenderer, {
        nodes: [
          {
            type: 'html_block',
            tag: 'span',
            attrs: [['style', 'font-size: 12px;']],
            content: '<span style="font-size: 12px;"></span>',
            children: [
              {
                type: 'list',
                ordered: false,
                items: [listItemNode('alpha'), listItemNode('beta')],
              },
            ],
          } as any,
        ],
      }),
    )

    expect(structuredHtml).toContain('<span')
    expect(structuredHtml).not.toContain('font-size:12px')
    expect(structuredHtml).toContain('<ul')
    expect(structuredHtml).toContain('alpha')
    expect(structuredHtml).toContain('beta')

    const blockedHtml = renderToStaticMarkup(
      React.createElement(serverEntry.NodeRenderer, {
        nodes: [
          {
            type: 'html_block',
            tag: 'script',
            content: '<script>\n\n- alpha\n\n</script>',
            children: [
              {
                type: 'list',
                ordered: false,
                items: [listItemNode('alpha')],
              },
            ],
          } as any,
        ],
      }),
    )

    expect(blockedHtml).not.toContain('<ul>')
    expect(blockedHtml).not.toContain('<li>')
  })

  it('renders custom overrides, custom tags, and heavy-node fallbacks through next and server entries', async () => {
    const nextEntry = await import('../packages/markstream-react/src/next')
    const serverEntry = await import('../packages/markstream-react/src/server')

    const renderCustomChildren = (props: any) => (
      Array.isArray(props.node?.children) && props.renderNode && props.ctx
        ? props.node.children.map((child: any, idx: number) => (
            React.createElement(React.Fragment, { key: `${String(props.indexKey ?? 'custom')}-${idx}` }, props.renderNode(child, `${String(props.indexKey ?? 'custom')}-${idx}`, props.ctx))
          ))
        : null
    )

    const readAttr = (node: any, name: string) => {
      if (!node?.attrs)
        return undefined
      if (Array.isArray(node.attrs))
        return node.attrs.find((item: [string, string | null]) => item[0] === name)?.[1] ?? undefined
      return node.attrs[name]
    }

    serverEntry.setCustomComponents('server-ssr-lab', {
      paragraph: ({ node }: any) => React.createElement('div', { 'data-ssr-status': 'paragraph-override' }, node.raw),
      insight: (props: any) => React.createElement(
        'section',
        { 'data-ssr-status': 'server-custom-node' },
        React.createElement('div', { 'data-ssr-status': 'server-custom-node-children' }, renderCustomChildren(props)),
      ),
      thinking: ({ node }: any) => React.createElement('aside', {
        'data-ssr-status': 'thinking-tag',
        'data-ssr-tone': readAttr(node, 'data-tone'),
        'data-ssr-scope': readAttr(node, 'data-scope'),
      }, node.content),
    })
    serverEntry.setCustomComponents('server-ssr-lab-alt', {
      paragraph: ({ node }: any) => React.createElement('div', { 'data-ssr-status': 'server-paragraph-alt' }, node.raw),
    })

    const serverHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, React.createElement(serverEntry.NodeRenderer, {
        customId: 'server-ssr-lab',
        customHtmlTags: ['thinking'],
        nodes: [
          paragraphNode('Paragraph override') as any,
          insightNode('Server custom node', 'Server child body') as any,
          customThinkingNode('server-primary', 'Server tag body') as any,
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'graph TD;A-->B;',
            raw: 'graph TD;A-->B;',
          } as any,
          {
            type: 'code_block',
            language: 'd2',
            code: 'x -> y',
            raw: 'x -> y',
          } as any,
          {
            type: 'code_block',
            language: 'infographic',
            code: '{"title":"SSR"}',
            raw: '{"title":"SSR"}',
          } as any,
        ],
      }), React.createElement(serverEntry.NodeRenderer, {
        customId: 'server-ssr-lab-alt',
        customHtmlTags: ['thinking'],
        nodes: [paragraphNode('Paragraph alt') as any],
      })),
    )

    expect(serverHtml).toContain('data-ssr-status="paragraph-override"')
    expect(serverHtml).toContain('data-ssr-status="server-paragraph-alt"')
    expect(serverHtml).toContain('data-ssr-status="server-custom-node-children"')
    expect(serverHtml).toContain('Server child body')
    expect(serverHtml).toContain('data-ssr-status="thinking-tag"')
    expect(serverHtml).toContain('data-ssr-tone="calm"')
    expect(serverHtml).toContain('data-ssr-scope="server-primary"')
    expect(serverHtml).toContain('data-ssr-fallback="mermaid"')
    expect(serverHtml).toContain('data-ssr-fallback="d2"')
    expect(serverHtml).toContain('data-ssr-fallback="infographic"')

    nextEntry.setCustomComponents('next-ssr-lab', {
      paragraph: ({ node }: any) => React.createElement('div', { 'data-ssr-status': 'next-paragraph-override' }, node.raw),
      insight: (props: any) => React.createElement(
        'section',
        { 'data-ssr-status': 'next-custom-node' },
        React.createElement('div', { 'data-ssr-status': 'next-custom-node-children' }, renderCustomChildren(props)),
      ),
      thinking: ({ node }: any) => React.createElement('aside', {
        'data-ssr-status': 'next-thinking-tag',
        'data-ssr-tone': readAttr(node, 'data-tone'),
        'data-ssr-scope': readAttr(node, 'data-scope'),
      }, node.content),
    })
    nextEntry.setCustomComponents('next-ssr-lab-alt', {
      paragraph: ({ node }: any) => React.createElement('div', { 'data-ssr-status': 'next-paragraph-alt' }, node.raw),
    })

    const nextHtml = renderToStaticMarkup(
      React.createElement(React.Fragment, null, React.createElement(nextEntry.NodeRenderer, {
        customId: 'next-ssr-lab',
        customHtmlTags: ['thinking'],
        nodes: [
          paragraphNode('Paragraph override') as any,
          insightNode('Next custom node', 'Next child body') as any,
          customThinkingNode('next-primary', 'Next tag body') as any,
          {
            type: 'code_block',
            language: 'mermaid',
            code: 'graph TD;A-->B;',
            raw: 'graph TD;A-->B;',
          } as any,
        ],
      }), React.createElement(nextEntry.NodeRenderer, {
        customId: 'next-ssr-lab-alt',
        customHtmlTags: ['thinking'],
        nodes: [paragraphNode('Paragraph alt') as any],
      })),
    )

    expect(nextHtml).toContain('data-ssr-status="next-paragraph-override"')
    expect(nextHtml).toContain('data-ssr-status="next-paragraph-alt"')
    expect(nextHtml).toContain('data-ssr-status="next-custom-node-children"')
    expect(nextHtml).toContain('Next child body')
    expect(nextHtml).toContain('data-ssr-status="next-thinking-tag"')
    expect(nextHtml).toContain('data-ssr-tone="calm"')
    expect(nextHtml).toContain('data-ssr-scope="next-primary"')
    expect(nextHtml).toContain('data-ssr-fallback="mermaid"')
  })
})
