import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  devtools: { enabled: true },
  app: {
    head: {
      title: 'markstream-nuxt Playground | Nuxt demo',
      meta: [
        {
          name: 'description',
          content: 'markstream-nuxt playground for streaming Markdown, Mermaid, KaTeX, and docs-site integration demos.',
        },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    },
  },
  modules: [
    '@nuxtjs/tailwindcss',
  ],
  css: [
    '@/assets/tailwind.css',
    'markstream-vue/index.css',
    'katex/dist/katex.min.css',
  ],
  nitro: {
    preset: 'static',
    publicAssets: [
      { dir: 'public' },
      { dir: '../playground/public', baseURL: '/' },
    ],
  },
  vite: {
    optimizeDeps: {
      include: [
        '@antv/infographic',
        '@floating-ui/dom',
        '@terrastruct/d2',
        'katex',
        'katex/dist/contrib/mhchem',
        'mermaid',
        'vue-i18n',
      ],
      exclude: ['stream-diffs', 'markstream-vue'],
    },
    worker: {
      format: 'es',
    },
  },
  runtimeConfig: {
    public: {
      demoTitle: 'Nuxt + Vue Renderer Markdown',
    },
  },
})
