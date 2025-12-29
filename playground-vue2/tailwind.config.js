/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['selector'],
  safelist: [
    'border-gray-400/5',
    'hover:bg-[var(--vscode-editor-selectionBackground)]',
  ],
  content: [
    './src/**/*.{vue,js,ts,jsx,tsx}',
    '../packages/markstream-vue2/src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
    },
  },
  plugins: [],
}
