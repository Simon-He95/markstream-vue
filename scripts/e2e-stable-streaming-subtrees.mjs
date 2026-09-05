#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'

process.env.MARKSTREAM_BENCHMARK_BUILD = '1'
const { createBenchmarkServer } = await import('./benchmark-streaming-split.mjs')
const outputDir = path.resolve('.tmp/stable-streaming-subtrees')
const variants = process.env.MARKSTREAM_BENCHMARK_BASELINE_ROOT
  ? [path.resolve(process.env.MARKSTREAM_BENCHMARK_BASELINE_ROOT), process.cwd()]
  : [process.cwd()]
const screenshots = []
const chrome = process.env.PLAYWRIGHT_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome, headless: true } : { channel: 'chrome', headless: true })
try {
  for (const [index, sourceRoot] of variants.entries()) {
    const { server, port } = await createBenchmarkServer(sourceRoot, path.join(outputDir, String(index)))
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`http://127.0.0.1:${port}/?renderer=markstream&variant=incremental-nosmooth&case=custom-html`)
      await page.waitForFunction(() => window.__ready)
      const result = await page.evaluate(async () => {
        let heading
        let paragraph
        let selectionText
        const select = setInterval(() => {
          const root = document.querySelector('.vue-host')
          const nextParagraph = root.querySelector('p')
          if (paragraph || nextParagraph?.textContent !== 'Stable selected paragraph.')
            return
          heading = root.querySelector('h1')
          paragraph = nextParagraph
          selectionText = paragraph.textContent
          const range = document.createRange()
          range.selectNodeContents(paragraph)
          window.getSelection().removeAllRanges()
          window.getSelection().addRange(range)
        }, 10)
        try {
          await window.__runBenchmark({
            chunks: ['# Stable heading\n\nStable selected paragraph.\n\nGrowing tail ', ...Array.from({ length: 20 }, () => '**more** text ')],
            intervalMs: 40,
            endMarker: 'SELECTION_END',
            timeoutMs: 10000,
            stableFrames: 4,
          })
          const rendererScope = document.querySelector('.vue-host .markdown-renderer').getAttributeNames().find(name => name.startsWith('data-v-'))
          return {
            selected: window.getSelection().toString(),
            selectionText,
            headingPreserved: heading === document.querySelector('.vue-host h1'),
            paragraphPreserved: paragraph === document.querySelector('.vue-host p'),
            parentScopeInherited: Boolean(rendererScope && paragraph.hasAttribute(rendererScope)),
          }
        }
        finally {
          clearInterval(select)
        }
      })
      assert.equal(result.selectionText, 'Stable selected paragraph.')
      assert.equal(result.selected, result.selectionText)
      assert.equal(result.headingPreserved, true)
      assert.equal(result.paragraphPreserved, true)
      assert.equal(result.parentScopeInherited, true)
      await page.evaluate(() => window.getSelection().removeAllRanges())
      await page.evaluate(async () => window.__runBenchmark({
        chunks: ['# Visual parity\n\n**Strong**, _emphasis_, ~~removed~~, [link](https://example.com), and `code`.\n\n> Quoted paragraph.\n\n- first\n- second\n\n| Name | Value |\n| --- | --- |\n| A | B |\n\n<audit-widget>\n\n**Custom** child paragraph.\n\n</audit-widget>\n\n```ts\nconst answer = 42\n```\n'],
        intervalMs: 16,
        endMarker: 'VISUAL_END',
        timeoutMs: 10000,
        stableFrames: 4,
      }))
      await page.evaluate(() => document.fonts.ready)
      mkdirSync(outputDir, { recursive: true })
      screenshots.push(await page.locator('.vue-host').screenshot({ path: path.join(outputDir, `${index}.png`), animations: 'disabled' }))
      assert.deepEqual(errors, [])
      console.log(`Selection and stable DOM passed: ${sourceRoot}`)
      await page.close()
    }
    finally {
      await server.close()
    }
  }
  if (screenshots.length === 2) {
    assert.equal(screenshots[0].equals(screenshots[1]), true, 'Baseline and candidate screenshots differ')
    console.log('Baseline and candidate final screenshots are byte-identical.')
  }
}
finally {
  await browser.close()
}
