import { describe, expect, it } from 'vitest'
import { getMarkdown, parseMarkdownToStructure } from '../packages/markdown-parser/src'
import { collect, links, textIncludes } from './utils/midstate-utils'

const md = getMarkdown('issue-402')

describe('issue #402 filename-like linkify regression', () => {
  it('keeps filename cells as plain text inside markdown tables', () => {
    const input = `当前可用的文件如下:

| 文件名 | 文件ID |
|--------|--------|
| 制度04-XX银行不良信贷资产转让实施细则.docx | f0f026a0a3b84b68af457786ac1271c4GbdC4y7vIs |
| 制度03-XX银行呆账核销实施细则.md | 7a092ea2aabd4460917e1a8347927548jocBz0soj8 |
| 制度02-XX银行呆账核销管理办法.md | d2b786c5ab9a48b5a4755b783a2c8668b2Tp9pCBmH |
| 制度01-财政部文件-《金融企业呆账核销管理办法(2017年版)》.md | 511e9efd721940868eb873c1beb67e43wMl7m22Kb5 |
`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    const tables = collect(nodes, 'table') as any[]
    expect(tables).toHaveLength(1)
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, '制度03-XX银行呆账核销实施细则.md')).toBe(true)
    expect(textIncludes(nodes, '制度02-XX银行呆账核销管理办法.md')).toBe(true)
  })

  it('keeps cjk markdown filenames without numeric segments as text', () => {
    const input = `文件名：

**《西游记后传世界观-热血情感版.md》**

如果你要，我下一步可以直接继续补其中一个：
1. **主角团角色设定**`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, '西游记后传世界观-热血情感版.md')).toBe(true)
  })

  it('keeps cjk ambiguous-extension filenames without ascii separators as text', () => {
    const input = `文件：
**个人简历.md**
**使用说明.md**
**世界观设定.md**
**研究报告.ai**
**报告２０２６.md**`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, '个人简历.md')).toBe(true)
    expect(textIncludes(nodes, '使用说明.md')).toBe(true)
    expect(textIncludes(nodes, '世界观设定.md')).toBe(true)
    expect(textIncludes(nodes, '研究报告.ai')).toBe(true)
    expect(textIncludes(nodes, '报告２０２６.md')).toBe(true)
  })

  it('keeps common lowercase ascii markdown filenames as text when used as filenames', () => {
    const input = `文件：
**readme.md**
**release-notes.md**
**getting-started.md**
**2026-plan.md**`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'readme.md')).toBe(true)
    expect(textIncludes(nodes, 'release-notes.md')).toBe(true)
    expect(textIncludes(nodes, 'getting-started.md')).toBe(true)
    expect(textIncludes(nodes, '2026-plan.md')).toBe(true)
  })

  it('keeps non-cjk unicode filenames with ambiguous extensions as text', () => {
    const input = `附件：
**résumé.md**
**café.md**
**отчёт.md**
**ملف.md**`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'résumé.md')).toBe(true)
    expect(textIncludes(nodes, 'café.md')).toBe(true)
    expect(textIncludes(nodes, 'отчёт.md')).toBe(true)
    expect(textIncludes(nodes, 'ملف.md')).toBe(true)
  })

  it('keeps market ticker suffixes as plain text inside markdown tables', () => {
    const input = `### 总结速查表

| 后缀 | 对应市场/交易所 | 典型例子 |
| :--- | :--- | :--- |
| **.SZ** | 深交所 (中国) | 003018.SZ |
| **.SS / .SH** | 上交所 (中国) | 600519.SS |
| **.BJ** | 北交所 (中国) | 835185.BJ |
| **.US** | 美股 (通用) | AAPL.US |
| **.NY** | 纽交所 (NYSE) | JPM.NY |
| **.L / .LN** | 伦交所 (LSE) | HSBA.L |
| **.HK** | 港交所 (HKEX) | 0700.HK |
| **.T** | 东证 (日本) | 6758.T |
| **.DE** | 德交所 (德国) | SAP.DE |
| **.PA** | 泛欧 (巴黎) | TTE.PA |
| **.AS** | 泛欧 (阿姆斯特丹) | ASML.AS |`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, '.SZ')).toBe(true)
    expect(textIncludes(nodes, '003018.SZ')).toBe(true)
    expect(textIncludes(nodes, 'ASML.AS')).toBe(true)
  })

  it('keeps ticker-like text as plain text in whitespace-separated summary blocks', () => {
    const input = `### 总结速查表

后缀 对应市场/交易所 典型例子
.SZ 深交所 (中国) 003018.SZ
.SS / .SH 上交所 (中国) 600519.SS
.BJ 北交所 (中国) 835185.BJ
.US 美股 (通用) AAPL.US
.NY 纽交所 (NYSE) JPM.NY
.L / .LN 伦交所 (LSE) HSBA.L
.HK 港交所 (HKEX) 0700.HK
.T 东证 (日本) 6758.T
.DE 德交所 (德国) SAP.DE
.PA 泛欧 (巴黎) TTE.PA
.AS 泛欧 (阿姆斯特丹) ASML.AS`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, '003018.SZ')).toBe(true)
    expect(textIncludes(nodes, 'ASML.AS')).toBe(true)
  })

  it('keeps alphanumeric and common exchange ticker-like text as plain text', () => {
    const input = `| 代码 | 市场 |
| :--- | :--- |
| VOW3.DE | 德股 |
| 1COV.DE | 德股 |
| B4B.DE | 德股 |
| BRK-B.US | 美股 |
| aapl.us | 美股 |
| Asml.as | 荷股 |
| 2330.TW | 台股 |
| BHP.AX | 澳股 |
| SHOP.TO | 加股 |
| 005930.KS | 韩股 |`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'VOW3.DE')).toBe(true)
    expect(textIncludes(nodes, 'BRK-B.US')).toBe(true)
    expect(textIncludes(nodes, 'aapl.us')).toBe(true)
    expect(textIncludes(nodes, 'SHOP.TO')).toBe(true)
    expect(textIncludes(nodes, '005930.KS')).toBe(true)
  })

  it('keeps alphanumeric and hyphenated tickers in lists under ticker context', () => {
    const input = `股票代码：

- BRK-B.US
- VOW3.DE
- aapl.us
- 2330.TW
- 005930.KS`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'BRK-B.US')).toBe(true)
    expect(textIncludes(nodes, '005930.KS')).toBe(true)
  })

  it('documents bare ticker-like text without market context', () => {
    const input = `- BRK-B.US
- VOW3.DE
- 2330.TW
- 005930.KS`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes.map(link => link.text)).toEqual([
      'BRK-B.US',
      'VOW3.DE',
      '2330.TW',
    ])
    expect(linkNodes.map(link => link.href)).toEqual([
      'http://BRK-B.US',
      'http://VOW3.DE',
      'http://2330.TW',
    ])
    expect(textIncludes(nodes, '005930.KS')).toBe(true)
  })

  it('keeps context-only market ticker suffixes as plain text', () => {
    const input = `| 代码 | 市场 |
| :--- | :--- |
| 7203.JP | 日股 |
| 600000.CN | A股 |
| ABC.SI | 新股 |
| XYZ.MX | 墨股 |`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, '7203.JP')).toBe(true)
    expect(textIncludes(nodes, 'XYZ.MX')).toBe(true)
  })

  it('keeps additional exchange ticker suffixes as plain text under market context', () => {
    const input = `| 代码 | 市场 |
| :--- | :--- |
| MAERSK-B.CO | 丹麦 |
| FPH.NZ | 新西兰 |
| ITUB.SA | 巴西 |
| TEF.MC | 西班牙 |
| PKO.PL | 波兰 |
| EBS.AT | 奥地利 |
| ENEL.IT | 意大利 |`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'MAERSK-B.CO')).toBe(true)
    expect(textIncludes(nodes, 'ENEL.IT')).toBe(true)
  })

  it('keeps short numeric market tickers as plain text', () => {
    const input = `| 代码 | 市场 |
| :--- | :--- |
| 5.HK | 港股 |
| 66.HK | 港股 |
| 388.HK | 港股 |`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, '5.HK')).toBe(true)
    expect(textIncludes(nodes, '388.HK')).toBe(true)
  })

  it('still preserves normal bare-domain autolinks', () => {
    const nodes = parseMarkdownToStructure('访问 example.com 获取更多信息。', md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes).toHaveLength(1)
    expect(linkNodes[0].href).toBe('http://example.com')
    expect(textIncludes(linkNodes[0], 'example.com')).toBe(true)
  })

  it('preserves real bare domains in broad market prose', () => {
    const nodes = parseMarkdownToStructure('市场说明：请访问 example.us 获取更多信息。', md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes).toHaveLength(1)
    expect(linkNodes[0].href).toBe('http://example.us')
  })

  it('preserves bare domains whose TLDs overlap with file extensions', () => {
    const nodes = parseMarkdownToStructure('访问 example.ai、example.md 和 OpenAI.ai 获取更多信息。', md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes).toHaveLength(3)
    expect(linkNodes.map(link => link.href)).toEqual([
      'http://example.ai',
      'http://example.md',
      'http://OpenAI.ai',
    ])
  })

  it('documents standalone lowercase ambiguous filename-like text without filename context', () => {
    const input = `readme.md
release-notes.md
report.final.md
setup.py
script.sh
archive.zip`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes.map(link => link.text)).toEqual([
      'readme.md',
      'release-notes.md',
      'report.final.md',
      'setup.py',
      'script.sh',
    ])
    expect(linkNodes.map(link => link.href)).toEqual([
      'http://readme.md',
      'http://release-notes.md',
      'http://report.final.md',
      'http://setup.py',
      'http://script.sh',
    ])
    expect(textIncludes(nodes, 'archive.zip')).toBe(true)
  })

  it('preserves adjacent cjk bare domains when they are intended as links', () => {
    const nodes = parseMarkdownToStructure('请访问example.ai，获取更多信息。', md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes).toHaveLength(1)
    expect(linkNodes[0].href).toBe('http://example.ai')
    expect(textIncludes(linkNodes[0], 'example.ai')).toBe(true)
  })

  it('preserves punycoded bare domains whose tlds overlap with file extensions', () => {
    const nodes = parseMarkdownToStructure('也可以访问 xn--fsqu00a.ai 查看说明。', md, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes).toHaveLength(1)
    expect(linkNodes[0].href).toBe('http://xn--fsqu00a.ai')
    expect(textIncludes(linkNodes[0], 'xn--fsqu00a.ai')).toBe(true)
  })

  it('preserves decoded visible text from raw punycode before filename demotion', () => {
    const punycodeMd = getMarkdown('issue-402-punycode-fixlink', {
      apply: [
        (md: any) => {
          md.core.ruler.before('fix_link_tokens', 'decode_punycode_linkify_text_for_test', (state: any) => {
            for (const token of state.tokens ?? []) {
              if (token?.type !== 'inline' || !Array.isArray(token.children))
                continue

              for (let index = 0; index < token.children.length; index++) {
                const child = token.children[index]
                const href = child?.attrs?.find((attr: [string, string]) => attr?.[0] === 'href')?.[1]
                if (child?.type === 'link_open' && child.markup === 'linkify' && href === 'http://xn--fsqu00a.ai') {
                  const textToken = token.children[index + 1]
                  if (textToken?.type === 'text')
                    textToken.content = '例子.ai'
                }
              }
            }
          })
        },
      ],
    })
    const nodes = parseMarkdownToStructure('文件：xn--fsqu00a.ai', punycodeMd, { final: true })
    const linkNodes = links(nodes)

    expect(linkNodes).toHaveLength(1)
    expect(linkNodes[0].href).toBe('http://xn--fsqu00a.ai')
    expect(textIncludes(linkNodes[0], '例子.ai')).toBe(true)
  })

  it('keeps ascii markdown filenames in lists under filename context', () => {
    const input = `文件列表：

- readme.md
- release-notes.md
- getting-started.md`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'readme.md')).toBe(true)
    expect(textIncludes(nodes, 'release-notes.md')).toBe(true)
  })

  it('inherits filename context across multiple top-level filename paragraphs', () => {
    const input = `文件名：

readme.md

release-notes.md

getting-started.md`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'readme.md')).toBe(true)
    expect(textIncludes(nodes, 'release-notes.md')).toBe(true)
    expect(textIncludes(nodes, 'getting-started.md')).toBe(true)
  })

  it('inherits filename context across sibling list items', () => {
    const input = `- 文件名：
- readme.md
- release-notes.md`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'readme.md')).toBe(true)
    expect(textIncludes(nodes, 'release-notes.md')).toBe(true)
  })

  it('inherits filename context from a list item into nested list items', () => {
    const input = `- 文件名：
  - readme.md
  - getting-started.md`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'readme.md')).toBe(true)
    expect(textIncludes(nodes, 'getting-started.md')).toBe(true)
  })

  it('inherits filename context across blockquote paragraphs', () => {
    const input = `> 文件名：
>
> **readme.md**
> **release-notes.md**`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'readme.md')).toBe(true)
    expect(textIncludes(nodes, 'release-notes.md')).toBe(true)
  })

  it('inherits ticker context across sibling list items', () => {
    const input = `- 股票代码：
- BRK-B.US
- VOW3.DE
- 2330.TW`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'BRK-B.US')).toBe(true)
    expect(textIncludes(nodes, 'VOW3.DE')).toBe(true)
    expect(textIncludes(nodes, '2330.TW')).toBe(true)
  })

  it('inherits ticker context across multiple top-level ticker paragraphs', () => {
    const input = `股票代码：

BRK-B.US

VOW3.DE

aapl.us`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'BRK-B.US')).toBe(true)
    expect(textIncludes(nodes, 'VOW3.DE')).toBe(true)
    expect(textIncludes(nodes, 'aapl.us')).toBe(true)
  })

  it('keeps dot-class US tickers under ticker context', () => {
    const input = `股票代码：

BRK.B.US

BRK.A.US

BF.B.US`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'BRK.B.US')).toBe(true)
    expect(textIncludes(nodes, 'BF.B.US')).toBe(true)
  })

  it('inherits filename and ticker context from row label cells', () => {
    const input = `| 字段 | 值 |
| :--- | :--- |
| 文件名 | readme.md |
| 股票代码 | BRK-B.US |
| 证券代码 | VOW3.DE |`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'readme.md')).toBe(true)
    expect(textIncludes(nodes, 'BRK-B.US')).toBe(true)
    expect(textIncludes(nodes, 'VOW3.DE')).toBe(true)
  })

  it('keeps ascii markdown filenames under document context', () => {
    const input = `文档：

**readme.md**
**release-notes.md**`

    const nodes = parseMarkdownToStructure(input, md, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'readme.md')).toBe(true)
    expect(textIncludes(nodes, 'release-notes.md')).toBe(true)
  })

  it('keeps context-only filename extensions as text only under filename context', () => {
    const appTldMd = getMarkdown('issue-402-app-tld', {
      apply: [
        (md: any) => {
          md.linkify?.tlds?.(['app'], true)
        },
      ],
    })
    const nodes = parseMarkdownToStructure(`文件：

- Foo.app
- installer.app`, appTldMd, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'Foo.app')).toBe(true)
    expect(textIncludes(nodes, 'installer.app')).toBe(true)

    const domainNodes = parseMarkdownToStructure('访问 example.app 获取更多信息。', appTldMd, { final: true })
    const linkNodes = links(domainNodes)
    expect(linkNodes).toHaveLength(1)
    expect(linkNodes[0].href).toBe('http://example.app')
  })

  it('keeps explicit filename-context TLD files as text without demoting generic file domains', () => {
    const filenameTldMd = getMarkdown('issue-402-filename-tlds', {
      apply: [
        (md: any) => {
          md.linkify?.tlds?.(['com', 'dev', 'io', 'page', 'site'], true)
        },
      ],
    })
    const nodes = parseMarkdownToStructure(`文件名：

server.dev

notes.io

homepage.site

release.page

command.com`, filenameTldMd, { final: true })
    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'server.dev')).toBe(true)
    expect(textIncludes(nodes, 'command.com')).toBe(true)

    const domainNodes = parseMarkdownToStructure('文件：example.com', filenameTldMd, { final: true })
    const linkNodes = links(domainNodes)
    expect(linkNodes).toHaveLength(1)
    expect(linkNodes[0].href).toBe('http://example.com')
  })

  it('keeps standalone uppercase filenames as text', () => {
    const nodes = parseMarkdownToStructure('README.md', md, { final: true })

    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'README.md')).toBe(true)
  })

  it('keeps numbered cjk filenames in headings as text', () => {
    const nodes = parseMarkdownToStructure('### ① 主角团（01-主角团.md）', md, { final: true })

    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, '01-主角团.md')).toBe(true)
  })

  it('keeps file-like paths as text instead of preserving linkify output', () => {
    const nodes = parseMarkdownToStructure('请查看 docs/README.md 和 src/index.ts。', md, { final: true })

    expect(links(nodes)).toHaveLength(0)
    expect(textIncludes(nodes, 'docs/README.md')).toBe(true)
    expect(textIncludes(nodes, 'src/index.ts')).toBe(true)
  })
})
