import { For, Show } from 'solid-js'

export function StreamSpeedPanel(props: {
  mode: 'tps' | 'chunks'
  targetTps: number
  actualTps: number
  totalTokens: number
  elapsedMs: number
  progress: number
  isStreaming: boolean
  isPaused: boolean
  smoothStreaming: boolean
  onMode: (mode: 'tps' | 'chunks') => void
  onSpeed: (speed: number) => void
}) {
  return (
    <section class="speed-panel" aria-label="Stream speed comparison">
      <div class="speed-panel__heading">
        <div>
          <h2>Stream simulator</h2>
          <p>Same Markdown. Different delivery speeds.</p>
        </div>
        <div class="speed-mode" role="group" aria-label="Simulation mode">
          <button aria-pressed={props.mode === 'tps'} onClick={() => props.onMode('tps')}>Estimated TPS</button>
          <button aria-pressed={props.mode === 'chunks'} onClick={() => props.onMode('chunks')}>Random chunks</button>
        </div>
      </div>
      <Show when={props.mode === 'tps'} fallback={<p class="speed-panel__note">Vary chunk sizes and delays in Controls. Stream settings apply when you replay.</p>}>
        <div class="speed-presets" role="group" aria-label="Target speed presets">
          <For each={[100, 200, 300, 500, 1000]}>
            {speed => (
              <button aria-pressed={props.targetTps === speed} aria-label={`${speed} estimated TPS`} onClick={() => props.onSpeed(speed)}>
                <span class="speed-presets__rate">
                  {speed}
                  {' '}
                  <small>TPS</small>
                </span>
                <span class="speed-presets__time">
                  ~
                  {(props.totalTokens / speed).toFixed(1)}
                  s
                  {' '}
                  <span class="speed-presets__total">total</span>
                </span>
              </button>
            )}
          </For>
        </div>
        <div class="speed-custom">
          <label for="custom-tps">Custom speed</label>
          <div class="speed-custom__input">
            <input
              id="custom-tps"
              value={props.targetTps}
              type="number"
              min="1"
              max="2000"
              step="1"
              onChange={(event) => {
                const value = event.currentTarget.valueAsNumber
                if (Number.isFinite(value))
                  props.onSpeed(Math.round(Math.min(2000, Math.max(1, value))))
                event.currentTarget.value = String(props.targetTps)
              }}
            />
            <span>TPS</span>
          </div>
          <span class="speed-custom__hint">Select a speed to replay from the start.</span>
        </div>
        <dl class="speed-metrics">
          <div class="speed-metrics__target">
            <dt>Target input</dt>
            <dd>
              {props.targetTps}
              {' '}
              <small>TPS</small>
            </dd>
          </div>
          <div>
            <dt>Average input</dt>
            <dd>
              {props.actualTps.toFixed(0)}
              {' '}
              <small>TPS</small>
            </dd>
          </div>
          <div>
            <dt>Active time</dt>
            <dd>
              {(props.elapsedMs / 1000).toFixed(1)}
              {' '}
              <small>s</small>
            </dd>
          </div>
          <div>
            <dt>Input sent</dt>
            <dd>
              {Math.floor(props.progress)}
              <small>%</small>
            </dd>
          </div>
        </dl>
        <div class="speed-status">
          <span class="speed-status__state" role="status">
            <span class="speed-status__dot" classList={{ 'speed-status__dot--active': props.isStreaming && !props.isPaused }} />
            {props.isStreaming ? props.isPaused ? 'Input paused' : 'Sending input' : props.progress >= 100 ? 'Input complete' : 'Ready'}
          </span>
          <span>{props.smoothStreaming ? 'Smoothing on: display may trail input.' : 'Smoothing off: displaying incoming chunks.'}</span>
        </div>
        <p class="speed-panel__note">Visual approximation: 1 token = 4 Unicode characters. These are input rates, not model benchmarks or rendering FPS.</p>
      </Show>
    </section>
  )
}
