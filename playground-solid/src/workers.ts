import { getOrCreateWorkerPoolSingleton } from '@pierre/diffs/worker'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { setKaTeXWorker, setMermaidWorker, setStreamDiffsWorkerPool } from 'markstream-solid'
import KatexWorker from '../../packages/markstream-solid/src/workers/katexRenderer.worker?worker'
import MermaidWorker from '../../packages/markstream-solid/src/workers/mermaidParser.worker?worker'

setKaTeXWorker(new KatexWorker({ name: 'markstream-solid-katex' }))
setMermaidWorker(new MermaidWorker({ name: 'markstream-solid-mermaid' }))
setStreamDiffsWorkerPool(getOrCreateWorkerPoolSingleton({
  poolOptions: {
    poolSize: Math.min(4, navigator.hardwareConcurrency || 4),
    workerFactory: () => new DiffsWorker({ name: 'markstream-highlight' }),
  },
  highlighterOptions: { theme: 'vitesse-dark' },
}))
