import PreCodeBlock from 'benchmark-pre-code'
import { createApp, h, nextTick, shallowRef } from 'vue'
import source from '../../../src/components/NodeRenderer/NodeRenderer.vue?raw'
import 'markstream-vue/index.css'

const items = shallowRef([])
let session = 0
const inline = shallowRef(false)
createApp({ setup: () => () => h('div', { id: 'diffs', class: 'markstream-vue markdown-renderer', style: 'width:1000px;padding:20px;background:white' }, items.value.map((node, i) => h(PreCodeBlock, { key: `${session}-${i}`, node, indexKey: `block-${i}`, diffInline: inline.value, diffHideUnchangedRegions: true }))) }).mount('#app')
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
function makeNode(originalCode, updatedCode, loading) {
  return { type: 'code_block', raw: '', code: '', diff: true, language: 'typescript', originalCode, updatedCode, loading }
}
window.runDiffCase = async ({ kind, count, blocks = 1, unified = false }) => {
  items.value = []
  await nextTick()
  session++
  inline.value = unified
  const lines = kind.includes('long-lines')
    ? Array.from({ length: count }, (_, i) => `${'unchanged common code prefix '.repeat(12)} ${i}`)
    : kind === 'source' || kind === 'stream'
      ? source.split('\n').slice(0, count)
      : Array.from({ length: count }, (_, i) => `const value${i} = ${i};`)
  const original = lines.join('\n')
  const changed = lines.map((line, i) => i === 0 || (kind !== 'suffix' && i % 13 === 0) ? `${line} // updated` : line)
  const root = document.querySelector('#diffs')
  let mutations = 0
  const observer = new MutationObserver((records) => {
    mutations += records.length
  })
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true })
  const started = performance.now()
  if (kind.startsWith('stream')) {
    for (let i = 40; i < changed.length; i += 40) {
      items.value = [makeNode(original, changed.slice(0, i).join('\n'), true)]
      await nextTick()
      await frame()
    }
  }
  items.value = Array.from({ length: blocks }, (_, i) => makeNode(original, `${changed.join('\n')}${blocks > 1 ? `\n// block ${i}` : ''}`, false))
  await nextTick()
  let stableFrames = 0
  let lastMutations = -1
  const deadline = performance.now() + 15000
  while (stableFrames < 4) {
    await frame()
    const measured = unified || Array.from(root.querySelectorAll('.markstream-pre__diff-line')).every(line => line.style.getPropertyValue('--markstream-pre-diff-synced-row-height'))
    stableFrames = measured && lastMutations === mutations ? stableFrames + 1 : 0
    lastMutations = mutations
    if (performance.now() > deadline) {
      observer.disconnect()
      throw new Error('Diff restoration did not settle')
    }
  }
  observer.disconnect()
  return { elapsedMs: performance.now() - started, domNodes: document.querySelector('#diffs').querySelectorAll('*').length, html: document.querySelector('#diffs').innerHTML }
}
window.ready = true
