#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frameworks = ['vue', 'vue2', 'react', 'octane', 'svelte', 'angular', 'solid']
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROME_PATH,
})
const failures = []

try {
  const page = await browser.newPage()
  for (const framework of frameworks) {
    const dir = framework === 'vue' ? root : path.join(root, 'packages', `markstream-${framework}`)
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const utilities = ['vue', 'vue2', 'react', 'octane'].includes(framework)
    const container = utilities || framework === 'solid'
    const variants = ['index.css', 'index.px.css'].filter(file => pkg.exports[`./${file}`])
    for (const variant of variants) {
      const css = readFileSync(path.join(dir, 'dist', variant), 'utf8')
      // Vue component styles retain their build-generated scope attributes.
      const scopes = [...new Set([...css.matchAll(/\.(?:hr-node|vmr-container)\[([^\]]+)\]/g)].map(match => match[1]))].join(' ')
      for (const preflight of [false, true]) {
        for (const dark of [false, true]) {
          const label = `${framework}/${variant}/${preflight ? 'border-preflight' : 'no-reset'}/${dark ? 'dark' : 'light'}`
          await page.setContent(`
            <style>${preflight ? '*, ::before, ::after { border-width: 0; border-style: solid; border-color: #e5e7eb; }' : ''}</style>
            <style>.consumer-border { border-style: dashed; }</style>
            <div id="outside" class="border">Outside renderer</div>
            <input id="native-input">
            <main class="markstream-${framework}${dark ? ' dark' : ''}">
              <div id="code" class="code-block-container border">
                <div id="code-header" class="code-block-header border-b">JavaScript</div>
                <pre>console.log('hello')</pre>
              </div>
              ${['mermaid', 'd2', 'infographic'].map(type => `
                <div id="${type}" class="${type}-block ${type}-block-container ${utilities ? 'border' : `markstream-${framework}-enhanced-block`}">
                  <div id="${type}-header" class="${type}-block-header ${utilities ? 'border-b' : `markstream-${framework}-enhanced-block__header`}">${type}</div>
                  <p>Diagram content</p>
                </div>`).join('')}
              ${utilities ? '<div id="fallback" class="code-block-container border">Fallback code</div><div id="menu" class="code-more-menu border">Code menu</div><div id="override" class="border consumer-border">Custom border</div>' : ''}
              ${framework !== 'angular' ? '<div id="footnote" class="footnote-node border-t">Footnote</div>' : ''}
              <hr id="hr" class="hr-node" ${scopes}>
              ${container ? `<div id="container" class="vmr-container" ${scopes}>Container</div>` : ''}
              <input id="inside-input">
              <div id="custom-node" style="border: 2px dotted purple">Custom node</div>
            </main>
          `)
          const nativeBefore = await page.locator('#native-input').evaluate(el => getComputedStyle(el).border)
          await page.addStyleTag({ content: css })
          const borders = await page.locator('[id]').evaluateAll(elements => Object.fromEntries(elements.map((element) => {
            const style = getComputedStyle(element)
            return [element.id, {
              widths: ['Top', 'Right', 'Bottom', 'Left'].map(side => style[`border${side}Width`]),
              styles: ['Top', 'Right', 'Bottom', 'Left'].map(side => style[`border${side}Style`]),
              color: style.borderTopColor,
              textColor: style.color,
              border: style.border,
            }]
          })))
          const check = (id, widths, style = 'solid') => {
            try {
              assert.deepEqual(borders[id].widths, widths.map(width => `${width}px`))
              widths.forEach((width, index) => {
                if (width > 0)
                  assert.equal(borders[id].styles[index], style)
              })
            }
            catch (error) {
              failures.push(`${label} #${id}: ${error.message}`)
            }
          }
          for (const id of ['code', 'mermaid', 'd2', 'infographic']) {
            check(id, [1, 1, 1, 1])
            check(`${id}-header`, [0, 0, 1, 0])
          }
          if (utilities) {
            check('fallback', [1, 1, 1, 1])
            check('menu', [1, 1, 1, 1])
            check('override', [1, 1, 1, 1], 'dashed')
          }
          if (framework !== 'angular')
            check('footnote', [1, 0, 0, 0])
          check('hr', [1, 0, 0, 0])
          if (container) {
            check('container', [1, 1, 1, 4])
            assert.notEqual(borders.container.color, borders.container.textColor, `${label}: explicit container color`)
          }
          check('outside', [0, 0, 0, 0])
          check('custom-node', [2, 2, 2, 2], 'dotted')
          assert.equal(borders['native-input'].border, nativeBefore, `${label}: outside input`)
          assert.equal(borders['inside-input'].border, nativeBefore, `${label}: raw HTML input`)
          if (utilities) {
            await page.locator('main').evaluate((el) => {
              el.style.setProperty('--hr-border', 'rgb(18, 52, 86)')
              el.style.setProperty('--hr-border-color', 'rgb(18, 52, 86)')
            })
            assert.equal(await page.locator('#hr').evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(18, 52, 86)', `${label}: hr color override`)
          }
          console.log(`Checked ${label}`)
        }
      }
    }
  }
}
finally {
  await browser.close()
}

assert.equal(failures.length, 0, failures.join('\n'))
console.log('Border baseline checks passed across all seven framework packages.')
