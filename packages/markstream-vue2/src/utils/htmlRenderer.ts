import type { HtmlPolicy, HtmlToken } from 'stream-markdown-parser'
import type { Component } from 'vue-demi'
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
  shouldRenderUnknownHtmlTagAsText,
  stripCustomHtmlWrapper,
  tokenizeHtml,
} from 'stream-markdown-parser'
import { h as vueH } from 'vue'
import * as VueModule from 'vue-demi'
import { h as demiH } from 'vue-demi'

export {
  getHtmlTagFromContent,
  hasCompleteHtmlTagContent,
  isHtmlTagBlocked,
  shouldRenderUnknownHtmlTagAsText,
  stripCustomHtmlWrapper,
  tokenizeHtml,
}

export type { HtmlPolicy, HtmlToken } from 'stream-markdown-parser'

type CreateElementLike = (tag: any, attrs?: Record<string, any>, children?: any[] | undefined) => any

function getVue2CreateElementFallback(): CreateElementLike | null {
  const anyMod = VueModule as any
  const isVueCtor = (candidate: any) => typeof candidate === 'function' && typeof candidate.extend === 'function'
  const candidates = [
    anyMod,
    anyMod?.default,
    anyMod?.default?.default,
    (anyMod?.default ?? anyMod)?.default,
    anyMod?.Vue2,
    anyMod?.Vue,
  ]
  for (const candidate of candidates) {
    const ctor = isVueCtor(candidate) ? candidate : (isVueCtor(candidate?.default) ? candidate.default : null)
    if (!ctor)
      continue
    try {
      // eslint-disable-next-line new-cap
      const vm = new ctor()
      if (typeof vm.$createElement === 'function')
        return vm.$createElement.bind(vm) as CreateElementLike
    }
    catch {}
  }
  return null
}

const vue2CreateElementFallback = getVue2CreateElementFallback()

function safeRender(
  createElement: CreateElementLike | undefined,
  tag: any,
  attrs?: Record<string, any>,
  children?: any[] | undefined,
) {
  if (createElement)
    return createElement(tag, attrs, children)

  try {
    return vueH(tag as any, attrs as any, children as any)
  }
  catch {}

  try {
    return demiH(tag, attrs, children)
  }
  catch {}

  if (vue2CreateElementFallback)
    return vue2CreateElementFallback(tag, attrs, children)

  return null
}

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

export function sanitizeAttrs(attrs: Record<string, string>): Record<string, string> {
  return sanitizeHtmlAttrs(attrs)
}

export function convertPropValue(value: string, key: string): any {
  return convertHtmlPropValue(value, key)
}

export function convertAttrsToProps(attrs: Record<string, string>): Record<string, any> {
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
  createElement?: CreateElementLike,
  htmlPolicy: HtmlPolicy = 'safe',
): any[] {
  const stack: Array<{ tagName: string, children: any[], attrs?: Record<string, string> }> = []
  const rootNodes: any[] = []

  for (const token of tokens) {
    if (token.type === 'text') {
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      target.push(token.content!)
    }
    else if (token.type === 'self_closing') {
      const vnode = createVNode(token.tagName!, token.attrs || {}, [], customComponents, createElement, htmlPolicy, true)
      const target = stack.length > 0 ? stack[stack.length - 1].children : rootNodes
      pushRenderedNode(target, vnode)
    }
    else if (token.type === 'tag_open') {
      stack.push({ tagName: token.tagName!, children: [], attrs: token.attrs })
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
          const vnode = createVNode(opening.tagName, opening.attrs || {}, opening.children, customComponents, createElement, htmlPolicy)

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
    const vnode = createVNode(unclosed.tagName, unclosed.attrs || {}, unclosed.children, customComponents, createElement, htmlPolicy)
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
  createElement?: CreateElementLike,
  htmlPolicy: HtmlPolicy = 'safe',
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

  if (customComponent) {
    // It's a custom Vue component
    const component = customComponents[tagName] || customComponents[tagName.toLowerCase()]
    const convertedAttrs = convertAttrsToProps(sanitizedAttrs)
    return safeRender(createElement, component as Component, convertedAttrs, children.length > 0 ? children : undefined)
  }
  else {
    // It's a standard HTML element
    const { innerHTML, ...validAttrs } = sanitizedAttrs as any
    return safeRender(createElement, tagName, validAttrs, children.length > 0 ? children : undefined)
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
  createElement?: CreateElementLike,
  htmlPolicy: HtmlPolicy = 'safe',
): any[] | null {
  if (!content)
    return []

  try {
    const tokens = tokenizeHtml(content)
    const nodes = buildVNodeTree(tokens, customComponents, createElement, htmlPolicy)
    return nodes
  }
  catch (error) {
    logError('Failed to parse HTML to VNodes:', error)
    return null
  }
}
