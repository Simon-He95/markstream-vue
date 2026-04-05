/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{vue,js,ts,jsx,tsx}'],
  important: '.markstream-vue',
  theme: {
    extend: {
      colors: {
        'background': 'hsl(var(--ms-background))',
        'foreground': 'hsl(var(--ms-foreground))',
        'muted': 'hsl(var(--ms-muted))',
        'muted-foreground': 'hsl(var(--ms-muted-foreground))',
        'secondary': 'hsl(var(--ms-secondary))',
        'secondary-foreground': 'hsl(var(--ms-secondary-foreground))',
        'accent': 'hsl(var(--ms-accent))',
        'accent-foreground': 'hsl(var(--ms-accent-foreground))',
        'primary': 'hsl(var(--ms-primary))',
        'primary-foreground': 'hsl(var(--ms-primary-foreground))',
        'destructive': 'hsl(var(--ms-destructive))',
        'destructive-foreground': 'hsl(var(--ms-destructive-foreground))',
        'border': 'hsl(var(--ms-border))',
        'ring': 'hsl(var(--ms-ring))',
        'popover': 'hsl(var(--ms-popover))',
        'popover-foreground': 'hsl(var(--ms-popover-foreground))',
      },
      borderRadius: {
        lg: 'calc(var(--ms-radius) + 4px)',
        md: 'calc(var(--ms-radius) + 2px)',
        DEFAULT: 'var(--ms-radius)',
        sm: 'calc(var(--ms-radius) - 2px)',
      },
      fontFamily: {
        sans: ['var(--ms-font-sans)'],
        mono: ['var(--ms-font-mono)'],
      },
    },
  },
  plugins: [],
}
