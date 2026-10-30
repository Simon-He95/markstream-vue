const paths = {
  copy: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></g>',
  check: '<path fill="none" stroke="currentColor" stroke-width="2" d="m5 12 4 4L19 6"/>',
  source: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  preview: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></g>',
  collapse: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m18 15-6-6-6 6"/>',
  expand: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9 6 6 6-6"/>',
  export: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  open: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/>',
  close: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="m6 6 12 12M6 18 18 6"/>',
  zoomIn: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5M7 10.5h7m-3.5-3.5v7"/></g>',
  zoomOut: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5M7 10.5h7"/></g>',
  reset: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 11a9 9 0 1 1 2.5 6.2M3 4v7h7"/>',
}
export function ToolbarIcon(props: { name: keyof typeof paths }) {
  return <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" innerHTML={paths[props.name]} />
}
