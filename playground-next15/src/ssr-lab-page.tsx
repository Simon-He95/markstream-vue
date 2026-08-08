import React from 'react'
import { HydrationProbe, NextCustomRenderer, NextExportMatrix } from './ssr-lab-client'
import {
  BASIC_NEXT_MARKDOWN,
  createMatrixCases,
  ENHANCED_DEMOS,
  FALLBACK_DEMOS,
  NEXT_CUSTOM_ALT_ID,
  NEXT_CUSTOM_ALT_NODES,
  NEXT_CUSTOM_ID,
  NEXT_CUSTOM_NODES,
  SERVER_BASIC_NODES,
  SERVER_CUSTOM_ALT_ID,
  SERVER_CUSTOM_ALT_NODES,
  SERVER_CUSTOM_ID,
  SERVER_CUSTOM_NODES,
} from './ssr-lab-data'

function readAttr(node: any, name: string) {
  if (!node?.attrs)
    return undefined
  if (Array.isArray(node.attrs))
    return node.attrs.find((item: [string, string | null]) => item[0] === name)?.[1] ?? undefined
  return node.attrs[name]
}

function renderCustomChildren(props: any) {
  if (!Array.isArray(props.node?.children) || !props.renderNode || !props.ctx)
    return null

  return props.node.children.map((child: any, idx: number) => (
    <React.Fragment key={`${String(props.indexKey ?? 'custom')}-${idx}`}>
      {props.renderNode(child, `${String(props.indexKey ?? 'custom')}-${idx}`, props.ctx)}
    </React.Fragment>
  ))
}

function ServerParagraphOverride({ node }: any) {
  return (
    <div data-ssr-status="server-paragraph-override">
      {node.raw}
    </div>
  )
}

function ServerInsightNode(props: any) {
  return (
    <section data-ssr-status="server-custom-node">
      <strong>{props.node.label}</strong>
      <div data-ssr-status="server-custom-node-children">
        {renderCustomChildren(props)}
      </div>
    </section>
  )
}

function ServerThinkingTag({ node }: any) {
  return (
    <aside
      data-ssr-status="server-thinking-tag"
      data-ssr-tone={readAttr(node, 'data-tone')}
      data-ssr-scope={readAttr(node, 'data-scope')}
    >
      {node.content}
    </aside>
  )
}

function ServerParagraphAlt({ node }: any) {
  return (
    <div data-ssr-status="server-paragraph-alt">
      {node.raw}
    </div>
  )
}

function ServerInsightAlt(props: any) {
  return (
    <section data-ssr-status="server-custom-node-alt">
      <strong>{props.node.label}</strong>
      <div data-ssr-status="server-custom-node-alt-children">
        {renderCustomChildren(props)}
      </div>
    </section>
  )
}

function ServerThinkingTagAlt({ node }: any) {
  return (
    <aside
      data-ssr-status="server-thinking-tag-alt"
      data-ssr-scope={readAttr(node, 'data-scope')}
    >
      {node.content}
    </aside>
  )
}

function MatrixSection({ caseName, entryName, items }: { caseName: string, entryName: string, items: Array<{ name: string, element: React.ReactElement }> }) {
  return (
    <article data-ssr-case={caseName} data-ssr-entry={entryName}>
      <h2>{entryName === 'next' ? 'Next Export Matrix' : 'Server Export Matrix'}</h2>
      <div className="ssr-matrix">
        {items.map(item => (
          <section key={item.name} data-ssr-export={item.name} className="ssr-card">
            <h3>{item.name}</h3>
            <div className="markstream-react ssr-matrix-renderer">{item.element}</div>
          </section>
        ))}
      </div>
    </article>
  )
}

export function SsrLabPage({
  version,
  router,
  nextEntry,
  serverEntry,
  serverBasicHtml,
  serverCustomHtml,
  serverFallbackHtml,
  serverMatrixHtml,
}: {
  version: string
  router: 'app' | 'pages'
  nextEntry: any
  serverEntry: any
  serverBasicHtml?: string
  serverCustomHtml?: string
  serverFallbackHtml?: string
  serverMatrixHtml?: string
}) {
  serverEntry.setCustomComponents(SERVER_CUSTOM_ID, {
    paragraph: ServerParagraphOverride,
    insight: ServerInsightNode,
    thinking: ServerThinkingTag,
  })
  serverEntry.setCustomComponents(SERVER_CUSTOM_ALT_ID, {
    paragraph: ServerParagraphAlt,
    insight: ServerInsightAlt,
    thinking: ServerThinkingTagAlt,
  })

  const serverMatrix = createMatrixCases(serverEntry, serverEntry)

  return (
    <main data-ssr-version={version} data-ssr-router={router} className="ssr-lab-shell markstream-react">
      <header className="ssr-hero">
        <p className="ssr-eyebrow">
          {version}
          {' / '}
          {router}
        </p>
        <h1>Markstream React Next SSR Lab</h1>
        <p>Dual entry, dual router, raw HTML first, hydration afterwards.</p>
      </header>

      <div className="ssr-grid">
        <article data-ssr-case="basic" data-ssr-entry="next">
          <h2>Basic / Next</h2>
          <nextEntry.NodeRenderer
            content={BASIC_NEXT_MARKDOWN}
            final
            showTooltips={false}
          />
        </article>

        <article data-ssr-case="basic" data-ssr-entry="server">
          <h2>Basic / Server</h2>
          {serverBasicHtml
            ? <div dangerouslySetInnerHTML={{ __html: serverBasicHtml }} />
            : (
                <serverEntry.NodeRenderer
                  customId={SERVER_CUSTOM_ID}
                  customHtmlTags={['thinking']}
                  nodes={SERVER_BASIC_NODES}
                  final
                  showTooltips={false}
                />
              )}
        </article>

        <article data-ssr-case="custom" data-ssr-entry="next">
          <h2>Custom / Next</h2>
          <section data-ssr-custom-id="next-primary" className="ssr-card">
            <NextCustomRenderer customId={NEXT_CUSTOM_ID} nodes={NEXT_CUSTOM_NODES} />
          </section>
          <section data-ssr-custom-id="next-alt" className="ssr-card">
            <NextCustomRenderer customId={NEXT_CUSTOM_ALT_ID} nodes={NEXT_CUSTOM_ALT_NODES} />
          </section>
        </article>

        <article data-ssr-case="custom" data-ssr-entry="server">
          <h2>Custom / Server</h2>
          {serverCustomHtml
            ? <div dangerouslySetInnerHTML={{ __html: serverCustomHtml }} />
            : (
                <>
                  <section data-ssr-custom-id="server-primary" className="ssr-card">
                    <serverEntry.NodeRenderer
                      customId={SERVER_CUSTOM_ID}
                      customHtmlTags={['thinking']}
                      nodes={SERVER_CUSTOM_NODES}
                      final
                      showTooltips={false}
                    />
                  </section>
                  <section data-ssr-custom-id="server-alt" className="ssr-card">
                    <serverEntry.NodeRenderer
                      customId={SERVER_CUSTOM_ALT_ID}
                      customHtmlTags={['thinking']}
                      nodes={SERVER_CUSTOM_ALT_NODES}
                      final
                      showTooltips={false}
                    />
                  </section>
                </>
              )}
        </article>

        <article data-ssr-case="enhanced" data-ssr-entry="next">
          <h2>Enhanced / Next</h2>
          <div data-ssr-demo="code" className="ssr-card">
            <nextEntry.CodeBlockNode node={ENHANCED_DEMOS.code as any} />
          </div>
          <div data-ssr-demo="markdown" className="ssr-card">
            <nextEntry.CodeBlockNode node={ENHANCED_DEMOS.markdown as any} />
          </div>
          <div data-ssr-demo="math" className="ssr-card">
            <nextEntry.MathBlockNode node={ENHANCED_DEMOS.mathBlock as any} />
            <p>
              Inline math:
              {' '}
              <nextEntry.MathInlineNode node={ENHANCED_DEMOS.mathInline as any} />
            </p>
          </div>
          <div data-ssr-demo="mermaid" className="ssr-card">
            <nextEntry.MermaidBlockNode node={ENHANCED_DEMOS.mermaid as any} />
          </div>
          <div data-ssr-demo="d2" className="ssr-card">
            <nextEntry.D2BlockNode node={ENHANCED_DEMOS.d2 as any} />
          </div>
          <div data-ssr-demo="infographic" className="ssr-card">
            <nextEntry.InfographicBlockNode node={ENHANCED_DEMOS.infographic as any} />
          </div>
        </article>

        <article data-ssr-case="fallback" data-ssr-entry="next">
          <h2>Fallback / Next</h2>
          <div data-ssr-demo="pre" className="ssr-card">
            <nextEntry.PreCodeNode node={FALLBACK_DEMOS.nextPre as any} />
          </div>
        </article>

        <article data-ssr-case="fallback" data-ssr-entry="server">
          <h2>Fallback / Server</h2>
          {serverFallbackHtml
            ? <div dangerouslySetInnerHTML={{ __html: serverFallbackHtml }} />
            : (
                <>
                  <div data-ssr-demo="mermaid" className="ssr-card">
                    <serverEntry.MermaidBlockNode node={FALLBACK_DEMOS.mermaid as any} />
                  </div>
                  <div data-ssr-demo="d2" className="ssr-card">
                    <serverEntry.D2BlockNode node={FALLBACK_DEMOS.d2 as any} />
                  </div>
                  <div data-ssr-demo="infographic" className="ssr-card">
                    <serverEntry.InfographicBlockNode node={FALLBACK_DEMOS.infographic as any} />
                  </div>
                </>
              )}
        </article>

        <NextExportMatrix />
        {serverMatrixHtml
          ? (
              <article data-ssr-case="server-export-matrix" data-ssr-entry="server">
                <h2>Server Export Matrix</h2>
                <div dangerouslySetInnerHTML={{ __html: serverMatrixHtml }} />
              </article>
            )
          : <MatrixSection caseName="server-export-matrix" entryName="server" items={serverMatrix} />}
        <HydrationProbe />
      </div>
    </main>
  )
}
