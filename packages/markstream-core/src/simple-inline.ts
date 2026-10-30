export interface SimpleInlineNode {
  type: string
  raw?: string
  children?: SimpleInlineNode[]
  [key: string]: unknown
}

export type SimpleInlineTextNode = SimpleInlineNode & {
  type: 'text'
  content?: unknown
  center?: boolean
}

const SIMPLE_INLINE_TYPES = '|checkbox|checkbox_input|emoji|emphasis|hardbreak|highlight|inline_code|insert|link|reference|strikethrough|strong|subscript|superscript|text|'

const SIMPLE_INLINE_CONTAINER_TYPES = '|emphasis|highlight|insert|link|strikethrough|strong|subscript|superscript|'

export function isSimpleInlineNode(node: SimpleInlineNode) {
  if (!node || typeof node !== 'object')
    return false

  const type = `|${node.type}|`
  if (!SIMPLE_INLINE_TYPES.includes(type))
    return false

  if (!SIMPLE_INLINE_CONTAINER_TYPES.includes(type))
    return true

  const children = node.children
  return Array.isArray(children) && children.every(isSimpleInlineNode)
}

export function resolveSimpleInlineChildren(
  nodes: readonly SimpleInlineNode[] | undefined,
  allowSingleParagraph = true,
  allowEmpty = false,
): readonly SimpleInlineNode[] | null {
  if (!nodes || (!allowEmpty && nodes.length === 0))
    return null

  if (nodes.every(isSimpleInlineNode))
    return nodes

  if (!allowSingleParagraph || nodes.length !== 1)
    return null

  const only = nodes[0]
  if (only?.type !== 'paragraph' || !Array.isArray(only.children))
    return null

  const paragraphChildren = only.children
  return (allowEmpty || paragraphChildren.length > 0) && paragraphChildren.every(isSimpleInlineNode)
    ? paragraphChildren
    : null
}

export function getPlainTextContent(
  nodes: readonly SimpleInlineNode[] | undefined,
) {
  if (!nodes?.length)
    return null

  let content = ''

  for (const node of nodes) {
    if (node?.type !== 'text' || (node as SimpleInlineTextNode).center === true)
      return null

    content += String((node as SimpleInlineTextNode).content ?? node.raw ?? '')
  }

  return content
}
