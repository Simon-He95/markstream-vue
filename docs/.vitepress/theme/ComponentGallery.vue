<script setup lang="ts">
import type { ComponentCategory } from './data/components'
import MarkdownRender from 'markstream-vue'
import { useData } from 'vitepress'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDark } from './composables/useDark'
import { componentCategories, componentsDocData } from './data/components'
import { needsCodeFallback, optionalMarkdownIt } from './optionalMarkdownIt'

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))
const isDark = useDark()

const activeCategory = ref<ComponentCategory | 'all'>('all')
const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return componentsDocData.filter((entry) => {
    if (activeCategory.value !== 'all' && entry.category !== activeCategory.value)
      return false
    if (!q)
      return true
    return (
      entry.name.toLowerCase().includes(q)
      || entry.slug.includes(q)
      || entry.description.toLowerCase().includes(q)
      || entry.descriptionZh.includes(query.value.trim())
      || entry.tags.some(tag => tag.toLowerCase().includes(q))
    )
  })
})

// Heavy previews mount lazily once they approach the viewport. Keyed by slug
// (not filtered-list index) so category/search filtering can never make an
// unseen card look visible or leave an observable card stuck on its skeleton.
const visibleHeavy = ref(new Set<string>())
let observer: IntersectionObserver | undefined

function isCardVisible(entry: { slug: string, heavy?: boolean }): boolean {
  if (!entry.heavy)
    return true
  return visibleHeavy.value.has(entry.slug)
}

function observeHeavyCards() {
  const root = document.querySelector('.ms-gallery')
  if (!root || !observer)
    return
  root.querySelectorAll<HTMLElement>('[data-lazy="true"]').forEach((el) => {
    const slug = el.dataset.slug
    // Skip cards already marked visible (unobserved after first intersection).
    if (slug && !visibleHeavy.value.has(slug))
      observer?.observe(el)
  })
}

onMounted(() => {
  if (typeof IntersectionObserver === 'undefined') {
    visibleHeavy.value = new Set(componentsDocData.map(entry => entry.slug))
    return
  }
  const root = document.querySelector('.ms-gallery')
  if (!root)
    return
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting)
          continue
        const slug = (entry.target as HTMLElement).dataset.slug
        if (slug) {
          visibleHeavy.value = new Set(visibleHeavy.value).add(slug)
          observer?.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '250px' },
  )
  observeHeavyCards()
})

// Filtering re-renders the grid with a different subset; make sure every
// heavy card currently in the DOM (including newly included ones) is observed.
watch([activeCategory, query], () => {
  nextTick(() => observeHeavyCards())
})

function detailLink(slug: string): string {
  return isZh.value ? `/zh/components/${slug}` : `/components/${slug}`
}

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = undefined
})
</script>

<template>
  <div class="ms-gallery">
    <div class="ms-gallery-controls">
      <div class="ms-gallery-chips" role="group" :aria-label="isZh ? '按分类过滤' : 'Filter by category'">
        <button
          type="button"
          class="ms-gallery-chip"
          :class="{ active: activeCategory === 'all' }"
          @click="activeCategory = 'all'"
        >
          {{ isZh ? '全部' : 'All' }}
          <span class="ms-gallery-chip-count">{{ componentsDocData.length }}</span>
        </button>
        <button
          v-for="category in componentCategories"
          :key="category.key"
          type="button"
          class="ms-gallery-chip"
          :class="{ active: activeCategory === category.key }"
          @click="activeCategory = category.key"
        >
          {{ isZh ? category.zh : category.en }}
          <span class="ms-gallery-chip-count">
            {{ componentsDocData.filter(entry => entry.category === category.key).length }}
          </span>
        </button>
      </div>
      <input
        v-model="query"
        type="search"
        class="ms-gallery-search"
        :placeholder="isZh ? '搜索组件名、描述或标签…' : 'Search components, descriptions, tags…'"
        :aria-label="isZh ? '搜索组件' : 'Search components'"
      >
    </div>

    <p v-if="filtered.length === 0" class="ms-gallery-empty">
      {{ isZh ? `没有匹配「${query}」的组件。` : `No components match “${query}”.` }}
    </p>

    <div class="ms-gallery-grid">
      <article
        v-for="entry in filtered"
        :key="entry.slug"
        class="ms-gallery-card"
        :data-slug="entry.slug"
        :data-lazy="entry.heavy ? 'true' : undefined"
      >
        <div class="ms-gallery-head">
          <a :href="detailLink(entry.slug)" class="ms-gallery-name" :title="entry.name">{{ entry.name }}</a>
          <div v-if="entry.tags.includes('opt-in') || entry.peers.length" class="ms-gallery-badges">
            <span
              v-if="entry.tags.includes('opt-in')"
              class="ms-gallery-optin"
              :title="isZh ? '需要额外配置才会触发（如 markdown-it 插件、loader 或渲染选项）' : 'Only triggers after extra setup (a markdown-it plugin, a loader, or a renderer option)'"
            >opt-in</span>
            <span v-for="peer in entry.peers" :key="peer" class="ms-gallery-peer" :title="`${isZh ? '渲染此组件需要安装对应的 peer 依赖' : 'Rendering this component requires the listed peer dependency'}: ${peer}`">
              {{ peer }}
            </span>
          </div>
        </div>
        <div class="ms-gallery-preview">
          <pre v-if="entry.mdSnippet && needsCodeFallback(entry.slug)" class="ms-gallery-codefallback"><code>{{ entry.mdSnippet }}</code></pre>
          <MarkdownRender
            v-else-if="entry.mdSnippet && isCardVisible(entry)"
            :key="entry.slug"
            :content="entry.mdSnippet"
            :custom-markdown-it="optionalMarkdownIt(entry.slug)"
            :is-dark="isDark"
            :fade="false"
          />
          <div v-else-if="entry.mdSnippet" class="ms-gallery-skeleton" aria-hidden="true" />
          <div v-else class="ms-gallery-api" aria-hidden="true">
            <code>{{ entry.name }}</code>
          </div>
        </div>
        <p class="ms-gallery-desc">
          {{ isZh ? entry.descriptionZh : entry.description }}
        </p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.ms-gallery {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.ms-gallery-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.ms-gallery-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.ms-gallery-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-weight: 500;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;
}

.ms-gallery-chip:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.ms-gallery-chip.active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.ms-gallery-chip-count {
  font-size: 0.7rem;
  opacity: 0.75;
}

.ms-gallery-search {
  flex: 1;
  min-width: 220px;
  max-width: 320px;
  font-size: 0.875rem;
  padding: 0.45rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  transition: border-color 0.2s;
}

.ms-gallery-search:focus {
  border-color: var(--vp-c-brand-1);
  outline: none;
}

.ms-gallery-empty {
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  margin: 0.5rem 0;
}

.ms-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 1rem;
}

.ms-gallery-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  background: var(--vp-c-bg);
  padding: 0.9rem 1rem 1rem;
  text-decoration: none;
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
}

.ms-gallery-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: var(--vp-shadow-2);
  transform: translateY(-2px);
}

.ms-gallery-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.5rem;
  margin-bottom: 0.6rem;
}

.ms-gallery-name {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: 0.9rem;
  font-weight: 650;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  text-decoration: none;
}

.ms-gallery-name:hover {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}

.ms-gallery-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  max-width: 100%;
}

.ms-gallery-peer {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  overflow-wrap: anywhere;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--vp-c-warning-1);
  border: 1px solid var(--vp-c-warning-soft);
  background: var(--vp-c-warning-soft);
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  white-space: normal;
}

.ms-gallery-optin {
  flex: 0 0 auto;
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-default-soft);
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  white-space: nowrap;
}

.ms-gallery-codefallback {
  margin: 0.4rem 0;
  padding: 0.6rem 0.7rem;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
  overflow: auto;
  font-size: 0.75rem;
  line-height: 1.5;
}

.ms-gallery-codefallback code {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  white-space: pre;
}

.ms-gallery-preview {
  flex: 1;
  font-size: 0.85rem;
  line-height: 1.55;
  overflow: hidden;
  min-height: 90px;
}

.ms-gallery-preview :deep(pre) {
  margin: 0.4rem 0;
}

.ms-gallery-skeleton {
  min-height: 90px;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
}

.ms-gallery-api {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 90px;
  border-radius: 8px;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
}

.ms-gallery-desc {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  margin: 0.6rem 0 0;
}

@media (max-width: 760px) {
  .ms-gallery-grid {
    grid-template-columns: 1fr;
  }

  .ms-gallery-search {
    max-width: none;
  }
}
</style>
