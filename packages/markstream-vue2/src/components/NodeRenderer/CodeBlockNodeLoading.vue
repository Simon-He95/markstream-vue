<script setup lang="ts">
import { computed } from 'vue-demi'
import { getLanguageIcon, languageMap, normalizeLanguageIdentifier } from '../../utils'
import PreCodeNode from '../PreCodeNode'

const props = defineProps({
  node: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  loading: { type: Boolean, default: true },
  minWidth: { type: [String, Number], default: undefined },
  maxWidth: { type: [String, Number], default: undefined },
  showHeader: { type: Boolean, default: true },
  estimatedHeightPx: { type: Number, default: undefined },
  estimatedContentHeightPx: { type: Number, default: undefined },
  estimatedDiffInline: { type: Boolean, default: undefined },
})

const language = computed(() => normalizeLanguageIdentifier(String((props.node as any)?.language ?? '')))
const displayLanguage = computed(() => languageMap[language.value]
  || (language.value
    ? language.value.charAt(0).toUpperCase() + language.value.slice(1)
    : languageMap['']))
const languageIcon = computed(() => getLanguageIcon(language.value))
const defaultCodeFontFamily = '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace'

const metrics = computed(() => {
  // Fixed default metrics; the monacoOptions prop was removed in 2.0.0.
  const fontSize = 12
  const lineHeight = 18
  const paddingTop = 8
  const paddingBottom = 8
  const tabSize = 4
  const fontFamily = defaultCodeFontFamily
  return { fontSize, lineHeight, paddingTop, paddingBottom, tabSize, fontFamily }
})

function formatSize(value: string | number | undefined) {
  if (value == null)
    return undefined
  return typeof value === 'number' ? `${value}px` : String(value)
}

const containerStyle = computed(() => ({
  minWidth: formatSize(props.minWidth),
  maxWidth: formatSize(props.maxWidth),
  minHeight: formatSize(props.estimatedHeightPx),
}))
const preStyle = computed(() => ({
  'minHeight': formatSize(props.estimatedContentHeightPx),
  'fontSize': `${metrics.value.fontSize}px`,
  'lineHeight': `${metrics.value.lineHeight}px`,
  'paddingTop': `${metrics.value.paddingTop}px`,
  'paddingBottom': `${metrics.value.paddingBottom}px`,
  'tabSize': metrics.value.tabSize,
  '--markstream-pre-line-number-top': `${metrics.value.paddingTop}px`,
  ...(metrics.value.fontFamily
    ? { '--markstream-code-font-family': metrics.value.fontFamily }
    : {}),
}))
</script>

<template>
  <div
    class="code-block-loading"
    :class="{ 'is-dark': props.isDark }"
    :style="containerStyle"
    data-markstream-code-block="1"
    data-markstream-code-loading="1"
  >
    <div v-if="props.showHeader" class="code-block-header code-block-loading__header">
      <div class="code-header-main">
        <span class="icon-slot code-block-loading__icon" aria-hidden="true" v-html="languageIcon" />
        <div class="code-header-copy">
          <div class="code-header-title">
            {{ displayLanguage }}
          </div>
        </div>
      </div>
      <div class="code-header-actions code-block-loading__actions" aria-hidden="true">
        <span v-for="index in 6" :key="index" />
      </div>
    </div>
    <PreCodeNode
      class="code-pre-fallback code-block-loading-pre"
      :node="props.node"
      :show-line-numbers="true"
      :style="preStyle"
      data-markstream-code-loading="1"
    />
  </div>
</template>

<style scoped>
.code-block-loading {
  box-sizing: border-box;
  width: 100%;
  margin-block: 1rem;
  overflow: hidden;
  border: 1px solid rgb(229 231 235);
  border-radius: 0.5rem;
  color: #111827;
  background: #ffffff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}

.code-block-loading.is-dark {
  border-color: rgb(55 65 81 / 0.3);
  color: #e5e7eb;
  background: #111827;
}

.code-block-loading__header {
  box-sizing: content-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ms-gap-header, 1rem);
  min-height: 1.75rem;
  padding: var(--ms-inset-panel-y, 0.375rem) var(--ms-inset-panel-x, 0.625rem);
  border-bottom: 1px solid var(--code-border, rgb(229 231 235));
  background: var(--code-header-bg, inherit);
  color: var(--code-fg, inherit);
  font-family: var(--ms-font-sans, ui-sans-serif, system-ui, sans-serif);
  line-height: 1.75;
}

.code-header-main {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--ms-gap-header-main, 0.625rem);
  overflow: hidden;
}

.code-header-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.code-header-title {
  overflow: hidden;
  color: var(--code-action-fg, hsl(0 0% 43%));
  font-family: inherit;
  font-size: var(--ms-text-label, 0.75rem);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ms-gap-header-actions, 0.125rem);
  margin-left: auto;
}

.code-block-loading__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  flex: 0 0 16px;
  align-items: center;
  justify-content: center;
}

.code-block-loading__icon ::v-deep svg,
.code-block-loading__icon ::v-deep img {
  display: block;
  width: 100%;
  height: 100%;
}

.code-block-loading__actions {
  visibility: hidden;
}

.code-block-loading__actions > span {
  width: 26px;
  height: 26px;
  display: block;
  flex: 0 0 26px;
}

.code-block-loading > pre.code-block-loading-pre {
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding-left: var(--markstream-code-padding-left, 52px);
  color: inherit;
  background: inherit;
  font-family: var(
    --markstream-code-font-family,
    "SF Mono",
    Monaco,
    Consolas,
    "Ubuntu Mono",
    "Liberation Mono",
    "Courier New",
    monospace
  );
  font-weight: 400;
}
</style>
