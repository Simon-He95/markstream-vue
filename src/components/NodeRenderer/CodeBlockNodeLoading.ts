import type { CodeBlockNodeProps } from '../../types/component-props'
import { buildDiffPreviewPanes, createDiffMatchCache, isDiffCodeBlock, resolveCodeBlockHeader, resolveDiffHideUnchangedRegionsOption, resolvePreCodeThemePalette, resolvePreCodeVisualOptions } from 'markstream-core'
import { defineComponent, h } from 'vue'
import { getLanguageIcon, languageMap, normalizeLanguageIdentifier } from '../../utils/languageIcon'
import PreCodeNode from '../PreCodeNode'
import './codeBlockNodeLoading.css'

type CodeBlockFallbackProps = CodeBlockNodeProps & Record<string, unknown>

export default defineComponent({
  name: 'CodeBlockNodeLoadingShell',
  inheritAttrs: false,
  props: [
    'node',
    'isDark',
    'loading',
    'stream',
    'codeBlockOptions',
    'showLineNumbers',
    'theme',
    'darkTheme',
    'lightTheme',
    'isShowPreview',
    'showHeader',
    'showCopyButton',
    'showExpandButton',
    'showPreviewButton',
    'showCollapseButton',
    'showFontSizeButtons',
    'enableFontSizeControl',
    'minWidth',
    'maxWidth',
    'themes',
    'showTooltips',
    'htmlPreviewAllowScripts',
    'htmlPreviewSandbox',
    'customId',
    'indexKey',
    'estimatedHeightPx',
    'estimatedContentHeightPx',
    'estimatedDiffInline',
    'diffInline',
    'diffHideUnchangedRegions',
    'reservedHeightPx',
  ],
  emits: ['click', 'mouseover', 'mouseout', 'copy', 'previewCode', 'handleArtifactClick'],
  setup(rawProps, { attrs }) {
    const props = rawProps as CodeBlockFallbackProps
    const loadingDiffMatchCache = createDiffMatchCache()
    return () => {
      const options = props.codeBlockOptions ?? {}
      const visual = resolvePreCodeVisualOptions(options)
      const palette = resolvePreCodeThemePalette({
        darkTheme: props.darkTheme,
        isDark: props.isDark,
        lightTheme: props.lightTheme,
        theme: props.theme,
        themes: props.themes,
      })
      const language = normalizeLanguageIdentifier(String(props.node?.language ?? ''))
      const isDiff = isDiffCodeBlock(props.node)
      const header = resolveCodeBlockHeader(
        String(props.node?.raw ?? ''),
        languageMap[language] || (language === 'typescript'
          ? 'TypeScript'
          : language ? language.charAt(0).toUpperCase() + language.slice(1) : languageMap['']),
        isDiff,
      )
      const diffLines = isDiff
        ? buildDiffPreviewPanes({
            originalCode: props.node?.originalCode,
            updatedCode: props.node?.updatedCode,
            loading: true,
            matchCache: loadingDiffMatchCache,
          }).flatMap(pane => pane.lines)
        : []
      const stats = isDiff
        ? {
            removed: diffLines.filter(line => line.kind === 'removed').length,
            added: diffLines.filter(line => line.kind === 'added').length,
          }
        : null
      const reservedHeight = Number(props.estimatedContentHeightPx ?? props.reservedHeightPx)
      const estimated = !isDiff && Number.isFinite(reservedHeight) && reservedHeight > 0
        ? Math.min(visual.maxHeight, Math.ceil(reservedHeight))
        : undefined
      const action = (kind: string) => h('button', {
        'class': `code-action-btn code-loading-action code-loading-action--${kind} inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded leading-none shrink-0`,
        'aria-hidden': 'true',
        'disabled': true,
        'tabindex': -1,
        'type': 'button',
      })
      const showMore = props.showExpandButton !== false
        || (props.showPreviewButton !== false && props.isShowPreview !== false && (language === 'html' || language === 'svg'))
        || (props.showFontSizeButtons !== false && props.enableFontSizeControl !== false)
      const formatSize = (value: unknown) => value == null
        ? undefined
        : typeof value === 'number' ? `${value}px` : String(value)
      const themeVariables = {
        '--code-bg': palette.background,
        '--code-fg': palette.foreground,
        '--code-line-number': palette.lineNumber,
        '--markstream-code-fallback-bg': palette.background,
        '--markstream-code-fallback-fg': palette.foreground,
        '--markstream-diff-added-line-fill': palette.diffAddedLine,
        '--markstream-diff-added-number-fill': palette.diffAddedNumber,
        '--markstream-diff-editor-bg': palette.background,
        '--markstream-diff-metadata-bg': palette.background,
        '--markstream-diff-metadata-fg': palette.lineNumber,
        '--markstream-diff-removed-line-fill': palette.diffRemovedLine,
        '--markstream-diff-removed-number-fill': palette.diffRemovedNumber,
        '--markstream-diff-shell-bg': palette.background,
        '--markstream-pre-resolved-theme-bg': palette.background,
        '--markstream-pre-resolved-theme-fg': palette.foreground,
        '--markstream-pre-resolved-theme-line-number': palette.lineNumber,
      }
      return h('div', {
        ...attrs,
        'class': ['code-block-container rounded-lg border', {
          'dark': props.isDark === true,
          'is-dark': palette.dark,
          'is-rendering': props.loading !== false,
          'is-diff': isDiff,
        }, attrs.class],
        'style': [{
          ...themeVariables,
          backgroundColor: palette.background,
          color: palette.foreground,
          minWidth: formatSize(props.minWidth),
          maxWidth: formatSize(props.maxWidth),
          ...(!isDiff ? { borderColor: 'var(--markstream-code-border-color, var(--code-border))' } : {}),
        }, attrs.style],
        'data-markstream-code-block': '1',
        'data-markstream-enhanced': 'false',
        'data-markstream-code-block-state': props.loading ? 'streaming' : 'settled',
        'data-markstream-code-loading': '1',
      }, [
        props.showHeader === false
          ? null
          : h('div', {
              class: 'code-block-header flex justify-between items-center border-b px-[var(--ms-inset-panel-x)] py-[var(--ms-inset-panel-y)] border-[var(--code-border)] bg-[var(--code-header-bg)] text-[var(--code-fg)]',
            }, [
              h('div', { class: 'code-header-main' }, [
                h('span', {
                  'class': 'icon-slot h-4 w-4 flex-shrink-0',
                  'aria-hidden': 'true',
                  'innerHTML': getLanguageIcon(language),
                }),
                h('div', { class: 'code-header-copy' }, [
                  h('div', { class: 'code-header-title' }, header.title),
                  header.caption ? h('div', { class: 'code-header-caption' }, header.caption) : null,
                ]),
              ]),
              h('div', { class: 'flex items-center gap-0.5' }, [
                stats
                  ? h('div', { 'class': 'code-diff-stats', 'aria-label': `-${stats.removed} +${stats.added}` }, [
                      h('span', { class: 'code-diff-stat removed' }, `-${stats.removed}`),
                      h('span', { class: 'code-diff-stat added' }, `+${stats.added}`),
                    ])
                  : null,
                props.showCopyButton === false ? null : action('copy'),
                props.showCollapseButton === false ? null : action('collapse'),
                showMore ? h('div', { class: 'relative' }, [action('more')]) : null,
              ]),
            ]),
        h('div', {
          class: 'code-block-shell-content',
          style: props.stream !== false || props.loading === false ? undefined : { display: 'none' },
        }, [h(PreCodeNode, {
          'node': props.node,
          'loading': props.loading,
          'showLineNumbers': props.showLineNumbers ?? options.disableLineNumbers !== true,
          'diffInline': isDiff && Boolean(props.diffInline ?? props.estimatedDiffInline ?? options.diffStyle === 'unified'),
          'diffHideUnchangedRegions': isDiff
            ? props.diffHideUnchangedRegions ?? resolveDiffHideUnchangedRegionsOption(options)
            : undefined,
          'reservedHeightPx': estimated,
          'class': ['code-pre-fallback', { 'is-wrap': visual.overflow === 'wrap' }],
          'style': {
            ...themeVariables,
            '--markstream-code-padding-x': `${visual.padding}px`,
            '--markstream-code-padding-y': `${visual.padding}px`,
            '--markstream-code-tab-size': visual.tabSize,
            '--markstream-pre-diff-line-height': `${visual.lineHeight}px`,
            'backgroundColor': palette.background,
            'color': palette.foreground,
            'fontFamily': visual.fontFamily,
            'fontSize': `${visual.fontSize}px`,
            'lineHeight': `${visual.lineHeight}px`,
            'maxHeight': `${estimated ?? visual.maxHeight}px`,
            'overflow': 'auto',
            'paddingTop': `${visual.padding}px`,
            'paddingBottom': `${visual.paddingBottom}px`,
            'tabSize': visual.tabSize,
            'whiteSpace': visual.overflow === 'wrap' ? 'pre-wrap' : 'pre',
            'overflowWrap': visual.overflow === 'wrap' ? 'anywhere' : 'normal',
          },
          'data-markstream-code-loading': '1',
        })]),
        h('div', {
          class: 'code-loading-placeholder',
          style: props.stream === false && props.loading !== false ? undefined : { display: 'none' },
        }, [h('div', { class: 'loading-skeleton' }, [
          h('div', { class: 'skeleton-line' }),
          h('div', { class: 'skeleton-line' }),
          h('div', { class: 'skeleton-line short' }),
        ])]),
      ])
    }
  },
})
