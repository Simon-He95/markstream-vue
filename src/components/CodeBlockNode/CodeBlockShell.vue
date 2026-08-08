<script setup lang="ts">
/**
 * CodeBlockShell — shared header/buttons/skeleton/collapse wrapper
 * for all built-in code block renderers (stream-diffs, Shiki, Pre).
 *
 * This is a "dumb" template component. All state lives in the parent;
 * Shell receives it via props and communicates back via emits.
 */
import { computed, ref } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'

const props = withDefaults(defineProps<{
  // Header visibility
  showHeader?: boolean
  showCollapseButton?: boolean
  showFontSizeButtons?: boolean
  enableFontSizeControl?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
  showPreviewButton?: boolean
  showTooltips?: boolean
  // State (from parent)
  isDark?: boolean
  loading?: boolean
  stream?: boolean
  isCollapsed?: boolean
  isExpanded?: boolean
  copyText?: boolean
  isPreviewable?: boolean
  // Font size state
  codeFontSize?: number
  codeFontMin?: number
  codeFontMax?: number
  defaultCodeFontSize?: number
  fontBaselineReady?: boolean
  // Diff stats (optional, CodeBlockNode only)
  diffStats?: { added: number, removed: number } | null
  diffStatsAriaLabel?: string
}>(), {
  showHeader: true,
  showCollapseButton: true,
  showCopyButton: true,
  showExpandButton: true,
  showPreviewButton: true,
  showTooltips: true,
  isDark: false,
  loading: false,
  stream: false,
  isCollapsed: false,
  isExpanded: false,
  copyText: false,
  isPreviewable: false,
  enableFontSizeControl: true,
  showFontSizeButtons: true,
  fontBaselineReady: false,
})
const emit = defineEmits<{
  (e: 'toggleCollapse'): void
  (e: 'decreaseFont'): void
  (e: 'resetFont'): void
  (e: 'increaseFont'): void
  (e: 'copy'): void
  (e: 'toggleExpand'): void
  (e: 'preview'): void
}>()
const moreMenuOpen = ref(false)
const moreMenuRef = ref<HTMLElement | null>(null)
const moreBtnRef = ref<HTMLElement | null>(null)

function toggleMoreMenu() {
  hideTooltip(true)
  moreMenuOpen.value = !moreMenuOpen.value
  if (moreMenuOpen.value) {
    document.addEventListener('click', closeMoreMenuOutside, { once: true, capture: true })
  }
}

function closeMoreMenu() {
  hideTooltip(true)
  moreMenuOpen.value = false
}

function closeMoreMenuOutside(e: Event) {
  const target = e.target as Node
  if (moreMenuRef.value?.contains(target) || moreBtnRef.value?.contains(target)) {
    document.addEventListener('click', closeMoreMenuOutside, { once: true, capture: true })
  }
  else {
    closeMoreMenu()
  }
}

// Whether the overflow menu has any items to show
const hasOverflowItems = computed(() =>
  (props.showFontSizeButtons && props.enableFontSizeControl)
  || props.showExpandButton
  || (props.isPreviewable && props.showPreviewButton),
)

const { t } = useSafeI18n()
const tooltipsEnabled = computed(() => props.showTooltips !== false)

function onBtnHover(e: MouseEvent | FocusEvent, text: string) {
  if (!tooltipsEnabled.value)
    return
  showTooltipForAnchor(e.currentTarget as HTMLElement, text, 'top', false, undefined, props.isDark)
}

function onBtnLeave() {
  if (!tooltipsEnabled.value)
    return
  hideTooltip()
}

function onCopyHover(e: MouseEvent | FocusEvent) {
  onBtnHover(e, props.copyText ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))
}

const fontDecreaseDisabled = computed(() =>
  Number.isFinite(props.codeFontSize) ? (props.codeFontSize ?? 0) <= (props.codeFontMin ?? 0) : false,
)
const fontResetDisabled = computed(() =>
  !props.fontBaselineReady || props.codeFontSize === props.defaultCodeFontSize,
)
const fontIncreaseDisabled = computed(() =>
  Number.isFinite(props.codeFontSize) ? (props.codeFontSize ?? 0) >= (props.codeFontMax ?? 100) : false,
)
</script>

<template>
  <!-- Header -->
  <div
    v-if="props.showHeader"
    class="code-block-header flex justify-between items-center border-b px-[var(--ms-inset-panel-x)] py-[var(--ms-inset-panel-y)] border-[var(--code-border)] bg-[var(--code-header-bg)] text-[var(--code-fg)]"
  >
    <!-- left: language icon + title (provided by parent via slot) -->
    <slot name="header-left" />

    <!-- right: action buttons -->
    <slot name="header-right">
      <div class="flex items-center gap-0.5">
        <!-- Diff stats (optional) -->
        <div
          v-if="diffStats"
          class="code-diff-stats"
          :aria-label="diffStatsAriaLabel"
        >
          <span class="code-diff-stat removed">-{{ diffStats.removed }}</span>
          <span class="code-diff-stat added">+{{ diffStats.added }}</span>
        </div>

        <!-- Copy (primary action — always visible) -->
        <button
          v-if="props.showCopyButton"
          type="button"
          class="code-action-btn inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded leading-none shrink-0 cursor-pointer text-[var(--code-action-fg)] hover:bg-[var(--code-action-hover-bg)] hover:text-[var(--code-action-hover-fg)] active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          :aria-label="copyText ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')"
          @click="emit('copy')"
          @mouseenter="onCopyHover($event)"
          @focus="onCopyHover($event)"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg v-if="!copyText" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></g></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5" /></svg>
        </button>

        <!-- Collapse (structural — always visible) -->
        <button
          v-if="props.showCollapseButton"
          type="button"
          class="code-action-btn inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded leading-none shrink-0 cursor-pointer text-[var(--code-action-fg)] hover:bg-[var(--code-action-hover-bg)] hover:text-[var(--code-action-hover-fg)] active:scale-[0.96] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          :aria-pressed="isCollapsed"
          @click="emit('toggleCollapse')"
          @mouseenter="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
          @focus="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg :style="{ rotate: isCollapsed ? '0deg' : '90deg' }" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
        </button>

        <!-- More menu (overflow for secondary actions) -->
        <div v-if="hasOverflowItems" class="relative">
          <button
            ref="moreBtnRef"
            type="button"
            class="code-action-btn inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded leading-none shrink-0 cursor-pointer text-[var(--code-action-fg)] hover:bg-[var(--code-action-hover-bg)] hover:text-[var(--code-action-hover-fg)] active:scale-[0.96] transition-colors"
            :aria-expanded="moreMenuOpen"
            aria-haspopup="true"
            @click.stop="toggleMoreMenu"
            @mouseenter="onBtnHover($event, t('common.more') || 'More')"
            @focus="onBtnHover($event, t('common.more') || 'More')"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="currentColor"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></g></svg>
          </button>

          <Transition name="code-menu">
            <div v-if="moreMenuOpen" ref="moreMenuRef" class="code-more-menu min-w-[10rem] p-1 bg-[hsl(var(--ms-popover))] text-[hsl(var(--ms-popover-foreground))] border border-[var(--code-border)] shadow-[var(--ms-shadow-popover)]" role="menu">
              <!-- Font size controls -->
              <template v-if="props.showFontSizeButtons && props.enableFontSizeControl">
                <button type="button" role="menuitem" class="flex items-center gap-2 w-full py-1.5 px-2 rounded text-xs text-[var(--code-action-fg)] cursor-pointer whitespace-nowrap hover:bg-[var(--code-action-hover-bg)] hover:text-[var(--code-action-hover-fg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors" :disabled="fontDecreaseDisabled" @click="hideTooltip(true); emit('decreaseFont')">
                  <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" /></svg>
                  <span>{{ t('common.fontSmaller') || 'Font size −' }}</span>
                </button>
                <button type="button" role="menuitem" class="flex items-center gap-2 w-full py-1.5 px-2 rounded text-xs text-[var(--code-action-fg)] cursor-pointer whitespace-nowrap hover:bg-[var(--code-action-hover-bg)] hover:text-[var(--code-action-hover-fg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors" :disabled="fontResetDisabled" @click="hideTooltip(true); emit('resetFont')">
                  <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></g></svg>
                  <span>{{ t('common.fontReset') || 'Font size reset' }}</span>
                </button>
                <button type="button" role="menuitem" class="flex items-center gap-2 w-full py-1.5 px-2 rounded text-xs text-[var(--code-action-fg)] cursor-pointer whitespace-nowrap hover:bg-[var(--code-action-hover-bg)] hover:text-[var(--code-action-hover-fg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors" :disabled="fontIncreaseDisabled" @click="hideTooltip(true); emit('increaseFont')">
                  <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7-7v14" /></svg>
                  <span>{{ t('common.fontLarger') || 'Font size +' }}</span>
                </button>
              </template>

              <!-- Expand -->
              <button v-if="props.showExpandButton" type="button" role="menuitem" class="flex items-center gap-2 w-full py-1.5 px-2 rounded text-xs text-[var(--code-action-fg)] cursor-pointer whitespace-nowrap hover:bg-[var(--code-action-hover-bg)] hover:text-[var(--code-action-hover-fg)] transition-colors" @click="closeMoreMenu(); emit('toggleExpand')">
                <svg v-if="isExpanded" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" /></svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" /></svg>
                <span>{{ isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand') }}</span>
              </button>

              <!-- Preview -->
              <button v-if="isPreviewable && props.showPreviewButton" type="button" role="menuitem" class="flex items-center gap-2 w-full py-1.5 px-2 rounded text-xs text-[var(--code-action-fg)] cursor-pointer whitespace-nowrap hover:bg-[var(--code-action-hover-bg)] hover:text-[var(--code-action-hover-fg)] transition-colors" @click="closeMoreMenu(); emit('preview')">
                <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></g></svg>
                <span>{{ t('common.preview') || 'Preview' }}</span>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </slot>
  </div>

  <!-- Content: keep slot subtree mounted so stream-diffs/renderer state survives collapse. -->
  <div
    v-show="stream ? true : !loading"
    class="code-block-shell-content"
    :class="{ 'code-block-shell-content--collapsed': isCollapsed }"
  >
    <slot />
  </div>

  <!-- Loading skeleton -->
  <div v-show="!stream && loading" class="code-loading-placeholder">
    <slot name="loading">
      <div class="loading-skeleton">
        <div class="skeleton-line" />
        <div class="skeleton-line" />
        <div class="skeleton-line short" />
      </div>
    </slot>
  </div>

  <!-- Screen reader copy status -->
  <span class="sr-only" aria-live="polite" role="status">{{ copyText ? t('common.copied') || 'Copied' : '' }}</span>
</template>

<!--
  Shared styles for CodeBlockShell and its slot content.
  Non-scoped so they apply to parent-compiled slot content.
  All selectors rooted under .code-block-header to avoid global leaks.
-->
<style>
.action-icon {
  width: var(--ms-action-btn-icon, 0.875rem);
  height: var(--ms-action-btn-icon, 0.875rem);
  max-width: 1.25rem;
  max-height: 1.25rem;
}

/* ── Container base (shared by all code block variants) ── */
.code-block-container {
  margin: var(--ms-flow-codeblock-y) 0;
  contain: layout style;
  container-type: inline-size;
  background: var(--code-bg);
  border-color: var(--code-border);
  color: var(--code-fg);
  box-shadow: var(--ms-shadow-subtle);
}

/* ── Header layout ── */
.code-block-header {
  position: relative;
  z-index: 1;
  gap: var(--ms-gap-header);
  border-radius: var(--ms-radius) var(--ms-radius) 0 0;
  overflow: visible;
}

.code-block-header .code-header-main {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: var(--ms-gap-header-main);
  overflow: hidden;
}

.code-block-header .code-header-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.code-block-header .code-header-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ms-text-label);
  font-weight: 500;
  color: var(--code-action-fg);
}

.code-block-header .code-header-caption {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--code-line-number);
}

.code-block-header .code-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ms-gap-header-actions);
  flex-wrap: wrap;
}

/* ── Icon slot (shared by all code block variants) ── */
.code-block-header .icon-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.code-block-header .icon-slot svg,
.code-block-header .icon-slot img {
  display: block;
  width: 100%;
  height: 100%;
}

/* ── Diff stats ── */
.code-diff-stats {
  display: inline-flex;
  align-items: center;
  gap: var(--ms-space-1_5);
  margin-right: var(--ms-space-1);
  font-size: var(--ms-text-label);
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.code-diff-stat {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: var(--ms-radius);
  line-height: 1;
}

.code-diff-stat.removed {
  color: var(--diff-removed-fg);
  background: hsl(var(--ms-diff-removed) / 0.1);
}

.code-diff-stat.added {
  color: var(--diff-added-fg);
  background: hsl(var(--ms-diff-added) / 0.1);
}

/* ── Dropdown menu ── */
.code-more-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  z-index: 50;
  border-radius: var(--ms-radius);
}

/* ── Content / loading — clip to bottom border-radius ── */
.code-block-shell-content,
.code-loading-placeholder {
  overflow: hidden;
  border-radius: 0 0 var(--ms-radius) var(--ms-radius);
  contain: content;
}

.code-block-shell-content--collapsed {
  height: 0;
  min-height: 0;
  visibility: hidden;
  pointer-events: none;
}

/* ── Menu transition ── */
.code-menu-enter-active,
.code-menu-leave-active {
  transform-origin: top right;
}
.code-menu-enter-active {
  transition: opacity 220ms cubic-bezier(.16, 1, .3, 1),
              transform 220ms cubic-bezier(.16, 1, .3, 1);
}
.code-menu-leave-active {
  transition: opacity 140ms ease-in,
              transform 140ms ease-in;
}
.code-menu-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(-4px);
}
.code-menu-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-2px);
}
</style>
