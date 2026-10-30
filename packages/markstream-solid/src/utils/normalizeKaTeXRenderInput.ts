export function normalizeKaTeXRenderInput(content: string) {
  if (!content)
    return ''

  return content
    .replace(/·/g, '⋅')
    .replace(/℃/g, '°C')
}
