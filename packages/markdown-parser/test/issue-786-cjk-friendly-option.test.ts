import { describe, expect, it } from 'vitest'
import { getMarkdown } from '../src'

// `cjkFriendly` defaults to true because CJK prose is the common case for this
// renderer, but it is a deliberate deviation from CommonMark, so it has to be
// switchable. These cases pin both directions and prove the option is not just a
// documented no-op.
const REPORTED = '说明**「A」**。和**「B」**。'
const STRIKETHROUGH = '说明~~「A」~~。'
const ASCII = '**foo** and a*b*c and snake_case_name and 2 * 3 * 4'

describe('cjkFriendly option', () => {
  it('is on by default', () => {
    const md = getMarkdown('cjk-option-default')

    expect(md.render(REPORTED).trim()).toBe('<p>说明<strong>「A」</strong>。和<strong>「B」</strong>。</p>')
    expect(md.render(STRIKETHROUGH).trim()).toBe('<p>说明<s>「A」</s>。</p>')
  })

  it('falls back to CommonMark flanking when disabled', () => {
    const md = getMarkdown('cjk-option-off', { cjkFriendly: false })

    // Same behaviour as before the fix: the run is refused and the markers stay literal.
    expect(md.render(REPORTED).trim()).toBe('<p>说明**「A」<strong>。和</strong>「B」**。</p>')
    expect(md.render(STRIKETHROUGH).trim()).toBe('<p>说明~~「A」~~。</p>')
    // Spans that never depended on CJK neighbours keep working.
    expect(md.render('中文**加粗**和*斜体*').trim()).toBe('<p>中文<strong>加粗</strong>和<em>斜体</em></p>')
  })

  it('leaves non-CJK documents identical either way', () => {
    const on = getMarkdown('cjk-option-ascii-on')
    const off = getMarkdown('cjk-option-ascii-off', { cjkFriendly: false })

    expect(on.render(ASCII).trim()).toBe('<p><strong>foo</strong> and a<em>b</em>c and snake_case_name and 2 * 3 * 4</p>')
    expect(off.render(ASCII).trim()).toBe(on.render(ASCII).trim())
  })

  it('does not install the plugin when disabled', () => {
    const on = getMarkdown('cjk-option-state-on') as any
    const off = getMarkdown('cjk-option-state-off', { cjkFriendly: false }) as any

    // The plugin signals installation by replacing the inline state class.
    expect(on.inline.State.name).toBe('CjkFriendlyState')
    expect(off.inline.State.name).not.toBe('CjkFriendlyState')
  })
})
