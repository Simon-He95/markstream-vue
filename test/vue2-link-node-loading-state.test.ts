import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('markstream-vue2 link loading state', () => {
  it('keeps the subtle loading hint implementation in sync', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/markstream-vue2/src/components/LinkNode/LinkNode.vue'), 'utf8')

    expect(source).toContain('link-loading-indicator')
    expect(source).toContain('const activeOpacity = props.animationOpacity ?? 0.35')
    expect(source).toContain('const restingOpacity = Math.max(0.12, Math.min(activeOpacity * 0.5, activeOpacity))')
    expect(source).toContain('props.animationDuration ?? 1.6')
    expect(source).toContain('props.animationTiming ?? \'ease-in-out\'')
    expect(source).toContain('@keyframes underlinePulse')
  })

  it('keeps href binding behind the safeHref sanitizer', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/markstream-vue2/src/components/LinkNode/LinkNode.vue'), 'utf8')

    expect(source).toContain('const safeHref = computed')
    expect(source).toContain('return sanitizeAttrs({ href }).href')
    expect(source).toContain(':href="safeHref"')
    expect(source).toContain('delete (merged as Record<string, unknown>).href')
  })
})
