export type LanguageIconMap = Record<string, string>

export interface IconTheme {
  /** Unique identifier, e.g. 'default', 'material' */
  readonly id: string
  /** Core icons — statically imported, always available */
  readonly core: LanguageIconMap
  /** Default/fallback icon SVG string */
  readonly fallback: string
  /** Lazy loader for extended icons. Called at most once; result is cached. */
  loadExtended?: () => Promise<LanguageIconMap>
}
