import React from 'react'

const DEMO_IMAGE_SRC = '/ssr-image.svg'

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

function headingNode(content: string, level = 2) {
  return {
    type: 'heading',
    level,
    raw: `${'#'.repeat(level)} ${content}`,
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

export const BASIC_NEXT_MARKDOWN = `
# Next Entry Basic

Server-first markdown content with <strong>inline HTML</strong>, a [stable link](https://example.com), and a footnote.[^1]

<div data-ssr-status="next-basic-html">Next HTML block</div>

| Name | Value |
| --- | --- |
| Next | SSR |

![Next SSR Image](${DEMO_IMAGE_SRC} "Next SSR Image")

[^1]: Footnote text from the Next entry.
`.trim()

export const NEXT_CUSTOM_ID = 'next-ssr-lab'
export const NEXT_CUSTOM_ALT_ID = 'next-ssr-lab-alt'
export const SERVER_CUSTOM_ID = 'server-ssr-lab'
export const SERVER_CUSTOM_ALT_ID = 'server-ssr-lab-alt'

export const NEXT_CUSTOM_NODES = [
  paragraphNode('Next scoped paragraph'),
  insightNode('Next custom node', 'Next custom child body'),
  customThinkingNode('next-primary', 'Next scoped thinking body'),
] as any[]

export const NEXT_CUSTOM_ALT_NODES = [
  paragraphNode('Next isolated paragraph'),
  insightNode('Next isolated custom node', 'Next isolated child body'),
  customThinkingNode('next-alt', 'Next isolated thinking body'),
] as any[]

export const SERVER_BASIC_NODES = [
  headingNode('Server Entry Basic'),
  paragraphNode('Server scoped paragraph'),
  {
    type: 'link',
    href: 'https://example.com/server',
    title: 'Server link',
    text: 'Server link',
    raw: '[Server link](https://example.com/server)',
    children: [textNode('Server link')],
  },
  tableNode(),
  {
    type: 'html_block',
    content: '<div data-ssr-status="server-basic-html">Server HTML block</div>',
    raw: '<div data-ssr-status="server-basic-html">Server HTML block</div>',
  },
] as any[]

export const SERVER_CUSTOM_NODES = [
  paragraphNode('Server scoped paragraph'),
  insightNode('Server custom node', 'Server custom child body'),
  customThinkingNode('server-primary', 'Server scoped thinking body'),
] as any[]

export const SERVER_CUSTOM_ALT_NODES = [
  paragraphNode('Server isolated paragraph'),
  insightNode('Server isolated custom node', 'Server isolated child body'),
  customThinkingNode('server-alt', 'Server isolated thinking body'),
] as any[]

export const ENHANCED_DEMOS = {
  code: {
    type: 'code_block',
    language: 'ts',
    code: 'export const answer = 42\nconsole.log(answer)',
    raw: 'export const answer = 42\nconsole.log(answer)',
    loading: false,
  },
  markdown: {
    type: 'code_block',
    language: 'md',
    code: '# Nested markdown\n\n- item one\n- item two',
    raw: '# Nested markdown\n\n- item one\n- item two',
    loading: false,
  },
  mathBlock: {
    type: 'math_block',
    content: 'x^2 + y^2 = z^2',
    raw: '$$x^2 + y^2 = z^2$$',
    loading: false,
  },
  mathInline: {
    type: 'math_inline',
    content: 'a+b',
    raw: '$a+b$',
    markup: '$',
    loading: false,
  },
  mermaid: {
    type: 'code_block',
    language: 'mermaid',
    code: 'graph TD;A[Start]-->B[Done];',
    raw: 'graph TD;A[Start]-->B[Done];',
    loading: false,
  },
  d2: {
    type: 'code_block',
    language: 'd2',
    code: 'api -> db',
    raw: 'api -> db',
    loading: false,
  },
  infographic: {
    type: 'code_block',
    language: 'infographic',
    code: '{"title":"SSR Lab","children":[{"title":"Node A"},{"title":"Node B"}]}',
    raw: '{"title":"SSR Lab","children":[{"title":"Node A"},{"title":"Node B"}]}',
    loading: false,
  },
} as const

export const FALLBACK_DEMOS = {
  nextPre: {
    type: 'code_block',
    language: 'ts',
    code: 'const stableFallback = true',
    raw: 'const stableFallback = true',
    loading: false,
  },
  mermaid: {
    type: 'code_block',
    language: 'mermaid',
    code: 'graph TD;Fallback-->Stable;',
    raw: 'graph TD;Fallback-->Stable;',
    loading: false,
  },
  d2: {
    type: 'code_block',
    language: 'd2',
    code: 'fallback -> stable',
    raw: 'fallback -> stable',
    loading: false,
  },
  infographic: {
    type: 'code_block',
    language: 'infographic',
    code: '{"title":"Fallback"}',
    raw: '{"title":"Fallback"}',
    loading: false,
  },
} as const

export function createMatrixCases(entry: any, serverEntry: any) {
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
      element: React.createElement(entry.NodeRenderer, {
        content: '# Matrix Heading\n\nParagraph text',
        final: true,
      }),
    },
    {
      name: 'AdmonitionNode',
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
      element: React.createElement(entry.BlockquoteNode, withCtx({
        node: {
          type: 'blockquote',
          children: [paragraphNode('Quoted body')],
        },
      })),
    },
    {
      name: 'CheckboxNode',
      element: React.createElement(entry.CheckboxNode, {
        node: { type: 'checkbox', checked: true },
      }),
    },
    {
      name: 'CodeBlockNode',
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
      name: 'ReactCodeBlockNode',
      element: React.createElement(entry.ReactCodeBlockNode, {
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const answer = 42',
          raw: 'const answer = 42',
        },
      }),
    },
    {
      name: 'PreCodeNode',
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
      element: React.createElement(entry.DefinitionListNode, withCtx({
        node: definitionListNode(),
      })),
    },
    {
      name: 'EmojiNode',
      element: React.createElement(entry.EmojiNode, {
        node: { type: 'emoji', name: 'sparkles' },
      }),
    },
    {
      name: 'EmphasisNode',
      element: React.createElement(entry.EmphasisNode, {
        node: { type: 'emphasis' },
        children: 'Emphasis',
      }),
    },
    {
      name: 'StrongNode',
      element: React.createElement(entry.StrongNode, {
        node: { type: 'strong' },
        children: 'Strong',
      }),
    },
    {
      name: 'StrikethroughNode',
      element: React.createElement(entry.StrikethroughNode, {
        node: { type: 'strikethrough' },
        children: 'Strike',
      }),
    },
    {
      name: 'HighlightNode',
      element: React.createElement(entry.HighlightNode, {
        node: { type: 'highlight' },
        children: 'Highlight',
      }),
    },
    {
      name: 'InsertNode',
      element: React.createElement(entry.InsertNode, {
        node: { type: 'insert' },
        children: 'Insert',
      }),
    },
    {
      name: 'SubscriptNode',
      element: React.createElement(entry.SubscriptNode, {
        node: { type: 'subscript' },
        children: 'Sub',
      }),
    },
    {
      name: 'SuperscriptNode',
      element: React.createElement(entry.SuperscriptNode, {
        node: { type: 'superscript' },
        children: 'Sup',
      }),
    },
    {
      name: 'FootnoteNode',
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
      element: React.createElement(entry.FootnoteReferenceNode, {
        node: { type: 'footnote_reference', id: '1' },
      }),
    },
    {
      name: 'FootnoteAnchorNode',
      element: React.createElement(entry.FootnoteAnchorNode, {
        node: { type: 'footnote_anchor', id: '1' },
      }),
    },
    {
      name: 'HardBreakNode',
      element: React.createElement(entry.HardBreakNode, {
        node: { type: 'hardbreak' },
      }),
    },
    {
      name: 'HeadingNode',
      element: React.createElement(entry.HeadingNode, {
        node: { type: 'heading', level: 2 },
        children: 'Heading',
      }),
    },
    {
      name: 'ParagraphNode',
      element: React.createElement(entry.ParagraphNode, {
        node: { type: 'paragraph' },
        children: 'Paragraph',
      }),
    },
    {
      name: 'HtmlBlockNode',
      element: React.createElement(entry.HtmlBlockNode, {
        node: { type: 'html_block', content: '<div><strong>Block HTML</strong></div>' },
      }),
    },
    {
      name: 'HtmlInlineNode',
      element: React.createElement(entry.HtmlInlineNode, {
        node: { type: 'html_inline', content: '<span>Inline HTML</span>' },
      }),
    },
    {
      name: 'ImageNode',
      element: React.createElement(entry.ImageNode, {
        node: {
          type: 'image',
          src: DEMO_IMAGE_SRC,
          alt: 'Demo image',
          title: 'Demo image',
          raw: '![Demo image](https://example.com/demo.png)',
        },
      }),
    },
    {
      name: 'InlineCodeNode',
      element: React.createElement(entry.InlineCodeNode, {
        node: { type: 'inline_code', code: 'inline-demo' },
      }),
    },
    {
      name: 'LinkNode',
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
      element: React.createElement(entry.ListItemNode, {
        node: { type: 'list_item' },
        children: 'List item',
      }),
    },
    {
      name: 'ListNode',
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
      element: React.createElement(entry.ReferenceNode, {
        node: { type: 'reference', id: 'ref-1' },
      }),
    },
    {
      name: 'TableNode',
      element: React.createElement(entry.TableNode, withCtx({
        node: tableNode(),
      })),
    },
    {
      name: 'TextNode',
      element: React.createElement(entry.TextNode, {
        node: { type: 'text', content: 'Text body' },
      }),
    },
    {
      name: 'ThematicBreakNode',
      element: React.createElement(entry.ThematicBreakNode, {
        node: { type: 'thematic_break' },
      }),
    },
    {
      name: 'Tooltip',
      element: React.createElement(entry.Tooltip, {
        visible: true,
        anchorEl: null,
        content: 'Tooltip body',
      }),
    },
    {
      name: 'HtmlPreviewFrame',
      element: React.createElement(entry.HtmlPreviewFrame, {
        code: '<p>Preview</p>',
      }),
    },
    {
      name: 'VmrContainerNode',
      element: React.createElement(entry.VmrContainerNode, withCtx({
        node: vmrContainerNode(),
      })),
    },
    {
      name: 'FallbackComponent',
      element: React.createElement(entry.FallbackComponent, {
        node: { type: 'mystery' },
      }),
    },
  ]
}
