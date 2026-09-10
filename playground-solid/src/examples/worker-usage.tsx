import { setKaTeXWorker, setMermaidWorker } from 'markstream-solid'

/** Typecheckable worker injection. The Vite `?worker` import lives in the app owner (`src/workers.ts`). */
export function configureMarkstreamWorkers(katexWorker: Worker, mermaidWorker: Worker) {
  setKaTeXWorker(katexWorker)
  setMermaidWorker(mermaidWorker)
}
