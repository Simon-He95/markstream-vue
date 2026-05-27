/**
 * @vitest-environment node
 */

import type { RenderContext } from '../packages/markstream-react/src/types'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { HtmlBlockNode as ReactHtmlBlockNode } from '../packages/markstream-react/src/components/HtmlBlockNode/HtmlBlockNode'
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
