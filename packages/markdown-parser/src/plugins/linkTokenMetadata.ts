import type { MarkdownToken } from '../types'

export type SyntheticLinkOrigin = 'autolink' | 'explicit' | 'linkify' | 'recovery'

const syntheticLinkOrigins = new WeakMap<object, SyntheticLinkOrigin>()
const cacheStableLinkValidators = new WeakSet<(url: string) => boolean>()

export function setSyntheticLinkOrigin<T extends object>(token: T, origin: SyntheticLinkOrigin): T {
  syntheticLinkOrigins.set(token, origin)
  return token
}

export function readSyntheticLinkOrigin(token: MarkdownToken): SyntheticLinkOrigin | undefined {
  return syntheticLinkOrigins.get(token)
}

/**
 * Resolve the `markup` reported on link nodes: markdown-it marks
 * auto-detected links with `linkify`/`autolink`, and folded single `link`
 * tokens keep that origin in the WeakMap above instead of on the token.
 */
export function resolveLinkMarkup(token: MarkdownToken | null | undefined): string {
  if (!token)
    return ''

  const origin = readSyntheticLinkOrigin(token)
  if (origin === 'linkify' || origin === 'autolink')
    return origin

  const markup = typeof token.markup === 'string' ? token.markup : ''
  return markup === 'linkify' || markup === 'autolink' ? markup : ''
}

/** Carry a recorded synthetic origin onto a clone of its token. */
export function copySyntheticLinkOrigin(
  from: MarkdownToken | null | undefined,
  to: MarkdownToken | null | undefined,
): void {
  if (!from || !to)
    return

  const origin = readSyntheticLinkOrigin(from)
  if (origin)
    syntheticLinkOrigins.set(to, origin)
}

export function registerCacheStableLinkValidator(validateLink: (url: string) => boolean) {
  cacheStableLinkValidators.add(validateLink)
}

export function isCacheStableLinkValidator(validateLink: ((url: string) => boolean) | undefined) {
  return validateLink === undefined || cacheStableLinkValidators.has(validateLink)
}
