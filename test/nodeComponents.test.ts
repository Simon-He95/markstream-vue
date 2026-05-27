import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearGlobalCustomComponents, getCustomNodeComponents, isReservedNodeComponentKey, mergeCustomNodeComponents, normalizeCustomComponentMapping, removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'

describe('nodeComponents scoped API', () => {
  const clearMappings = () => {
    clearGlobalCustomComponents()
    for (const id of ['test-scope', 'other-scope']) {
      try {
        removeCustomComponents(id)
      }
      catch {}
    }
  }

  beforeEach(clearMappings)
  afterEach(clearMappings)

  it('sets and retrieves a scoped mapping', () => {
    setCustomComponents('test-scope', { custom_node: 'MyComp' })
    const mapping = getCustomNodeComponents('test-scope')
    expect(mapping.custom_node).toBe('MyComp')
  })

  it('sets and retrieves a global mapping (legacy)', () => {
    setCustomComponents({ code_block: 'MarkdownCodeBlock' })
    const mapping = getCustomNodeComponents()
    expect(mapping.code_block).toBe('MarkdownCodeBlock')
  })

  it('removes a scoped mapping', () => {
    setCustomComponents('test-scope', { foo: 'bar' })
    expect(getCustomNodeComponents('test-scope').foo).toBe('bar')
    removeCustomComponents('test-scope')
    expect(getCustomNodeComponents('test-scope').foo).toBeUndefined()
  })

  it('clears global mapping and disallows removing global via removeCustomComponents', () => {
    setCustomComponents({ code_block: 'MarkdownCodeBlock' })
    expect(getCustomNodeComponents().code_block).toBe('MarkdownCodeBlock')
    // clear global mapping
    clearGlobalCustomComponents()
    expect(getCustomNodeComponents().code_block).toBeUndefined()
    // attempting to remove global via removeCustomComponents should throw
    expect(() => removeCustomComponents('__global__')).toThrow()
  })

  it('uses scoped mappings over app-scoped defaults', () => {
    setCustomComponents('test-scope', { thinking: 'ScopedThinking' })

    const mapping = mergeCustomNodeComponents('test-scope', {
      thinking: 'AppThinking',
      code_block: 'AppCodeBlock',
    })

    expect(mapping.thinking).toBe('ScopedThinking')
    expect(mapping.code_block).toBe('AppCodeBlock')
  })

  it('uses app-scoped mapping over legacy global mapping for the same key', () => {
    setCustomComponents({ thinking: 'GlobalThinking' })

    const mapping = mergeCustomNodeComponents(undefined, {
      thinking: 'AppThinking',
    })

    expect(mapping.thinking).toBe('AppThinking')
  })

  it('uses customId scoped mapping over app-scoped mapping for the same key', () => {
    setCustomComponents('test-scope', { thinking: 'ScopedThinking' })

    const mapping = mergeCustomNodeComponents('test-scope', {
      thinking: 'AppThinking',
    })

    expect(mapping.thinking).toBe('ScopedThinking')
  })

  it('normalizes reserved node component keys before matching', () => {
    expect(isReservedNodeComponentKey('Text')).toBe(true)
    expect(isReservedNodeComponentKey(' Code_Block ')).toBe(true)
    expect(isReservedNodeComponentKey('thinking')).toBe(false)
  })

  it('adds normalized aliases for PascalCase custom tag keys', () => {
    const mapping = normalizeCustomComponentMapping({
      Thinking: 'ThinkingNode',
      AnswerBox: 'AnswerBoxNode',
      Link: 'LinkNode',
    } as any)

    expect(mapping.Thinking).toBe('ThinkingNode')
    expect(mapping.thinking).toBe('ThinkingNode')
    expect(mapping.AnswerBox).toBe('AnswerBoxNode')
    expect(mapping.answerbox).toBe('AnswerBoxNode')
    expect(mapping['answer-box']).toBe('AnswerBoxNode')
    expect((mapping as any).Link).toBe('LinkNode')
    expect(mapping.link).toBeUndefined()
  })

  it('filters undefined custom component values before custom tag inference', () => {
    const mapping = normalizeCustomComponentMapping({
      thinking: undefined,
      Answer: 'AnswerNode',
    } as any)

    expect(Object.prototype.hasOwnProperty.call(mapping, 'thinking')).toBe(false)
    expect(mapping.Answer).toBe('AnswerNode')
    expect(mapping.answer).toBe('AnswerNode')
  })
})
