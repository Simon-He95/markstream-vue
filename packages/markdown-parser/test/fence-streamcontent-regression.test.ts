import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

const streamContent = `\`\`\`python
# 添加用户消息到 memory
agent.memory.add_message(CoreMessage.user_message("帮我查询今天的天气"))

# 开始执行循环
step = 0
while step < agent.max_steps:
    # ========== Think 阶段 ==========
    should_act = await agent.think()
    # 调用 LLM 分析用户请求，决定是否需要调用工具
    
    last_msg = agent.memory.messages[-1]
    
    # 发送 thinking 事件（如果有）
    if last_msg.thinking:
        yield {
            "type": "thinking",
            "data": {"content": last_msg.thinking},
            "task_id": task_id
        }
    
    # 如果不需要执行工具，任务完成
    if not should_act:
        yield {
            "type": "message",
            "data": {"content": last_msg.content, "role": "assistant"},
            "task_id": task_id
        }
        break
    
    # ========== Act 阶段 ==========
    # 发送工具调用事件
    if agent.tool_calls:
        for tool_call in agent.tool_calls:
            yield {
                "type": "tool_call",
                "data": {
                    "tool_name": tool_call.function.name,
                    "tool_input": tool_call.function.arguments,
                    "tool_call_id": tool_call.id
                },
                "task_id": task_id
            }
    
    # 执行工具
    result = await agent.act()
    
    # 发送工具结果事件
    yield {
        "type": "tool_result",
        "data": {
            "tool_name": tool_call.function.name,
            "tool_output": result,
            "success": True
        },
        "task_id": task_id
    }
    
    step += 1
\`\`\``

function findFirstCodeBlock(nodes: any[]): any | undefined {
  const stack: any[] = Array.isArray(nodes) ? [...nodes] : []
  while (stack.length) {
    const node = stack.shift()
    if (!node || typeof node !== 'object')
      continue
    if (node.type === 'code_block')
      return node
    if (Array.isArray(node.children))
      stack.unshift(...node.children)
    if (node.type === 'list' && Array.isArray(node.items)) {
      for (const item of node.items) {
        if (Array.isArray(item?.children))
          stack.unshift(...item.children)
      }
    }
  }
  return undefined
}

describe('parseMarkdownToStructure - fence regression', () => {
  it('does not drop content after "<" inside fenced code', () => {
    const md = getMarkdown('fence-regression')
    const nodes = parseMarkdownToStructure(streamContent, md)

    const codeNode = findFirstCodeBlock(nodes)
    expect(codeNode).toBeTruthy()
    expect(codeNode.loading).toBe(false)
    expect(String(codeNode.code)).toContain('while step < agent.max_steps:')
    expect(String(codeNode.code)).toContain('tool_call_id')
    expect(String(codeNode.code)).toContain('step += 1')
  })

  it('does not drop content in blockquote fenced code', () => {
    const md = getMarkdown('fence-regression')
    const markdown = [
      '> ```python',
      '> step = 0',
      '> while step < agent.max_steps:',
      '>     step += 1',
      '> ```',
      '',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md)
    const codeNode = findFirstCodeBlock(nodes)
    expect(codeNode).toBeTruthy()
    expect(String(codeNode.code)).toContain('while step < agent.max_steps:')
    expect(String(codeNode.code)).toContain('step += 1')
  })

  it('does not drop content in list-indented fenced code', () => {
    const md = getMarkdown('fence-regression')
    const markdown = [
      '- item',
      '  ',
      '    ```python',
      '    step = 0',
      '    while step < agent.max_steps:',
      '        step += 1',
      '    ```',
      '',
    ].join('\n')

    const nodes = parseMarkdownToStructure(markdown, md)
    const codeNode = findFirstCodeBlock(nodes)
    expect(codeNode).toBeTruthy()
    expect(String(codeNode.code)).toContain('while step < agent.max_steps:')
    expect(String(codeNode.code)).toContain('step += 1')
  })

  it('withholds a closing-fence prefix and releases it when streaming proves it is literal', () => {
    const streamingOptions = {
      final: false,
      streamParse: true,
      reuseStableTopLevelNodes: true,
    }

    for (const fence of ['```', '~~~']) {
      const marker = fence[0]
      const body = `${fence}python\nprint("ok")\n`
      const closingMd = getMarkdown(`closing-fence-prefix-${marker}`)

      for (const prefix of [marker, marker.repeat(2)]) {
        const codeNode = findFirstCodeBlock(parseMarkdownToStructure(
          `${body}${prefix}`,
          closingMd,
          streamingOptions,
        ) as any[])
        expect(codeNode?.loading).toBe(true)
        expect(codeNode?.code).toBe('print("ok")')
      }

      const closed = findFirstCodeBlock(parseMarkdownToStructure(
        `${body}${fence}`,
        closingMd,
        streamingOptions,
      ) as any[])
      expect(closed?.loading).toBe(false)
      expect(closed?.code).toBe('print("ok")\n')

      const literalValueMd = getMarkdown(`literal-fence-value-${marker}`)
      parseMarkdownToStructure(`${body}${marker}`, literalValueMd, streamingOptions)
      const literalValue = findFirstCodeBlock(parseMarkdownToStructure(
        `${body}${marker}value`,
        literalValueMd,
        streamingOptions,
      ) as any[])
      expect(literalValue?.code).toBe(`print("ok")\n${marker}value`)

      const literalLineMd = getMarkdown(`literal-fence-line-${marker}`)
      parseMarkdownToStructure(`${body}${marker}`, literalLineMd, streamingOptions)
      const literalLine = findFirstCodeBlock(parseMarkdownToStructure(
        `${body}${marker}\nnext`,
        literalLineMd,
        streamingOptions,
      ) as any[])
      expect(literalLine?.code).toBe(`print("ok")\n${marker}\nnext`)

      const finalLiteral = findFirstCodeBlock(parseMarkdownToStructure(
        `${body}${marker}`,
        getMarkdown(`final-fence-tail-${marker}`),
        { final: true, streamParse: false },
      ) as any[])
      expect(finalLiteral?.loading).toBe(false)
      expect(finalLiteral?.code).toBe(`print("ok")\n${marker}`)
    }
  })

  it('uses the opening fence length to resolve a four-backtick stream', () => {
    const fence = '````'
    const marker = fence[0]
    const body = `${fence}python\nprint("ok")\n`
    const options = { final: false, streamParse: true, reuseStableTopLevelNodes: true }
    const closingMd = getMarkdown('four-backtick-closing-prefix')

    for (let length = 1; length < fence.length; length++) {
      const codeNode = findFirstCodeBlock(parseMarkdownToStructure(
        `${body}${marker.repeat(length)}`,
        closingMd,
        options,
      ) as any[])
      expect(codeNode?.loading).toBe(true)
      expect(codeNode?.code).toBe('print("ok")')
    }

    const closed = findFirstCodeBlock(parseMarkdownToStructure(
      `${body}${fence}`,
      closingMd,
      options,
    ) as any[])
    expect(closed?.loading).toBe(false)
    expect(closed?.code).toBe('print("ok")\n')

    const nestedMd = getMarkdown('four-backtick-literal-nested-fence')
    parseMarkdownToStructure(`${body}${marker.repeat(3)}`, nestedMd, options)
    const releasedNestedFence = findFirstCodeBlock(parseMarkdownToStructure(
      `${body}${marker.repeat(3)}\nnext\n${fence}`,
      nestedMd,
      options,
    ) as any[])
    expect(releasedNestedFence?.loading).toBe(false)
    expect(releasedNestedFence?.code).toBe('print("ok")\n```\nnext\n')

    const finalLiteral = findFirstCodeBlock(parseMarkdownToStructure(
      `${body}${marker.repeat(3)}`,
      getMarkdown('four-backtick-final-literal'),
      { final: true, streamParse: false },
    ) as any[])
    expect(finalLiteral?.code).toBe('print("ok")\n```')
  })

  it('handles empty, CRLF, and indented streaming fence prefixes', () => {
    const options = { final: false, streamParse: true, reuseStableTopLevelNodes: true }
    const emptyBody = '```js\n'
    const emptyMd = getMarkdown('empty-closing-fence-prefix')

    for (const prefix of ['`', '``']) {
      const codeNode = findFirstCodeBlock(parseMarkdownToStructure(
        `${emptyBody}${prefix}`,
        emptyMd,
        options,
      ) as any[])
      expect(codeNode?.code).toBe('')
    }

    const emptyClosed = findFirstCodeBlock(parseMarkdownToStructure(
      `${emptyBody}\`\`\``,
      emptyMd,
      options,
    ) as any[])
    expect(emptyClosed?.loading).toBe(false)
    expect(emptyClosed?.code).toBe('')

    const crlfBody = '```js\r\ncode\r\n'
    const crlfMd = getMarkdown('crlf-closing-fence-prefix')
    const crlfPending = findFirstCodeBlock(parseMarkdownToStructure(
      `${crlfBody}\``,
      crlfMd,
      options,
    ) as any[])
    expect(crlfPending?.code).toBe('code')

    const crlfLiteral = findFirstCodeBlock(parseMarkdownToStructure(
      `${crlfBody}\`value`,
      crlfMd,
      options,
    ) as any[])
    expect(crlfLiteral?.code).toBe('code\n`value')

    const indentedCandidate = findFirstCodeBlock(parseMarkdownToStructure(
      '```js\ncode\n   ``',
      getMarkdown('indented-closing-fence-prefix'),
      { final: false, streamParse: false },
    ) as any[])
    expect(indentedCandidate?.code).toBe('code')

    const indentedLiteral = findFirstCodeBlock(parseMarkdownToStructure(
      '```js\ncode\n    ``',
      getMarkdown('indented-literal-fence-tail'),
      { final: false, streamParse: false },
    ) as any[])
    expect(indentedLiteral?.code).toBe('code\n    ``')
  })

  it('applies the same pending-tail contract before diff splitting', () => {
    const body = '```diff js\n-old\n+new\n'
    const options = { final: false, streamParse: true, reuseStableTopLevelNodes: true }
    const md = getMarkdown('diff-closing-fence-prefix')
    const pending = findFirstCodeBlock(parseMarkdownToStructure(
      `${body}\``,
      md,
      options,
    ) as any[])

    expect(pending?.raw).toBe('-old\n+new')
    expect(pending?.originalCode).toBe('old')
    expect(pending?.updatedCode).toBe('new')

    const literal = findFirstCodeBlock(parseMarkdownToStructure(
      `${body}\`value`,
      md,
      options,
    ) as any[])
    expect(literal?.raw).toBe('-old\n+new\n`value')
    expect(literal?.originalCode).toBe('old\n`value')
    expect(literal?.updatedCode).toBe('new\n`value')
  })

  it('still strips dangling html-like tail outside fences', () => {
    const md = getMarkdown('fence-regression')
    const nodes = parseMarkdownToStructure('Hello\\n<think', md)
    expect(JSON.stringify(nodes)).not.toContain('<think')
    expect(JSON.stringify(nodes)).toContain('Hello')
  })
})

describe('parseMarkdownToStructure - list fence html tail (streaming)', () => {
  it('keeps incomplete html content monotonic inside a list-nested fence', () => {
    // Regression: the inner fence scanner in stripDanglingHtmlLikeTail used
    // to miss list-item-prefixed fences, so an incomplete `<div` tail inside
    // `- ```html` was truncated from the code content on every non-final
    // commit (content flashed '' while typing `<d`). The streamed prefixes
    // must match a cold parse of the same prefix at every step.
    const md = getMarkdown('fence-list-html-tail')
    const src = '- ```html\n  <div\n  ```\n'
    for (let end = 1; end <= src.length; end++) {
      const prefix = src.slice(0, end)
      const streamed = parseMarkdownToStructure(prefix, md, {
        final: false,
        streamParse: true,
        __reuseStableTopLevelNodes: true,
      }) as any[]
      const cold = parseMarkdownToStructure(prefix, getMarkdown(`fence-list-html-tail-cold-${end}`), {
        final: false,
        streamParse: false,
      }) as any[]
      const codeOf = (nodes: any[]) => {
        const out: string[] = []
        const walk = (ns: any[]) => {
          for (const n of ns) {
            if (n?.type === 'code_block')
              out.push(String(n.code ?? ''))
            for (const key of ['children', 'items']) {
              if (Array.isArray(n?.[key]))
                walk(n[key])
            }
          }
        }
        walk(nodes)
        return out.join('|')
      }
      expect(codeOf(streamed), `streamed != cold at prefix ${end}: '${codeOf(streamed)}' vs '${codeOf(cold)}'`).toBe(codeOf(cold))
    }
  })
})
