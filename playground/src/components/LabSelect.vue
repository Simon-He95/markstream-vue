<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core'
import { computed, nextTick, ref, watch } from 'vue'

type LabSelectValue = string | number

interface LabSelectOption {
  value: LabSelectValue
  label: string
}

const props = withDefaults(defineProps<{
  modelValue: LabSelectValue
  label: string
  options: readonly LabSelectOption[]
  placeholder?: string
}>(), {
  placeholder: '请选择',
})

const emit = defineEmits<{
  'update:modelValue': [value: LabSelectValue]
}>()

const uid = `lab-select-${Math.random().toString(36).slice(2, 9)}`
const rootRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const listRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const activeIndex = ref(0)
const placement = ref<'top' | 'bottom'>('bottom')
const labelId = `${uid}-label`
const listId = `${uid}-list`

const selectedIndex = computed(() => props.options.findIndex(option => option.value === props.modelValue))
const selectedOption = computed(() => props.options[selectedIndex.value] ?? null)
const activeDescendantId = computed(() => `${uid}-option-${activeIndex.value}`)

function syncActiveIndex() {
  activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0
}

function updatePlacement() {
  const element = rootRef.value
  if (!element)
    return

  const rect = element.getBoundingClientRect()
  const estimatedHeight = Math.min(props.options.length * 50 + 18, 280)
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top

  placement.value = spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top'
}

function focusListbox() {
  nextTick(() => {
    updatePlacement()
    listRef.value?.focus()
  })
}

function openMenu() {
  if (isOpen.value || !props.options.length)
    return

  syncActiveIndex()
  isOpen.value = true
  focusListbox()
}

function closeMenu({ restoreFocus = false }: { restoreFocus?: boolean } = {}) {
  if (!isOpen.value)
    return

  isOpen.value = false

  if (restoreFocus) {
    nextTick(() => {
      triggerRef.value?.focus()
    })
  }
}

function toggleMenu() {
  if (isOpen.value)
    closeMenu()
  else
    openMenu()
}

function moveActive(step: number) {
  if (!props.options.length)
    return

  if (!isOpen.value) {
    openMenu()
    return
  }

  const next = activeIndex.value + step
  const lastIndex = props.options.length - 1

  if (next < 0)
    activeIndex.value = lastIndex
  else if (next > lastIndex)
    activeIndex.value = 0
  else
    activeIndex.value = next
}

function selectActiveOption() {
  const option = props.options[activeIndex.value]
  if (option)
    selectOption(option.value)
}

function selectOption(value: LabSelectValue) {
  emit('update:modelValue', value)
  closeMenu({ restoreFocus: true })
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openMenu()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    syncActiveIndex()
    moveActive(-1)
  }
}

function handleListKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveActive(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveActive(-1)
    return
  }

  if (event.key === 'Home') {
    event.preventDefault()
    activeIndex.value = 0
    return
  }

  if (event.key === 'End') {
    event.preventDefault()
    activeIndex.value = Math.max(props.options.length - 1, 0)
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectActiveOption()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu({ restoreFocus: true })
    return
  }

  if (event.key === 'Tab')
    closeMenu()
}

watch(() => props.modelValue, () => {
  if (!isOpen.value)
    syncActiveIndex()
})

watch(() => props.options, () => {
  syncActiveIndex()
}, { deep: true, immediate: true })

onClickOutside(rootRef, () => {
  closeMenu()
})

useEventListener(window, 'resize', () => {
  if (isOpen.value)
    updatePlacement()
})

useEventListener(window, 'scroll', () => {
  if (isOpen.value)
    updatePlacement()
}, { capture: true, passive: true })
</script>

<template>
  <div
    ref="rootRef"
    class="lab-select select-control"
    :class="{
      'lab-select--open': isOpen,
      'lab-select--top': placement === 'top',
    }"
  >
    <span :id="labelId" class="lab-select__label">{{ label }}</span>

    <button
      ref="triggerRef"
      type="button"
      class="lab-select__trigger"
      :aria-expanded="isOpen"
      aria-haspopup="listbox"
      :aria-labelledby="labelId"
      @click="toggleMenu"
      @keydown="handleTriggerKeydown"
    >
      <span class="lab-select__value">
        {{ selectedOption?.label ?? placeholder }}
      </span>
      <span class="lab-select__chevron" aria-hidden="true" />
    </button>

    <transition name="lab-select-menu">
      <div
        v-if="isOpen"
        :id="listId"
        ref="listRef"
        class="lab-select__menu"
        role="listbox"
        tabindex="-1"
        :aria-activedescendant="activeDescendantId"
        :aria-labelledby="labelId"
        @keydown="handleListKeydown"
      >
        <div
          v-for="(option, index) in options"
          :id="`${uid}-option-${index}`"
          :key="option.value"
          class="lab-select__option"
          :class="{
            'lab-select__option--active': index === activeIndex,
            'lab-select__option--selected': option.value === modelValue,
          }"
          role="option"
          :aria-selected="option.value === modelValue"
          @click="selectOption(option.value)"
          @mouseenter="activeIndex = index"
        >
          <span class="lab-select__option-label">{{ option.label }}</span>
          <span
            v-if="option.value === modelValue"
            class="lab-select__option-indicator"
            aria-hidden="true"
          />
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.lab-select {
  position: relative;
}

.lab-select__label {
  color: var(--lab-muted);
  font-size: 0.84rem;
}

.lab-select__trigger {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 12px 14px 12px 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.92));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 10px 24px rgba(15, 23, 42, 0.06);
  color: var(--lab-text);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease,
    background 0.18s ease;
}

.lab-select__trigger:hover {
  border-color: rgba(13, 148, 136, 0.18);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.88),
    0 14px 28px rgba(15, 23, 42, 0.08);
}

.lab-select__trigger:focus-visible {
  outline: none;
  border-color: var(--lab-accent);
  box-shadow:
    0 0 0 3px var(--lab-accent-soft),
    0 16px 32px rgba(15, 23, 42, 0.1);
  transform: translateY(-1px);
}

.lab-select--open .lab-select__trigger {
  border-color: rgba(13, 148, 136, 0.24);
  box-shadow:
    0 0 0 3px var(--lab-accent-soft),
    0 18px 36px rgba(15, 23, 42, 0.12);
  transform: translateY(-1px);
}

.lab-select__value {
  min-width: 0;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lab-select__chevron {
  width: 10px;
  height: 10px;
  margin-right: 4px;
  border-right: 1.6px solid currentColor;
  border-bottom: 1.6px solid currentColor;
  color: var(--lab-muted);
  transform: rotate(45deg);
  transition: transform 0.18s ease, color 0.18s ease;
}

.lab-select--open .lab-select__chevron {
  color: var(--lab-accent);
  transform: rotate(-135deg) translate(-1px, -1px);
}

.lab-select__menu {
  position: absolute;
  left: 14px;
  right: 14px;
  top: calc(100% - 2px);
  z-index: 40;
  display: grid;
  gap: 6px;
  max-height: 280px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 18px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 24px 56px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(20px) saturate(1.2);
  outline: none;
}

.lab-select--top .lab-select__menu {
  top: auto;
  bottom: calc(100% - 2px);
}

.lab-select__option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 12px;
  color: var(--lab-text);
  cursor: pointer;
  transition:
    background 0.14s ease,
    color 0.14s ease,
    transform 0.14s ease;
}

.lab-select__option--active {
  background: rgba(15, 23, 42, 0.04);
  transform: translateY(-1px);
}

.lab-select__option--selected {
  background: var(--lab-accent-soft);
  color: var(--lab-accent);
}

.lab-select__option-label {
  min-width: 0;
  font-size: 0.94rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.lab-select__option-indicator {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 14%, transparent);
}

.lab-select-menu-enter-active,
.lab-select-menu-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.lab-select-menu-enter-from,
.lab-select-menu-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.lab-select--top .lab-select-menu-enter-from,
.lab-select--top .lab-select-menu-leave-to {
  transform: translateY(-6px);
}
</style>

<!-- Dark overrides live outside the scoped block: the ancestor .test-lab--dark
     sits above this component, and scoped `:global()` selectors get dropped. -->
<style>
.test-lab--dark .lab-select__trigger {
  border-color: rgba(148, 163, 184, 0.16);
  background:
    linear-gradient(180deg, rgba(16, 24, 34, 0.94), rgba(13, 20, 28, 0.82));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 12px 28px rgba(2, 6, 23, 0.26);
}

.test-lab--dark .lab-select__trigger:hover {
  border-color: rgba(45, 212, 191, 0.3);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 16px 32px rgba(2, 6, 23, 0.3);
}

.test-lab--dark .lab-select--open .lab-select__trigger,
.test-lab--dark .lab-select__trigger:focus-visible {
  border-color: rgba(45, 212, 191, 0.36);
  box-shadow:
    0 0 0 3px rgba(45, 212, 191, 0.16),
    0 18px 36px rgba(2, 6, 23, 0.34);
}

.test-lab--dark .lab-select__menu {
  border-color: rgba(148, 163, 184, 0.12);
  background: rgba(13, 20, 28, 0.94);
  box-shadow: 0 28px 64px rgba(2, 6, 23, 0.44);
}

.test-lab--dark .lab-select__option--active {
  background: rgba(148, 163, 184, 0.08);
}

.test-lab--dark .lab-select__option--selected {
  background: rgba(45, 212, 191, 0.14);
  color: #5eead4;
}
</style>
