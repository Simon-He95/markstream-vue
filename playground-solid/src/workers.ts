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
  highlighterOptions: {
    // A `{ dark, light }` pair keeps the value distinct from the single theme
    // name CodeBlockNode syncs, so @pierre/diffs re-sends the resolved theme
    // set to its workers instead of short-circuiting and leaving them without
    // one (`Theme "pierre-dark" has not been resolved`).
    theme: { dark: 'vitesse-dark', light: 'vitesse-light' },
  },
}))
