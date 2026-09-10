/// <reference lib="webworker" />

import mermaid from 'mermaid'

declare const self: DedicatedWorkerGlobalScope

mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { htmlLabels: false } })

type Theme = 'light' | 'dark'

interface RequestMessage {
  id: string
  action: 'canParse' | 'findPrefix' | (string & {})
  payload: { code: string, theme: Theme }
}

type ResponseMessage
  = | { id: string, ok: true, result: any }
    | { id: string, ok: false, error: string }

function applyThemeTo(code: string, theme: Theme) {
  const themeValue = theme === 'dark' ? 'dark' : 'default'
  const themeConfig = `%%{init: {"theme": "${themeValue}"}}%%\n`
  const trimmed = code.trimStart()
  if (trimmed.startsWith('%%{'))
    return code
  return themeConfig + code
}

function findHeaderIndex(lines: string[]) {
  const headerRe = /^(?:graph|flowchart|flowchart\s+tb|flowchart\s+lr|sequenceDiagram|gantt|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|pie|quadrantChart|timeline|xychart(?:-beta)?)\b/
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line || line.startsWith('%%'))
      continue
    if (headerRe.test(line))
      return index
  }
  return -1
}

async function canParse(code: string, theme: Theme) {
  const themed = applyThemeTo(code, theme)
  const anyMermaid = mermaid as any
  if (typeof anyMermaid.parse === 'function') {
    await anyMermaid.parse(themed)
    return true
  }
  throw new Error('mermaid.parse not available in worker')
}

async function findLastRenderablePrefix(baseCode: string, theme: Theme) {
  const lines = baseCode.split('\n')
  const headerIndex = findHeaderIndex(lines)
  if (headerIndex === -1)
    return null

  const head = lines.slice(0, headerIndex + 1)
  await canParse(head.join('\n'), theme)

  let low = headerIndex + 1
  let high = lines.length
  let lastGood = headerIndex + 1
  let tries = 0
  const maxTries = 12

  while (low <= high && tries < maxTries) {
    const mid = Math.floor((low + high) / 2)
    const candidate = [...head, ...lines.slice(headerIndex + 1, mid)].join('\n')
    tries += 1
    try {
      await canParse(candidate, theme)
      lastGood = mid
      low = mid + 1
    }
    catch {
      high = mid - 1
    }
  }

  return [...head, ...lines.slice(headerIndex + 1, lastGood)].join('\n')
}

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const message = event.data
  const send = (response: ResponseMessage) => self.postMessage(response)

  try {
    if (message.action === 'canParse') {
      send({
        id: message.id,
        ok: true,
        result: await canParse(message.payload.code, message.payload.theme),
      })
      return
    }

    if (message.action === 'findPrefix') {
      send({
        id: message.id,
        ok: true,
        result: await findLastRenderablePrefix(message.payload.code, message.payload.theme),
      })
      return
    }

    send({ id: message.id, ok: false, error: 'Unknown action' })
  }
  catch (error: any) {
    send({ id: message.id, ok: false, error: error?.message ?? String(error) })
  }
}

export {}
