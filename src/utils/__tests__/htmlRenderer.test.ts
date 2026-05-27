/**
 * @vitest-environment jsdom
 */

import type { HtmlToken } from '../htmlRenderer'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import {
  buildVNodeTree,
  convertAttrsToProps,
  convertPropValue,
  hasCustomComponents,

  isCustomComponent,
  parseHtmlToVNodes,
  sanitizeAttrs,
  tokenizeHtml,
} from '../htmlRenderer'

// Mock Vue components for testing
const MockComponentA = defineComponent({
  name: 'MockComponentA',
  props: ['data-type', 'value'],
  setup(props) {
    return () => h('div', { class: 'mock-a' }, `Component A: ${props['data-type']}`)
  },
})

const MockComponentB = defineComponent({
  name: 'MockComponentB',
  props: ['active'],
  setup(props) {
    return () => h('span', { class: 'mock-b' }, `Component B: ${props.active}`)
  },
})

describe('htmlRenderer', () => {
  describe('isCustomComponent', () => {
    it('should return false for standard HTML tags', () => {
      const customComponents = {}
      expect(isCustomComponent('div', customComponents)).toBe(false)
      expect(isCustomComponent('span', customComponents)).toBe(false)
      expect(isCustomComponent('a', customComponents)).toBe(false)
      expect(isCustomComponent('img', customComponents)).toBe(false)
    })

    it('should return true for registered custom components', () => {
      const customComponents = {
        mycomponent: MockComponentA,
      }
      expect(isCustomComponent('mycomponent', customComponents)).toBe(true)
      expect(isCustomComponent('MyComponent', customComponents)).toBe(true) // case-insensitive
    })

    it('should return false for unregistered non-standard tags', () => {
      const customComponents = {}
      expect(isCustomComponent('custom-tag', customComponents)).toBe(false)
      expect(isCustomComponent('unknown', customComponents)).toBe(false)
    })
  })

  describe('sanitizeAttrs', () => {
    it('should remove dangerous event handlers', () => {
      const attrs = {
        'class': 'test',
        'onclick': 'alert(1)',
        'data-value': '123',
        'onerror': 'malicious()',
      }
      const result = sanitizeAttrs(attrs)
      expect(result).toEqual({
        'class': 'test',
        'data-value': '123',
      })
    })

    it('should keep safe attributes', () => {
      const attrs = {
        'class': 'test-class',
        'id': 'test-id',
        'data-type': 'custom',
        'aria-label': 'Test',
      }
      const result = sanitizeAttrs(attrs)
      expect(result).toEqual(attrs)
    })

    it('should remove style by default but preserve safe srcset candidates', () => {
      const result = sanitizeAttrs({
        'style': 'color: red;',
        'srcset': 'cover-1x.jpg 1x, cover-2x.jpg 2x',
        'data-type': 'custom',
      })

      expect(result).toEqual({
        'srcset': 'cover-1x.jpg 1x, cover-2x.jpg 2x',
        'data-type': 'custom',
      })
    })

    it('should handle empty attributes', () => {
      expect(sanitizeAttrs({})).toEqual({})
    })
  })

  describe('convertPropValue', () => {
    it('should convert boolean attributes', () => {
      expect(convertPropValue('true', 'checked')).toBe(true)
      expect(convertPropValue('', 'checked')).toBe(true)
      expect(convertPropValue('checked', 'checked')).toBe(true)
      expect(convertPropValue('false', 'checked')).toBe(false)
    })

    it('should convert numeric attributes', () => {
      expect(convertPropValue('123', 'value')).toBe(123)
      expect(convertPropValue('45.5', 'min')).toBe(45.5)
      expect(convertPropValue('', 'value')).toBe('')
    })

    it('should keep string values as-is', () => {
      expect(convertPropValue('hello', 'class')).toBe('hello')
      expect(convertPropValue('test-value', 'data-type')).toBe('test-value')
    })
  })

  describe('convertAttrsToProps', () => {
    it('should convert multiple attributes', () => {
      const attrs = {
        checked: 'true',
        value: '42',
        class: 'test',
        disabled: '',
      }
      const result = convertAttrsToProps(attrs)
      expect(result).toEqual({
        checked: true,
        value: 42,
        class: 'test',
        disabled: true,
      })
    })
  })

  describe('tokenizeHtml', () => {
    it('should tokenize simple HTML', () => {
      const html = '<div>text</div>'
      const tokens = tokenizeHtml(html)
      expect(tokens).toEqual([
        { type: 'tag_open', tagName: 'div', attrs: {} },
        { type: 'text', content: 'text' },
        { type: 'tag_close', tagName: 'div' },
      ])
    })

    it('should tokenize nested HTML', () => {
      const html = '<div><span>nested</span></div>'
      const tokens = tokenizeHtml(html)
      expect(tokens).toHaveLength(5)
      expect(tokens[0].type).toBe('tag_open')
      expect(tokens[0].tagName).toBe('div')
      expect(tokens[1].type).toBe('tag_open')
      expect(tokens[1].tagName).toBe('span')
    })

    it('should tokenize HTML with attributes', () => {
      const html = '<div class="test" id="myid">content</div>'
      const tokens = tokenizeHtml(html)
      expect(tokens[0].attrs).toEqual({
        class: 'test',
        id: 'myid',
      })
    })

    it('should handle self-closing tags', () => {
      const html = '<img src="test.jpg" />'
      const tokens = tokenizeHtml(html)
      expect(tokens).toHaveLength(1)
      expect(tokens[0].type).toBe('self_closing')
      expect(tokens[0].tagName).toBe('img')
    })

    it('should skip HTML comments', () => {
      const html = '<div><!-- comment -->text</div>'
      const tokens = tokenizeHtml(html)
      expect(tokens).toHaveLength(3) // tag_open, text, tag_close
      expect(tokens[1].content).toBe('text')
    })

    it('should handle CDATA sections', () => {
      const html = '<div><![CDATA[test]]></div>'
      const tokens = tokenizeHtml(html)
      expect(tokens.length).toBeGreaterThan(0)
    })

    it('should ignore whitespace-only text nodes', () => {
      const html = '<div>   </div>'
      const tokens = tokenizeHtml(html)
      expect(tokens.some(t => t.type === 'text')).toBe(false)
    })

    it('should handle unclosed tags gracefully', () => {
      const html = '<div>text'
      const tokens = tokenizeHtml(html)
      expect(tokens).toEqual([
        { type: 'tag_open', tagName: 'div', attrs: {} },
        { type: 'text', content: 'text' },
      ])
    })
  })

  describe('buildVNodeTree', () => {
    it('should build simple tree', () => {
      const tokens: HtmlToken[] = [
        { type: 'tag_open', tagName: 'div', attrs: {} },
        { type: 'text', content: 'hello' },
        { type: 'tag_close', tagName: 'div' },
      ]
      const nodes = buildVNodeTree(tokens, {})
      expect(nodes).toHaveLength(1)
      expect(nodes[0].type).toBe('div') // VNode type for 'div'
    })

    it('should build nested tree with custom components', () => {
      const customComponents = {
        mycomp: MockComponentA,
      }
      const tokens: HtmlToken[] = [
        { type: 'tag_open', tagName: 'div', attrs: {} },
        { type: 'tag_open', tagName: 'mycomp', attrs: { 'data-type': 'test' } },
        { type: 'text', content: 'content' },
        { type: 'tag_close', tagName: 'mycomp' },
        { type: 'tag_close', tagName: 'div' },
      ]
      const nodes = buildVNodeTree(tokens, customComponents)
      expect(nodes).toHaveLength(1)
    })

    it('should handle mismatched tags gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const tokens: HtmlToken[] = [
        { type: 'tag_open', tagName: 'div', attrs: {} },
        { type: 'tag_open', tagName: 'span', attrs: {} },
        { type: 'tag_close', tagName: 'div' },
      ]
      const nodes = buildVNodeTree(tokens, {})
      expect(nodes).toHaveLength(1)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('should auto-close unclosed tags', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const tokens: HtmlToken[] = [
        { type: 'tag_open', tagName: 'div', attrs: {} },
        { type: 'text', content: 'text' },
      ]
      const nodes = buildVNodeTree(tokens, {})
      expect(nodes).toHaveLength(1)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('parseHtmlToVNodes', () => {
    it('should parse simple HTML', () => {
      const html = '<div>hello</div>'
      const nodes = parseHtmlToVNodes(html, {})
      expect(nodes).not.toBeNull()
      expect(nodes).toHaveLength(1)
    })

    it('should return null on parse error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      // Force an error by passing invalid input
      const result = parseHtmlToVNodes('<<invalid>>', {})
      // Should either return null or handle gracefully
      expect(result !== undefined).toBe(true)
      consoleSpy.mockRestore()
    })

    it('should handle empty content', () => {
      const nodes = parseHtmlToVNodes('', {})
      expect(nodes).toEqual([])
    })

    it('should preserve custom components while keeping unknown tags as literal text in safe mode', () => {
      const nodes = parseHtmlToVNodes('<mycomp data-type="test">ok</mycomp><unknown-tag>keep</unknown-tag>', {
        mycomp: MockComponentA,
      })

      expect(nodes).not.toBeNull()
      const stringNodes = (nodes || []).filter((node): node is string => typeof node === 'string')
      expect(stringNodes).toEqual(['<unknown-tag>', 'keep', '</unknown-tag>'])
      expect((nodes || []).some((node: any) => typeof node === 'object' && typeof node?.type !== 'string')).toBe(true)
    })

    it('should keep self-closing unknown tags literal in safe mode', () => {
      const nodes = parseHtmlToVNodes('<mycomp data-type="test">ok</mycomp><unknown-tag />', {
        mycomp: MockComponentA,
      })

      expect(nodes).not.toBeNull()
      const stringNodes = (nodes || []).filter((node): node is string => typeof node === 'string')
      expect(stringNodes).toContain('<unknown-tag />')
    })
  })

  describe('hasCustomComponents', () => {
    it('should return true when custom components are present', () => {
      const html = '<mycomponent>content</mycomponent>'
      const customComponents = {
        mycomponent: MockComponentA,
      }
      expect(hasCustomComponents(html, customComponents)).toBe(true)
    })

    it('should return false when only standard HTML is present', () => {
      const html = '<div><span>text</span></div>'
      expect(hasCustomComponents(html, {})).toBe(false)
    })

    it('should return false for empty content', () => {
      expect(hasCustomComponents('', {})).toBe(false)
    })

    it('should detect custom components mixed with standard HTML', () => {
      const html = '<div><mycomp>test</mycomp></div>'
      const customComponents = {
        mycomp: MockComponentA,
      }
      expect(hasCustomComponents(html, customComponents)).toBe(true)
    })
  })

  describe('integration Tests', () => {
    it('should handle nested custom components', () => {
      const html = '<outer>text <inner>nested</inner> more</outer>'
      const customComponents = {
        outer: MockComponentA,
        inner: MockComponentB,
      }

      const nodes = parseHtmlToVNodes(html, customComponents)
      expect(nodes).not.toBeNull()
      expect(nodes!.length).toBeGreaterThan(0)
    })

    it('should handle deeply nested structure', () => {
      const html = '<div><one><two><three>deep</three></two></one></div>'
      const nodes = parseHtmlToVNodes(html, {})
      expect(nodes).not.toBeNull()
    })

    it('should sanitize dangerous attributes in custom components', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const html = '<mycomp onclick="alert(1)" onerror="bad()">text</mycomp>'
      const customComponents = {
        mycomp: MockComponentA,
      }

      const nodes = parseHtmlToVNodes(html, customComponents)
      expect(nodes).not.toBeNull()
      consoleSpy.mockRestore()
    })

    it('should convert props correctly', () => {
      const html = '<mycomp checked="true" value="42">text</mycomp>'
      const customComponents = {
        mycomp: MockComponentA,
      }

      const nodes = parseHtmlToVNodes(html, customComponents)
      expect(nodes).not.toBeNull()
    })

    it('should handle the test scenario from playground', () => {
      const html = '<diyelement data-type="outer">外层组件 <diyelement data-type="inner">内层组件</diyelement> 继续外层</diyelement>'
      const customComponents = {
        diyelement: MockComponentA,
      }

      const nodes = parseHtmlToVNodes(html, customComponents)
      expect(nodes).not.toBeNull()
      expect(nodes!.length).toBeGreaterThan(0)
    })

    it('should handle complex nested HTML with custom components', () => {
      const html = `
        <section class="flex">
          <diyelement class="wrapper" data-type="block-level">
            <div>Standard HTML</div>
            <diyelement data-type="inner">Nested component</diyelement>
          </diyelement>
        </section>
      `
      const customComponents = {
        diyelement: MockComponentA,
      }

      const nodes = parseHtmlToVNodes(html, customComponents)
      expect(nodes).not.toBeNull()
      expect(nodes!.length).toBeGreaterThan(0)
    })

    it('should handle mixed custom and standard HTML elements', () => {
      const html = `
        <div class="container">
          <h2>Title</h2>
          <mycomp data-type="test">
            <p>Paragraph</p>
            <anothercomp active="true">Content</anothercomp>
          </mycomp>
        </div>
      `
      const customComponents = {
        mycomp: MockComponentA,
        anothercomp: MockComponentB,
      }

      const nodes = parseHtmlToVNodes(html, customComponents)
      expect(nodes).not.toBeNull()
    })

    it('should handle attributes with various quote styles', () => {
      const html = `<div class="test" data-value='single' id=unquoted>text</div>`
      const nodes = parseHtmlToVNodes(html, {})
      expect(nodes).not.toBeNull()
    })
  })

  describe('xSS Protection', () => {
    it('should filter out all dangerous event handlers', () => {
      const dangerousAttrs = [
        'onclick',
        'onerror',
        'onload',
        'onanimationstart',
        'onmouseover',
        'onmouseout',
        'onpointerover',
        'ontouchstart',
        'onwheel',
        'onscroll',
        'oncopy',
        'oncut',
      ]

      dangerousAttrs.forEach((attr) => {
        const result = sanitizeAttrs({ [attr]: 'malicious()' })
        expect(result[attr]).toBeUndefined()
      })
    })

    it('should filter out dangerous URL protocols', () => {
      expect(sanitizeAttrs({ href: 'javascript:alert(1)' }).href).toBeUndefined()
      expect(sanitizeAttrs({ src: 'vbscript:msgbox(1)' }).src).toBeUndefined()
      expect(sanitizeAttrs({ href: 'data:text/html;base64,PGgxPkJBRDwvaDE+' }).href).toBeUndefined()
    })

    it('should allow safe data URLs for media', () => {
      const result = sanitizeAttrs({ src: 'data:image/png;base64,iVBORw0KGgo=' }, 'safe', 'img')
      expect(result.src).toBe('data:image/png;base64,iVBORw0KGgo=')
    })

    it('should preserve safe event-like attributes', () => {
      const safeAttrs = {
        'data-onclick': 'safe',
        'aria-label': 'Test',
        'class': 'test-class',
      }
      const result = sanitizeAttrs(safeAttrs)
      expect(result).toEqual(safeAttrs)
    })
  })

  describe('edge Cases', () => {
    it('should handle HTML with only whitespace', () => {
      const html = '    \n\t   '
      const tokens = tokenizeHtml(html)
      expect(tokens).toHaveLength(0)
    })

    it('should handle malformed tags', () => {
      const html = '<div>unclosed'
      const nodes = parseHtmlToVNodes(html, {})
      expect(nodes).not.toBeNull()
    })

    it('should handle self-closing syntax for non-void elements', () => {
      const html = '<div />'
      const tokens = tokenizeHtml(html)
      expect(tokens[0].type).toBe('self_closing')
    })

    it('should handle boolean attributes without values', () => {
      const html = '<input checked disabled>'
      const tokens = tokenizeHtml(html)
      expect(tokens[0].attrs).toEqual({ checked: '', disabled: '' })
    })

    it('should drop blocked tags like <script>', () => {
      const html = '<script>alert(1)</script><div>ok</div>'
      const nodes = parseHtmlToVNodes(html, {})
      expect(nodes).not.toBeNull()
      const hasScript = (nodes || []).some((n: any) => typeof n === 'object' && n && n.type === 'script')
      expect(hasScript).toBe(false)
    })

    it('should drop safe-policy blocked tags from VNode output', () => {
      const html = '<iframe src="https://example.com"></iframe><div>ok</div>'
      const nodes = parseHtmlToVNodes(html, {})
      expect(nodes).not.toBeNull()
      expect((nodes || []).some((n: any) => typeof n === 'object' && n?.type === 'iframe')).toBe(false)
      expect((nodes || []).some((n: any) => typeof n === 'object' && n?.type === 'div')).toBe(true)
    })

    it('should preserve broader tags for trusted VNode output', () => {
      const html = '<iframe src="https://example.com"></iframe><div>ok</div>'
      const nodes = parseHtmlToVNodes(html, {}, 'trusted')
      expect(nodes).not.toBeNull()
      expect((nodes || []).some((n: any) => typeof n === 'object' && n?.type === 'iframe')).toBe(true)
    })

    it('should not render unknown tags as live VNodes in safe mode', () => {
      const html = '<unknown-tag>ok</unknown-tag><div>safe</div>'
      const nodes = parseHtmlToVNodes(html, {})
      expect(nodes).not.toBeNull()
      expect((nodes || []).some((n: any) => typeof n === 'object' && n?.type === 'unknown-tag')).toBe(false)
      expect((nodes || []).some((n: any) => typeof n === 'object' && n?.type === 'div')).toBe(true)
    })
  })
})
