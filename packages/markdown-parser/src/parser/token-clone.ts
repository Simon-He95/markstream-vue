import type { Token } from '../markdown-it-types'
import type { MarkdownToken } from '../types'
import { copySyntheticLinkOrigin } from '../plugins/linkTokenMetadata'
import { cloneTokenWithMutableChildren } from './token-copy'

function isPlainObject(value: unknown) {
  if (!value || typeof value !== 'object')
    return false

  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function copyCloneableOwnDataProperties(source: object, target: Record<PropertyKey, unknown>, seen: WeakMap<object, unknown>) {
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    if (!descriptor || !('value' in descriptor))
      continue

    const targetDescriptor = Object.getOwnPropertyDescriptor(target, key)
    if (targetDescriptor && (!('value' in targetDescriptor) || targetDescriptor.writable === false))
      continue

    target[key] = safeCloneTokenField(descriptor.value, seen)
  }
}

function safeCloneTokenField<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (!value || typeof value !== 'object')
    return value

  const object = value as object
  const existing = seen.get(object)
  if (existing)
    return existing as T

  if (Array.isArray(value)) {
    const cloned: unknown[] = []
    seen.set(object, cloned)
    for (const item of value)
      cloned.push(safeCloneTokenField(item, seen))
    return cloned as T
  }

  if (value instanceof Map) {
    const cloned = new Map()
    seen.set(object, cloned)
    for (const [key, item] of value)
      cloned.set(safeCloneTokenField(key, seen), safeCloneTokenField(item, seen))
    return cloned as T
  }

  if (value instanceof Set) {
    const cloned = new Set()
    seen.set(object, cloned)
    for (const item of value)
      cloned.add(safeCloneTokenField(item, seen))
    return cloned as T
  }

  if (value instanceof Date) {
    const cloned = new Date(value.getTime())
    seen.set(object, cloned)
    return cloned as T
  }

  if (value instanceof RegExp) {
    const cloned = new RegExp(value.source, value.flags)
    cloned.lastIndex = value.lastIndex
    seen.set(object, cloned)
    return cloned as T
  }

  if (typeof URL !== 'undefined' && value instanceof URL) {
    const cloned = new URL(value.href)
    seen.set(object, cloned)
    copyCloneableOwnDataProperties(object, cloned as unknown as Record<PropertyKey, unknown>, seen)
    return cloned as T
  }

  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
    const cloned = new URLSearchParams(value.toString())
    seen.set(object, cloned)
    copyCloneableOwnDataProperties(object, cloned as unknown as Record<PropertyKey, unknown>, seen)
    return cloned as T
  }

  if (value instanceof Error) {
    let cloned: Error
    const ErrorCtor = value.constructor as new (message?: string) => Error
    try {
      cloned = new ErrorCtor(value.message)
    }
    catch {
      cloned = new Error(value.message)
    }
    Object.setPrototypeOf(cloned, Object.getPrototypeOf(value))
    seen.set(object, cloned)
    copyCloneableOwnDataProperties(object, cloned as unknown as Record<PropertyKey, unknown>, seen)
    return cloned as T
  }

  if (typeof Promise !== 'undefined' && value instanceof Promise) {
    seen.set(object, value)
    return value
  }

  if (typeof Node !== 'undefined' && value instanceof Node) {
    seen.set(object, value)
    return value
  }

  if (!isPlainObject(value)) {
    const cloned = Object.create(Object.getPrototypeOf(value)) as Record<PropertyKey, unknown>
    seen.set(object, cloned)
    copyCloneableOwnDataProperties(object, cloned, seen)
    return cloned as T
  }

  const cloned: Record<string, unknown> = {}
  seen.set(object, cloned)

  const record = value as Record<string, unknown>
  for (const key of Object.keys(record))
    cloned[key] = safeCloneTokenField(record[key], seen)

  return cloned as T
}

function canCloneMarkdownTokenFast(token: Token, enumerableKeys: string[]) {
  for (let index = 0; index < enumerableKeys.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(token, enumerableKeys[index]!)
    if (
      enumerableKeys[index] === '__proto__'
      || !descriptor
      || !('value' in descriptor)
      || descriptor.writable !== true
      || descriptor.configurable !== true
    ) {
      return false
    }
  }
  return true
}

function cloneMarkdownToken(token: Token, cloneObjectFields = true): Token {
  const cloned = cloneMarkdownTokenValue(token, cloneObjectFields)
  // A plain object copy does not carry over the WeakMap origin of `link` tokens.
  copySyntheticLinkOrigin(token as unknown as MarkdownToken, cloned as unknown as MarkdownToken)
  return cloned
}

function cloneMarkdownTokenValue(token: Token, cloneObjectFields = true): Token {
  if (!cloneObjectFields)
    return cloneTokenWithMutableChildren(token as unknown as MarkdownToken) as unknown as Token

  // Fast path: markdown-it Token instances store their data as configurable,
  // writable, own enumerable string-keyed data properties; methods live on
  // the prototype. Copy those with plain assignment (much cheaper than
  // defineProperty-per-key), then restore the prototype in one call. Plugins
  // may attach symbols, hidden fields, accessors or constrained data fields;
  // route those tokens through the reflective clone to preserve descriptors.
  const allKeys = Reflect.ownKeys(token as unknown as object)
  const enumerableKeys = Object.keys(token)
  if (
    allKeys.length === enumerableKeys.length
    && canCloneMarkdownTokenFast(token, enumerableKeys)
  ) {
    try {
      return cloneMarkdownTokenFast(token, enumerableKeys, cloneObjectFields)
    }
    catch {
      return cloneMarkdownTokenReflective(token, cloneObjectFields)
    }
  }

  return cloneMarkdownTokenReflective(token, cloneObjectFields)
}

function cloneMarkdownTokenFast(
  token: Token,
  enumerableKeys: string[],
  cloneObjectFields: boolean,
): Token {
  const prototype = Object.getPrototypeOf(token)
  const cloned = {} as Record<PropertyKey, unknown>
  const seen = new WeakMap<object, unknown>()
  const children = token.children
  const attrs = token.attrs
  const map = token.map
  const source = token as unknown as Record<string, unknown>

  for (let keyIndex = 0; keyIndex < enumerableKeys.length; keyIndex++) {
    const key = enumerableKeys[keyIndex]!
    const value = source[key]

    if (key === 'children' && Array.isArray(children)) {
      const clonedChildren = new Array(children.length)
      for (let index = 0; index < children.length; index++)
        clonedChildren[index] = cloneMarkdownToken(children[index]!, cloneObjectFields)
      cloned[key] = clonedChildren
    }
    else if (key === 'attrs' && Array.isArray(attrs)) {
      const clonedAttrs: Array<[string, string]> = new Array(attrs.length)
      for (let index = 0; index < attrs.length; index++) {
        const attr = attrs[index]!
        clonedAttrs[index] = [attr[0], attr[1]]
      }
      cloned[key] = clonedAttrs
    }
    else if (key === 'map' && Array.isArray(map)) {
      cloned[key] = [map[0], map[1]]
    }
    else if (cloneObjectFields && value && typeof value === 'object') {
      cloned[key] = safeCloneTokenField(value, seen)
    }
    else {
      cloned[key] = value
    }
  }

  Object.setPrototypeOf(cloned, prototype)
  return cloned as unknown as Token
}

function cloneMarkdownTokenReflective(token: Token, cloneObjectFields = true): Token {
  const cloned = Object.create(Object.getPrototypeOf(token)) as Token
  const seen = new WeakMap<object, unknown>()

  for (const key of Reflect.ownKeys(token as unknown as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(token, key)
    if (!descriptor)
      continue

    if (!('value' in descriptor)) {
      Object.defineProperty(cloned, key, descriptor)
      continue
    }

    const value = descriptor.value
    let clonedValue = value

    if (key === 'attrs' && Array.isArray(value)) {
      clonedValue = value.map(attr => [...attr] as [string, string])
    }
    else if (key === 'map' && Array.isArray(value)) {
      clonedValue = [...value] as [number, number]
    }
    else if (key === 'children' && Array.isArray(value)) {
      clonedValue = value.map(child => cloneMarkdownToken(child, cloneObjectFields))
    }
    else if (cloneObjectFields && value && typeof value === 'object') {
      clonedValue = safeCloneTokenField(value, seen)
    }

    Object.defineProperty(cloned, key, {
      ...descriptor,
      value: clonedValue,
    })
  }

  return cloned
}

export function cloneMarkdownTokens(tokens: Token[], cloneObjectFields = true) {
  return tokens.map(token => cloneMarkdownToken(token, cloneObjectFields))
}
