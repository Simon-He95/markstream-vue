#!/usr/bin/env node

import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const parserDistUrl = new URL('../packages/markdown-parser/dist/index.js', import.meta.url)
const injectDivergence = process.env.MARKSTREAM_PARSER_DIFFERENTIAL_INJECT_DIVERGENCE === '1'

const fixtures = [
  {
    id: 'math-crlf-unicode',
    seed: 62601,
    source: [
      '# 数学与 Unicode 🙂',
      '',
      '行内公式 $x + 1$，以及未完成公式 $y +',
      '',
      '$$',
      '\\sum_{i=0}^{n} i',
      '$$',
      '',
      '未完成括号公式 \\[z + 1',
    ].join('\r\n'),
    restartSource: '重启后的内容 👋\r\n\r\n完整公式 $a+b$。\r\n',
    options: { includeSourceMap: true },
  },
  {
    id: 'html-custom-links',
    seed: 62602,
    source: [
      '<thinking>分析 <em>中</em></thinking>',
      '',
      '<div data-kind="box">HTML 内容</div>',
      '',
      '[安全链接][safe] 与 [拒绝链接](javascript:alert(1))',
      '',
      '[safe]: https://example.com/docs',
      '',
      '<thinking>未完成',
    ].join('\n'),
    restartSource: '<thinking>新的会话</thinking>\n\n[链接](https://example.com)\n',
    options: {
      customHtmlTags: ['thinking'],
      validateLink: url => !/^\s*javascript:/i.test(url),
    },
  },
  {
    id: 'lists-tables-fences',
    seed: 62603,
    source: [
      '- 第一项',
      '  - nested 🙂',
      '- 第二项',
      '',
      '| 列 A | 列 B |',
      '| --- | --- |',
      '| 1 | 二 |',
      '',
      '```ts',
      'const value = `中🙂`',
      '```',
      '',
      '~~~diff',
      '+ added',
    ].join('\n'),
    restartSource: '1. restarted\n2. stable\n\n```js\nconsole.log(1)\n```\n',
    options: { requireClosingStrong: true },
  },
  {
    id: 'inline-dispatcher-heavy',
    seed: 63401,
    source: [
      '## Inline dispatcher 中🙂',
      '',
      '前缀 **strong [link `code` 与 $x_1$](https://example.com/a_(b)) 后缀**，再接 *强调*、~~删除~~、==高亮==、++插入++、H~2~O 与 x^2^。',
      '',
      '转义：\\*literal\\* \\[not link\\] \\$not math\\$ \\`not code\\`。',
      '',
      '[![alt *字*](https://images.example/complete.png "图")](https://example.com/outer)',
      '',
      '[![流式图片](https://images.example/loading.png)](https://example.com/loading',
      '',
      '未完成：**strong [label](https://example.com/path 与 `code',
    ].join('\n'),
    restartSource: '重启：**[新链接 \\*字\\* 与 `code`](https://example.com/restart)**，以及 $a+b$。\n',
    options: { requireClosingStrong: true },
  },
  {
    // An unclosed wrapper swallows a <details> block, the nested list raw has no
    // literal counterpart at its own position, and a later paragraph repeats
    // that text verbatim (plus a second <details> block with the same summary).
    // Before the merge cursor was anchored on node source ranges, this shape made
    // the HTML merge pass scan the rest of the document for every list node.
    id: 'html-wrapper-details-duplicate-raw',
    seed: 63402,
    source: [
      '<details>',
      '<summary>Summary 2</summary>',
      '',
      '- x1',
      '- y1',
      '',
      '</details>',
      '',
      '<div class="same">',
      'BETA',
      '',
      '',
      '<details>',
      '<summary>Summary 2</summary>',
      '',
      '- p2',
      '- q2',
      '',
      '</details>',
      '',
      '<div class="same">',
      'DELTA',
      '</div>',
      '',
      'trailing copy:',
      'x1',
      'y1',
    ].join('\n'),
    restartSource: '<div class="same">\nRESTART\n\n<details>\n<summary>S</summary>\n\n- r1\n- r2\n\n</details>\n',
    options: {},
  },
]

function readArg(name) {
  const equalsPrefix = `${name}=`
  const withEquals = process.argv.find(argument => argument.startsWith(equalsPrefix))
  if (withEquals)
    return withEquals.slice(equalsPrefix.length)

  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function randomInt(random, minimum, maximum) {
  return minimum + Math.floor(random() * (maximum - minimum + 1))
}

function appendInChunks(actions, source, random) {
  let offset = 0
  while (offset < source.length) {
    const size = randomInt(random, 1, Math.min(19, source.length - offset))
    actions.push({ kind: 'append', text: source.slice(offset, offset + size), final: false })
    offset += size
  }
}

function createActionPlan(fixture, seed) {
  const random = createRandom(seed)
  const actions = [{ kind: 'reset', final: false }]
  appendInChunks(actions, fixture.source, random)
  actions.push({ kind: 'duplicate', final: false })
  actions.push({ kind: 'final-transition', final: true })
  actions.push({ kind: 'final-transition', final: false })

  const truncateCount = randomInt(random, 1, Math.min(17, fixture.source.length))
  const truncatedLength = fixture.source.length - truncateCount
  actions.push({ kind: 'truncate', length: truncatedLength, final: false })
  actions.push({ kind: 'duplicate', final: false })
  actions.push({ kind: 'append', text: fixture.source.slice(truncatedLength), final: false })

  const replaceStart = randomInt(random, 1, Math.max(1, fixture.source.length - 3))
  const replaceEnd = Math.min(fixture.source.length, replaceStart + randomInt(random, 1, 5))
  actions.push({
    kind: 'replace-range',
    start: replaceStart,
    end: replaceEnd,
    text: `替换-${seed.toString(36)}-🙂`,
    final: false,
  })
  actions.push({ kind: 'duplicate', final: false })
  actions.push({ kind: 'final-transition', final: true })
  actions.push({ kind: 'reset', final: false })
  appendInChunks(actions, fixture.restartSource, random)
  actions.push({ kind: 'duplicate', final: false })
  actions.push({ kind: 'final-transition', final: true })
  return actions
}

function applyAction(source, action, markdownInstances) {
  switch (action.kind) {
    case 'append':
      return source + action.text
    case 'duplicate':
    case 'final-transition':
      return source
    case 'truncate':
      return source.slice(0, action.length)
    case 'replace-range':
      return source.slice(0, action.start) + action.text + source.slice(action.end)
    case 'reset':
      for (const markdown of markdownInstances)
        markdown.stream?.reset?.()
      return ''
    default:
      throw new Error(`Unknown differential action: ${action.kind}`)
  }
}

function canonicalize(value, seen = new WeakSet()) {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (typeof value === 'undefined')
    return undefined
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
    throw new TypeError(`Parser result contains unsupported ${typeof value} value`)
  if (seen.has(value))
    throw new TypeError('Parser result contains a cycle')

  seen.add(value)
  const result = Array.isArray(value)
    ? value.map(item => canonicalize(item, seen))
    : Object.fromEntries(
        Object.keys(value)
          .sort()
          .map(key => [key, canonicalize(value[key], seen)])
          .filter(([, item]) => item !== undefined),
      )
  seen.delete(value)
  return result
}

function serialize(value) {
  return JSON.stringify(canonicalize(value))
}

function summarizeOptions(options, final, streamParse, structuredReuse) {
  return {
    ...options,
    validateLink: typeof options.validateLink === 'function' ? '[Function validateLink]' : options.validateLink,
    final,
    streamParse,
    structuredReuse,
  }
}

function failDifferential({
  actionTrace,
  actual,
  commitIndex,
  expected,
  fixture,
  label,
  options,
  seed,
  source,
}) {
  const injectionPrefix = injectDivergence
    ? 'MARKSTREAM_PARSER_DIFFERENTIAL_INJECT_DIVERGENCE=1 '
    : ''
  const replay = `${injectionPrefix}pnpm validate:parser-differential -- --fixture=${fixture.id} --seed=${seed}`
  console.error('[parser-differential] mismatch')
  console.error(`seed: ${seed}`)
  console.error(`fixture: ${fixture.id}`)
  console.error(`comparison: ${label}`)
  console.error(`commit index: ${commitIndex}`)
  console.error(`options: ${JSON.stringify(options)}`)
  console.error(`source: ${JSON.stringify(source)}`)
  console.error(`original fixture: ${JSON.stringify(fixture.source)}`)
  console.error(`action trace: ${JSON.stringify(actionTrace, null, 2)}`)
  console.error(`expected: ${expected}`)
  console.error(`actual: ${actual}`)
  console.error(`replay: ${replay}`)
  process.exit(1)
}

async function runFixture(parser, fixture, seed) {
  const { getMarkdown, parseMarkdownToStructure } = parser
  const msgId = `parser-differential-${fixture.id}-${seed}`
  const markdownOptions = fixture.options.customHtmlTags
    ? { customHtmlTags: fixture.options.customHtmlTags }
    : undefined
  const streamMarkdown = getMarkdown(msgId, markdownOptions)
  const reuseMarkdown = getMarkdown(msgId, markdownOptions)
  const actions = createActionPlan(fixture, seed)
  const actionTrace = []
  let source = ''

  for (let commitIndex = 0; commitIndex < actions.length; commitIndex++) {
    const action = actions[commitIndex]
    source = applyAction(source, action, [streamMarkdown, reuseMarkdown])
    actionTrace.push({ ...action, resultLength: source.length })

    const coldMarkdown = getMarkdown(msgId, markdownOptions)
    const coldOptions = { ...fixture.options, final: action.final, streamParse: false }
    const streamOptions = { ...fixture.options, final: action.final, streamParse: true }
    const reuseOptions = {
      ...streamOptions,
      reuseStableTopLevelNodes: true,
    }
    const cold = parseMarkdownToStructure(source, coldMarkdown, coldOptions)
    const streamed = parseMarkdownToStructure(source, streamMarkdown, streamOptions)
    const reused = parseMarkdownToStructure(source, reuseMarkdown, reuseOptions)
    const expected = serialize(cold)
    const comparisons = [
      {
        label: 'stream-vs-cold',
        nodes: streamed,
        options: summarizeOptions(fixture.options, action.final, true, false),
      },
      {
        label: 'structured-reuse-vs-cold',
        nodes: reused,
        options: summarizeOptions(fixture.options, action.final, true, true),
      },
    ]

    if (action.final) {
      const finalMarkdown = getMarkdown(msgId, markdownOptions)
      comparisons.push({
        label: 'final-vs-cold',
        nodes: parseMarkdownToStructure(source, finalMarkdown, { ...fixture.options, final: true, streamParse: false }),
        options: summarizeOptions(fixture.options, true, false, false),
      })
    }

    for (const comparison of comparisons) {
      const nodes = injectDivergence && commitIndex === 1 && comparison.label === 'structured-reuse-vs-cold'
        ? [...comparison.nodes, { type: '__injected_divergence__' }]
        : comparison.nodes
      const actual = serialize(nodes)
      if (actual !== expected) {
        failDifferential({
          actionTrace,
          actual,
          commitIndex,
          expected,
          fixture,
          label: comparison.label,
          options: comparison.options,
          seed,
          source,
        })
      }
    }
  }

  console.log(`[parser-differential] PASS fixture=${fixture.id} seed=${seed} commits=${actions.length}`)
}

const requestedFixtureId = readArg('--fixture')
const requestedSeedValue = readArg('--seed')
const requestedSeed = requestedSeedValue == null ? undefined : Number(requestedSeedValue)
const printPlan = process.argv.includes('--print-plan')

if (requestedSeedValue != null && (!Number.isInteger(requestedSeed) || requestedSeed < 0)) {
  console.error(`Invalid --seed value: ${requestedSeedValue}`)
  process.exit(1)
}

const selectedFixtures = requestedFixtureId
  ? fixtures.filter(fixture => fixture.id === requestedFixtureId)
  : fixtures

if (!selectedFixtures.length) {
  console.error(`Unknown --fixture value: ${requestedFixtureId}`)
  process.exit(1)
}

if (printPlan) {
  const plans = selectedFixtures.map(fixture => ({
    fixture: fixture.id,
    seed: requestedSeed ?? fixture.seed,
    actions: createActionPlan(fixture, requestedSeed ?? fixture.seed),
  }))
  console.log(JSON.stringify(plans, null, 2))
  process.exit(0)
}

const parserDistPath = fileURLToPath(parserDistUrl)
const parser = await import(pathToFileURL(parserDistPath).href)
for (const fixture of selectedFixtures)
  await runFixture(parser, fixture, requestedSeed ?? fixture.seed)

console.log(`[parser-differential] All ${selectedFixtures.length} fixed-seed fixtures matched cold parses.`)
