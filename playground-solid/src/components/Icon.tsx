const paths: Record<string, string> = {
  'carbon:settings': 'M18.5 4l.4 2.3a7 7 0 012.1.9l2.1-1.1 2.1 3.7-1.7 1.6a7 7 0 010 2.2l1.7 1.6-2.1 3.7-2.1-1.1a7 7 0 01-2.1.9L18.5 21h-5l-.4-2.3a7 7 0 01-2.1-.9l-2.1 1.1-2.1-3.7 1.7-1.6a7 7 0 010-2.2L6.8 9.8l2.1-3.7 2.1 1.1a7 7 0 012.1-.9L13.5 4h5zM16 13.5A2.5 2.5 0 1016 8.5a2.5 2.5 0 000 5z',
  'carbon:chevron-down': 'M6 10l10 10 10-10',
  'carbon:moon': 'M21 18.5A9.5 9.5 0 1112 4a7.5 7.5 0 009 14.5z',
  'carbon:sun': 'M16 8a8 8 0 100 16 8 8 0 000-16zm0-4v3m0 18v3M4 16h3m18 0h3M7 7l2 2m14 14l2 2m0-18l-2 2M7 25l2-2',
  'carbon:chat': 'M6 7h20v14H12l-6 5V7z',
  'carbon:star': 'M16 4l3.5 8.5L29 14l-7 6 2 9-8-4.5L8 29l2-9-7-6 9.5-1.5z',
  'carbon:rocket': 'M16 4c5 4 8 10 8 16 0 3-1 6-3 8l-5-5-5 5c-2-2-3-5-3-8 0-6 3-12 8-16zm0 11a2 2 0 110-4 2 2 0 010 4z',
  'carbon:data-structured': 'M6 6h8v8H6V6zm12 0h8v8h-8V6zM6 18h8v8H6v-8zm12 0h8v8h-8v-8z',
  'carbon:home': 'M6 14L16 6l10 8v12H6V14z',
  'carbon:skill-level-basic': 'M6 24V10h4v14H6zm8 0V6h4v18h-4zm8 0V14h4v10h-4z',
}

export function Icon(props: { icon: string, class?: string, className?: string }) {
  const d = () => paths[props.icon] || paths['carbon:settings']
  return (
    <svg
      class={props.className || props.class || ''}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={d()} fill={props.icon === 'carbon:star' || props.icon === 'carbon:moon' ? 'currentColor' : 'none'} />
    </svg>
  )
}
