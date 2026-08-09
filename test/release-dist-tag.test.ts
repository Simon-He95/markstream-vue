import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPublishedDistTags, resolveDistTag, resolveDistTagPlan, resolvePublishedDistTag } from '../scripts/resolve-dist-tag.mjs'

describe('release dist-tag routing', () => {
  it.each([
    ['2.0.0', { latest: '1.0.9' }, 'latest'],
    ['1.0.10', { latest: '2.0.0' }, 'legacy'],
    ['1.0.10', { latest: '1.0.9' }, 'latest'],
    ['2.0.0-beta.1', { latest: '1.0.9', next: '1.1.2-beta.2' }, 'next'],
    ['1.1.3-beta.1', { latest: '1.0.9', next: '2.0.0-beta.1' }, 'legacy-next'],
    ['1.1.3-beta.1', { latest: '2.0.0' }, 'legacy-next'],
    ['1.1.3-beta.1', { latest: '1.0.9', next: '1.1.2-beta.2' }, 'next'],
    ['1.1.3+build.1', { latest: '1.0.9' }, 'latest'],
    ['1.0.0', {}, 'latest'],
    ['1.0.0-beta.1', {}, 'next'],
  ])('routes %s against %j to %s', (version, distTags, expected) => {
    expect(resolveDistTag(version, distTags)).toBe(expected)
  })

  it('fails closed for malformed published versions', () => {
    expect(() => resolveDistTag('1.0.0', { latest: 'not-semver' })).toThrow('Invalid npm latest version')
    expect(() => resolveDistTag('1.0.0-beta.1', { next: 'not-semver' })).toThrow('Invalid npm next version')
  })

  it.each([
    '01.2.3',
    '1.02.3',
    '1.2.3-beta..1',
    '1.2.3-beta_1',
    '9007199254740992.0.0',
    '1.2.3 ',
    '1.2.3\n',
  ])('rejects invalid candidate SemVer %s', (version) => {
    expect(() => resolveDistTag(version)).toThrow('Invalid candidate version')
  })

  it('rejects non-canonical published SemVer', () => {
    expect(() => resolveDistTag('2.0.0', { latest: '1.2.3 ' })).toThrow('Invalid npm latest version')
    expect(() => resolveDistTag('2.0.0-beta.1', { next: '1.2.3\n' })).toThrow('Invalid npm next version')
  })

  it('requires the old channels to be preserved before a major cutover', () => {
    expect(resolveDistTagPlan('2.0.0-beta.1', {
      latest: '1.0.9',
      next: '1.1.2-beta.2',
    })).toEqual({
      publishTag: 'next',
      requiredAliases: [{ tag: 'legacy-next', version: '1.1.2-beta.2' }],
    })
    expect(resolveDistTagPlan('2.0.0', {
      latest: '1.0.9',
    })).toEqual({
      publishTag: 'latest',
      requiredAliases: [{ tag: 'legacy', version: '1.0.9' }],
    })
    expect(resolveDistTagPlan('2.0.0', {
      'latest': '1.0.9',
      'legacy': '1.0.9',
      'next': '2.0.0-beta.1',
      'legacy-next': '1.1.2-beta.2',
    })).toEqual({
      publishTag: 'latest',
      requiredAliases: [],
    })
  })

  it.each([
    [
      '2.0.0-beta.1',
      { latest: '1.0.9', next: '1.1.2-beta.2' },
      'npm dist-tag add markstream-vue@1.1.2-beta.2 legacy-next',
    ],
    [
      '2.0.0',
      { latest: '1.0.9' },
      'npm dist-tag add markstream-vue@1.0.9 legacy',
    ],
  ])('fails with the exact migration command for %s', (version, distTags, command) => {
    const run = () => ({
      status: 0,
      stdout: JSON.stringify(distTags),
      stderr: '',
    })
    expect(() => resolvePublishedDistTag('markstream-vue', version, run)).toThrow(command)
  })

  it('publishes on the new channels after both cutover aliases exist', () => {
    const run = () => ({
      status: 0,
      stdout: JSON.stringify({
        'latest': '1.0.9',
        'next': '1.1.2-beta.2',
        'legacy': '1.0.9',
        'legacy-next': '1.1.2-beta.2',
      }),
      stderr: '',
    })

    expect(resolvePublishedDistTag('markstream-vue', '2.0.0-beta.1', run)).toBe('next')
    expect(resolvePublishedDistTag('markstream-vue', '2.0.0', run)).toBe('latest')
  })

  it('treats an npm 404 as the first package release', () => {
    const run = () => ({ status: 1, stderr: 'npm error code E404' })
    expect(readPublishedDistTags('new-package', run)).toEqual({})
  })

  it('fails closed when the registry cannot be read', () => {
    const run = () => ({ status: 1, stderr: 'network timeout' })
    expect(() => readPublishedDistTags('markstream-vue', run)).toThrow('Unable to read npm dist-tags')
  })

  it('uses the shared resolver in every stable publish path', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release-stable.yml'), 'utf8')
    const releaseCli = readFileSync(resolve(process.cwd(), 'scripts/dist-tag.mjs'), 'utf8')
    const publishCurrent = readFileSync(resolve(process.cwd(), 'scripts/publish-current-package.mjs'), 'utf8')

    expect(workflow).toContain('DIST_TAG="$(node scripts/resolve-dist-tag.mjs')
    expect(releaseCli).toContain('from \'./resolve-dist-tag.mjs\'')
    expect(releaseCli).toContain('process.stdout.write(distTag)')
    expect(publishCurrent).toContain('from \'./resolve-dist-tag.mjs\'')
  })

  it.each([
    ['package.json', 'scripts/dist-tag.mjs'],
    ['packages/markdown-parser/package.json', '../../scripts/dist-tag.mjs'],
    ['packages/markstream-angular/package.json', '../../scripts/dist-tag.mjs'],
    ['packages/markstream-core/package.json', '../../scripts/dist-tag.mjs'],
    ['packages/markstream-octane/package.json', '../../scripts/dist-tag.mjs'],
    ['packages/markstream-react/package.json', '../../scripts/dist-tag.mjs'],
    ['packages/markstream-svelte/package.json', '../../scripts/dist-tag.mjs'],
    ['packages/markstream-vue2/package.json', '../../scripts/dist-tag.mjs'],
  ])('resolves a tag before publishing in %s', (packageJsonPath, resolverPath) => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), packageJsonPath), 'utf8'))
    const release = packageJson.scripts.release
    const assignment = `DIST_TAG="$(node ${resolverPath})"`
    const assignmentIndex = release.indexOf(assignment)
    const publishIndex = release.indexOf('publish', assignmentIndex + assignment.length)

    expect(assignmentIndex).toBeGreaterThan(-1)
    expect(release.slice(assignmentIndex + assignment.length)).toMatch(/^ && /)
    expect(publishIndex).toBeGreaterThan(assignmentIndex)
    expect(release.slice(publishIndex)).toMatch(/--tag "\$\{DIST_TAG\}"/)
    expect(release).not.toMatch(/publish[^&]*\$\([^)]*dist-tag\.mjs\)/)
  })

  it.skipIf(process.platform === 'win32')('does not run publish when tag resolution fails', () => {
    const result = spawnSync('sh', [
      '-c',
      'DIST_TAG="$(node -e \'process.exit(23)\')" && printf publish',
    ], { encoding: 'utf8' })

    expect(result.status).toBe(23)
    expect(result.stdout).toBe('')
  })

  it.skipIf(process.platform === 'win32')('passes the resolved tag as one publish argument', () => {
    const command = 'DIST_TAG="$(node -e \'process.stdout.write("legacy-next")\')" && node -e \'process.stdout.write(JSON.stringify(process.argv.slice(1)))\' -- --tag "$' + '{DIST_TAG}"'
    const result = spawnSync('sh', ['-c', command], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(['--tag', 'legacy-next'])
  })

  it('keeps dry runs independent of the npm registry', () => {
    const publishCurrent = readFileSync(resolve(process.cwd(), 'scripts/publish-current-package.mjs'), 'utf8')

    expect(publishCurrent).toMatch(/const distTag = args\.dryRun\s+\? resolveDistTag\(packageJson\.version\)\s+: resolvePublishedDistTag\(packageJson\.name, packageJson\.version\)/)
  })

  it('serializes stable release workflows', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/release-stable.yml'), 'utf8')

    expect(workflow).toMatch(/concurrency:\n {2}group: release-stable\n {2}queue: max\n {2}cancel-in-progress: false/)
  })
})
