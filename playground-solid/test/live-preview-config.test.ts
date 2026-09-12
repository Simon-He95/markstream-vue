import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('playground-solid live preview config', () => {
  it('keeps the shared Solid playground custom scope in one place', () => {
    const sharedSource = readSource('src/shared/markstreamPlayground.ts')
    expect(sharedSource).toContain('PLAYGROUND_CUSTOM_ID = \'playground-demo\'')
    expect(sharedSource).toContain('PLAYGROUND_CUSTOM_HTML_TAGS = [\'thinking\'] as const')
  })

  it('wires preview surfaces to the shared custom html config', () => {
    const homeSource = readSource('src/pages/HomePage.tsx')
    const testLabSource = readSource('src/pages/TestLab.tsx')
    const migrationSource = readSource('src/pages/MigrationDemoPage.tsx')
    const thinkingSource = readSource('src/components/ThinkingNode.tsx')

    expect(homeSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')
    expect(homeSource).toContain('customComponents={PLAYGROUND_CUSTOM_COMPONENTS}')
    expect(testLabSource).toContain('customId={PLAYGROUND_CUSTOM_ID}')
    expect(testLabSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')
    expect(testLabSource).toContain('customComponents={PLAYGROUND_CUSTOM_COMPONENTS}')
    expect(migrationSource).toContain('customId={PLAYGROUND_CUSTOM_ID}')
    expect(migrationSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')
    expect(migrationSource).toContain('customComponents={PLAYGROUND_CUSTOM_COMPONENTS}')
    expect(thinkingSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')
    expect(thinkingSource).toContain('props.children')
  })

  it('keeps SSE/WebSocket names as cadence presets and does not invent a public Solid origin', () => {
    const presets = readSource('src/shared/streamPresets.ts')
    const fixtures = readFileSync(resolve(process.cwd(), '../playground-shared/testLabFixtures.ts'), 'utf8')
    expect(presets).toContain('id: \'sse\'')
    expect(presets).toContain('id: \'websocket\'')
    expect(presets).not.toContain('new WebSocket')
    expect(presets).not.toContain('EventSource')
    expect(fixtures).toContain('id: \'solid\'')
    expect(fixtures).toContain('localPort: 4177')
    expect(fixtures).not.toContain('https://markstream-solid.pages.dev')
  })
})
