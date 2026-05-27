import type { ComponentType } from 'react'
import type { HtmlPolicy } from 'stream-markdown-parser'
import type { CustomComponentMap } from '../../customComponents'
import type { NodeComponentProps } from '../../types/node-component'
import type { HtmlToken } from '../../utils/htmlToReact'
import React, { useEffect, useRef, useState } from 'react'
import { BLOCKED_HTML_TAGS as BLOCKED_TAGS, convertHtmlAttrsToProps, isHtmlTagBlocked, isHtmlTagHardBlocked, sanitizeHtmlContent } from 'stream-markdown-parser'
import { getCustomNodeComponents } from '../../customComponents'
import {
  hasCustomHtmlComponents,
  isCustomHtmlComponent,
  normalizeDomAttrs,
  sanitizeHtmlAttrs,
  tokenizeHtml,
} from '../../utils/htmlToReact'

const SHOULD_LOG = (() => {
  try {
    return Boolean((import.meta as any).env?.DEV)
  }
  catch {}
  return false
})()

function warn(message: string) {
  if (SHOULD_LOG)
    console.warn(message)
}

function logError(message: string, err: unknown) {
  if (SHOULD_LOG)
    console.error(message, err)
}

function convertAttrsToProps(attrs: Record<string, string>): Record<string, any> {
  return convertHtmlAttrsToProps(attrs)
}

function renderLiteralTagText(tagName: string, attrs?: Record<string, string>, isSelfClosing = false) {
  const pairs = Object.entries(attrs ?? {})
  const serializedAttrs = pairs.length > 0
    ? pairs.map(([name, value]) => value === '' ? ` ${name}` : ` ${name}="${value}"`).join('')
    : ''
  return isSelfClosing
    ? `<${tagName}${serializedAttrs} />`
    : `<${tagName}${serializedAttrs}>`
}

function pushRenderedNode(target: React.ReactNode[], rendered: React.ReactNode | React.ReactNode[] | null) {
  if (Array.isArray(rendered))
    target.push(...rendered)
  else if (rendered != null)
    target.push(rendered)
}

/**
 * Build React element tree from tokens
 */
function buildReactElementTree(
  tokens: HtmlToken[],
  customComponents: CustomComponentMap,
  htmlPolicy: HtmlPolicy = 'safe',
): React.ReactNode[] {
  let autoKeySeed = 0
  const stack: Array<{
    tagName: string
    children: React.ReactNode[]
    attrs?: Record<string, string>
    hardBlocked?: boolean
    softBlocked?: boolean
    customComponent?: boolean
  }> = []
  const rootNodes: React.ReactNode[] = []

  for (const token of tokens) {
    if (token.type === 'text') {
      if (stack.length > 0 && stack[stack.length - 1].hardBlocked)
        continue
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      target.push(token.content!)
    }
    else if (token.type === 'self_closing') {
      const customComponent = isCustomHtmlComponent(token.tagName!, customComponents)
      if (BLOCKED_TAGS.has(token.tagName!.toLowerCase()) || (!customComponent && isHtmlTagHardBlocked(token.tagName, htmlPolicy)))
        continue
      if (!customComponent && isHtmlTagBlocked(token.tagName, htmlPolicy)) {
        const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
        target.push(renderLiteralTagText(token.tagName!, token.attrs || {}, true))
        continue
      }
      const element = createReactElement(token.tagName!, token.attrs || {}, [], customComponents, `ms-html-${autoKeySeed++}`, htmlPolicy)
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      pushRenderedNode(target, element)
    }
    else if (token.type === 'tag_open') {
      const parentHardBlocked = stack.length > 0 && stack[stack.length - 1].hardBlocked
      const customComponent = isCustomHtmlComponent(token.tagName!, customComponents)
      stack.push({
        tagName: token.tagName!,
        children: [],
        attrs: token.attrs,
        customComponent,
        hardBlocked: parentHardBlocked || BLOCKED_TAGS.has(token.tagName!.toLowerCase()) || (!customComponent && isHtmlTagHardBlocked(token.tagName, htmlPolicy)),
        softBlocked: !parentHardBlocked && !customComponent && isHtmlTagBlocked(token.tagName, htmlPolicy),
      })
    }
    else if (token.type === 'tag_close') {
      const closingTag = token.tagName!.toLowerCase()

      // Find matching opening tag (handle nested same tags)
      let matchedIndex = -1
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tagName.toLowerCase() === closingTag) {
          matchedIndex = i
          break
        }
      }

      if (matchedIndex !== -1) {
        // Pop all tags until the matched one (auto-closing intermediate tags)
        while (stack.length > matchedIndex) {
          const opening = stack.pop()!
          let element: React.ReactNode | React.ReactNode[] | null
          if (opening.hardBlocked) {
            element = null
          }
          else if (opening.softBlocked) {
            element = [
              renderLiteralTagText(opening.tagName, opening.attrs || {}),
              ...opening.children,
              `</${opening.tagName}>`,
            ]
          }
          else {
            element = createReactElement(opening.tagName, opening.attrs || {}, opening.children, customComponents, `ms-html-${autoKeySeed++}`, htmlPolicy)
          }

          if (stack.length > 0)
            pushRenderedNode(stack[stack.length - 1].children, element)
          else
            pushRenderedNode(rootNodes, element)

          // Warn if auto-closing tags
          if (opening.tagName.toLowerCase() !== closingTag && stack.length > matchedIndex) {
            warn(`Auto-closing unclosed tag: <${opening.tagName}>`)
          }
        }
      }
      else {
        // No matching opening tag, warn and ignore
        warn(`Ignoring closing tag with no matching opening tag: </${token.tagName}>`)
      }
    }
  }

  // Handle any remaining unclosed tags
  while (stack.length > 0) {
    const unclosed = stack.pop()!
    let element: React.ReactNode | React.ReactNode[] | null
    if (unclosed.hardBlocked) {
      element = null
    }
    else if (unclosed.softBlocked) {
      element = [
        renderLiteralTagText(unclosed.tagName, unclosed.attrs || {}),
        ...unclosed.children,
        `</${unclosed.tagName}>`,
      ]
    }
    else {
      element = createReactElement(unclosed.tagName, unclosed.attrs || {}, unclosed.children, customComponents, `ms-html-${autoKeySeed++}`, htmlPolicy)
    }
    pushRenderedNode(rootNodes, element)
    warn(`Auto-closing unclosed tag: <${unclosed.tagName}>`)
  }

  return rootNodes
}

/**
 * Create React element for a tag
 */
function createReactElement(
  tagName: string,
  attrs: Record<string, string>,
  children: React.ReactNode[],
  customComponents: CustomComponentMap,
  autoKey: string,
  htmlPolicy: HtmlPolicy,
): React.ReactNode {
  const customComponent = isCustomHtmlComponent(tagName, customComponents)
  if (BLOCKED_TAGS.has(tagName.toLowerCase()) || (!customComponent && isHtmlTagHardBlocked(tagName, htmlPolicy)))
    return null

  if (!customComponent && isHtmlTagBlocked(tagName, htmlPolicy)) {
    return [
      renderLiteralTagText(tagName, attrs),
      ...children,
      `</${tagName}>`,
    ]
  }

  const sanitizedAttrs = sanitizeHtmlAttrs(attrs, htmlPolicy, tagName)
  const explicitKey = (sanitizedAttrs as any).key
  const elementKey = explicitKey != null && explicitKey !== '' ? explicitKey : autoKey

  if (customComponent) {
    // It's a custom React component
    const component = customComponents[tagName] || customComponents[tagName.toLowerCase()]
    const convertedAttrs = convertAttrsToProps(sanitizedAttrs)
    return React.createElement(component as ComponentType<Record<string, unknown>>, { ...convertedAttrs, key: elementKey }, ...children)
  }
  else {
    // It's a standard HTML element
    return React.createElement(tagName, { ...normalizeDomAttrs(sanitizedAttrs), key: elementKey }, ...children)
  }
}

/**
 * Parse HTML content to React elements
 */
function parseHtmlToReactNodes(
  content: string,
  customComponents: CustomComponentMap,
  htmlPolicy: HtmlPolicy = 'safe',
): React.ReactNode[] | null {
  if (!content)
    return []

  try {
    const tokens = tokenizeHtml(content)
    const nodes = buildReactElementTree(tokens, customComponents, htmlPolicy)
    return nodes
  }
  catch (error) {
    logError('Failed to parse HTML to React nodes:', error)
    return null
  }
}

export function HtmlInlineNode(props: NodeComponentProps<{
  type: 'html_inline'
  content: string
  loading?: boolean
  autoClosed?: boolean
}> & { htmlPolicy?: HtmlPolicy }) {
  const { node, customId } = props
  const htmlPolicy = props.htmlPolicy ?? props.ctx?.htmlPolicy ?? 'safe'
  const containerRef = useRef<HTMLSpanElement>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
  }, [])

  // Get custom components from global registry
  const customComponents = getCustomNodeComponents(customId)
  const safeHtmlContent = React.useMemo(() => sanitizeHtmlContent(node.content ?? '', htmlPolicy), [htmlPolicy, node.content])

  // Computed property to determine render mode and content
  const renderMode = React.useMemo(() => {
    const content = node.content
    if (!content)
      return { mode: 'html', content: '' }

    if (htmlPolicy === 'escape')
      return { mode: 'html', content }

    // Check if content contains custom components
    if (!hasCustomHtmlComponents(content, customComponents))
      return { mode: 'html', content }

    // Parse and build React element tree
    const nodes = parseHtmlToReactNodes(content, customComponents, htmlPolicy)
    if (nodes === null)
      return { mode: 'html', content } // Fallback to dangerouslySetInnerHTML if parsing fails

    return { mode: 'dynamic', nodes }
  }, [customComponents, htmlPolicy, node.content])

  // Use DOM manipulation for pure HTML (mode: 'html')
  useEffect(() => {
    if (!isClient || !containerRef.current || renderMode.mode !== 'html')
      return

    const host = containerRef.current
    host.innerHTML = ''
    const template = document.createElement('template')
    template.innerHTML = safeHtmlContent
    host.appendChild(template.content.cloneNode(true))
  }, [renderMode.mode, isClient, safeHtmlContent])

  // Loading state handling
  if (node.loading && !node.autoClosed) {
    return (
      <span className="html-inline-node html-inline-node--loading">
        {node.content}
      </span>
    )
  }

  // Dynamic rendering for custom components
  if (renderMode.mode === 'dynamic') {
    return (
      <span
        className="html-inline-node"
        style={{ display: 'inline' }}
      >
        {renderMode.nodes}
      </span>
    )
  }

  // Fallback to DOM rendering for standard HTML
  return (
    <span
      ref={containerRef}
      className="html-inline-node"
      style={{ display: 'inline' }}
    />
  )
}

export default HtmlInlineNode
