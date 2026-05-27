import { withMarkdownHash } from './testPageState'

export type SandboxFrameworkId = 'vue3' | 'vue2' | 'react18' | 'react19' | 'angular' | 'svelte'
export type SandboxRenderSource = 'workspace' | 'npm'

export interface SandboxFrameworkTarget {
  id: SandboxFrameworkId
  label: string
  packageName: string
  defaultVersion: string
  runtimeVersion: string
  supportsWorkspace: boolean
}

export interface SandboxSelectionInput {
  frameworkId?: string | null
  source?: string | null
  version?: string | null
}

export interface SandboxSelection {
  framework: SandboxFrameworkTarget
  frameworkId: SandboxFrameworkId
  source: SandboxRenderSource
  version: string
}

export function normalizeSandboxVersion(version: string | null | undefined, fallback: string) {
  const trimmed = typeof version === 'string' ? version.trim() : ''
  return trimmed || fallback
}

export function resolveSandboxFramework(
  frameworks: ReadonlyArray<SandboxFrameworkTarget>,
  frameworkId?: string | null,
) {
  return frameworks.find(item => item.id === frameworkId) ?? frameworks[0]
}

export function normalizeSandboxSource(
  framework: SandboxFrameworkTarget,
  source?: string | null,
): SandboxRenderSource {
  if (framework.supportsWorkspace && source === 'workspace')
    return 'workspace'
  return 'npm'
}

export function resolveSandboxSelection(
  frameworks: ReadonlyArray<SandboxFrameworkTarget>,
  input: SandboxSelectionInput = {},
): SandboxSelection {
  const framework = resolveSandboxFramework(frameworks, input.frameworkId)
  const source = normalizeSandboxSource(framework, input.source)
  const version = normalizeSandboxVersion(input.version, framework.defaultVersion)

  return {
    framework,
    frameworkId: framework.id,
    source,
    version,
  }
}

export function parseSandboxSelection(
  search: string,
  frameworks: ReadonlyArray<SandboxFrameworkTarget>,
) {
  const params = new URLSearchParams(search)
  return resolveSandboxSelection(frameworks, {
    frameworkId: params.get('framework'),
    source: params.get('source'),
    version: params.get('version'),
  })
}

export function buildSandboxSearch(selection: SandboxSelection) {
  const params = new URLSearchParams()
  params.set('framework', selection.frameworkId)
  params.set('source', selection.source)
  params.set('version', selection.version)
  return `?${params.toString()}`
}

export function buildTestSandboxHref(
  selection: SandboxSelection,
  markdown: string,
  basePath = '/test-sandbox',
) {
  return withMarkdownHash(`${basePath}${buildSandboxSearch(selection)}`, markdown)
}
