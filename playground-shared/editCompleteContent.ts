/**
 * Extract the finalized code from a stream-diffs `onEditComplete` event.
 * File events expose `file.contents`; diff events expose `newFile.contents`.
 */
export function readEditCompleteContent(event: unknown): string {
  const value = event as {
    file?: { contents?: unknown }
    newFile?: { contents?: unknown }
    fileDiff?: { additionLines?: unknown }
  } | undefined
  if (typeof value?.file?.contents === 'string')
    return value.file.contents
  if (typeof value?.newFile?.contents === 'string')
    return value.newFile.contents
  if (Array.isArray(value?.fileDiff?.additionLines))
    return value.fileDiff.additionLines.join('\n')
  return ''
}
