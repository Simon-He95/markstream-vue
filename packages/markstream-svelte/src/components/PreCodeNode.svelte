<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { encodeDataPayload, getString, sanitizeClassToken } from './shared/node-helpers'

  type Props = {
    node: SvelteRenderableNode
    showLineNumbers?: boolean
    enhanceable?: boolean
    class?: string
    style?: string
  };
  let {
    node,
    showLineNumbers = false,
    enhanceable = true,
    class: className = undefined,
    style = undefined,
  }: Props = $props()

  let languageRaw = $derived(getString((node as any)?.language).trim())
  let language = $derived(sanitizeClassToken(languageRaw))
  let code = $derived(getString((node as any)?.code))
  let diff = $derived(Boolean((node as any)?.diff))
  let loading = $derived((node as any)?.loading === true)
  let displayCode = $derived(loading ? code : code.replace(/\r\n$|\n$|\r$/, ''))

  // Non-diff line numbers, aligned with the Vue 3 PreCodeNode.
  let showLineGutter = $derived(showLineNumbers === true && !diff)
  let lineCount = $derived(countCodeLines(displayCode))
  let lineNumbersText = $derived(buildLineNumbersText(lineCount))
  let lineNumberLayoutStyle = $derived(
    showLineGutter
      ? `--markstream-pre-line-number-width: ${Math.max(2, String(lineCount).length)}ch; --markstream-pre-diff-line-number-width: ${Math.max(2, String(lineCount).length)}ch; --markstream-code-padding-left: calc(var(--markstream-pre-line-number-padding-left, 2ch) + var(--markstream-pre-line-number-width, 2ch) + var(--markstream-pre-line-number-padding-right, 1ch) + var(--markstream-pre-line-number-separator-width, 2px) + var(--markstream-pre-line-number-gap-to-code, 1ch));`
      : '',
  )
  let mergedStyle = $derived([lineNumberLayoutStyle, style].filter(Boolean).join(' '))

  function countCodeLines(codeStr: string) {
    let count = 1
    for (let index = 0; index < codeStr.length; index++) {
      if (codeStr[index] === '\n') {
        count++
      }
      else if (codeStr[index] === '\r') {
        count++
        if (codeStr[index + 1] === '\n')
          index++
      }
    }
    return codeStr.length ? count : 1
  }

  function buildLineNumbersText(count: number) {
    let out = ''
    for (let line = 1; line <= count; line++)
      out += `${out ? '\n' : ''}${line}`
    return out
  }
</script>

{#if !(loading && !code.trim())}
  <pre
    data-markstream-code-block={enhanceable ? '1' : undefined}
    data-markstream-language={languageRaw || undefined}
    data-markstream-loading={loading ? '1' : undefined}
    data-markstream-diff={diff ? '1' : undefined}
    data-markstream-original={diff ? encodeDataPayload(getString((node as any)?.originalCode)) : undefined}
    data-markstream-updated={diff ? encodeDataPayload(getString((node as any)?.updatedCode)) : undefined}
    data-markstream-pre="1"
    data-markstream-line-numbers={showLineGutter ? '1' : undefined}
    aria-busy={loading ? 'true' : undefined}
    class:markstream-pre--line-numbers={showLineGutter}
    class={[language ? `language-${language}` : '', className].filter(Boolean).join(' ') || undefined}
    style={mergedStyle || undefined}
  >{#if showLineGutter}<span class="markstream-pre__line-numbers" aria-hidden="true"><span class="markstream-pre__line-numbers-text">{lineNumbersText}</span></span>{/if}<code class="markstream-pre__code" translate="no">{displayCode}</code></pre>
{/if}
