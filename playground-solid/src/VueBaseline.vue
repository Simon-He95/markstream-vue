<script lang="ts">
import { getStreamDiffsWorkerPool } from 'markstream-solid'
import MarkdownRender, { setInfographicLoader, setKaTeXWorker, setMermaidWorker, setStreamDiffsWorkerPool } from '../../src/exports'
import KatexWorker from '../../src/workers/katexRenderer.worker?worker'
import MermaidWorker from '../../src/workers/mermaidParser.worker?worker'
import '../../src/index.css'
</script>

<script setup lang="ts">
defineOptions({ inheritAttrs: false })
setInfographicLoader(() => import('@antv/infographic'))
setKaTeXWorker(new KatexWorker({ name: 'markstream-vue-katex' }))
setMermaidWorker(new MermaidWorker({ name: 'markstream-vue-mermaid' }))
setStreamDiffsWorkerPool(getStreamDiffsWorkerPool())
</script>

<template>
  <MarkdownRender v-bind="$attrs" />
</template>
