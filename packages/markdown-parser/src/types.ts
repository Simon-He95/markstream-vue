import type { MarkdownIt, Token } from './markdown-it-types'

export interface BaseNode {
  type: string
  raw: string
  loading?: boolean
  code?: string
  diff?: boolean
}

/**
 * A catch‑all node type for user extensions.
 * Must still satisfy the renderer contract (`type` + `raw`), but may carry
 * arbitrary extra fields.
 */
export type UnknownNode = BaseNode & Record<string, unknown>

export interface TextNode extends BaseNode {
  type: 'text'
  content: string
  center?: boolean
}

export interface HeadingNode extends BaseNode {
  type: 'heading'
  level: number
  text: string
  attrs?: Record<string, string | boolean>
  children: ParsedNode[]
}

export interface ParagraphNode extends BaseNode {
  type: 'paragraph'
  children: ParsedNode[]
  maybeCheckbox?: boolean
}

export interface InlineNode extends BaseNode {
  type: 'inline'
  children: ParsedNode[]
  content?: string
}

export interface ListNode extends BaseNode {
  type: 'list'
  ordered: boolean
  // Optional start index for ordered lists (HTML <ol start="N">)
  start?: number
  items: ListItemNode[]
}

export interface ListItemNode extends BaseNode {
  type: 'list_item'
  children: ParsedNode[]
}

export interface CodeBlockNode extends BaseNode {
  type: 'code_block'
  language: string
  code: string
  // Optional: source line range [start, end) from markdown-it token.map
  startLine?: number
  endLine?: number
  // Whether this block is still incomplete (e.g., missing closing fence)
  loading?: boolean
  // Whether this code block represents a diff
  diff?: boolean
  // If diff is true, original and updated code versions
  originalCode?: string
  updatedCode?: string
  raw: string
}

export interface HtmlBlockNode extends BaseNode {
  type: 'html_block'
  attrs?: [string, string][] | null
  tag: string
  content: string
  children?: ParsedNode[]
}

export interface HtmlInlineNode extends BaseNode {
  type: 'html_inline'
  tag?: string
  content: string
  children: ParsedNode[]
  /**
   * True when the parser auto-appended a closing tag for streaming stability.
   * The original source is still incomplete (no explicit close typed yet).
   */
  autoClosed?: boolean
}

export type CustomComponentAttrs
  = | [string, string][]
    | Record<string, string | boolean>
    | Array<{ name: string, value: string | boolean }>
    | null

/**
 * A generic node shape for custom HTML-like components.
 * When a tag name is included in `customHtmlTags`, the parser emits a node
 * whose `type` equals that tag name and carries the raw HTML `content`
 * plus extracted `attrs` from user transforms.
 */
export interface CustomComponentNode extends BaseNode {
  /** The custom tag name (same as `tag`) */
  type: string
  tag: string
  content: string
  attrs?: CustomComponentAttrs
  children?: ParsedNode[]
  autoClosed?: boolean
}

export interface InlineCodeNode extends BaseNode {
  type: 'inline_code'
  code: string
}

export interface LinkNode extends BaseNode {
  type: 'link'
  href: string
  title: string | null
  text: string
  attrs?: [string, string][]
  children: ParsedNode[]
}

export interface ImageNode extends BaseNode {
  type: 'image'
  src: string
  alt: string
  title: string | null
}

export interface ThematicBreakNode extends BaseNode {
  type: 'thematic_break'
}

export interface MermaidBlockNode {
  node: {
    type: 'code_block'
    language: string
    code: string
    loading?: boolean
  }
}

export type MarkdownRender
  = | {
    content: string
    nodes?: undefined
  }
  | {
    content?: undefined
    nodes: BaseNode[]
  }
export interface BlockquoteNode extends BaseNode {
  type: 'blockquote'
  children: ParsedNode[]
}

export interface TableNode extends BaseNode {
  type: 'table'
  header: TableRowNode
  rows: TableRowNode[]
}

export interface TableRowNode extends BaseNode {
  type: 'table_row'
  cells: TableCellNode[]
}

export interface TableCellNode extends BaseNode {
  type: 'table_cell'
  header: boolean
  children: ParsedNode[]
  align?: 'left' | 'right' | 'center'
}

export interface DefinitionListNode extends BaseNode {
  type: 'definition_list'
  items: DefinitionItemNode[]
}

export interface DefinitionItemNode extends BaseNode {
  type: 'definition_item'
  term: ParsedNode[]
  definition: ParsedNode[]
}

export interface FootnoteNode extends BaseNode {
  type: 'footnote'
  id: string
  children: ParsedNode[]
}

export interface FootnoteReferenceNode extends BaseNode {
  type: 'footnote_reference'
  id: string
}

export interface FootnoteAnchorNode extends BaseNode {
  type: 'footnote_anchor'
  id: string
}

export interface AdmonitionNode extends BaseNode {
  type: 'admonition'
  kind: string // 'note' | 'warning' | 'danger' | 'info' | 'tip' 等
  title: string
  children: ParsedNode[]
}

export interface VmrContainerNode extends BaseNode {
  type: 'vmr_container'
  name: string
  /** True while the opening `:::` has been seen but the closing `:::` hasn't (streaming mid-state). */
  loading?: boolean
  attrs?: Record<string, string>
  children: ParsedNode[]
}

export interface StrongNode extends BaseNode {
  type: 'strong'
  children: ParsedNode[]
}

export interface EmphasisNode extends BaseNode {
  type: 'emphasis'
  children: ParsedNode[]
}

export interface StrikethroughNode extends BaseNode {
  type: 'strikethrough'
  children: ParsedNode[]
}

export interface HighlightNode extends BaseNode {
  type: 'highlight'
  children: ParsedNode[]
}

export interface InsertNode extends BaseNode {
  type: 'insert'
  children: ParsedNode[]
}

export interface SubscriptNode extends BaseNode {
  type: 'subscript'
  children: ParsedNode[]
}

export interface SuperscriptNode extends BaseNode {
  type: 'superscript'
  children: ParsedNode[]
}

export interface CheckboxNode extends BaseNode {
  type: 'checkbox'
  checked: boolean
}

export interface CheckboxInputNode extends BaseNode {
  type: 'checkbox_input'
  checked: boolean
}

export interface EmojiNode extends BaseNode {
  type: 'emoji'
  name: string
  markup: string
}

export interface HardBreakNode extends BaseNode {
  type: 'hardbreak'
}

export interface MathInlineNode extends BaseNode {
  type: 'math_inline'
  content: string
  markup?: string
}

export interface MathBlockNode extends BaseNode {
  type: 'math_block'
  content: string
  markup?: string
}

export interface ReferenceNode extends BaseNode {
  type: 'reference'
  id: string
}

export type MarkdownTokenMeta = Record<string, unknown>

type MarkdownTokenBase = Omit<Token, 'children' | 'meta'> & {
  children?: MarkdownToken[] | null
  loading?: boolean
  mark?: string
  meta?: MarkdownTokenMeta | null
  raw?: string
}

// Define markdown-it token type
export interface MarkdownTokenLite {
  type: string
  tag?: string
  content?: string
  info?: string
  mark?: string
  markup?: string
  meta?: MarkdownTokenMeta | null
  map?: [number, number] | number[] | null
  block?: boolean
  hidden?: boolean
  attrs?: [string, string][] | null
  nesting?: number
  level?: number
  children?: MarkdownToken[] | null
  loading?: boolean
  raw?: string
}

export type MarkdownToken = MarkdownTokenBase | MarkdownTokenLite

export type ParsedNode
  = | TextNode
    | HeadingNode
    | ParagraphNode
    | ListNode
    | ListItemNode
    | CodeBlockNode
    | InlineCodeNode
    | LinkNode
    | ImageNode
    | ThematicBreakNode
    | BlockquoteNode
    | TableNode
    | TableRowNode
    | TableCellNode
    | StrongNode
    | EmphasisNode
    | StrikethroughNode
    | HighlightNode
    | InsertNode
    | SubscriptNode
    | SuperscriptNode
    | CheckboxNode
    | CheckboxInputNode
    | EmojiNode
    | DefinitionListNode
    | DefinitionItemNode
    | FootnoteNode
    | FootnoteReferenceNode
    | AdmonitionNode
    | VmrContainerNode
    | HardBreakNode
    | MathInlineNode
    | MathBlockNode
    | ReferenceNode
    | HtmlBlockNode
    | HtmlInlineNode
    | CustomComponentNode
    | UnknownNode
export interface CustomComponents {
  text: unknown
  paragraph: unknown
  heading: unknown
  code_block: unknown
  list: unknown
  blockquote: unknown
  table: unknown
  definition_list: unknown
  footnote: unknown
  footnote_reference: unknown
  admonition: unknown
  hardbreak: unknown
  link: unknown
  image: unknown
  thematic_break: unknown
  math_inline: unknown
  math_block: unknown
  strong: unknown
  emphasis: unknown
  strikethrough: unknown
  highlight: unknown
  insert: unknown
  subscript: unknown
  superscript: unknown
  emoji: unknown
  checkbox: unknown
  inline_code: unknown
  html_inline: unknown
  reference: unknown
  mermaid: unknown
  [key: string]: unknown
}

// Function to parse markdown into a structured representation
export type TransformTokensHook = (tokens: MarkdownToken[]) => MarkdownToken[]

export interface ParseOptions {
  preTransformTokens?: TransformTokensHook
  postTransformTokens?: TransformTokensHook
  /**
   * Defaults to 'auto': use markdown-it-ts' stream parser for non-final
   * top-level document parses when available. Final parses and fragment parses
   * use the regular parser unless streamParse is explicitly true.
   */
  streamParse?: boolean | 'auto'
  // When true, require a closing `**` to parse strong; otherwise allow mid-state strong
  requireClosingStrong?: boolean
  /**
   * When true, indicates the input buffer is complete (end-of-stream).
   * This disables "mid-state" streaming behavior (e.g. unclosed math/link/code
   * tokens staying in a loading state) and keeps trailing markers as literal text.
   */
  final?: boolean
  /**
   * Custom HTML-like tag names that should be emitted as custom nodes
   * instead of `html_inline` when encountered (e.g. ['thinking']).
   * Used by inline parsing; pair with `getMarkdown({ customHtmlTags })`
   * to enable mid-state suppression for the same tags during streaming.
   */
  customHtmlTags?: readonly string[]
  /**
   * If provided, link nodes are only emitted when this returns true for the href.
   * When it returns false, the link is rendered as plain text (the link text only).
   * Typically set from the MarkdownIt instance (e.g. md.options.validateLink or
   * md.set({ validateLink })) so that unsafe URLs (e.g. javascript:) are not
   * output as links.
   */
  validateLink?: (url: string) => boolean
  // When true, log the parsed tree structure for debugging
  debug?: boolean
}

export interface InternalParseOptions extends ParseOptions {
  __customHtmlBlockCursor?: number
  __customHtmlSourceCursor?: number
  __disableStreamParse?: boolean
  __insideStrong?: boolean
  __linkifyDemotionContext?: {
    filename?: boolean
    explicitFilename?: boolean
    marketTicker?: boolean
  }
  __markdownIt?: MarkdownIt
  __sourceMarkdown?: string
}

export type PostTransformNodesHook = (nodes: ParsedNode[]) => ParsedNode[]
