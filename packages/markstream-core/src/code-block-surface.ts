function buildStreamDiffsOverflowCSS(overflow: 'scroll' | 'wrap') {
  const whiteSpace = overflow === 'wrap' ? 'pre-wrap' : 'pre'
  const overflowWrap = overflow === 'wrap' ? 'anywhere' : 'normal'
  return `
[data-file] [data-line],
[data-diff] [data-line] {
  white-space: ${whiteSpace} !important;
  overflow-wrap: ${overflowWrap} !important;
  word-break: normal !important;
}`
}

function buildStreamDiffsMetadataCSS() {
  return `
[data-no-newline],
[data-gutter-buffer="metadata"] {
  --diffs-computed-decoration-bg: var(--markstream-diff-metadata-bg) !important;
  --diffs-computed-diff-line-bg: var(--markstream-diff-metadata-bg) !important;
  --diffs-computed-selected-line-bg: var(--markstream-diff-metadata-bg) !important;
  --diffs-line-bg: var(--markstream-diff-metadata-bg) !important;
  color: var(--markstream-diff-metadata-fg) !important;
  background-color: var(--markstream-diff-metadata-bg) !important;
}`
}

export function buildStreamDiffsSurfaceCSS(overflow: 'scroll' | 'wrap', unsafeCSS = '') {
  return `[data-file], [data-diff] { --diffs-min-number-column-width-default: 2ch !important; }
${buildStreamDiffsOverflowCSS(overflow)}
${buildStreamDiffsMetadataCSS()}
${unsafeCSS}`.trim()
}
