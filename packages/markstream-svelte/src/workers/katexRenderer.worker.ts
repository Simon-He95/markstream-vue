import katex from 'katex'
import 'katex/dist/contrib/mhchem'

interface MessageIn {
  type?: 'init' | 'render'
  id?: string
  content?: string
  displayMode?: boolean
  debug?: boolean
}

interface MessageOut {
  id: string
  html?: string
  error?: string
}

let debugWorker = false

;(globalThis as any).addEventListener('message', (event: MessageEvent<MessageIn>) => {
  const data = event.data || {}
  if (data.type === 'init') {
    debugWorker = !!data.debug
    return
  }

  const id = data.id ?? ''
  const content = data.content ?? ''
  const displayMode = data.displayMode ?? true

  try {
    if (debugWorker)
      console.debug('[markstream-svelte:katexRenderer.worker] render start', { id, displayMode, content })

    const html = katex.renderToString(content, {
      throwOnError: true,
      displayMode,
      output: 'html',
      strict: 'ignore',
    })

    const result: MessageOut & { content: string, displayMode: boolean } = {
      id,
      html,
      content,
      displayMode,
    }
    ;(globalThis as any).postMessage(result)
  }
  catch (error: any) {
    const result: MessageOut & { content: string, displayMode: boolean } = {
      id,
      error: String(error?.message ?? error),
      content,
      displayMode,
    }
    ;(globalThis as any).postMessage(result)
  }
})

;(globalThis as any).addEventListener('error', (event: ErrorEvent) => {
  try {
    ;(globalThis as any).postMessage({
      id: '__worker_uncaught__',
      error: String(event.message ?? event.error),
      content: '',
      displayMode: true,
    })
  }
  catch {
    // Ignore postMessage failures while surfacing uncaught worker errors.
  }
})
