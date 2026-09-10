import { generateHydrationScript, renderToString } from 'solid-js/web'
import { HydrationApp } from './HydrationApp'

export function renderHydrationFixture() {
  const body = renderToString(() => <HydrationApp />)
  const bootstrap = generateHydrationScript()
  return { body, bootstrap }
}
