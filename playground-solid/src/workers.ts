import { preloadCodeBlockRuntime, setKaTeXWorker, setMermaidWorker } from 'markstream-solid'
import KatexWorker from 'markstream-solid/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from 'markstream-solid/workers/mermaidParser.worker?worker&inline'

let katexWorker: Worker | null = null
let mermaidWorker: Worker | null = null
let injected = false

export function ensurePlaygroundWorkers() {
  if (typeof window === 'undefined' || typeof Worker === 'undefined')
    return
  if (injected)
    return

  katexWorker = new KatexWorker()
  mermaidWorker = new MermaidWorker()
  setKaTeXWorker(katexWorker)
  setMermaidWorker(mermaidWorker)
  injected = true
}

export function preloadPlaygroundCodeRuntime() {
  if (typeof window === 'undefined')
    return
  void preloadCodeBlockRuntime()
}

export function playgroundWorkersInjected() {
  return injected
}
