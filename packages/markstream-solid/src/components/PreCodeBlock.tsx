import type { JSX } from 'solid-js'
import type { SolidCodeBlockNodeProps } from './CodeBlockNode'
import { createMemo, createSignal, mergeProps, onCleanup, Show, useContext } from 'solid-js'
import { MarkstreamConfigContext } from '../configuration'
import { useSafeI18n } from '../i18n/useSafeI18n'
import { copyTextToClipboard } from '../utils/clipboard'
import { languageIconsRevision, languageMap, normalizeLanguageIdentifier } from '../utils/languageIcon'
import { resolveLanguageIcon } from '../utils/resolveLanguageIcon'
import { isDiffCodeBlock, resolveCodeBlockHeader, resolveDiffHideUnchangedRegionsOption } from './codeBlockHeader'
import { PreCodeNode } from './PreCodeNode'
import { resolvePreCodeThemePalette } from './preCodeTheme'
import { ToolbarButton } from './ToolbarButton'

export function PreCodeBlock(input: SolidCodeBlockNodeProps): JSX.Element {
  const props = mergeProps(() => ({ isDark: input.context?.isDark, showTooltips: input.context?.showTooltips, darkTheme: input.context?.codeBlockThemes?.darkTheme, lightTheme: input.context?.codeBlockThemes?.lightTheme, themes: input.context?.codeBlockThemes?.themes, ...input.context?.codeBlockProps, codeBlockOptions: input.context?.codeBlockOptions }), input)
  const { t } = useSafeI18n()
  const configuration = useContext(MarkstreamConfigContext)
  const [copied, setCopied] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const language = createMemo(() => normalizeLanguageIdentifier(props.node.language))
  const header = createMemo(() => resolveCodeBlockHeader(props.node.raw, languageMap[language()] || language() || 'Plain Text', isDiffCodeBlock(props.node)))
  const icon = createMemo(() => {
    languageIconsRevision()
    return resolveLanguageIcon(language(), configuration().languageIconResolver)
  })
  const palette = createMemo(() => resolvePreCodeThemePalette(props))
  async function copy() {
    try {
      if (props.clipboardWriter)
        await props.clipboardWriter(props.node.code)
      else if (!await copyTextToClipboard(props.node.code))
        return
      if (disposed)
        return
      setCopied(true)
      props.onCopy?.(props.node.code)
      props.context?.events.onCopy?.(props.node.code)
      clearTimeout(timer)
      timer = setTimeout(() => setCopied(false), 1000)
    }
    catch { }
  }
  onCleanup(() => {
    disposed = true
    clearTimeout(timer)
  })
  return (
    <div class="code-block-container code-block-pre" classList={{ 'markstream-solid': !props.context, 'dark': !!props.isDark }} style={{ '--markstream-code-fallback-bg': palette().background, '--markstream-code-fallback-fg': palette().foreground, '--code-line-number': palette().lineNumber, '--markstream-diff-added-bg': palette().diffAddedLine, '--markstream-diff-removed-bg': palette().diffRemovedLine }}>
      <Show when={props.showHeader !== false}>
        <div class="code-block-header">
          <div class="code-block-title">
            <span class="code-language-icon" innerHTML={icon()} />
            <span>
              {header().title}
              <Show when={header().caption}><small>{header().caption}</small></Show>
            </span>
          </div>
          <Show when={props.showCopyButton !== false}><ToolbarButton label={t(copied() ? 'common.copied' : 'common.copy')} onClick={() => void copy()} showTooltips={props.showTooltips} isDark={props.isDark}>{copied() ? '✓' : 'Copy'}</ToolbarButton></Show>
        </div>
      </Show>
      <PreCodeNode context={props.context} node={props.node} loading={props.loading} showLineNumbers={props.showLineNumbers ?? props.codeBlockOptions?.disableLineNumbers !== true} diffInline={props.codeBlockOptions?.diffStyle === 'unified'} diffHideUnchangedRegions={resolveDiffHideUnchangedRegionsOption(props.codeBlockOptions)} codeBlockOptions={props.codeBlockOptions} />
    </div>
  )
}
