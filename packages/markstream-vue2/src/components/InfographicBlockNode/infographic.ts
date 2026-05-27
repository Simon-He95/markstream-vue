let infographicPromise: Promise<InfographicConstructor | null> | null = null
let infographicInstance: any = null

export interface InfographicInstance {
  render: (source: string) => unknown
  destroy?: () => unknown
  on?: (event: string, handler: (payload: unknown) => void) => unknown
}

export interface InfographicConstructor {
  new (options: { container: HTMLElement, width?: string | number, height?: string | number }): InfographicInstance
}

export async function getInfographic(): Promise<InfographicConstructor | null> {
  if (infographicInstance)
    return infographicInstance
  if (infographicPromise)
    return infographicPromise

  infographicPromise = import('@antv/infographic')
    .then((mod) => {
      // Normalize module
      const defaultExport = (mod && (mod as any).default) ? (mod as any).default : mod

      let resolved = defaultExport

      if (typeof defaultExport === 'function' && defaultExport.prototype && defaultExport.prototype.render) {
        resolved = defaultExport
      }
      else if (mod.Infographic) {
        resolved = mod.Infographic
      }
      else if (defaultExport && defaultExport.Infographic) {
        resolved = defaultExport.Infographic
      }

      infographicInstance = resolved
      return resolved as InfographicConstructor
    })
    .catch((e) => {
      console.warn('Failed to load @antv/infographic', e)
      return null
    })
  return infographicPromise
}
