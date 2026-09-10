import baseConfig from '../tailwind.config.js'

const baseContent = Array.isArray(baseConfig.content) ? baseConfig.content : []

export default {
  ...baseConfig,
  important: '.markstream-solid',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    '../packages/markstream-solid/src/**/*.{js,ts,jsx,tsx,css}',
    ...baseContent,
  ],
}
