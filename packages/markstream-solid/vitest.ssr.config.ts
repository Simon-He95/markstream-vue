import solid from 'vite-plugin-solid'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [solid({ ssr: true, hot: false })],
  test: { environment: 'node', include: ['tests/**/*.ssr.tsx'] },
})
