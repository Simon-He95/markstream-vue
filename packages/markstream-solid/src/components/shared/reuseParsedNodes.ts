import type { SolidRenderableNode } from './node-helpers'

export function sameParserValue(previous: unknown, next: unknown, seen = new WeakMap<object, object>()): boolean {
  if (Object.is(previous, next))
    return true
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object')
    return false
  if (Object.getPrototypeOf(previous) !== Object.getPrototypeOf(next))
    return false
  if (!Array.isArray(previous) && Object.getPrototypeOf(previous) !== Object.prototype && Object.getPrototypeOf(previous) !== null)
    return false
  if (Array.isArray(previous) && (!Array.isArray(next) || previous.length !== next.length))
    return false
  if (seen.get(previous) === next)
    return true
  seen.set(previous, next)
  const keys = Object.keys(previous)
  if (keys.length !== Object.keys(next).length)
    return false
  return keys.every(key => Object.prototype.hasOwnProperty.call(next, key) && sameParserValue((previous as Record<string, unknown>)[key], (next as Record<string, unknown>)[key], seen))
}

export function reuseParsedNodes(previous: readonly SolidRenderableNode[] | undefined, next: SolidRenderableNode[]) {
  if (!previous?.length)
    return next
  return next.map((node, index) => sameParserValue(previous[index], node) ? previous[index] : node)
}
