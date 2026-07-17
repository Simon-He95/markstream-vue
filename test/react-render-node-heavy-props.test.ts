/**
 * @vitest-environment node
 */

import type { RenderContext } from '../packages/markstream-react/src/types'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { HtmlBlockNode as ReactHtmlBlockNode } from '../packages/markstream-react/src/components/HtmlBlockNode/HtmlBlockNode'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../packages/markstream-react/src/customComponents'
import { renderNode as clientRenderNode } from '../packages/markstream-react/src/renderers/renderNode'
import {
  HtmlBlockNode as ReactServerHtmlBlockNode,
  renderNode as serverRenderNode,
} from '../packages/markstream-react/src/server-renderer/index'

const packageRequire = createRequire(new URL('../package.json', import.meta.url))
const React = packageRequire('react') as typeof import('react')
const { renderToStaticMarkup } = packageRequire('react-dom/server') as typeof import('react-dom/server')

function ExactLanguageProbe() {
  return null
}

function GenericCodeBlockProbe() {
  return null
}

function CustomMermaidProbe() {
  return null
}

function CustomInfographicProbe() {
  return null
}

function CustomD2Probe() {
  return null
}

function CustomD2LangProbe() {
  return null
}

function CodeBlockForwardingProbe(props: any) {
  return React.createElement('div', {
    'className': 'code-block-forwarding-probe',
    'data-dark-theme': String(props.darkTheme ?? ''),
    'data-light-theme': String(props.lightTheme ?? ''),
    'data-themes': Array.isArray(props.themes) ? props.themes.join(',') : '',
    'data-langs': Array.isArray(props.langs) ? props.langs.join(',') : '',
  })
}

describe('markstream-react heavy-node prop forwarding', () => {
  const baseCtx: RenderContext = {
    customId: 'react-heavy-props-test',
    isDark: false,
    indexKey: 'react-heavy-props-test',
    typewriter: false,
    codeBlockProps: {},
    mermaidProps: {},
    d2Props: {},
    infographicProps: {},
    showTooltips: true,
    codeBlockStream: true,
    renderCodeBlocksAsPre: false,
    customComponents: {},
    customHtmlTags: [],
    events: {},
  }

  it('forwards mermaidProps to MermaidBlockNode render output', () => {
    const ctx: RenderContext = {
      ...baseCtx,
      mermaidProps: {
        showHeader: false,
        renderDebounceMs: 180,
      },
    }

    const element = clientRenderNode({
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    } as any, 'mermaid-props', ctx) as any

    expect(element?.props?.showHeader).toBe(false)
    expect(element?.props?.renderDebounceMs).toBe(180)
    expect(element?.props?.estimatedPreviewHeightPx).toBe(360)
  })

  it('does not let codeBlockProps override default code block structural props', () => {
    const realNode = {
      type: 'code_block',
      language: 'ts',
      code: 'export const real = 1',
      raw: '```ts\nexport const real = 1\n```',
    }
    const fakeNode = {
      type: 'code_block',
      language: 'python',
      code: 'wrong = True',
      raw: '```python\nwrong = True\n```',
    }
    const ctx: RenderContext = {
      ...baseCtx,
      codeBlockProps: {
        key: 'wrong-key',
        node: fakeNode,
        ref: 'wrong-ref',
        ctx: { unsafe: true },
        renderNode: null,
        indexKey: 'wrong-index',
        ['__proto__']: { unsafe: true },
        prototype: { unsafe: true },
        constructor: { unsafe: true },
        showHeader: false,
      },
    }

    const clientElement = clientRenderNode(realNode as any, 'client-default-code', ctx) as any
    const serverElement = serverRenderNode(realNode as any, 'server-default-code', ctx) as any

    expect(clientElement?.key).toBe('client-default-code')
    expect(clientElement?.props?.node).toBe(realNode)
    expect(clientElement?.props?.showHeader).toBe(false)
    expect(clientElement?.props?.ctx).toBeUndefined()
    expect(clientElement?.props?.renderNode).toBeUndefined()
    expect(clientElement?.props?.indexKey).toBeUndefined()
    expect(clientElement?.ref).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(clientElement?.props ?? {}, '__proto__')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(clientElement?.props ?? {}, 'prototype')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(clientElement?.props ?? {}, 'constructor')).toBe(false)

    expect(serverElement?.key).toBe('server-default-code')
    expect(serverElement?.props?.node).toBe(realNode)
    expect(serverElement?.props?.showHeader).toBe(false)
    expect(serverElement?.props?.ctx).toBeUndefined()
    expect(serverElement?.props?.renderNode).toBeUndefined()
    expect(serverElement?.props?.indexKey).toBeUndefined()
    expect(serverElement?.ref).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(serverElement?.props ?? {}, '__proto__')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(serverElement?.props ?? {}, 'prototype')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(serverElement?.props ?? {}, 'constructor')).toBe(false)
  })

  it('forwards configured themes to the default client code block', () => {
    const ctx: RenderContext = {
      ...baseCtx,
      codeBlockThemes: {
        darkTheme: 'vitesse-dark',
        lightTheme: 'vitesse-light',
      },
    }

    const element = clientRenderNode({
      type: 'code_block',
      language: 'ts',
      code: 'export const value = 1',
      raw: '```ts\nexport const value = 1\n```',
    } as any, 'default-code-theme', ctx) as any

    expect(element?.props?.darkTheme).toBe('vitesse-dark')
    expect(element?.props?.lightTheme).toBe('vitesse-light')
  })

  it('injects stable preview height estimates for client Mermaid and Infographic custom renderers', () => {
    const longMermaidCode = 'flowchart TD\nA-->B\nB-->C\nC-->D\nD-->E\nE-->F\nF-->G\nG-->H\nH-->I\nI-->J\nJ-->K\nK-->L\n'
    const infographicCode = ['# Release progress', '- Plan: complete', '- Build: active', '- Verify: pending'].join('\n')
    const ctx: RenderContext = {
      ...baseCtx,
      customComponents: {
        mermaid: CustomMermaidProbe,
        infographic: CustomInfographicProbe,
      },
    }

    const mermaidElement = clientRenderNode({
      type: 'code_block',
      language: 'mermaid',
      code: longMermaidCode,
      raw: `\`\`\`mermaid\n${longMermaidCode}\`\`\``,
    } as any, 'mermaid-client-estimate', ctx) as any

    const infographicElement = clientRenderNode({
      type: 'code_block',
      language: 'infographic',
      code: infographicCode,
      raw: `\`\`\`infographic\n${infographicCode}\`\`\``,
    } as any, 'infographic-client-estimate', ctx) as any

    expect(mermaidElement?.type).toBe(CustomMermaidProbe)
    expect(mermaidElement?.props?.estimatedPreviewHeightPx).toBe(500)
    expect(infographicElement?.type).toBe(CustomInfographicProbe)
    expect(infographicElement?.props?.estimatedPreviewHeightPx).toBe(500)
  })

  it('prefers exact language overrides over code_block fallback on the client renderer', () => {
    const ctx: RenderContext = {
      ...baseCtx,
      codeBlockProps: {
        showHeader: false,
      },
      customComponents: {
        echarts: ExactLanguageProbe,
        code_block: GenericCodeBlockProbe,
      },
    }

    const exactElement = clientRenderNode({
      type: 'code_block',
      language: 'echarts',
      code: 'option = {}',
      raw: '```echarts\noption = {}\n```',
    } as any, 'echarts-client', ctx) as any

    const genericElement = clientRenderNode({
      type: 'code_block',
      language: 'ts',
      code: 'export const value = 1',
      raw: '```ts\nexport const value = 1\n```',
    } as any, 'ts-client', ctx) as any

    expect(exactElement?.type).toBe(ExactLanguageProbe)
    expect(exactElement?.props?.node?.language).toBe('echarts')
    expect(exactElement?.props?.ctx?.codeBlockProps).toEqual({ showHeader: false })
    expect(genericElement?.type).toBe(GenericCodeBlockProbe)
    expect(genericElement?.props?.node?.language).toBe('ts')
    expect(genericElement?.props?.ctx?.codeBlockProps).toEqual({ showHeader: false })
  })

  it('forwards top-level Shiki themes and langs through React NodeRenderer custom code_block renderers', () => {
    const customId = 'react-node-renderer-shiki-forwarding'

    try {
      setCustomComponents(customId, {
        code_block: CodeBlockForwardingProbe as any,
      })

      const html = renderToStaticMarkup(
        React.createElement(NodeRenderer, {
          customId,
          content: '```ts\nconst value = 1\n```',
          final: true,
          renderCodeBlocksAsPre: false,
          codeBlockDarkTheme: 'github-dark',
          codeBlockLightTheme: 'github-light',
          themes: ['github-dark', 'github-light'],
          langs: ['ts', 'js'],
        }),
      )

      expect(html).toContain('data-dark-theme="github-dark"')
      expect(html).toContain('data-light-theme="github-light"')
      expect(html).toContain('data-themes="github-dark,github-light"')
      expect(html).toContain('data-langs="ts,js"')
    }
    finally {
      removeCustomComponents(customId)
    }
  })

  it('keeps specialized mermaid routing ahead of code_block fallback on the client renderer', () => {
    const ctx: RenderContext = {
      ...baseCtx,
      mermaidProps: {
        showHeader: false,
        renderDebounceMs: 180,
      },
      customComponents: {
        mermaid: CustomMermaidProbe,
        code_block: GenericCodeBlockProbe,
      },
    }

    const element = clientRenderNode({
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    } as any, 'mermaid-client-priority', ctx) as any

    expect(element?.type).toBe(CustomMermaidProbe)
    expect(element?.props?.showHeader).toBe(false)
    expect(element?.props?.renderDebounceMs).toBe(180)
    expect(element?.props?.estimatedPreviewHeightPx).toBe(360)
    expect(element?.props?.stream).toBeUndefined()
    expect(element?.props?.langs).toBeUndefined()
    expect(element?.props?.ctx).toBeUndefined()
  })

  it('lets d2lang exact overrides beat d2 fallback on the client renderer', () => {
    const ctx: RenderContext = {
      ...baseCtx,
      d2Props: {
        themeId: 7,
      },
      customComponents: {
        d2: CustomD2Probe,
        d2lang: CustomD2LangProbe,
      },
    }

    const element = clientRenderNode({
      type: 'code_block',
      language: 'd2lang',
      code: 'a -> b',
      raw: '```d2lang\na -> b\n```',
    } as any, 'd2lang-client', ctx) as any

    expect(element?.type).toBe(CustomD2LangProbe)
    expect(element?.props?.themeId).toBe(7)
  })

  it('prefers exact language overrides over code_block fallback on the server renderer', () => {
    const ctx: RenderContext = {
      ...baseCtx,
      codeBlockProps: {
        showHeader: false,
      },
      customComponents: {
        echarts: ExactLanguageProbe,
        code_block: GenericCodeBlockProbe,
      },
    }

    const exactElement = serverRenderNode({
      type: 'code_block',
      language: 'echarts',
      code: 'option = {}',
      raw: '```echarts\noption = {}\n```',
    } as any, 'echarts-server', ctx) as any

    const genericElement = serverRenderNode({
      type: 'code_block',
      language: 'ts',
      code: 'export const value = 1',
      raw: '```ts\nexport const value = 1\n```',
    } as any, 'ts-server', ctx) as any

    expect(exactElement?.type).toBe(ExactLanguageProbe)
    expect(exactElement?.props?.node?.language).toBe('echarts')
    expect(exactElement?.props?.ctx?.codeBlockProps).toEqual({ showHeader: false })
    expect(genericElement?.type).toBe(GenericCodeBlockProbe)
    expect(genericElement?.props?.node?.language).toBe('ts')
    expect(genericElement?.props?.ctx?.codeBlockProps).toEqual({ showHeader: false })
  })

  it('keeps specialized mermaid routing ahead of code_block fallback on the server renderer', () => {
    const ctx: RenderContext = {
      ...baseCtx,
      mermaidProps: {
        showHeader: false,
        renderDebounceMs: 180,
      },
      customComponents: {
        mermaid: CustomMermaidProbe,
        code_block: GenericCodeBlockProbe,
      },
    }

    const element = serverRenderNode({
      type: 'code_block',
      language: 'mermaid',
      code: 'graph LR\nA-->B\n',
      raw: '```mermaid\ngraph LR\nA-->B\n```',
    } as any, 'mermaid-server-priority', ctx) as any

    expect(element?.type).toBe(CustomMermaidProbe)
    expect(element?.props?.showHeader).toBe(false)
    expect(element?.props?.renderDebounceMs).toBe(180)
    expect(element?.props?.estimatedPreviewHeightPx).toBe(360)
    expect(element?.props?.stream).toBeUndefined()
    expect(element?.props?.langs).toBeUndefined()
    expect(element?.props?.ctx).toBeUndefined()
  })

  it('injects stable preview height estimates for server Mermaid and Infographic custom renderers', () => {
    const longMermaidCode = 'flowchart TD\nA-->B\nB-->C\nC-->D\nD-->E\nE-->F\nF-->G\nG-->H\nH-->I\nI-->J\nJ-->K\nK-->L\n'
    const infographicCode = ['# Release progress', '- Plan: complete', '- Build: active', '- Verify: pending'].join('\n')
    const ctx: RenderContext = {
      ...baseCtx,
      customComponents: {
        mermaid: CustomMermaidProbe,
        infographic: CustomInfographicProbe,
      },
    }

    const mermaidElement = serverRenderNode({
      type: 'code_block',
      language: 'mermaid',
      code: longMermaidCode,
      raw: `\`\`\`mermaid\n${longMermaidCode}\`\`\``,
    } as any, 'mermaid-server-estimate', ctx) as any

    const infographicElement = serverRenderNode({
      type: 'code_block',
      language: 'infographic',
      code: infographicCode,
      raw: `\`\`\`infographic\n${infographicCode}\`\`\``,
    } as any, 'infographic-server-estimate', ctx) as any

    expect(mermaidElement?.type).toBe(CustomMermaidProbe)
    expect(mermaidElement?.props?.estimatedPreviewHeightPx).toBe(500)
    expect(infographicElement?.type).toBe(CustomInfographicProbe)
    expect(infographicElement?.props?.estimatedPreviewHeightPx).toBe(500)
  })

  it('lets d2lang exact overrides beat d2 fallback on the server renderer', () => {
    const ctx: RenderContext = {
      ...baseCtx,
      d2Props: {
        themeId: 7,
      },
      customComponents: {
        d2: CustomD2Probe,
        d2lang: CustomD2LangProbe,
      },
    }

    const element = serverRenderNode({
      type: 'code_block',
      language: 'd2lang',
      code: 'a -> b',
      raw: '```d2lang\na -> b\n```',
    } as any, 'd2lang-server', ctx) as any

    expect(element?.type).toBe(CustomD2LangProbe)
    expect(element?.props?.themeId).toBe(7)
  })

  it('sanitizes dangerous attrs on the client structured html wrapper path', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReactHtmlBlockNode, {
        node: {
          type: 'html_block',
          tag: 'a',
          content: '<a href="javascript:alert(1)" onclick="alert(1)" data-safe="ok"></a>',
          attrs: [
            ['href', 'javascript:alert(1)'],
            ['onclick', 'alert(1)'],
            ['data-safe', 'ok'],
          ],
          children: [
            {
              type: 'paragraph',
              raw: 'safe child',
              children: [{ type: 'text', raw: 'safe child', content: 'safe child' }],
            },
          ],
          loading: false,
        },
        ctx: baseCtx,
        renderNode: clientRenderNode,
        indexKey: 'client-html-attrs',
        customId: baseCtx.customId,
      } as any),
    )

    expect(html).toContain('data-safe="ok"')
    expect(html).not.toContain('onclick=')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('safe child')
  })

  it('sanitizes dangerous attrs on the server structured html wrapper path', () => {
    const html = renderToStaticMarkup(
      React.createElement(ReactServerHtmlBlockNode, {
        node: {
          type: 'html_block',
          tag: 'a',
          content: '<a href="javascript:alert(1)" onclick="alert(1)" data-safe="ok"></a>',
          attrs: [
            ['href', 'javascript:alert(1)'],
            ['onclick', 'alert(1)'],
            ['data-safe', 'ok'],
          ],
          children: [
            {
              type: 'paragraph',
              raw: 'safe child',
              children: [{ type: 'text', raw: 'safe child', content: 'safe child' }],
            },
          ],
        },
        ctx: baseCtx,
        renderNode: serverRenderNode,
        indexKey: 'server-html-attrs',
        customId: baseCtx.customId,
      } as any),
    )

    expect(html).toContain('data-safe="ok"')
    expect(html).not.toContain('onclick=')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('safe child')
  })

  it('keeps literal-content tags on the raw html path for both client and server renderers', () => {
    const node = {
      type: 'html_block',
      tag: 'pre',
      content: '<pre>\n\n- alpha\n\n</pre>',
      children: [
        {
          type: 'list',
          raw: '',
          ordered: false,
          items: [
            {
              type: 'list_item',
              raw: '',
              children: [
                {
                  type: 'paragraph',
                  raw: '',
                  children: [{ type: 'text', raw: '', content: 'alpha' }],
                },
              ],
            },
          ],
        },
      ],
      loading: false,
    }

    const clientHtml = renderToStaticMarkup(
      React.createElement(ReactHtmlBlockNode, {
        node,
        ctx: baseCtx,
        renderNode: clientRenderNode,
        indexKey: 'client-pre-raw',
        customId: baseCtx.customId,
      } as any),
    )
    const serverHtml = renderToStaticMarkup(
      React.createElement(ReactServerHtmlBlockNode, {
        node,
        ctx: baseCtx,
        renderNode: serverRenderNode,
        indexKey: 'server-pre-raw',
        customId: baseCtx.customId,
      } as any),
    )

    expect(clientHtml).not.toContain('<ul>')
    expect(clientHtml).toContain('<pre>')
    expect(serverHtml).not.toContain('<ul>')
    expect(serverHtml).toContain('<pre>')
  })
})
