import type { ReactNode } from 'react'
import type { ParsedNode } from 'stream-markdown-parser'
import type { RenderContext, RenderNodeFn } from '../types'
import React from 'react'

export const BLOCK_LEVEL_TYPES = new Set([
  'image',
  'table',
  'code_block',
  'html_block',
  'blockquote',
  'list',
  'list_item',
  'definition_list',
  'footnote',
  'footnote_reference',
  'footnote_anchor',
  'admonition',
  'thematic_break',
  'math_block',
  'thinking',
  'vmr_container',
])

export function tokenAttrsToProps(attrs?: [string, string | null][]) {
  if (!Array.isArray(attrs) || attrs.length === 0)
    return undefined
  return attrs.reduce<Record<string, string | true>>((acc, [name, value]) => {
    if (!name)
      return acc
    const attrName = name === 'for'
      ? 'htmlFor'
      : name === 'class'
        ? 'className'
        : name
    acc[attrName] = value ?? true
    return acc
  }, {})
}

export function renderNodeChildren(
  children: ParsedNode[] | undefined,
  ctx: RenderContext,
  prefix: string,
  renderNode: RenderNodeFn,
) {
  if (!Array.isArray(children) || children.length === 0)
    return null

  const result: ReactNode[] = []
  for (let idx = 0; idx < children.length; idx++) {
    const child = children[idx] as ParsedNode & { attrs?: [string, string | null][] }
    if (!child)
      continue

    if (child.type === 'label_open') {
      const labelChildren: ParsedNode[] = []
      idx++
      while (idx < children.length) {
        const segment = children[idx]
        if (segment?.type === 'label_close')
          break
        if (segment)
          labelChildren.push(segment)
        idx++
      }
      const key = `${prefix}-label-${idx}`
      result.push(
        <label key={key} {...tokenAttrsToProps(child.attrs)}>
          {renderNodeChildren(labelChildren, ctx, `${key}-child`, renderNode)}
        </label>,
      )
      continue
    }

    if (child.type === 'label_close')
      continue

    result.push(renderNode(child, `${prefix}-${idx}`, ctx))
  }
  return result
}

export function renderInline(
  children: ParsedNode[] | undefined,
  ctx: RenderContext,
  prefix: string,
  renderNode: RenderNodeFn,
) {
  return (
    <>
      {renderNodeChildren(children, ctx, `${prefix}-inline`, renderNode)}
    </>
  )
}
