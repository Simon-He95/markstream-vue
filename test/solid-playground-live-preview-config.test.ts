import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('solid playground live preview config (root)', () => {
  it('registers Solid in shared fixtures without inventing a public origin', () => {
    const fixtures = readSource('playground-shared/testLabFixtures.ts')
    expect(fixtures).toContain('\'solid\'')
    expect(fixtures).toContain('id: \'solid\'')
    expect(fixtures).toContain('localPort: 4177')
    expect(fixtures).not.toContain('https://markstream-solid.pages.dev')
  })

  it('wires the Solid playground to the shared custom html config', () => {
    const sharedSource = readSource('playground-solid/src/shared/markstreamPlayground.ts')
    const homeSource = readSource('playground-solid/src/pages/HomePage.tsx')
    const testLabSource = readSource('playground-solid/src/pages/TestLab.tsx')
    expect(sharedSource).toContain('PLAYGROUND_CUSTOM_ID = \'playground-demo\'')
    expect(homeSource).toContain('customHtmlTags={PLAYGROUND_CUSTOM_HTML_TAGS}')
    expect(testLabSource).toContain('customId={PLAYGROUND_CUSTOM_ID}')
  })
})
