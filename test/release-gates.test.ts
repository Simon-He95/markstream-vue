import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('release dependency gates', () => {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

  it('runs the workspace dependency publish gate before packed smoke on prepublish', () => {
    const scripts = packageJson.scripts
    const prepublishOnly = scripts.prepublishOnly

    expect(scripts['check:workspace-deps-local']).toBe('node ./scripts/check-workspace-deps-local.mjs')
    expect(scripts['check:workspace-deps-published']).toBe('node ./scripts/check-workspace-deps-published.mjs')
    expect(prepublishOnly).toContain('pnpm run build:parser')
    expect(prepublishOnly).toContain('pnpm run check:workspace-deps-published')
    expect(prepublishOnly).toContain('pnpm run test:smoke:pack')
    expect(prepublishOnly).toContain('pnpm run test:smoke:pack:optional')
    expect(prepublishOnly.indexOf('pnpm run build:parser')).toBeLessThan(prepublishOnly.indexOf('pnpm run check:workspace-deps-published'))
    expect(prepublishOnly.indexOf('pnpm run check:workspace-deps-published')).toBeLessThan(prepublishOnly.indexOf('pnpm run test:smoke:pack'))
    expect(prepublishOnly.indexOf('pnpm run test:smoke:pack')).toBeLessThan(prepublishOnly.indexOf('pnpm run test:smoke:pack:optional'))
  })

  it('uses the workspace dependency publish gate in the release script', () => {
    const scripts = packageJson.scripts
    const release = scripts.release

    expect(release).toContain('pnpm run check:workspace-deps-published')
    expect(release).not.toContain('pnpm run check:core-published')
    expect(scripts.changelog).toContain('--tag-prefix markstream-vue@')
    expect(scripts.changelog).toContain('-r 1')
    expect(scripts.changelog).not.toContain('-r 0')
    expect(release).toContain('--tag-prefix markstream-vue@')
    expect(release).toContain('-r 1')
    expect(release).not.toContain('-r 0')
  })

  it('uses the 1.0 release gate before publishing stable packages', () => {
    const scripts = packageJson.scripts
    const releaseGate = scripts['release:gate:1.0']
    const release1 = scripts['release:1.0']
    const releaseDryRun = scripts['release:dry-run:1.0']

    expect(releaseGate).toContain('pnpm run release:verify')
    expect(releaseGate).toContain('pnpm run docs:build:ci')
    expect(releaseGate).toContain('pnpm run size:check')
    expect(releaseGate).toContain('pnpm run benchmark:1.0')
    expect(release1).toContain('pnpm run release:gate:1.0')
    expect(scripts['publish:parser:current']).toContain('scripts/publish-current-package.mjs')
    expect(scripts['publish:core:current']).toContain('scripts/publish-current-package.mjs')
    expect(scripts['publish:vue3:current']).toContain('scripts/publish-current-package.mjs')
    expect(scripts['publish:vue3:current']).toContain('pnpm run check:workspace-deps-published')
    expect(scripts['publish:parser:dry-run']).toContain('--dry-run')
    expect(scripts['publish:core:dry-run']).toContain('--dry-run')
    expect(scripts['publish:vue3:dry-run']).toContain('pnpm run check:workspace-deps-local')
    expect(scripts['publish:vue3:dry-run']).not.toContain('pnpm run check:workspace-deps-published')
    expect(scripts['publish:vue3:dry-run']).toContain('--dry-run')
    expect(release1).not.toContain('pnpm run release:parser')
    expect(release1).not.toContain('pnpm run release:core')
    expect(release1).not.toMatch(/&& pnpm run release(?:\s|$)/)
    expect(release1.indexOf('pnpm run release:gate:1.0')).toBeLessThan(release1.indexOf('pnpm run publish:parser:current'))
    expect(release1.indexOf('pnpm run publish:parser:current')).toBeLessThan(release1.indexOf('pnpm run publish:core:current'))
    expect(release1.indexOf('pnpm run publish:core:current')).toBeLessThan(release1.indexOf('pnpm run publish:vue3:current'))
    expect(releaseDryRun.indexOf('pnpm run release:gate:1.0')).toBeLessThan(releaseDryRun.indexOf('pnpm run publish:parser:dry-run'))
    expect(releaseDryRun.indexOf('pnpm run publish:parser:dry-run')).toBeLessThan(releaseDryRun.indexOf('pnpm run publish:core:dry-run'))
    expect(releaseDryRun.indexOf('pnpm run publish:core:dry-run')).toBeLessThan(releaseDryRun.indexOf('pnpm run publish:vue3:dry-run'))
  })

  it('binds the 1.0 benchmark report to the release version and commit', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/benchmark-1-0.mjs'), 'utf8')

    expect(script).toContain('packageVersion: rootPackageVersion')
    expect(script).toContain('gitSha: await resolveGitSha()')
    expect(script).toContain('report.packageVersion !== rootPackageVersion')
    expect(script).toContain('process.env.GITHUB_SHA && report.gitSha !== process.env.GITHUB_SHA')
    expect(script).toContain('const requiredScenarioIds = scenarios.map(scenario => scenario.id)')
  })

  it('uses explicit JSON files for child benchmark results', () => {
    const benchmarkScript = readFileSync(resolve(process.cwd(), 'scripts/benchmark-1-0.mjs'), 'utf8')
    const diagnosticScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-playground-performance.mjs'), 'utf8')
    const mainScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-main-playground-performance.mjs'), 'utf8')

    expect(benchmarkScript).toContain('BENCHMARK_JSON_PATH: resultPath')
    expect(benchmarkScript).toContain('result: readJsonFile(resultPath)')
    expect(benchmarkScript).not.toContain('parseJsonOutput')
    expect(diagnosticScript).toContain('process.env.BENCHMARK_JSON_PATH')
    expect(mainScript).toContain('process.env.BENCHMARK_JSON_PATH')
  })

  it('captures stream parser metrics in the 1.0 benchmark', () => {
    const benchmarkScript = readFileSync(resolve(process.cwd(), 'scripts/benchmark-1-0.mjs'), 'utf8')
    const diagnosticScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-playground-performance.mjs'), 'utf8')
    const mainScript = readFileSync(resolve(process.cwd(), 'scripts/e2e-main-playground-performance.mjs'), 'utf8')
    const mainPlayground = readFileSync(resolve(process.cwd(), 'playground/src/pages/index.vue'), 'utf8')
    const diagnosticPlayground = readFileSync(resolve(process.cwd(), 'playground/src/pages/test.vue'), 'utf8')

    expect(mainPlayground).toContain(':debug-performance="isBenchmarkMode"')
    expect(diagnosticPlayground).toContain(':debug-performance="isBenchmarkMode"')
    expect(diagnosticScript).toContain('parsePerformance')
    expect(mainScript).toContain('parsePerformance')
    expect(diagnosticScript).toContain('diffParsePerformance')
    expect(mainScript).toContain('replayParsePerformanceBaseline')
    expect(mainScript).toContain('Replay stream parser should record append/tail/cache hits')
    expect(mainScript).toContain('Replay token clone cost too high')
    expect(benchmarkScript).toContain('parsePerformanceSummary')
    expect(benchmarkScript).toContain('tokenCloneMs')
    expect(benchmarkScript).toContain('processTokensMs')
  })

  it('does not create release tags for package versions already published on npm', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/publish-current-package.mjs'), 'utf8')

    expect(script).toContain('assertPublishedTagAtHead(packageJson)')
    expect(script).toContain('Refusing to create a tag for an already-published version.')
    expect(script).toContain('Refusing to retag an already-published version.')
  })

  it('skips publish lifecycle scripts for dry-run package publishes', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/publish-current-package.mjs'), 'utf8')

    expect(script).toContain('const dryRunPublishArgs = args.dryRun ? [\'--dry-run\', \'--ignore-scripts\'] : []')
    expect(script).toContain('const pnpmDryRunPublishArgs = args.dryRun ? [...dryRunPublishArgs, \'--no-git-checks\'] : []')
    expect(script).toContain('[\'publish\', \'--access\', \'public\', ...pnpmDryRunPublishArgs]')
    expect(script).toContain('[\'publish\', \'--access\', \'public\', ...dryRunPublishArgs]')
  })

  it('checks both runtime workspace packages for published versions', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/check-workspace-deps-published.mjs'), 'utf8')

    expect(script).toMatch(/name: 'markstream-core'/)
    expect(script).toMatch(/packageJson: 'packages\/markstream-core\/package\.json'/)
    expect(script).toMatch(/name: 'stream-markdown-parser'/)
    expect(script).toMatch(/packageJson: 'packages\/markdown-parser\/package\.json'/)
  })

  it('keeps dry-run workspace dependency checks local', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/check-workspace-deps-local.mjs'), 'utf8')

    expect(script).toMatch(/name: 'markstream-core'/)
    expect(script).toMatch(/name: 'stream-markdown-parser'/)
    expect(script).toContain('dependencyVersion !== \'workspace:*\' && dependencyVersion !== targetVersion')
    expect(script).not.toContain('execFileSync')
    expect(script).not.toContain('npmViewVersion')
  })
})
