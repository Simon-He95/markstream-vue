<script setup lang="ts">
import { useData } from 'vitepress'
import { computed } from 'vue'
import ComponentDemo from './ComponentDemo.vue'
import { componentCategories, componentsDocData } from './data/components'
import OpenInPlayground from './OpenInPlayground.vue'

const props = defineProps<{
  /** kebab-case slug from the components data file. */
  slug: string
}>()

const { lang } = useData()
const isZh = computed(() => lang.value?.startsWith('zh'))

const entry = computed(() => componentsDocData.find(item => item.slug === props.slug))

const categoryLabel = computed(() => {
  if (!entry.value)
    return ''
  const category = componentCategories.find(item => item.key === entry.value?.category)
  if (!category)
    return entry.value.category
  return isZh.value ? category.zh : category.en
})

const related = computed(() => {
  if (!entry.value)
    return []
  return componentsDocData
    .filter(item => item.category === entry.value?.category && item.slug !== entry.value?.slug)
    .slice(0, 8)
})

const overrideLink = computed(() => (isZh.value ? '/zh/guide/component-overrides' : '/guide/component-overrides'))
const componentsRefLink = computed(() => (isZh.value ? '/zh/guide/components' : '/guide/components'))
const installationLink = computed(() => (isZh.value ? '/zh/guide/installation' : '/guide/installation'))

function detailLink(slug: string): string {
  return isZh.value ? `/zh/components/${slug}` : `/components/${slug}`
}
</script>

<template>
  <div v-if="entry" class="ms-component-detail">
    <div class="ms-detail-head">
      <div class="ms-detail-badges">
        <span class="ms-detail-badge">{{ categoryLabel }}</span>
        <span
          v-for="peer in entry.peers"
          :key="peer"
          class="ms-detail-badge ms-detail-badge-peer"
        >
          {{ isZh ? `peer 依赖：${peer}` : `peer: ${peer}` }}
        </span>
        <span v-if="entry.tags.includes('opt-in')" class="ms-detail-badge">
          {{ isZh ? '需要额外配置后触发（插件 / loader / 渲染选项）' : 'opt-in: requires extra setup (plugin, loader, or renderer option)' }}
        </span>
      </div>
      <p class="ms-detail-desc">
        {{ isZh ? entry.descriptionZh : entry.description }}
      </p>
    </div>

    <p><a :href="isZh ? '/zh/guide/solid-api#组件' : '/guide/solid-api#components'">{{ isZh ? 'SolidJS 组件、参数与 TSX 示例' : 'SolidJS component props and TSX examples' }}</a></p>

    <ComponentDemo v-if="entry.mdSnippet" :md="entry.mdSnippet" :slug="entry.slug" />

    <div class="ms-detail-actions">
      <OpenInPlayground v-if="entry.mdSnippet" :md="entry.mdSnippet" />
    </div>

    <div class="ms-detail-sections">
      <section v-if="entry.guide" class="ms-detail-section">
        <h2>{{ isZh ? '深度指南' : 'Deep dive' }}</h2>
        <p>
          {{ isZh ? '这个组件有专门的深度指南：' : 'This component has a dedicated guide:' }}
          <a :href="isZh ? `/zh${entry.guide}` : entry.guide">{{ isZh ? `/zh${entry.guide}` : entry.guide }}</a>
        </p>
      </section>

      <section class="ms-detail-section">
        <h2>{{ isZh ? '定制与覆盖' : 'Customize & override' }}</h2>
        <p>
          <a :href="overrideLink">{{ isZh ? '覆盖内置组件' : 'Override built-in components' }}</a>
          {{ isZh ? ' — 用带作用域的方式安全替换这个节点渲染器。' : ' — replace this node renderer safely with scoped overrides.' }}
          <a :href="componentsRefLink">{{ isZh ? '渲染器与节点组件参考' : 'Renderer & node components reference' }}</a>
          {{ isZh ? ' — 查看全部导出的组件和 props。' : ' — see all exported components and their props.' }}
        </p>
      </section>

      <section v-if="entry.peers.length" class="ms-detail-section">
        <h2>{{ isZh ? '可选依赖' : 'Optional peers' }}</h2>
        <p>
          {{ isZh ? '渲染此组件需要先安装对应的 peer 依赖，详见' : 'Rendering this component requires its peer dependencies. See' }}
          <a :href="installationLink">{{ isZh ? '安装与可选依赖' : 'Installation & optional peers' }}</a>{{ isZh ? '。' : '.' }}
        </p>
      </section>

      <section v-if="related.length" class="ms-detail-section">
        <h2>{{ isZh ? '相关组件' : 'Related components' }}</h2>
        <div class="ms-detail-related">
          <a v-for="item in related" :key="item.slug" :href="detailLink(item.slug)" class="ms-detail-chip">
            {{ item.name }}
          </a>
        </div>
      </section>
    </div>
  </div>

  <div v-else class="ms-detail-missing">
    <p>{{ isZh ? `未找到组件 ${slug}，请从组件画廊选择一个组件。` : `Component ${slug} was not found. Pick one from the component gallery.` }}</p>
    <a :href="isZh ? '/zh/components/' : '/components/'">{{ isZh ? '组件画廊' : 'Component gallery' }}</a>
  </div>
</template>

<style scoped>
.ms-component-detail {
  display: flex;
  flex-direction: column;
}

.ms-detail-head {
  margin-bottom: 0.5rem;
}

.ms-detail-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}

.ms-detail-badge {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  background: var(--vp-c-default-soft);
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
}

.ms-detail-badge-peer {
  color: var(--vp-c-warning-1);
  background: var(--vp-c-warning-soft);
}

.ms-detail-desc {
  font-size: 0.95rem;
  color: var(--vp-c-text-2);
  margin: 0;
}

.ms-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.ms-detail-sections {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.ms-detail-section h2 {
  font-size: 1.1rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
  border-top: 1px solid var(--vp-c-divider);
  padding-top: 1.1rem;
  margin: 1.1rem 0 0.4rem;
}

.ms-detail-section p {
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
  line-height: 1.7;
  margin: 0;
}

.ms-detail-section a {
  color: var(--vp-c-brand-1);
  font-weight: 500;
  text-decoration: none;
}

.ms-detail-section a:hover {
  text-decoration: underline;
}

.ms-detail-related {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.ms-detail-chip {
  font-size: 0.78rem;
  font-family: var(--vp-font-family-mono);
  font-weight: 500;
  color: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  text-decoration: none;
  transition: border-color 0.2s;
}

.ms-detail-chip:hover {
  border-color: var(--vp-c-brand-1);
}

.ms-detail-missing {
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  padding: 1rem 1.25rem;
  color: var(--vp-c-text-2);
}
</style>
