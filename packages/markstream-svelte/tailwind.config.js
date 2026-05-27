import baseConfig from '../../tailwind.config.js'

export default {
  ...baseConfig,
  important: '.markstream-svelte',
  corePlugins: {
    container: false,
  },
  content: [
    './src/**/*.{ts,svelte}',
    './src/**/*.css',
  ],
}
