import type { HtmlPolicy, HtmlToken } from 'stream-markdown-parser'
import type { Component } from 'vue'
import type { CustomComponentAttrs } from '../types'
import {
  BLOCKED_HTML_TAGS as BLOCKED_TAGS,
  convertHtmlAttrsToProps,
  convertHtmlPropValue,
  getHtmlTagFromContent,
  hasCompleteHtmlTagContent,
  hasCustomHtmlComponents,
  isCustomHtmlComponentTag,
  isHtmlTagBlocked,
  isHtmlTagHardBlocked,
  sanitizeHtmlAttrs,
  sanitizeHtmlTokenAttrs,
  sanitizeImageSrc,
  shouldRenderUnknownHtmlTagAsText,
  stripCustomHtmlWrapper,
  tokenAttrsToRecord,
  tokenizeHtml,
} from 'stream-markdown-parser'
import { h } from 'vue'

export {
  getHtmlTagFromContent,
  hasCompleteHtmlTagContent,
  isHtmlTagBlocked,
  sanitizeImageSrc,
  shouldRenderUnknownHtmlTagAsText,
  stripCustomHtmlWrapper,
  tokenizeHtml,
}

export type { HtmlPolicy, HtmlToken } from 'stream-markdown-parser'

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

export function isCustomComponent(
  tagName: string,
  customComponents: Record<string, Component>,
): boolean {
  return isCustomHtmlComponentTag(tagName, customComponents as Record<string, unknown>)
}

export function sanitizeAttrs(attrs: Record<string, string>, policy: HtmlPolicy = 'safe', tagName?: string): Record<string, string> {
  return sanitizeHtmlAttrs(attrs, policy, tagName)
}

export function convertPropValue(value: string, key: string): any {
  return convertHtmlPropValue(value, key)
}

export function convertAttrsToProps(attrs: Record<string, string>): Record<string, any> {
  return convertHtmlAttrsToProps(attrs)
}

type CustomNodeAttrs = CustomComponentAttrs | Array<[string, string | null]> | null | undefined

function normalizeCustomAttrValue(value: string | boolean | null | undefined) {
  if (value === true)
    return ''
  if (value === false)
    return 'false'
  return value == null ? null : String(value)
}

function normalizeCustomAttrs(attrs: CustomNodeAttrs): Array<[string, string | null]> | null {
  if (!attrs)
    return null

  if (Array.isArray(attrs)) {
    if (attrs.every(Array.isArray)) {
      return (attrs as Array<[string, string | null]>).map(([name, value]) => [
        String(name),
        normalizeCustomAttrValue(value),
      ] as [string, string | null])
    }

    return attrs
      .filter(item => item && typeof item === 'object' && !Array.isArray(item) && 'name' in item)
      .map(item => [
        String((item as { name: unknown }).name),
        normalizeCustomAttrValue((item as { value?: string | boolean | null }).value),
      ] as [string, string | null])
  }

  return Object.entries(attrs).map(([key, value]) => [
    key,
    normalizeCustomAttrValue(value),
  ] as [string, string | null])
}

export function getCustomNodeAttrs(
  node: { type?: string, tag?: string, attrs?: CustomNodeAttrs },
  htmlPolicy: HtmlPolicy = 'safe',
): Record<string, any> | undefined {
  const tagName = String(node.tag || node.type || '').trim()
  const sanitizedAttrs = sanitizeHtmlTokenAttrs(normalizeCustomAttrs(node.attrs), htmlPolicy, tagName)
  if (!sanitizedAttrs)
    return undefined
  const props = convertAttrsToProps(tokenAttrsToRecord(sanitizedAttrs))
  return Object.keys(props).length > 0 ? props : undefined
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

function pushRenderedNode(target: any[], rendered: any) {
  if (Array.isArray(rendered))
    target.push(...rendered)
  else if (rendered != null)
    target.push(rendered)
}

/**
 * Build VNode tree from tokens
 */
export function buildVNodeTree(
  tokens: HtmlToken[],
  customComponents: Record<string, Component>,
  htmlPolicy: HtmlPolicy = 'safe',
): any[] {
  let autoKeySeed = 0
  const stack: Array<{ tagName: string, children: any[], attrs?: Record<string, string>, autoKey: string }> = []
  const rootNodes: any[] = []

  for (const token of tokens) {
    if (token.type === 'text') {
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      target.push(token.content!)
    }
    else if (token.type === 'self_closing') {
      const vnode = createVNode(token.tagName!, token.attrs || {}, [], customComponents, `ms-html-${autoKeySeed++}`, htmlPolicy, true)
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      pushRenderedNode(target, vnode)
    }
    else if (token.type === 'tag_open') {
      // Assign an auto-key at open time so outer node keys stay stable while
      // streaming content grows (otherwise keys shift based on close order).
      stack.push({
        tagName: token.tagName!,
        children: [],
        attrs: token.attrs,
        autoKey: `ms-html-${autoKeySeed++}`,
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
          const vnode = createVNode(opening.tagName, opening.attrs || {}, opening.children, customComponents, opening.autoKey, htmlPolicy)

          if (stack.length > 0)
            pushRenderedNode(stack[stack.length - 1].children, vnode)
          else
            pushRenderedNode(rootNodes, vnode)

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
    const vnode = createVNode(unclosed.tagName, unclosed.attrs || {}, unclosed.children, customComponents, unclosed.autoKey, htmlPolicy)
    if (stack.length > 0)
      pushRenderedNode(stack[stack.length - 1].children, vnode)
    else
      pushRenderedNode(rootNodes, vnode)
    warn(`Auto-closing unclosed tag: <${unclosed.tagName}>`)
  }

  return rootNodes
}

/**
 * Create VNode for a tag
 */
function createVNode(
  tagName: string,
  attrs: Record<string, string>,
  children: any[],
  customComponents: Record<string, Component>,
  autoKey: string,
  htmlPolicy: HtmlPolicy,
  isSelfClosing = false,
): any {
  const customComponent = isCustomComponent(tagName, customComponents)
  if (BLOCKED_TAGS.has(tagName.toLowerCase()) || (!customComponent && isHtmlTagHardBlocked(tagName, htmlPolicy)))
    return null

  if (!customComponent && isHtmlTagBlocked(tagName, htmlPolicy)) {
    return isSelfClosing
      ? [renderLiteralTagText(tagName, attrs, true)]
      : [
          renderLiteralTagText(tagName, attrs),
          ...children,
          `</${tagName}>`,
        ]
  }

  const sanitizedAttrs = sanitizeHtmlAttrs(attrs, htmlPolicy, tagName)
  const explicitKey = (sanitizedAttrs as any).key
  const vnodeKey = explicitKey != null && explicitKey !== '' ? explicitKey : autoKey

  if (customComponent) {
    // It's a custom Vue component
    const component = customComponents[tagName] || customComponents[tagName.toLowerCase()]
    const convertedAttrs = convertAttrsToProps(sanitizedAttrs)
    return h(component as Component, { ...convertedAttrs, key: vnodeKey }, children.length > 0 ? children : undefined)
  }
  else {
    // It's a standard HTML element
    return h(tagName, { ...sanitizedAttrs, innerHTML: undefined, key: vnodeKey }, children.length > 0 ? children : undefined)
  }
}

/**
 * Check if HTML content contains custom components
 */
export function hasCustomComponents(
  content: string,
  customComponents: Record<string, Component>,
): boolean {
  return hasCustomHtmlComponents(content, customComponents as Record<string, unknown>)
}

/**
 * Parse HTML content to VNodes
 */
export function parseHtmlToVNodes(
  content: string,
  customComponents: Record<string, Component>,
  htmlPolicy: HtmlPolicy = 'safe',
): any[] | null {
  if (!content)
    return []

  try {
    const tokens = tokenizeHtml(content)
    const nodes = buildVNodeTree(tokens, customComponents, htmlPolicy)
    return nodes
  }
  catch (error) {
    logError('Failed to parse HTML to VNodes:', error)
    return null
  }
}
