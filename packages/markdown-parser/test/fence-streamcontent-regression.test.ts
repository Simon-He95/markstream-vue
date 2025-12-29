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

  it('still strips dangling html-like tail outside fences', () => {
    const md = getMarkdown('fence-regression')
    const nodes = parseMarkdownToStructure('Hello\\n<think', md)
    expect(JSON.stringify(nodes)).not.toContain('<think')
    expect(JSON.stringify(nodes)).toContain('Hello')
  })
})
