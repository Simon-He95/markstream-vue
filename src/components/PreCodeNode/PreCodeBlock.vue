<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { CodeBlockNodeProps, CodeBlockOptions, CodeBlockTheme, CodeBlockThemeProp, CodeBlockThemes, PreCodeNodeProps } from '../../types/component-props'
import type { ResolvedPreCodeVisualOptions } from './preCodeVisual'
import { computed, inject, onBeforeUnmount, ref, useAttrs } from 'vue'
import { languageIconsRevision, languageMap, normalizeLanguageIdentifier } from '../../utils'
import { MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY } from '../../utils/languageIconContext'
import { resolveLanguageIcon } from '../../utils/resolveLanguageIcon'
import { isDiffCodeBlock, resolveCodeBlockHeader, resolveDiffInlineLayout } from '../CodeBlockNode/codeBlockHeader'
import CodeBlockShell from '../CodeBlockNode/CodeBlockShell.vue'
import PreCodeNode from './PreCodeNode.vue'
import { resolvePreCodeThemePalette } from './preCodeTheme'
import { resolvePreCodeVisualOptions } from './preCodeVisual'

interface PreCodeBlockProps extends PreCodeNodeProps {
  codeBlockOptions?: CodeBlockOptions
  clipboardWriter?: CodeBlockNodeProps['clipboardWriter']
  darkTheme?: CodeBlockTheme
  isDark?: boolean
  lightTheme?: CodeBlockTheme
  resolvedVisualOptions?: ResolvedPreCodeVisualOptions
  showCopyButton?: boolean
  showHeader?: boolean
  showToolbar?: boolean
  showTooltips?: boolean
  theme?: CodeBlockThemeProp
  themes?: CodeBlockThemes
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<PreCodeBlockProps>(), {
  isDark: false,
  showCopyButton: true,
  showHeader: true,
  showLineNumbers: true,
  showToolbar: true,
  showTooltips: true,
})

const emit = defineEmits<{
  (event: 'copy', code: string): void
}>()

const attrs = useAttrs()
const forwardedAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})
const preNodeRef = ref<InstanceType<typeof PreCodeNode> | null>(null)
const copyText = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | undefined
const appLanguageIconResolver = inject(MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY, undefined)

const showLineNumbers = computed(() => {
  return props.showLineNumbers ?? (props.codeBlockOptions?.disableLineNumbers !== true)
})
const isDiff = computed(() => isDiffCodeBlock(props.node))
const diffInline = computed(() => props.diffInline === true
  || (isDiff.value && resolveDiffInlineLayout((props.codeBlockOptions ?? {}) as unknown as Record<string, unknown>)))
const codeLanguage = computed(() => normalizeLanguageIdentifier(String(props.node?.language ?? '')))
const displayLanguage = computed(() => {
  const language = codeLanguage.value
  if (!language)
    return languageMap[''] || 'Plain Text'
  return languageMap[language] || language.charAt(0).toUpperCase() + language.slice(1)
})
const codeBlockHeader = computed(() => resolveCodeBlockHeader(
  String(props.node?.raw ?? ''),
  displayLanguage.value,
  isDiffCodeBlock(props.node),
))
const languageIcon = computed(() => {
  void languageIconsRevision.value
  return resolveLanguageIcon(codeLanguage.value, appLanguageIconResolver)
})
const visualOptions = computed(() => props.resolvedVisualOptions
  ?? resolvePreCodeVisualOptions(props.codeBlockOptions))
const themePalette = computed(() => resolvePreCodeThemePalette({
  darkTheme: props.darkTheme,
  isDark: props.isDark,
  lightTheme: props.lightTheme,
  theme: props.theme,
  themes: props.themes,
}))
const shellStyle = computed<CSSProperties>(() => ({
  '--markstream-code-fallback-bg': themePalette.value.background,
  '--markstream-code-fallback-fg': themePalette.value.foreground,
  ...(themePalette.value.builtin
    ? {
        '--markstream-code-theme-bg': themePalette.value.background,
        '--markstream-code-theme-fg': themePalette.value.foreground,
        '--markstream-code-theme-line-number': themePalette.value.lineNumber,
      }
    : {}),
  '--markstream-diff-added-line-fill': themePalette.value.diffAddedLine,
  '--markstream-diff-added-number-fill': themePalette.value.diffAddedNumber,
  '--markstream-diff-editor-bg': themePalette.value.background,
  '--markstream-diff-removed-line-fill': themePalette.value.diffRemovedLine,
  '--markstream-diff-removed-number-fill': themePalette.value.diffRemovedNumber,
  '--markstream-diff-shell-bg': themePalette.value.background,
  '--markstream-pre-resolved-theme-bg': themePalette.value.background,
  '--markstream-pre-resolved-theme-fg': themePalette.value.foreground,
  '--markstream-pre-resolved-theme-line-number': themePalette.value.lineNumber,
  'backgroundColor': themePalette.value.background,
  'color': themePalette.value.foreground,
}))
const preClass = computed(() => [
  'code-pre-fallback',
  attrs.class,
  { 'is-wrap': visualOptions.value.overflow === 'wrap' },
])
const preStyle = computed<CSSProperties>(() => {
  const visual = visualOptions.value
  const horizontalPadding = props.codeBlockOptions?.padding == null
    ? '1ch'
    : `${visual.padding}px`
  const reservedDiffHeight = isDiff.value
    && typeof props.reservedHeightPx === 'number'
    && Number.isFinite(props.reservedHeightPx)
    && props.reservedHeightPx > 0
    ? `${Math.ceil(props.reservedHeightPx)}px`
    : undefined

  return {
    '--markstream-code-font-family': visual.fontFamily,
    '--markstream-code-padding-x': horizontalPadding,
    '--markstream-code-padding-y': `${visual.padding}px`,
    '--markstream-code-padding-bottom': `${visual.paddingBottom}px`,
    '--markstream-code-scrollbar-gutter': `${visual.scrollbarGutter}px`,
    '--markstream-code-tab-size': String(visual.tabSize),
    ...(isDiff.value ? { '--markstream-pre-diff-line-height': `${visual.lineHeight}px` } : {}),
    '--markstream-pre-line-number-top': `${visual.padding}px`,
    '--markstream-pre-line-number-left': '0px',
    '--markstream-pre-line-number-padding-left': '2ch',
    '--markstream-pre-line-number-padding-right': '1ch',
    '--markstream-pre-line-number-separator-width': '2px',
    ...(themePalette.value.builtin
      ? {
          '--markstream-code-theme-bg': themePalette.value.background,
          '--markstream-code-theme-fg': themePalette.value.foreground,
          '--markstream-code-theme-line-number': themePalette.value.lineNumber,
        }
      : {}),
    '--markstream-diff-added-line-fill': themePalette.value.diffAddedLine,
    '--markstream-diff-added-number-fill': themePalette.value.diffAddedNumber,
    '--markstream-diff-metadata-bg': themePalette.value.background,
    '--markstream-diff-metadata-fg': themePalette.value.lineNumber,
    '--markstream-diff-removed-line-fill': themePalette.value.diffRemovedLine,
    '--markstream-diff-removed-number-fill': themePalette.value.diffRemovedNumber,
    '--markstream-pre-resolved-theme-bg': themePalette.value.background,
    '--markstream-pre-resolved-theme-fg': themePalette.value.foreground,
    '--markstream-pre-resolved-theme-line-number': themePalette.value.lineNumber,
    '--markstream-pre-line-number-gap-to-code': horizontalPadding,
    '--markstream-diff-fallback-handoff-height': reservedDiffHeight ?? 'auto',
    'backgroundColor': 'var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--markstream-pre-resolved-theme-bg)))',
    'boxSizing': 'border-box',
    'color': 'var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--markstream-pre-resolved-theme-fg)))',
    'fontFamily': visual.fontFamily,
    'fontSize': `${visual.fontSize}px`,
    'lineHeight': `${visual.lineHeight}px`,
    'margin': '0',
    'maxHeight': `${visual.maxHeight}px`,
    'overflow': 'auto',
    'overflowX': visual.overflow === 'wrap' ? 'hidden' : 'auto',
    'overflowY': 'auto',
    'paddingBottom': `${visual.paddingBottom}px`,
    'paddingLeft': showLineNumbers.value
      ? 'var(--markstream-code-padding-left)'
      : horizontalPadding,
    'paddingRight': horizontalPadding,
    'paddingTop': `${visual.padding}px`,
    // stream-diffs removes the diff surface's scrollbar gutter in wrap mode;
    // do not reserve a native gutter in the fallback or its split panes start
    // several pixels earlier than the enhanced surface.
    'scrollbarGutter': isDiff.value ? 'auto' : 'stable',
    'tabSize': visual.tabSize,
    'whiteSpace': visual.overflow === 'scroll' ? 'pre' : 'pre-wrap',
    'overflowWrap': visual.overflow === 'wrap' ? 'anywhere' : 'normal',
    'wordBreak': 'normal',
    'width': '100%',
    ...(reservedDiffHeight
      ? {
          height: reservedDiffHeight,
          minHeight: reservedDiffHeight,
          maxHeight: reservedDiffHeight,
        }
      : {}),
  } as CSSProperties
})

function codeText() {
  return String(props.node?.code ?? '')
}

async function writeClipboardText(text: string) {
  if (props.clipboardWriter) {
    await props.clipboardWriter(text)
    return
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text)
    return
  }

  if (typeof document === 'undefined' || !document.body)
    throw new Error('Clipboard API is unavailable')

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    if (!document.execCommand('copy'))
      throw new Error('Clipboard copy command failed')
  }
  finally {
    textarea.remove()
  }
}

async function copyCode() {
  const code = codeText()
  try {
    await writeClipboardText(code)
    copyText.value = true
    emit('copy', code)
    if (copyResetTimer)
      clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(() => {
      copyText.value = false
      copyResetTimer = undefined
    }, 1000)
  }
  catch (error) {
    copyText.value = false
    console.error('[markstream-vue] Failed to copy preformatted code.', error)
  }
}

onBeforeUnmount(() => {
  if (copyResetTimer)
    clearTimeout(copyResetTimer)
})
</script>

<template>
  <div v-if="props.showToolbar" :style="shellStyle" class="code-block-container rounded-lg border">
    <CodeBlockShell
      :show-header="props.showHeader"
      :show-copy-button="props.showCopyButton"
      :show-collapse-button="false"
      :show-font-size-buttons="false"
      :show-expand-button="false"
      :show-preview-button="false"
      :show-tooltips="props.showTooltips"
      :copy-text="copyText"
      stream
      @copy="copyCode"
    >
      <template #header-left>
        <slot name="header-left">
          <div class="code-header-main">
            <span class="icon-slot h-4 w-4 flex-shrink-0" v-html="languageIcon" />
            <div class="code-header-copy">
              <div class="code-header-title">
                {{ codeBlockHeader.title }}
              </div>
              <div v-if="codeBlockHeader.caption" class="code-header-caption">
                {{ codeBlockHeader.caption }}
              </div>
            </div>
          </div>
        </slot>
      </template>
      <template v-if="$slots['header-right']" #header-right>
        <slot name="header-right" />
      </template>
      <PreCodeNode
        ref="preNodeRef"
        v-bind="forwardedAttrs"
        :class="preClass"
        :style="[attrs.style, preStyle]"
        :node="props.node"
        :loading="props.loading"
        :show-line-numbers="showLineNumbers"
        :diff-inline="diffInline"
        :diff-hide-unchanged-regions="props.diffHideUnchangedRegions"
        :reserved-height-px="props.reservedHeightPx"
        :data-markstream-code-theme="themePalette.name"
      />
    </CodeBlockShell>
  </div>
  <PreCodeNode
    v-else
    ref="preNodeRef"
    v-bind="forwardedAttrs"
    :class="preClass"
    :style="[attrs.style, preStyle]"
    :node="props.node"
    :loading="props.loading"
    :show-line-numbers="showLineNumbers"
    :diff-inline="diffInline"
    :diff-hide-unchanged-regions="props.diffHideUnchangedRegions"
    :reserved-height-px="props.reservedHeightPx"
    :data-markstream-code-theme="themePalette.name"
  />
</template>

<style>
.markstream-vue pre.code-pre-fallback {
  margin: 0;
  box-sizing: border-box;
  width: 100%;
  border: 0;
  border-radius: 0;
  background: var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--markstream-pre-resolved-theme-bg, #fff)));
  color: var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--markstream-pre-resolved-theme-fg, var(--code-fg))));
  backface-visibility: visible;
  transform: none;
  -webkit-font-smoothing: auto;
  font-family: var(--markstream-code-font-family);
  font-size: var(--vscode-editor-font-size, 12px);
  font-weight: 400;
  line-height: var(--vscode-editor-line-height, 18px);
}

.markstream-vue pre.code-pre-fallback > code {
  font-family: inherit;
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
}

.markstream-vue pre.code-pre-fallback.is-wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.markstream-vue pre.code-pre-fallback.markstream-pre--diff-preview {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.markstream-vue pre.code-pre-fallback .markstream-pre__line-numbers,
.markstream-vue pre.code-pre-fallback .markstream-pre__logical-line::before {
  color: var(--markstream-code-theme-line-number, var(--markstream-pre-resolved-theme-line-number, var(--code-line-number)));
}
</style>
