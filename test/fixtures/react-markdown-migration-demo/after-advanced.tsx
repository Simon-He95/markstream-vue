import type { NodeComponentProps } from 'markstream-react'
import MarkdownRender, { setCustomComponents } from 'markstream-react'
import 'markstream-react/index.css'

function rewriteDocsUrl(url: string) {
  if (url.startsWith('/docs/'))
    return `https://markstream.example.com${url}`
  return url
}

function CustomHeading({ node, ctx, renderNode, indexKey }: NodeComponentProps<any>) {
  const Tag = `h${node.level || 1}` as keyof JSX.IntrinsicElements

  return (
    <Tag className="docs-title">
      {node.children?.map((child: any, i: number) =>
        renderNode && ctx
          ? renderNode(child, `${String(indexKey)}-heading-${i}`, ctx)
          : null,
      )}
    </Tag>
  )
}

function CustomLink({ node, ctx, renderNode, indexKey }: NodeComponentProps<any>) {
  const href = rewriteDocsUrl(node.href)

  return (
    <a href={href} target="_blank" rel="noreferrer">
      {node.children?.map((child: any, i: number) =>
        renderNode && ctx
          ? renderNode(child, `${String(indexKey)}-link-${i}`, ctx)
          : null,
      )}
    </a>
  )
}

setCustomComponents('migration-demo', {
  heading: CustomHeading,
  link: CustomLink,
})

export function AdvancedArticle({ markdown }: { markdown: string }) {
  return (
    <MarkdownRender
      customId="migration-demo"
      content={markdown}
    />
  )
}

// If the previous component depended on `allowedElements`, filter the parsed
// node tree before render. There is no direct allowlist prop on markstream-react.
