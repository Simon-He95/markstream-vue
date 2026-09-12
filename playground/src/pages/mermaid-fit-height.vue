<script setup lang="ts">
import { enableMermaid } from '../../../src/components/MermaidBlockNode/mermaid'
import MermaidBlockNode from '../../../src/components/MermaidBlockNode/MermaidBlockNode.vue'
import MarkdownRender from '../../../src/components/NodeRenderer'

// Deterministic flat diagram, same shape as the reported case: a 1440x220
// viewBox laid out at 506px wide renders ~77px tall, so the pre-render
// reservation (500px) is several times the diagram.
const STUB_SVG
  = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 220" width="100%">'
    + '<rect x="0" y="0" width="1440" height="220" fill="#e5e7eb" /></svg>'

enableMermaid(() => ({
  initialize() {},
  parse: async () => true,
  render: async () => ({ svg: STUB_SVG }),
}))

const node = {
  type: 'code_block',
  language: 'mermaid',
  code: 'gantt\n  title timeline\n  section A\n  phase :a1, 0, 5\n',
  raw: '',
} as any

const content = '```mermaid\ngantt\n  title timeline\n  section A\n  phase :a1, 0, 5\n```\n'

function previewArea(id: string) {
  return document.querySelector(`[data-ms-fit-probe="${id}"] .mermaid-preview-area`) as HTMLElement | null
}

function measure(id: string) {
  const el = previewArea(id)
  if (!el)
    return null
  const svg = el.querySelector('svg')
  const root = el.closest('.markstream-vue')
  return {
    box: el.getBoundingClientRect().height,
    inlineHeight: el.style.height,
    computedMinHeight: getComputedStyle(el).minHeight,
    token: root ? getComputedStyle(root).getPropertyValue('--ms-size-diagram-min-height').trim() : '(no .markstream-vue ancestor)',
    diagram: svg ? svg.getBoundingClientRect().height : null,
  }
}

function waitForPreview(id: string, timeoutMs = 15_000) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now()
    const tick = () => {
      if (previewArea(id)?.querySelector('svg'))
        return resolve()
      if (Date.now() - startedAt > timeoutMs)
        return reject(new Error(`Timed out waiting for the preview of "${id}".`))
      setTimeout(tick, 50)
    }
    tick()
  })
}

// The preview area animates `height` (transition-[height]), so a measurement taken
// the moment the svg appears catches the box mid-flight. Wait until the box stops
// moving before asserting.
function waitForStableHeight(id: string, timeoutMs = 15_000) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now()
    let previous = -1
    let stableTicks = 0
    const tick = () => {
      const current = previewArea(id)?.getBoundingClientRect().height ?? -1
      stableTicks = current >= 0 && Math.abs(current - previous) < 0.5 ? stableTicks + 1 : 0
      previous = current
      if (stableTicks >= 6)
        return resolve()
      if (Date.now() - startedAt > timeoutMs)
        return reject(new Error(`Timed out waiting for a stable height on "${id}".`))
      setTimeout(tick, 50)
    }
    tick()
  })
}

;(window as any).__mermaidFitHeight = { measure, waitForPreview, waitForStableHeight }
</script>

<template>
  <div class="p-4">
    <!-- The real consumer path: MarkdownRender renders its own `.markstream-vue`
         root, so the library's `--ms-size-diagram-min-height` token is in scope. -->
    <div data-ms-fit-probe="markdown-render" style="width: 506px">
      <MarkdownRender
        :content="content"
        :mermaid-props="{ fitPreviewHeight: true, estimatedPreviewHeightPx: 500 }"
      />
    </div>
    <!-- Control on the same path with the flag off: the host reservation holds. -->
    <div data-ms-fit-probe="markdown-render-default" style="width: 506px">
      <MarkdownRender
        :content="content"
        :mermaid-props="{ estimatedPreviewHeightPx: 500 }"
      />
    </div>
    <!-- Contrast: the block mounted directly, with no `.markstream-vue` ancestor
         (the token is then undefined and the CSS floor does not apply). -->
    <div data-ms-fit-probe="bare-block" style="width: 506px">
      <MermaidBlockNode
        :node="node"
        :loading="false"
        :fit-preview-height="true"
        :estimated-preview-height-px="500"
      />
    </div>
  </div>
</template>
