// Keep this function self-contained: CDN workers embed its source.
export function applyMermaidThemeDirective(code: string, directive: string): string {
  const frontmatter = code.match(/^---[^\S\r\n]*(?:\r\n?|\n)[\s\S]*?(?:\r\n?|\n)---[^\S\r\n]*(?:\r\n?|\n)/)?.[0] ?? ''
  const diagram = code.slice(frontmatter.length)
  if (diagram.trimStart().startsWith('%%{'))
    return code
  return frontmatter + directive + diagram
}
