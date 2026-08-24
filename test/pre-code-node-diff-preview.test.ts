import { readFileSync } from 'node:fs'

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import PreCodeNode from '../src/components/PreCodeNode'

describe('pre code node diff preview', () => {
  it('clears async diff measurement state after a chunk failure', () => {
    const source = readFileSync('src/components/PreCodeNode/PreCodeNode.vue', 'utf8')
    const start = source.indexOf('function scheduleDiffLineMetricsSync()')
    const end = source.indexOf('function setupDiffResizeObserver', start)
    const scheduler = source.slice(start, end)

    expect(scheduler).toContain('}, () => {')
    expect(scheduler).toContain('diffMetricsModule = null')
    expect(scheduler).toContain('.finally(() => {')
    expect(scheduler).toContain('diffLineMetricsRaf = null')
  })

  it('styles async code block loading content inside the bordered shell', () => {
    const source = readFileSync('src/components/PreCodeNode/PreCodeNode.vue', 'utf8')
    const selector = '.markstream-vue pre.code-pre-fallback[data-markstream-code-loading=\'1\']'
    const start = source.indexOf(selector)
    expect(start).toBeGreaterThanOrEqual(0)
    const end = source.indexOf('}', start)
    const rule = source.slice(start, end)

    expect(rule).toContain('background: var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--code-bg)))')
    expect(rule).toContain('color: var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--code-fg)))')
    expect(rule).toContain('border: 0')
    expect(rule).toContain('border-radius: 0')
    expect(rule).toContain('font-family: var(')
  })

  it('does not render a terminal newline as an extra ordinary line', async () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const a = 1\n',
          raw: '```ts\nconst a = 1\n```',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__line-number')).toHaveLength(0)
    expect(wrapper.get('.markstream-pre__line-numbers-text').element.textContent).toBe('1')
    expect(wrapper.get('.markstream-pre__code').element.textContent).toBe('const a = 1')

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'const a = 1\n\n',
        raw: '```ts\nconst a = 1\n\n```',
      },
    })

    expect(wrapper.findAll('.markstream-pre__line-number')).toHaveLength(0)
    expect(wrapper.get('.markstream-pre__line-numbers-text').element.textContent).toBe('1\n2')
    expect(wrapper.get('.markstream-pre__code').element.textContent).toBe('const a = 1\n')

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'ts',
        code: 'const a = 1\n',
        raw: '```ts\nconst a = 1\n',
        loading: true,
      },
    })

    expect(wrapper.findAll('.markstream-pre__line-number')).toHaveLength(0)
    expect(wrapper.get('.markstream-pre__line-numbers-text').element.textContent).toBe('1\n2')
    expect(wrapper.get('.markstream-pre__code').element.textContent).toBe('const a = 1\n')

    wrapper.unmount()
  })

  it('keeps wrapped visual rows under their logical source line number', () => {
    const code = 'const message = "one logical source line that can wrap"\n\nreturn message\n'
    const wrapper = mount(PreCodeNode, {
      attrs: {
        style: { whiteSpace: 'pre-wrap' },
      },
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          code,
          raw: `\`\`\`ts\n${code}\`\`\``,
        },
      },
    })

    const logicalLines = wrapper.findAll('.markstream-pre__logical-line')
    expect(wrapper.find('.markstream-pre__line-numbers-text').exists()).toBe(false)
    expect(logicalLines.map(line => line.attributes('data-line-number'))).toEqual(['1', '2', '3'])
    expect(logicalLines.map(line => line.element.textContent)).toEqual([
      'const message = "one logical source line that can wrap"\n',
      '\n',
      'return message',
    ])
    expect(wrapper.get('.markstream-pre__code--wrapped').element.textContent).toBe(
      'const message = "one logical source line that can wrap"\n\nreturn message',
    )

    wrapper.unmount()
  })

  it('preserves CRLF and CR as logical source-line delimiters while wrapping', () => {
    const code = 'first\r\nsecond\rthird\nfourth\r\n'
    const wrapper = mount(PreCodeNode, {
      attrs: {
        class: 'is-wrap',
      },
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'txt',
          code,
          raw: code,
        },
      },
    })

    const logicalLines = wrapper.findAll('.markstream-pre__logical-line')
    expect(logicalLines.map(line => line.attributes('data-line-number'))).toEqual(['1', '2', '3', '4'])
    expect(logicalLines.map(line => line.element.textContent)).toEqual([
      'first\r\n',
      'second\r',
      'third\n',
      'fourth',
    ])
    expect(wrapper.get('.markstream-pre__code--wrapped').element.textContent).toBe(
      'first\r\nsecond\rthird\nfourth',
    )

    wrapper.unmount()
  })

  it('keeps wrapped logical lines stable when a streamed CR becomes CRLF', async () => {
    const wrapper = mount(PreCodeNode, {
      attrs: {
        class: 'is-wrap',
      },
      props: {
        loading: true,
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'txt',
          code: 'first\r',
          raw: 'first\r',
          loading: true,
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__logical-line').map(line => line.element.textContent)).toEqual([
      'first\r',
      '',
    ])

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'txt',
        code: 'first\r\nsecond',
        raw: 'first\r\nsecond',
        loading: true,
      },
    })

    const logicalLines = wrapper.findAll('.markstream-pre__logical-line')
    expect(logicalLines.map(line => line.attributes('data-line-number'))).toEqual(['1', '2'])
    expect(logicalLines.map(line => line.element.textContent)).toEqual(['first\r\n', 'second'])

    wrapper.unmount()
  })

  it('does not pin streaming pre height to the reserved estimate', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        loading: true,
        showLineNumbers: true,
        reservedHeightPx: 240,
        node: {
          type: 'code_block',
          language: 'json',
          code: '{\n  "name": "marks"',
          raw: '```json\n{\n  "name": "marks"',
        },
      },
    })

    const pre = wrapper.get('pre').element

    expect(pre.style.height).toBe('')
    expect(pre.style.minHeight).toBe('')
    expect(pre.style.maxHeight).toBe('240px')
    expect(wrapper.findAll('.markstream-pre__line-number')).toHaveLength(0)
    expect(wrapper.get('.markstream-pre__line-numbers-text').element.textContent).toBe('1\n2')
    expect(wrapper.get('pre').attributes('aria-busy')).toBe('true')

    wrapper.unmount()
  })

  it('uses one line-number text node for a large code block before and after streaming', async () => {
    const code = Array.from({ length: 5000 }, (_, index) => `const value${index} = ${index}`).join('\n')
    const wrapper = mount(PreCodeNode, {
      props: {
        loading: true,
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          code,
          raw: `\`\`\`ts\n${code}`,
          loading: true,
        },
      },
    })

    const streamingNumbers = wrapper.get('.markstream-pre__line-numbers-text')
    expect(streamingNumbers.element.textContent?.split('\n')).toHaveLength(5000)
    expect(wrapper.findAll('.markstream-pre__line-number')).toHaveLength(0)
    expect((wrapper.get('pre').element as HTMLElement).style.getPropertyValue('--markstream-pre-line-number-width')).toBe('4ch')

    await wrapper.setProps({
      loading: false,
      node: {
        type: 'code_block',
        language: 'ts',
        code,
        raw: `\`\`\`ts\n${code}\n\`\`\``,
        loading: false,
      },
    })

    expect(wrapper.get('.markstream-pre__line-numbers-text').element).toBe(streamingNumbers.element)
    expect(wrapper.get('.markstream-pre__line-numbers-text').element.textContent?.split('\n')).toHaveLength(5000)
    expect(wrapper.findAll('.markstream-pre__line-number')).toHaveLength(0)
    expect((wrapper.get('pre').element as HTMLElement).style.getPropertyValue('--markstream-pre-line-number-width')).toBe('4ch')

    wrapper.unmount()
  })

  it('keeps the fallback gutter stable across one- to four-digit line counts', async () => {
    const createCode = (lineCount: number) => Array.from({ length: lineCount }, (_, index) => `line ${index + 1}`).join('\n')
    const wrapper = mount(PreCodeNode, {
      props: {
        loading: true,
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'txt',
          code: createCode(9),
          raw: `\`\`\`txt\n${createCode(9)}`,
          loading: true,
        },
      },
    })

    const pre = wrapper.get('pre').element as HTMLElement
    const expectedWidths: Array<[number, string]> = [
      [9, '2ch'],
      [10, '2ch'],
      [100, '3ch'],
      [1000, '4ch'],
    ]
    for (const [lineCount, expectedWidth] of expectedWidths) {
      const code = createCode(lineCount)
      await wrapper.setProps({
        node: {
          type: 'code_block',
          language: 'txt',
          code,
          raw: `\`\`\`txt\n${code}`,
          loading: true,
        },
      })
      expect(pre.style.getPropertyValue('--markstream-pre-line-number-width')).toBe(expectedWidth)
    }
    expect(pre.style.getPropertyValue('--markstream-code-padding-left')).toContain('var(--markstream-pre-line-number-width, 2ch)')
    expect(wrapper.get('.markstream-pre__line-numbers-text').element.textContent?.split('\n')).toHaveLength(1000)

    wrapper.unmount()
  })

  it.each([
    { diffInline: false, pane: 'modified' },
    { diffInline: true, pane: 'inline' },
  ])('reserves the three-digit $pane diff fallback gutter for a three-digit source', ({ diffInline, pane }) => {
    const originalCode = Array.from({ length: 99 }, (_, index) => `line ${index + 1}`).join('\n')
    const updatedCode = `${originalCode}\nline 100`
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline,
        node: {
          type: 'code_block',
          language: 'txt',
          diff: true,
          originalCode,
          updatedCode,
          code: '',
          raw: '',
        },
      },
    })

    const pre = wrapper.get('pre').element as HTMLElement
    expect(pre.style.getPropertyValue('--markstream-pre-line-number-width')).toBe('3ch')
    expect(pre.style.getPropertyValue('--markstream-pre-diff-line-number-width')).toBe('3ch')
    const numbers = wrapper
      .findAll(`.markstream-pre__diff-pane--${pane} .markstream-pre__diff-number`)
      .map(number => number.text())
      .filter(Boolean)
    expect(numbers.at(-1)).toBe('100')

    wrapper.unmount()
  })

  it('keeps the full source digit width when trailing unchanged diff rows collapse', () => {
    const originalLines = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`)
    const updatedLines = [...originalLines]
    updatedLines[0] = 'changed line 1'
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffHideUnchangedRegions: {
          enabled: true,
          contextLineCount: 0,
          minimumLineCount: 4,
        },
        node: {
          type: 'code_block',
          language: 'txt',
          diff: true,
          originalCode: originalLines.join('\n'),
          updatedCode: updatedLines.join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    const pre = wrapper.get('pre').element as HTMLElement
    expect(pre.classList).toContain('markstream-pre--diff-collapsed')
    expect(pre.style.getPropertyValue('--markstream-pre-diff-line-number-width')).toBe('3ch')

    wrapper.unmount()
  })

  it('does not add line-number layout styles when line numbers are disabled', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: false,
        node: {
          type: 'code_block',
          language: 'txt',
          code: 'line 1\nline 2',
          raw: '```txt\nline 1\nline 2\n```',
        },
      },
    })

    const pre = wrapper.get('pre').element as HTMLElement
    expect(pre.style.getPropertyValue('--markstream-pre-line-number-width')).toBe('')
    expect(pre.style.getPropertyValue('--markstream-pre-diff-line-number-width')).toBe('')
    expect(pre.style.getPropertyValue('--markstream-code-padding-left')).toBe('')

    wrapper.unmount()
  })

  it('keeps reserved pre height fixed after loading', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        loading: false,
        showLineNumbers: true,
        reservedHeightPx: 120,
        node: {
          type: 'code_block',
          language: 'ts',
          code: 'const value = 1',
          raw: '```ts\nconst value = 1\n```',
        },
      },
    })

    const pre = wrapper.get('pre').element

    expect(pre.style.height).toBe('120px')
    expect(pre.style.minHeight).toBe('120px')
    expect(pre.style.maxHeight).toBe('120px')
    expect(wrapper.get('pre').attributes('aria-busy')).toBe('false')

    wrapper.unmount()
  })

  it('keeps wrapped diff content in one logical row per source line', () => {
    const originalCode = 'const veryLongLineThatWrapsVisually = true'
    const updatedCode = 'const veryLongLineThatWrapsVisually = false'
    const wrapper = mount(PreCodeNode, {
      attrs: { class: 'is-wrap' },
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode,
          updatedCode,
          code: '',
          raw: '',
        },
      },
    })

    expect(wrapper.get('pre').classes()).toContain('is-wrap')
    expect(wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-line')).toHaveLength(2)
    expect(wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')).toHaveLength(2)
    expect(wrapper.get('.markstream-pre__diff-content-inner').element.textContent).toBe(originalCode)
    expect(wrapper.get('.markstream-pre__diff-pane--modified .markstream-pre__diff-content-inner').element.textContent).toBe(updatedCode)

    wrapper.unmount()
  })

  it('does not paint terminal blank diff preview rows as added or removed', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'const a = 1\n',
          updatedCode: 'const a = 2\n',
          code: '',
          raw: '',
        },
      },
    })

    const emptyRows = wrapper.findAll('.markstream-pre__diff-line--empty')

    expect(emptyRows).toHaveLength(0)

    wrapper.unmount()
  })

  it.each([
    { diffInline: false, expectedRows: 2 },
    { diffInline: true, expectedRows: 2 },
  ])('shows no-final-newline metadata for both $diffInline diff sources', ({ diffInline, expectedRows }) => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'const value = "before"',
          updatedCode: 'const value = "after"',
          code: '',
          raw: '',
        },
      },
    })

    const metadata = wrapper.findAll('.markstream-pre__diff-line--metadata')
    expect(metadata).toHaveLength(expectedRows)
    expect(metadata.every(row => row.text() === 'No newline at end of file')).toBe(true)
    expect(metadata.some(row => row.classes().includes('markstream-pre__diff-line--metadata-removed'))).toBe(true)
    expect(metadata.some(row => row.classes().includes('markstream-pre__diff-line--metadata-added'))).toBe(true)

    wrapper.unmount()
  })

  it.each([
    { diffInline: false },
    { diffInline: true },
  ])('omits no-final-newline metadata when both $diffInline diff sources end with LF', ({ diffInline }) => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'const value = "before"\n',
          updatedCode: 'const value = "after"\n',
          code: '',
          raw: '',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-line--metadata')).toHaveLength(0)

    wrapper.unmount()
  })

  it('buffers the opposite split pane when only one source lacks a final newline', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'const value = "before"',
          updatedCode: 'const value = "after"\n',
          code: '',
          raw: '',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-line--metadata')).toHaveLength(1)
    expect(wrapper.get('.markstream-pre__diff-pane--original .markstream-pre__diff-line--metadata').text()).toBe('No newline at end of file')
    expect(wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-line--spacer')).toHaveLength(1)

    wrapper.unmount()
  })

  it.each(['line\n', 'line\r\n', 'line\r'])('treats %j as a final newline', (source) => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: source,
          updatedCode: source,
          code: '',
          raw: '',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-line--metadata')).toHaveLength(0)
    wrapper.unmount()
  })

  it('matches side-by-side enhanced unchanged-region folding before handoff', () => {
    const originalLines = [
      'import { computed, ref } from \'vue\'',
      '',
      'const count = ref(1)',
      'const label = computed(() => `old:' + '$' + '{count.value}`)',
      ...Array.from({ length: 20 }, (_, index) => `const stable${index} = ${index}`),
      'console.log(label.value)',
    ]
    const modifiedLines = [...originalLines]
    modifiedLines[2] = 'const count = ref(2)'
    modifiedLines[3] = 'const label = computed(() => `new:' + '$' + '{count.value}`)'
    modifiedLines[24] = 'console.info(label.value)'

    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffHideUnchangedRegions: {
          enabled: true,
          contextLineCount: 2,
          minimumLineCount: 4,
          revealLineCount: 5,
        },
        node: {
          type: 'code_block',
          language: 'diff typescript',
          diff: true,
          originalCode: originalLines.join('\n'),
          updatedCode: modifiedLines.join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    const originalRows = wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
    const modifiedRows = wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')
    const numbers = originalRows.map(row => row.find('.markstream-pre__diff-number').text())

    expect(wrapper.get('pre').classes()).toContain('markstream-pre--diff-collapsed')
    expect(originalRows).toHaveLength(11)
    expect(modifiedRows).toHaveLength(11)
    expect(numbers).toEqual(['1', '2', '3', '4', '5', '6', '', '23', '24', '25', ''])
    expect(wrapper.findAll('.markstream-pre__diff-line--collapsed')).toHaveLength(2)
    expect(wrapper.get('.markstream-pre__diff-pane--original .markstream-pre__diff-line--collapsed').text()).toContain('unmodified lines')

    wrapper.unmount()
  })

  it('applies unchanged-region folding to inline diff fallback rows', () => {
    const originalLines = [
      'const before = 1',
      ...Array.from({ length: 12 }, (_, index) => `const stable${index} = ${index}`),
      'const after = 1',
    ]
    const modifiedLines = [...originalLines]
    modifiedLines[0] = 'const before = 2'
    modifiedLines[13] = 'const after = 2'

    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        diffHideUnchangedRegions: {
          enabled: true,
          contextLineCount: 2,
          minimumLineCount: 4,
        },
        node: {
          type: 'code_block',
          language: 'diff typescript',
          diff: true,
          originalCode: originalLines.join('\n'),
          updatedCode: modifiedLines.join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    expect(wrapper.get('pre').classes()).toContain('markstream-pre--diff-collapsed')
    expect(wrapper.findAll('.markstream-pre__diff-pane--inline .markstream-pre__diff-line--collapsed')).toHaveLength(1)

    wrapper.unmount()
  })

  it('does not collapse fewer hidden rows than the enhanced minimumLineCount', () => {
    const originalLines = ['one', 'two', 'three', 'old', ...Array.from({ length: 8 }, (_, index) => `tail${index}`)]
    const modifiedLines = [...originalLines]
    modifiedLines[3] = 'new'

    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffHideUnchangedRegions: {
          enabled: true,
          contextLineCount: 2,
          minimumLineCount: 3,
        },
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: originalLines.join('\n'),
          updatedCode: modifiedLines.join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    const numbers = wrapper
      .findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-number')
      .map(row => row.text())
    expect(numbers.slice(0, 6)).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(numbers).toHaveLength(7)
    expect(wrapper.findAll('.markstream-pre__diff-line--collapsed')).toHaveLength(2)
    expect(wrapper.findAll('.markstream-pre__diff-line--metadata')).toHaveLength(0)

    wrapper.unmount()
  })

  it('preserves exact common prefix and suffix rows when a diff exceeds the LCS limit', () => {
    const middleLength = 1230
    const originalLines = [
      'const sharedPrefix = true',
      ...Array.from({ length: middleLength }, (_, index) => `const old${index} = ${index}`),
      'const sharedSuffix = true',
    ]
    const modifiedLines = [
      'const sharedPrefix = true',
      ...Array.from({ length: middleLength }, (_, index) => `const next${index} = ${index}`),
      'const sharedSuffix = true',
    ]

    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'diff typescript',
          diff: true,
          originalCode: originalLines.join('\n'),
          updatedCode: modifiedLines.join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    const originalRows = wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
    expect(originalRows[0].classes()).toContain('markstream-pre__diff-line--context')
    expect(originalRows.at(-2)?.classes()).toContain('markstream-pre__diff-line--context')

    wrapper.unmount()
  })

  it('shows original line numbers on removed inline diff fallback rows', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          code: [
            '@@ -26,1 +25,1 @@',
            '- lineDecorationsWidth: 0,',
            '+ lineDecorationsWidth: 4,',
          ].join('\n'),
          raw: '',
        },
      },
    })

    const rows = wrapper.findAll('.markstream-pre__diff-pane--inline .markstream-pre__diff-line')
    const removed = rows.find(row => row.classes().includes('markstream-pre__diff-line--removed'))
    const added = rows.find(row => row.classes().includes('markstream-pre__diff-line--added'))

    expect(removed?.find('.markstream-pre__diff-number').text()).toBe('26')
    expect(added?.find('.markstream-pre__diff-number').text()).toBe('25')

    wrapper.unmount()
  })

  it('keeps repeated braces and blank lines anchored before inserted inline source rows', () => {
    const originalCode = [
      '  };',
      '}',
      '',
      'function splitUnifiedDiff(patch: string): { original: string; updated: string } {',
      '  const original: string[] = [];',
      '  const updated: string[] = [];',
      '  }',
      '',
      '  for (const raw of lines) {',
    ].join('\n')
    const updatedCode = [
      '  };',
      '}',
      '',
      'function isNewFileDiff(file: FileChange): boolean {',
      '  const { original, updated } = splitUnifiedDiff(file.content ?? "");',
      '  return original.length === 0 && updated.length > 0;',
      '}',
      '',
      'function splitUnifiedDiff(patch: string): { original: string; updated: string } {',
      '  const original: string[] = [];',
      '  const updated: string[] = [];',
      '  }',
      '',
      '  for (const raw of lines) {',
    ].join('\n')

    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode,
          updatedCode,
          code: '',
          raw: '',
        },
      },
    })

    const rows = wrapper.findAll('.markstream-pre__diff-pane--inline .markstream-pre__diff-line')
    const rowSummary = rows.map(row => ({
      number: row.find('.markstream-pre__diff-number').text(),
      text: row.find('.markstream-pre__diff-content-inner').text(),
      classes: row.classes(),
    }))

    expect(rowSummary.slice(0, 9).map(row => row.number)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(rowSummary[1].classes).toContain('markstream-pre__diff-line--context')
    expect(rowSummary[2].classes).toContain('markstream-pre__diff-line--context')
    for (const row of rowSummary.slice(3, 8))
      expect(row.classes).toContain('markstream-pre__diff-line--added')
    expect(rowSummary[8]).toMatchObject({
      number: '9',
      text: 'function splitUnifiedDiff(patch: string): { original: string; updated: string } {',
    })
    expect(rowSummary[8].classes).toContain('markstream-pre__diff-line--context')

    wrapper.unmount()
  })

  it('paints one added or removed fill layer in each visual region', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('.markstream-pre__diff-line--added::before')
    expect(source).toContain('.markstream-pre__diff-line--removed::before')
    expect(source).toContain('.markstream-pre__diff-line::after')
    expect(source).not.toContain('.markstream-pre__diff-line--added::after')
    expect(source).not.toContain('.markstream-pre__diff-line--removed::after')
    expect(source).toContain('.markstream-pre__diff-line--added > .markstream-pre__diff-rail')
    expect(source).toContain('.markstream-pre__diff-line--removed > .markstream-pre__diff-rail')
    expect(source).toContain('.markstream-pre__diff-line--added > .markstream-pre__diff-number')
    expect(source).toContain('.markstream-pre__diff-line--removed > .markstream-pre__diff-number')
    expect(source).toContain('background: var(--markstream-diff-added-line-fill, transparent);')
    expect(source).toContain('background: var(--markstream-diff-removed-line-fill, transparent);')
    expect(source).not.toContain('linear-gradient(\n      var(--markstream-diff-added-line-fill')
    expect(source).not.toContain('linear-gradient(\n      var(--markstream-diff-removed-line-fill')
    expect(source).toContain('--markstream-pre-diff-line-number-bg: var(')
    expect(source).toContain('background: var(--markstream-pre-diff-line-number-bg);')
    expect(source).toContain('border-right: var(--markstream-pre-diff-line-number-separator-width, 2px) solid var(--markstream-diff-editor-bg, var(--code-bg));')
    expect(source).toContain('--markstream-pre-diff-content-height')
    for (const selector of [
      'pre.markstream-pre--diff-preview .markstream-pre__diff-line::before',
      'pre.markstream-pre--diff-preview .markstream-pre__diff-line::after',
      'pre.markstream-pre--diff-preview .markstream-pre__diff-rail',
      'pre.markstream-pre--diff-preview .markstream-pre__diff-number',
    ]) {
      const start = source.indexOf(selector)
      const end = source.indexOf('\n}', start)
      const rule = source.slice(start, end)
      expect(rule).toContain('--markstream-pre-diff-synced-row-height')
      expect(rule).not.toContain('--markstream-pre-diff-content-height')
    }
    const metadataStart = source.indexOf('pre.markstream-pre--diff-preview .markstream-pre__diff-line--metadata {')
    const metadataEnd = source.indexOf('\n}', metadataStart)
    const metadataRule = source.slice(metadataStart, metadataEnd)
    expect(metadataRule).toContain('var(--markstream-diff-metadata-fg')
    expect(metadataRule).toContain('var(--markstream-diff-metadata-bg')
    expect(metadataRule).not.toContain('markstream-diff-added')
    expect(metadataRule).not.toContain('markstream-diff-removed')
    expect(source).toContain('color: var(--markstream-diff-added-fg, var(--code-line-number));')
    expect(source).toContain('color: var(--markstream-diff-removed-fg, var(--code-line-number));')
    expect(source).not.toMatch(/\.markstream-pre__diff-line--added\s*\{\s*color:/)
    expect(source).not.toMatch(/\.markstream-pre__diff-line--removed\s*\{\s*color:/)
    expect(source).not.toContain('.markstream-pre__diff-line--added:not(.markstream-pre__diff-line--empty)::before')
    expect(source).not.toContain('.markstream-pre__diff-line--removed:not(.markstream-pre__diff-line--empty)::before')
  })

  it('keeps inline diff fallback full width when wrap is disabled', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('pre.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) > .markstream-pre__diff-code')
    expect(source).toContain('grid-template-columns: minmax(100%, max-content);')
    expect(source).toContain('width: 100%;')
    expect(source).toContain('min-width: max-content;')
    expect(source).toContain('white-space: inherit;')
    expect(source).toContain('overflow-wrap: normal;')
    expect(source).toContain('pre.markstream-pre--diff-preview.is-wrap')
    expect(source).toContain('white-space: pre-wrap;')
    expect(source).toContain('overflow-wrap: anywhere;')
    expect(source).toContain('pre.code-pre-fallback.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap) {\n  scrollbar-width: none;')
    expect(source).toContain('pre.code-pre-fallback.markstream-pre--diff-preview.markstream-pre--diff-inline:not(.is-wrap)::-webkit-scrollbar {\n  width: 0;\n  height: 0;')
  })

  it('keeps diff fallback rows and content at least pane width', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('.markstream-pre__diff-line {\n  position: relative;\n  display: block;\n  box-sizing: border-box;\n  width: 100%;\n  min-width: 100%;')
    expect(source).toContain('.markstream-pre__diff-content {\n  position: relative;\n  z-index: 1;\n  display: block;\n  width: max-content;\n  min-width: 100%;')
    expect(source).toContain('.markstream-pre--diff-preview.is-wrap .markstream-pre__diff-content {\n  box-sizing: border-box;\n  width: auto;\n  min-width: 0;\n  padding-right: 1ch;')
  })

  it('uses modified gutter metrics without an extra gap for inline diff fallback', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('.markstream-vue pre.markstream-pre--diff-preview.markstream-pre--diff-inline {')
    expect(source).toContain('--markstream-pre-diff-gutter-marker-width: 4px;')
    expect(source).toContain('--markstream-pre-diff-code-gap: 1ch;')
    expect(source).toContain('--markstream-pre-diff-code-padding: 0px;')
    expect(source).toContain('--markstream-diff-added-gutter: linear-gradient(')
    expect(source).toContain('--markstream-diff-removed-gutter: linear-gradient(')
    expect(source).toContain('--markstream-pre-diff-line-number-padding-left: 2ch;')
    expect(source).toContain('--markstream-pre-diff-line-number-padding-right: 1ch;')
    expect(source).toContain('--markstream-pre-diff-line-number-separator-width: 2px;')
    expect(source).toContain('--markstream-pre-diff-line-number-bg: var(')
    expect(source).toContain('--markstream-pre-diff-line-number-box-width: calc(')
    expect(source).toContain('--markstream-pre-diff-code-fill-left: calc(')
    expect(source).toContain('--markstream-pre-diff-code-left: calc(')
    expect(source).toContain('var(--markstream-pre-diff-line-number-left)')
    expect(source).toContain('+ var(--markstream-pre-diff-line-number-box-width)')
    expect(source).toContain('+ var(--markstream-pre-diff-line-number-gap-to-code)')
    expect(source).not.toContain('--markstream-pre-diff-scrollable-left')
    expect(source).not.toContain('left: var(--markstream-pre-diff-scrollable-left);')
    expect(source).toContain('padding-left: var(--markstream-pre-diff-code-left);')
    expect(source).toContain('left: var(--markstream-pre-diff-code-fill-left);')
    expect(source).toContain('padding-left: var(--markstream-pre-diff-line-number-padding-left, 2ch);')
    expect(source).toContain('padding-right: var(--markstream-pre-diff-line-number-padding-right, 1ch);')
    expect(source).toContain('min-width: var(--markstream-pre-diff-line-number-width);')
    expect(source).toContain('border-right: var(--markstream-pre-diff-line-number-separator-width, 2px) solid var(--markstream-diff-editor-bg, var(--code-bg));')
    expect(source).toContain('width: var(--markstream-pre-diff-gutter-marker-width, 4px);')
  })

  it('keeps diff fallback line fills square', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('.markstream-pre__diff-line::before')
    expect(source).toContain('border-radius: 0;')
    expect(source).toContain('.markstream-pre__diff-line--added::before')
    expect(source).toContain('.markstream-pre__diff-line--removed::before')
  })

  it('lets side-by-side diff fallback panes scroll horizontally when wrap is disabled', () => {
    const source = readFileSync(
      'src/components/PreCodeNode/PreCodeNode.vue',
      'utf8',
    )

    expect(source).toContain('pre.markstream-pre--diff-preview:not(.is-wrap):not(.markstream-pre--diff-inline) .markstream-pre__diff-pane')
    expect(source).toContain('overflow-x: auto;')
    expect(source).toContain('overflow-y: hidden;')
  })

  it('renders diff lines with index in v-for (row-height sync template wiring)', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'line one\nline two\nline three\n',
          updatedCode: 'line one\nchanged two\nline three\n',
          code: '',
          raw: '',
        },
      },
    })

    const originalLines = wrapper.findAll('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
    const modifiedLines = wrapper.findAll('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')

    // Both panes must render the same number of lines
    expect(originalLines.length).toBeGreaterThan(0)
    expect(originalLines.length).toBe(modifiedLines.length)

    // All lines must have a line number element
    for (const line of [...originalLines, ...modifiedLines]) {
      expect(line.find('.markstream-pre__diff-number').exists()).toBe(true)
      expect(line.find('.markstream-pre__diff-content').exists()).toBe(true)
    }

    wrapper.unmount()
  })

  it('aligns side-by-side source changes with enhanced spacer rows before handoff', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: ['same', 'old one', 'old two', 'old three', 'tail'].join('\n'),
          updatedCode: ['same', 'new one', 'tail'].join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    const summarize = (selector: string) => wrapper.findAll(selector).map(row => ({
      number: row.find('.markstream-pre__diff-number').text(),
      text: row.find('.markstream-pre__diff-content-inner').text(),
      classes: row.classes(),
    }))
    const originalRows = summarize('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
    const modifiedRows = summarize('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')

    expect(originalRows.map(row => row.number)).toEqual(['1', '2', '3', '4', '5', ''])
    expect(modifiedRows.map(row => row.number)).toEqual(['1', '2', '', '', '3', ''])
    expect(originalRows[1].classes).toContain('markstream-pre__diff-line--removed')
    expect(modifiedRows[1].classes).toContain('markstream-pre__diff-line--added')
    expect(modifiedRows[2].classes).toContain('markstream-pre__diff-line--spacer')
    expect(modifiedRows[3].classes).toContain('markstream-pre__diff-line--spacer')
    expect(originalRows[4].text).toBe('tail')
    expect(modifiedRows[4].text).toBe('tail')
    expect(originalRows[5].classes).toContain('markstream-pre__diff-line--metadata')
    expect(modifiedRows[5].classes).toContain('markstream-pre__diff-line--metadata')

    wrapper.unmount()
  })

  it('attaches preRef to the pre element', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'const x = 1',
          updatedCode: 'const x = 2',
          code: '',
          raw: '',
        },
      },
    })

    const pre = wrapper.find('pre')
    expect(pre.exists()).toBe(true)
    // preRef must point to the same element that carries the diff-preview class
    expect(pre.classes()).toContain('markstream-pre--diff-preview')

    wrapper.unmount()
  })

  it('syncs side-by-side row heights when wrap is enabled', async () => {
    const rafCallbacks = new Map<number, FrameRequestCallback>()
    let rafId = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = ++rafId
      rafCallbacks.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      rafCallbacks.delete(id)
    })
    const flushRaf = () => {
      const pending = [...rafCallbacks.values()]
      rafCallbacks.clear()
      for (const callback of pending)
        callback(performance.now())
    }

    const originalGetBCR = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('markstream-pre__diff-content')) {
        const height = this.closest('.markstream-pre__diff-pane--modified') ? 36 : 18
        return { height, top: 0, left: 0, right: 0, bottom: 0, width: 100, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
      }
      return originalGetBCR.call(this)
    })

    let resizeCallback: ResizeObserverCallback | undefined
    const observe = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }

      observe = observe
      unobserve() {}
      disconnect() {}
    })

    const wrapper = mount(PreCodeNode, {
      attachTo: document.body,
      attrs: { class: 'is-wrap' },
      props: {
        showLineNumbers: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode: 'short\nline two',
          updatedCode: 'a much longer line that would wrap in a narrow container\nline two',
          code: '',
          raw: '',
        },
      },
    })

    await nextTick()
    await vi.dynamicImportSettled()
    const pre = wrapper.get('pre')
    expect(pre.classes()).toContain('is-wrap')
    expect(observe).toHaveBeenCalledWith(pre.element)

    flushRaf()
    await nextTick()
    resizeCallback?.([], {} as ResizeObserver)
    flushRaf()
    await nextTick()

    const originalLine1 = wrapper.find('.markstream-pre__diff-pane--original .markstream-pre__diff-line')
    const modifiedLine1 = wrapper.find('.markstream-pre__diff-pane--modified .markstream-pre__diff-line')
    const originalStyle = originalLine1.attributes('style') ?? ''
    const modifiedStyle = modifiedLine1.attributes('style') ?? ''

    expect(originalStyle).toContain('--markstream-pre-diff-synced-row-height: 36px')
    expect(modifiedStyle).toContain('--markstream-pre-diff-synced-row-height: 36px')

    wrapper.unmount()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not measure unified diff rows when wrap is enabled', async () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame')
    const originalGetBCR = Element.prototype.getBoundingClientRect
    const contentReads = vi.fn()
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('markstream-pre__diff-content'))
        contentReads()
      return originalGetBCR.call(this)
    })
    const observe = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      observe = observe
      unobserve() {}
      disconnect() {}
    })

    const wrapper = mount(PreCodeNode, {
      attrs: { class: 'is-wrap' },
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: 'old value',
          updatedCode: 'new value',
          code: '-old value\n+new value',
          raw: '',
        },
      },
    })

    await nextTick()
    expect(requestFrame).not.toHaveBeenCalled()
    expect(observe).not.toHaveBeenCalled()
    expect(contentReads).not.toHaveBeenCalled()

    wrapper.unmount()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('clears and restores synchronized heights across wrap to scroll to wrap', async () => {
    const wrap = ref(true)
    const node = {
      type: 'code_block' as const,
      language: 'ts',
      diff: true,
      originalCode: 'a very long removed line that wraps',
      updatedCode: 'a very long added line that wraps',
      code: '',
      raw: '',
    }
    const Host = defineComponent({
      setup: () => () => h(PreCodeNode, {
        class: wrap.value ? 'is-wrap' : '',
        node,
        showLineNumbers: true,
      }),
    })
    const wrapper = mount(Host)

    await nextTick()
    await vi.dynamicImportSettled()
    await new Promise(resolve => requestAnimationFrame(resolve))
    await nextTick()
    expect(wrapper.findAll('.markstream-pre__diff-line').some(row => row.attributes('style')?.includes('--markstream-pre-diff-synced-row-height'))).toBe(true)

    wrap.value = false
    await nextTick()

    expect(wrapper.findAll('.markstream-pre__diff-line').every(row => row.attributes('style') === undefined)).toBe(true)

    wrap.value = true
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))
    await nextTick()

    expect(wrapper.findAll('.markstream-pre__diff-line').every(row => row.attributes('style')?.includes('--markstream-pre-diff-synced-row-height'))).toBe(true)

    wrapper.unmount()
  })

  it('renders inline diff fallback as one ordered diff stream instead of stacked panes', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          originalCode: 'same before\nold value\nsame after',
          updatedCode: 'same before\nnew value\nsame after',
          code: '',
          raw: '```diff\n-old value\n+new value\n```',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-pane')).toHaveLength(1)
    expect(wrapper.find('.markstream-pre__diff-pane--inline').exists()).toBe(true)
    expect(wrapper.findAll('.markstream-pre__diff-content').map(node => node.element.textContent)).toEqual([
      'same before',
      'old value',
      'new value',
      'same after',
      'No newline at end of file',
      'No newline at end of file',
    ])
    expect(wrapper.findAll('.markstream-pre__diff-line--removed')).toHaveLength(1)
    expect(wrapper.findAll('.markstream-pre__diff-line--added')).toHaveLength(1)

    wrapper.unmount()
  })

  it('normalizes inline patch indentation to match source diff rows', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          code: [
            '{',
            '  "type": "module",',
            '- "version": "0.0.49",',
            '+ "version": "0.0.54-beta.1",',
          ].join('\n'),
          raw: '```diff json:package.json',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-content').map(node => node.element.textContent)).toEqual([
      '{',
      '  "type": "module",',
      '  "version": "0.0.49",',
      '  "version": "0.0.54-beta.1",',
    ])

    wrapper.unmount()
  })

  it('does not add an extra space to already-indented inline patch rows', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'diff',
          diff: true,
          code: [
            '{',
            '  "type": "module",',
            '-  "version": "0.0.49",',
            '+  "version": "0.0.54-beta.1",',
          ].join('\n'),
          raw: '```diff json:package.json',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-content').map(node => node.element.textContent)).toEqual([
      '{',
      '  "type": "module",',
      '  "version": "0.0.49",',
      '  "version": "0.0.54-beta.1",',
    ])

    wrapper.unmount()
  })

  it('does not show a modified line number for inline removed rows', () => {
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'json',
          diff: true,
          originalCode: [
            '{',
            '  "type": "module",',
            '  "version": "1.0.1",',
            '  "description": "old",',
            '  "author": "Simon He"',
            '}',
          ].join('\n'),
          updatedCode: [
            '{',
            '  "type": "module",',
            '  "version": "1.0.1",',
            '  "description": "new",',
            '  "author": "Simon He"',
            '}',
          ].join('\n'),
          code: '',
          raw: '',
        },
      },
    })

    const removedNumber = wrapper.get('.markstream-pre__diff-line--removed .markstream-pre__diff-number')
    const addedNumber = wrapper.get('.markstream-pre__diff-line--added .markstream-pre__diff-number')

    expect(removedNumber.text()).toBe('4')
    expect(addedNumber.text()).toBe('4')

    wrapper.unmount()
  })

  it('keeps unchanged source rows neutral in inline source diff fallback', () => {
    const originalCode = [
      'export const name = "@archships/dim-agent-sdk"',
      'export {',
      '  createAgent,',
      '} from "./agent"',
      'export {',
      '  createSessionForAgent,',
      '  loadSessionForAgent,',
      '} from "./session"',
      'export {',
      '  createRunEngine,',
      '} from "./run-engine"',
    ].join('\n')
    const updatedCode = [
      'export const name = "@archships/dim-agent-sdk"',
      '// Core SDK entry points.',
      'export {',
      '  createAgent,',
      '} from "./agent"',
      '// Session lifecycle.',
      'export {',
      '  createSessionForAgent,',
      '  loadSessionForAgent,',
      '} from "./session"',
      '// Run engine.',
      'export {',
      '  createRunEngine,',
      '} from "./run-engine"',
    ].join('\n')
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'ts',
          diff: true,
          originalCode,
          updatedCode,
          code: updatedCode,
          raw: '',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-line--removed')).toHaveLength(0)
    expect(wrapper.findAll('.markstream-pre__diff-line--added')).toHaveLength(3)
    expect(wrapper.findAll('.markstream-pre__diff-content-inner').map(node => node.element.textContent)).toEqual([
      'export const name = "@archships/dim-agent-sdk"',
      '// Core SDK entry points.',
      'export {',
      '  createAgent,',
      '} from "./agent"',
      '// Session lifecycle.',
      'export {',
      '  createSessionForAgent,',
      '  loadSessionForAgent,',
      '} from "./session"',
      '// Run engine.',
      'export {',
      '  createRunEngine,',
      '} from "./run-engine"',
      'No newline at end of file',
      'No newline at end of file',
    ])

    wrapper.unmount()
  })

  it('does not treat markdown list items as removed lines when source diff data exists', () => {
    const updatedCode = [
      '# 示例文档',
      '',
      '- 无序项 1',
      '- 无序项 2',
      '  - 子项 A',
      '  - 子项 B',
    ].join('\n')
    const wrapper = mount(PreCodeNode, {
      props: {
        showLineNumbers: true,
        diffInline: true,
        node: {
          type: 'code_block',
          language: 'md',
          diff: true,
          originalCode: '',
          updatedCode,
          code: updatedCode,
          raw: '',
        },
      },
    })

    expect(wrapper.findAll('.markstream-pre__diff-line--removed')).toHaveLength(0)

    const listRows = wrapper.findAll('.markstream-pre__diff-line').filter(row =>
      row.find('.markstream-pre__diff-content-inner').text().includes('无序项'),
    )
    expect(listRows).toHaveLength(2)
    for (const row of listRows) {
      expect(row.classes()).toContain('markstream-pre__diff-line--added')
    }

    const emptyRows = wrapper.findAll('.markstream-pre__diff-line--empty')
    expect(emptyRows).toHaveLength(1)
    expect(emptyRows[0].classes()).toContain('markstream-pre__diff-line--added')

    wrapper.unmount()
  })
})
