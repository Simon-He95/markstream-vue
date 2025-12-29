import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../src'

describe('table <br> handling', () => {
  it('converts <br> inside table cells into hardbreak nodes', () => {
    const md = getMarkdown()
    const markdown = `| 环节   | 优等生任务      | 学困生任务       | 时间  | 准备材料          |  
|--------|------------------|-----------------|-------|-------------------|  
| **自学** | 1. 用成语形容小蝌蚪（例：锲而不舍）<br>2. 画“成长流程图” | 1. 圈出文中动物名称<br>2. 跟读课文录音 | 8分钟 | 课文、彩笔        |  
| **助学** | 1. 设计“特征谜语”考同伴<br>2. 分析乌龟为何不是妈妈 | 1. 用特征卡片配对动物<br>2. 填空补全对话 | 12分钟 | 动物卡片、对话条  |  
| **共学** | 1. 领读青蛙妈妈台词（带动作）<br>2. 总结“坚持的道理” | 1. 模仿角色语气朗读<br>2. 复述变化顺序 | 15分钟 | 头饰、奖励贴纸    |`

    const nodes = parseMarkdownToStructure(markdown, md)
    // find the table node
    const table = nodes.find(n => n.type === 'table') as any
    expect(table).toBeDefined()
    // first data row (after header) should exist
    expect(table.rows.length).toBeGreaterThan(0)

    const firstRow = table.rows[0]
    // second cell (优等生任务) should contain a hardbreak node
    const targetCell = firstRow.cells[1]
    expect(targetCell).toBeDefined()
    const hasHardbreak = Array.isArray(targetCell.children) && targetCell.children.some((c: any) => c.type === 'hardbreak')
    expect(hasHardbreak).toBe(true)
  })
})
