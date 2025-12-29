/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{vue,js,ts,jsx,tsx}'],
  important: '.markstream-vue',
  theme: {
    extend: {
      colors: {
        'border': 'hsl(var(--border),214.3 21.44% 93.4%)',
        'background': 'hsl(var(--background),0 0% 100%)',
        'foreground': 'hsl(var(--foreground),217.2 22.08% 19.5%)',
        'secondary': 'hsl(var(--secondary),214.3 21.44% 93.4%)',
        'muted': 'hsl(var(--muted),210 28% 98.1%)',
        'muted-foreground': 'hsl(var(--muted-foreground),215 12.16% 67.1%)',
      },
    },
  },
  plugins: [],
}
