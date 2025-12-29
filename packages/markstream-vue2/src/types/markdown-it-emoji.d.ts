declare module 'markdown-it-emoji' {
  // Minimal ambient types to avoid implicit `any` in the playground/demo.
  // Consumers who need precise types can install proper @types or provide stronger declarations.
  import type { PluginSimple } from 'markdown-it'
  export const full: PluginSimple
  const plugin: PluginSimple
  export default plugin
}
