import { describe, expect, it } from 'vitest'
import {
  buildFamilyReleaseNotes,
  extractChangelogSection,
  FAMILY_PACKAGES,
  familyReleaseTitle,
  parseRemoteTags,
  renderFamilySection,
  resolveReleaseAnchor,
} from '../scripts/build-family-release-notes.mjs'

const HEAD = '9cb8055799ee9b1313759ca9784c7de0cd3119f6'
const NEXT = '4556e5d6b1ef9bb4476bf983123ac25a3b01b2a9'

function tagsAtHead(names: string[], others: string[] = []) {
  return [
    ...names.map(name => ({ name, sha: HEAD })),
    ...others.map(name => ({ name, sha: NEXT })),
  ]
}

function versions(overrides: Record<string, string> = {}) {
  return Object.fromEntries(FAMILY_PACKAGES.map(pkg => [pkg.name, overrides[pkg.name] ?? '2.0.23']))
}

describe('parseRemoteTags', () => {
  it('prefers the peeled commit of annotated tags', () => {
    const output = [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/tags/markstream-vue@2.0.23',
      `${HEAD} refs/tags/markstream-vue@2.0.23^{}`,
      `${HEAD} refs/tags/markstream-react@2.0.23`,
      `${HEAD} refs/heads/main`,
      '',
    ].join('\n')

    expect(parseRemoteTags(output)).toEqual([
      { name: 'markstream-vue@2.0.23', sha: HEAD },
      { name: 'markstream-react@2.0.23', sha: HEAD },
    ])
  })
})

describe('resolveReleaseAnchor', () => {
  it('gives a coordinated train to markstream-vue', () => {
    const tags = tagsAtHead([
      'stream-markdown-parser@1.2.24',
      'markstream-core@2.0.23',
      'markstream-vue@2.0.23',
      'markstream-react@2.0.23',
      'markstream-solid@2.0.23',
    ])

    expect(resolveReleaseAnchor({ packageName: 'markstream-vue', version: '2.0.23', headSha: HEAD, tags })).toBe(true)
    for (const packageName of ['stream-markdown-parser', 'markstream-core', 'markstream-react', 'markstream-solid']) {
      const version = packageName === 'stream-markdown-parser' ? '1.2.24' : '2.0.23'
      expect(resolveReleaseAnchor({ packageName, version, headSha: HEAD, tags })).toBe(false)
    }
  })

  it('lets the first package in anchor order own a train without markstream-vue', () => {
    const tags = tagsAtHead([
      'markstream-react@0.1.0',
      'markstream-svelte@0.1.0',
      'markstream-angular@0.1.0',
    ])

    expect(resolveReleaseAnchor({ packageName: 'markstream-react', version: '0.1.0', headSha: HEAD, tags })).toBe(true)
    expect(resolveReleaseAnchor({ packageName: 'markstream-svelte', version: '0.1.0', headSha: HEAD, tags })).toBe(false)
    expect(resolveReleaseAnchor({ packageName: 'markstream-angular', version: '0.1.0', headSha: HEAD, tags })).toBe(false)
  })

  it('anchors an independent adapter release on its own commit', () => {
    const tags = tagsAtHead(
      ['markstream-react@2.0.24'],
      ['markstream-vue@2.0.23', 'markstream-core@2.0.23'],
    )

    expect(resolveReleaseAnchor({ packageName: 'markstream-react', version: '2.0.24', headSha: HEAD, tags })).toBe(true)
  })

  it('does not let an adapter anchor when another markstream-vue tag shares the commit', () => {
    const tags = tagsAtHead([
      'markstream-vue@2.0.23',
      'markstream-react@2.0.24',
    ])

    expect(resolveReleaseAnchor({ packageName: 'markstream-react', version: '2.0.24', headSha: HEAD, tags })).toBe(false)
    expect(resolveReleaseAnchor({ packageName: 'markstream-vue', version: '2.0.23', headSha: HEAD, tags })).toBe(true)
  })

  it('ignores nightly tags', () => {
    const tags = tagsAtHead([
      'markstream-vue@nightly-20261101-4556e5d',
      'markstream-react@nightly-20261101-4556e5d',
    ])

    expect(resolveReleaseAnchor({ packageName: 'markstream-vue', version: 'nightly-20261101-4556e5d', headSha: HEAD, tags })).toBe(false)
    expect(resolveReleaseAnchor({ packageName: 'markstream-react', version: 'nightly-20261101-4556e5d', headSha: HEAD, tags })).toBe(false)
  })
})

describe('family release notes', () => {
  it('names the family in the Vue title', () => {
    expect(familyReleaseTitle({ packageName: 'markstream-vue', version: '2.0.23' }))
      .toBe('Markstream 2.0.23 — Vue · React · Octane · Solid · Svelte · Angular · Vue 2')
    expect(familyReleaseTitle({ packageName: 'markstream-react', version: '2.0.24' }))
      .toBe('Markstream 2.0.24 — markstream-react')
  })

  it('lists every family package and links only tags that exist', () => {
    const section = renderFamilySection({
      packageName: 'markstream-vue',
      versions: versions({ 'stream-markdown-parser': '1.2.24' }),
      tags: tagsAtHead(['markstream-vue@2.0.23', 'markstream-react@2.0.23']),
      repoUrl: 'https://github.com/Simon-He95/markstream-vue',
    })

    for (const pkg of FAMILY_PACKAGES.filter(pkg => pkg.name !== 'markstream-vue'))
      expect(section).toContain(`\`${pkg.name}\``)

    expect(section).toContain('| **markstream-vue** | Vue 3 / Nuxt / VitePress | `2.0.23` | [tag](https://github.com/Simon-He95/markstream-vue/releases/tag/markstream-vue%402.0.23) |')
    expect(section).toContain('| `markstream-react` | React / Next.js | `2.0.23` | [tag](https://github.com/Simon-He95/markstream-vue/releases/tag/markstream-react%402.0.23) |')
    expect(section).toContain('| `markstream-svelte` | Svelte 5 | `2.0.23` | — |')
    expect(section).toContain('| `stream-markdown-parser` | Streaming parser | `1.2.24` | — |')
  })

  it('extracts the changelog section for the anchored version only', () => {
    const changelog = [
      '# Changelog',
      '',
      '## [2.0.23](https://example.com)',
      '',
      '### Bug Fixes',
      '',
      '* fixed everything',
      '',
      '## [2.0.22](https://example.com)',
      '',
      '* older',
      '',
    ].join('\n')

    expect(extractChangelogSection(changelog, '2.0.23')).toBe('### Bug Fixes\n\n* fixed everything')
    expect(extractChangelogSection(changelog, '2.0.21')).toBeNull()
    expect(extractChangelogSection(null, '2.0.23')).toBeNull()
  })

  it('composes changelog notes, the family matrix and the anchor decision', () => {
    const changelog = '## [2.0.23]\n\n### Bug Fixes\n\n* fixed everything\n'
    const notes = buildFamilyReleaseNotes({
      packageName: 'markstream-vue',
      version: '2.0.23',
      headSha: HEAD,
      tags: tagsAtHead(['markstream-vue@2.0.23', 'markstream-react@2.0.23']),
      versions: versions(),
      changelog,
      repoUrl: 'https://github.com/Simon-He95/markstream-vue',
    })

    expect(notes.anchor).toBe(true)
    expect(notes.title).toBe('Markstream 2.0.23 — Vue · React · Octane · Solid · Svelte · Angular · Vue 2')
    expect(notes.body).toContain('### Bug Fixes\n\n* fixed everything')
    expect(notes.body).toContain('## Markstream family')
    expect(notes.body.endsWith('\n')).toBe(true)

    const skipped = buildFamilyReleaseNotes({
      packageName: 'markstream-react',
      version: '2.0.23',
      headSha: HEAD,
      tags: tagsAtHead(['markstream-vue@2.0.23', 'markstream-react@2.0.23']),
      versions: versions(),
      changelog,
    })
    expect(skipped.anchor).toBe(false)
  })
})
