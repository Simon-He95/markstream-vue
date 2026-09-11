export const CUSTOM_STREAM_PRESET_ID = 'custom' as const

export type StreamPresetId
  = 'balanced'
    | 'sse'
    | 'websocket'
    | 'proxy-buffered'
    | 'weak-mobile'
    | typeof CUSTOM_STREAM_PRESET_ID

export interface StreamPresetValues {
  chunkDelayMin: number
  chunkDelayMax: number
  chunkSizeMin: number
  chunkSizeMax: number
  burstiness: number
}

export interface StreamPreset extends StreamPresetValues {
  id: Exclude<StreamPresetId, typeof CUSTOM_STREAM_PRESET_ID>
  label: string
  description: string
}

export const STREAM_PRESETS: StreamPreset[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Moderate jitter with short stalls and occasional bursts.',
    chunkDelayMin: 14,
    chunkDelayMax: 34,
    chunkSizeMin: 2,
    chunkSizeMax: 7,
    burstiness: 35,
  },
  {
    id: 'sse',
    label: 'SSE',
    description: 'Smaller chunks, frequent flushes, and visible network wobble.',
    chunkDelayMin: 18,
    chunkDelayMax: 44,
    chunkSizeMin: 1,
    chunkSizeMax: 4,
    burstiness: 18,
  },
  {
    id: 'websocket',
    label: 'WebSocket',
    description: 'Smoother cadence with larger chunks and lower transport jitter.',
    chunkDelayMin: 8,
    chunkDelayMax: 20,
    chunkSizeMin: 4,
    chunkSizeMax: 8,
    burstiness: 22,
  },
  {
    id: 'proxy-buffered',
    label: 'Proxy Buffered',
    description: 'Silent gaps followed by buffered batches from an intermediate proxy.',
    chunkDelayMin: 36,
    chunkDelayMax: 160,
    chunkSizeMin: 6,
    chunkSizeMax: 16,
    burstiness: 88,
  },
  {
    id: 'weak-mobile',
    label: 'Weak Mobile',
    description: 'High latency, high jitter, and resume-after-stall behavior.',
    chunkDelayMin: 42,
    chunkDelayMax: 180,
    chunkSizeMin: 1,
    chunkSizeMax: 6,
    burstiness: 68,
  },
]

export function getStreamPreset(id: StreamPresetId | string | null | undefined) {
  return STREAM_PRESETS.find(preset => preset.id === id) ?? null
}

export function findMatchingStreamPreset(values: StreamPresetValues) {
  return STREAM_PRESETS.find(preset =>
    preset.chunkDelayMin === values.chunkDelayMin
    && preset.chunkDelayMax === values.chunkDelayMax
    && preset.chunkSizeMin === values.chunkSizeMin
    && preset.chunkSizeMax === values.chunkSizeMax
    && preset.burstiness === values.burstiness,
  ) ?? null
}
