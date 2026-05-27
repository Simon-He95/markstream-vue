/**
 * @vitest-environment jsdom
 */

import { getMarkdown } from 'stream-markdown-parser'
import { describe, expect, it } from 'vitest'

describe('legacy getMarkdown fence renderer escaping', () => {
  it('does not allow fence info strings to inject attributes', () => {
    const md = getMarkdown('fence" onmouseover="alert(1)')
    const html = md.render('```x" onclick="alert(1)\nhello\n```')
    const root = document.createElement('div')
    root.innerHTML = html

    const block = root.querySelector('.code-block') as HTMLElement
    const label = root.querySelector('.code-lang') as HTMLElement

    expect(block.getAttribute('data-lang')).toBe('x-')
    expect(block.getAttribute('onclick')).toBeNull()
    expect(block.getAttribute('onmouseover')).toBeNull()
    expect(block.id).toBe('editor-fence-onmouseover-alert-1-0-x-')
    expect(label.textContent).toBe('X-')
    expect(html).not.toContain('onclick=')
    expect(html).not.toContain('onmouseover=')
  })

  it('escapes translated button labels before rendering HTML', () => {
    const md = getMarkdown('fence-copy-label', {
      i18n: {
        'common.copy': '<img src=x onerror=alert(1)>',
      },
    })
    const html = md.render('```ts\nconst value = 1\n```')
    const root = document.createElement('div')
    root.innerHTML = html

    const button = root.querySelector('.copy-button') as HTMLButtonElement

    expect(button.querySelector('img')).toBeNull()
    expect(button.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(button.getAttribute('onerror')).toBeNull()
    expect(html).not.toContain('<img')
  })
})
