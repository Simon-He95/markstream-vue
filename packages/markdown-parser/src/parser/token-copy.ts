import type { MarkdownToken } from '../types'
import { copySyntheticLinkOrigin } from '../plugins/linkTokenMetadata'

export function cloneTokenWithMutableChildren<T extends MarkdownToken>(token: T): T {
  const copy = Object.assign(Object.create(Object.getPrototypeOf(token)), token) as MarkdownToken

  if (Array.isArray(token.attrs))
    copy.attrs = token.attrs.map(attr => [...attr] as [string, string])

  if (Array.isArray(token.map))
    copy.map = [...token.map]

  if (Array.isArray(token.children))
    copy.children = token.children.map(child => cloneTokenWithMutableChildren(child))

  copySyntheticLinkOrigin(token, copy)

  return copy as T
}
