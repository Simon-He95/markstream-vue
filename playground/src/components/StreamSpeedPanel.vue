<script setup lang="ts">
const props = defineProps<{
  mode: 'tps' | 'chunks'
  targetTps: number
  actualTps: number
  totalTokens: number
  elapsedMs: number
  progress: number
  isStreaming: boolean
  isPaused: boolean
  smoothStreaming: boolean
}>()

const emit = defineEmits<{
  mode: [value: 'tps' | 'chunks']
  speed: [value: number]
}>()

const speeds = [100, 200, 300, 500, 1000]

function applyCustomSpeed(event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (input.value && Number.isFinite(value))
    emit('speed', Math.round(Math.min(2000, Math.max(1, value))))
  input.value = String(props.targetTps)
}
</script>

<template>
  <section class="speed-panel" aria-label="Stream speed comparison">
    <div class="speed-panel__heading">
      <div>
        <h2>Stream simulator</h2>
        <p>Same Markdown. Different delivery speeds.</p>
      </div>
      <div class="speed-mode" role="group" aria-label="Simulation mode">
        <button :aria-pressed="mode === 'tps'" @click="emit('mode', 'tps')">
          Estimated TPS
        </button>
        <button :aria-pressed="mode === 'chunks'" @click="emit('mode', 'chunks')">
          Random chunks
        </button>
      </div>
    </div>

    <template v-if="mode === 'tps'">
      <div class="speed-presets" role="group" aria-label="Target speed presets">
        <button
          v-for="speed in speeds"
          :key="speed"
          :aria-pressed="targetTps === speed"
          :aria-label="`${speed} estimated TPS`"
          @click="emit('speed', speed)"
        >
          <span class="speed-presets__rate">{{ speed }} <small>TPS</small></span>
          <span class="speed-presets__time">~{{ (totalTokens / speed).toFixed(1) }}s <span class="speed-presets__total">total</span></span>
        </button>
      </div>

      <div class="speed-custom">
        <label for="custom-tps">Custom speed</label>
        <div class="speed-custom__input">
          <input id="custom-tps" :value="targetTps" type="number" min="1" max="2000" step="1" @change="applyCustomSpeed">
          <span>TPS</span>
        </div>
        <span class="speed-custom__hint">Select a speed to replay from the start.</span>
      </div>

      <dl class="speed-metrics">
        <div class="speed-metrics__target">
          <dt>Target input</dt>
          <dd>{{ targetTps }} <small>TPS</small></dd>
        </div>
        <div>
          <dt>Average input</dt>
          <dd>{{ actualTps.toFixed(0) }} <small>TPS</small></dd>
        </div>
        <div>
          <dt>Active time</dt>
          <dd>{{ (elapsedMs / 1000).toFixed(1) }} <small>s</small></dd>
        </div>
        <div>
          <dt>Input sent</dt>
          <dd>{{ Math.floor(progress) }}<small>%</small></dd>
        </div>
      </dl>

      <div class="speed-status">
        <span class="speed-status__state" role="status">
          <span class="speed-status__dot" :class="{ 'speed-status__dot--active': isStreaming && !isPaused }" />
          {{ isStreaming ? (isPaused ? 'Input paused' : 'Sending input') : (progress >= 100 ? 'Input complete' : 'Ready') }}
        </span>
        <span>{{ smoothStreaming ? 'Smoothing on: display may trail input.' : 'Smoothing off: displaying incoming chunks.' }}</span>
      </div>
      <p class="speed-panel__note">
        Visual approximation: 1 token = 4 Unicode characters. These are input rates, not model benchmarks or rendering FPS.
      </p>
    </template>
    <p v-else class="speed-panel__note">
      Vary chunk sizes and delays in Controls. Stream settings apply when you replay.
    </p>
  </section>
</template>

<style scoped>
.speed-panel {
  padding: 18px 22px;
  border-bottom: 1px solid var(--speed-border);
  color: var(--speed-text);
  font-family: var(--play-font-display, 'Space Grotesk', sans-serif);
}

.speed-panel__heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

h2 { margin: 0; font-size: 0.92rem; font-weight: 700; letter-spacing: -0.02em; }
.speed-panel__heading p { margin: 3px 0 0; font-size: 0.72rem; color: var(--speed-muted); }

.speed-mode {
  display: flex;
  flex-shrink: 0;
  gap: 3px;
  padding: 3px;
  border-radius: 11px;
  border: 1px solid var(--speed-border);
  background: var(--speed-subtle);
}

button { cursor: pointer; font: inherit; transition: background-color 0.18s, border-color 0.18s, color 0.18s, transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--speed-accent); outline-offset: 3px; }
button:active { transform: scale(0.96); }
.speed-mode button { padding: 6px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--speed-muted); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.02em; white-space: nowrap; }
.speed-mode button[aria-pressed="true"] { background: var(--speed-surface); color: var(--speed-accent); box-shadow: 0 1px 6px rgb(15 23 42 / 0.1), inset 0 0 0 1px var(--speed-border); }

.speed-presets { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.speed-presets button { display: grid; gap: 4px; padding: 11px 13px; text-align: left; border: 1px solid var(--speed-border); border-radius: 12px; background: var(--speed-surface); color: var(--speed-text); }
.speed-presets button:hover { transform: translateY(-2px); border-color: var(--speed-accent); box-shadow: 0 8px 20px rgb(13 148 136 / 0.14); }
.speed-presets button[aria-pressed="true"] { border-color: transparent; background: linear-gradient(140deg, var(--play-accent, #0d9488), #0e7490); color: #f0fdfa; box-shadow: 0 8px 22px rgb(13 148 136 / 0.3), inset 0 1px 0 rgb(255 255 255 / 0.22); }
.speed-presets__rate { font-family: var(--play-font-mono, 'JetBrains Mono', monospace); font-size: 1.02rem; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.speed-presets__rate small { font-size: 0.58rem; font-weight: 500; letter-spacing: 0.06em; color: var(--speed-muted); }
.speed-presets__time { font-family: var(--play-font-mono, 'JetBrains Mono', monospace); font-size: 0.64rem; color: var(--speed-muted); font-variant-numeric: tabular-nums; }
.speed-presets button[aria-pressed="true"] .speed-presets__rate small,
.speed-presets button[aria-pressed="true"] .speed-presets__time { color: #ccfbf1; }

.speed-custom { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 0.7rem; color: var(--speed-muted); }
.speed-custom__input { display: flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--speed-border); border-radius: 9px; background: var(--speed-surface); transition: border-color 0.18s; }
.speed-custom__input:focus-within { border-color: var(--speed-accent); }
.speed-custom input { width: 58px; border: 0; padding: 0; font-family: var(--play-font-mono, 'JetBrains Mono', monospace); font-size: 0.74rem; color: var(--speed-text); background: transparent; font-variant-numeric: tabular-nums; }
.speed-custom__input span { font-size: 0.6rem; letter-spacing: 0.06em; }
.speed-custom__hint { margin-left: auto; font-size: 0.65rem; }

.speed-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 14px 0 12px; padding: 13px 14px; border-radius: 12px; border: 1px solid var(--speed-border); background: var(--speed-subtle); }
.speed-metrics > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 8px; }
dt { font-size: 0.62rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--speed-muted); }
dd { margin: 0; font-family: var(--play-font-mono, 'JetBrains Mono', monospace); font-size: 0.92rem; font-weight: 600; font-variant-numeric: tabular-nums; }
dd small { font-size: 0.58rem; font-weight: 500; letter-spacing: 0.06em; color: var(--speed-muted); }
.speed-metrics__target dd { color: var(--speed-accent); }

.speed-status { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px 16px; font-size: 0.65rem; color: var(--speed-muted); }
.speed-status__state { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; color: var(--speed-text); }
.speed-status__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--speed-muted); }
.speed-status__dot--active { background: var(--speed-accent); animation: speedPulse 1.6s ease-out infinite; }
@keyframes speedPulse {
  0% { box-shadow: 0 0 0 0 rgb(20 184 166 / 0.4); }
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
.speed-panel__note { margin: 9px 0 0; font-size: 0.65rem; line-height: 1.55; color: var(--speed-muted); }

@media (max-width: 640px) {
  .speed-panel { padding: 14px 16px; }
  .speed-panel__heading { align-items: flex-start; flex-direction: column; gap: 10px; }
  .speed-mode { width: 100%; }
  .speed-mode button { flex: 1; min-height: 36px; }
  .speed-presets { gap: 5px; }
  .speed-presets button { padding: 10px 5px; text-align: center; }
  .speed-presets__rate { font-size: 0.95rem; }
  .speed-presets__rate small, .speed-presets__total { display: none; }
  .speed-presets__time { font-size: 0.62rem; }
  .speed-custom { flex-wrap: wrap; }
  .speed-custom__hint { width: 100%; margin: 0; }
  .speed-metrics { gap: 8px; padding: 10px; }
  .speed-metrics > div { display: block; }
  dt { font-size: 0.58rem; min-height: 2.6em; }
  dd { margin-top: 3px; font-size: 0.85rem; }
  dd small { font-size: 0.55rem; }
}

@media (prefers-reduced-motion: reduce) {
  button { transition: none; }
  .speed-status__dot--active { animation: none; }
}
</style>
