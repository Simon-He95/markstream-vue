import type { ElementRef, OnDestroy, OnInit, Type } from '@angular/core'
import type { SafeResourceUrl } from '@angular/platform-browser'
import type { TestLabFrameworkId, TestLabSampleId } from '../../playground-shared/testLabFixtures'
import type { TestPageViewMode } from '../../playground-shared/testPageState'
import type { SandboxFrameworkId, SandboxRenderSource } from '../../playground-shared/versionSandbox'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, EventEmitter, inject, Output, signal, ViewChild } from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import {
  CodeBlockNode,
  disableKatex,
  disableMermaid,
  enableKatex,
  enableMermaid,
  isKatexEnabled,
  isMermaidEnabled,
  MarkstreamAngularComponent,
  PreCodeNode,
} from 'markstream-angular'
import { resolveMarkdownTextareaPaste } from '../../playground-shared/markdownPaste'
import { TEST_LAB_FRAMEWORKS, TEST_LAB_SAMPLES } from '../../playground-shared/testLabFixtures'
import { buildTestPageHref, decodeMarkdownHash, resolveFrameworkTestHref, resolveTestPageViewMode, withMarkdownHash } from '../../playground-shared/testPageState'
import {
  buildTestSandboxHref,
  normalizeSandboxSource,
  resolveSandboxSelection,

} from '../../playground-shared/versionSandbox'
import { testSandboxFrameworks } from './testSandboxConfig'
import { ThinkingNodeComponent } from './thinking-node.component'

type SampleId = TestLabSampleId
type FrameworkId = TestLabFrameworkId
type RenderMode = 'stream-diffs' | 'pre' | 'markdown'
type NoticeType = 'success' | 'error' | 'info'

const CURRENT_FRAMEWORK: FrameworkId = 'angular'
const DARK_MODE_KEY = 'vmr-test-dark'
const MAX_URL_LEN = 2000

function readStoredString(key: string, fallback: string) {
  if (typeof window === 'undefined')
    return fallback
  const value = window.localStorage.getItem(key)
  return value == null || value === '' ? fallback : value
}

function readStoredNumber(key: string, fallback: number) {
  const value = Number(readStoredString(key, String(fallback)))
  return Number.isFinite(value) ? value : fallback
}

function readStoredBoolean(key: string, fallback: boolean) {
  const value = readStoredString(key, fallback ? '1' : '0')
  if (value === 'true' || value === '1')
    return true
  if (value === 'false' || value === '0')
    return false
  return fallback
}

function persistStoredValue(key: string, value: string | number | boolean) {
  if (typeof window === 'undefined')
    return
  const normalized = typeof value === 'boolean'
    ? (value ? '1' : '0')
    : String(value)
  window.localStorage.setItem(key, normalized)
}

function clampInt(value: number, min: number, max: number, fallback: number) {
  const normalized = Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, normalized))
}

function readTextInput(event: Event, fallback = '') {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value ?? fallback
}

function readCheckedInput(event: Event, fallback = false) {
  return (event.target as HTMLInputElement | null)?.checked ?? fallback
}

function normalizeRenderMode(value: string | null | undefined): RenderMode {
  return value === 'pre' || value === 'markdown' ? value : 'stream-diffs'
}

function normalizeSampleId(value: string | null | undefined): SampleId {
  return TEST_LAB_SAMPLES.some(sample => sample.id === value)
    ? value as SampleId
    : 'baseline'
}

function buildIssueUrl(text: string) {
  const base = 'https://github.com/Simon-He95/markstream-vue/issues/new?template=bug_report.yml'
  const body = `**Reproduction input**:\n\nPlease find the reproduction input below:\n\n\`\`\`markdown\n${text}\n\`\`\``
  return `${base}&body=${encodeURIComponent(body)}`
}

function basePageUrl() {
  const url = new URL(window.location.href)
  url.hash = ''
  url.search = ''
  return url.toString()
}

@Component({
  selector: 'app-angular-test-page',
  standalone: true,
  imports: [CommonModule, MarkstreamAngularComponent],
  template: `
    <div
      class="test-lab"
      [class.test-lab--dark]="isDark()"
      [class.dark]="isDark()"
      [class.test-lab--share-preview]="isSharePreviewMode()"
    >
      <div *ngIf="!isSharePreviewMode()" class="test-lab__glow test-lab__glow--cyan"></div>
      <div *ngIf="!isSharePreviewMode()" class="test-lab__glow test-lab__glow--amber"></div>

      <div class="test-lab__shell" [class.test-lab__shell--share-preview]="isSharePreviewMode()">
        <section *ngIf="!isSharePreviewMode()" class="hero-panel">
          <div class="hero-panel__copy">
            <span class="eyebrow">Cross-framework regression lab</span>
            <h1>markstream-angular /test</h1>
            <p>
              用同一份 markdown，快速对照 Vue 3、Vue 2、React 和 Angular 的渲染行为。
              现在这里也带上了分享、版本沙箱和跨框架切页入口。
            </p>
          </div>

          <div class="hero-panel__actions">
            <div class="hero-panel__status-row">
              <span class="mini-pill">Angular</span>
              <span class="mini-pill" [class.mini-pill--active]="isStreaming()">
                {{ streamStatusLabel() }}
              </span>
              <span class="mini-pill">{{ renderModeLabel() }}</span>
              <span class="mini-pill" [class.mini-pill--active]="!sandboxDirty()">
                沙箱{{ sandboxStatusLabel() }}
              </span>
            </div>

            <div class="hero-panel__metrics">
              <div class="metric-card">
                <span>当前框架</span>
                <strong>Angular</strong>
              </div>
              <div class="metric-card">
                <span>字符数</span>
                <strong>{{ charCount() }}</strong>
              </div>
              <div class="metric-card">
                <span>行数</span>
                <strong>{{ lineCount() }}</strong>
              </div>
              <div class="metric-card">
                <span>预览进度</span>
                <strong>{{ progress() }}%</strong>
              </div>
            </div>
          </div>

          <div class="framework-switcher">
            <a
              *ngFor="let framework of frameworkCards"
              class="framework-chip"
              [class.framework-chip--current]="framework.id === currentFramework"
              [href]="frameworkHref(framework.id)"
            >
              <span class="framework-chip__label">{{ framework.label }}</span>
              <span class="framework-chip__note">{{ framework.note }}</span>
            </a>
          </div>
        </section>

        <div class="lab-layout" [class.lab-layout--share-preview]="isSharePreviewMode()">
          <section *ngIf="!isSharePreviewMode()" class="panel-card panel-card--samples">
              <div class="panel-card__head">
                <div>
                  <h2>样例</h2>
                  <p>快速切换不同的回归场景。</p>
                </div>
                <span class="mini-pill">{{ activeSample().title }}</span>
              </div>

              <div class="sample-list">
                <button
                  *ngFor="let sample of sampleCards"
                  type="button"
                  class="sample-card"
                  [class.sample-card--active]="sample.id === selectedSampleId()"
                  (click)="applySample(sample.id)"
                >
                  <strong>{{ sample.title }}</strong>
                  <span>{{ sample.summary }}</span>
                </button>
              </div>
          </section>

          <section *ngIf="!isSharePreviewMode()" class="panel-card panel-card--stream">
              <div class="panel-card__head">
                <div>
                  <h2>流式控制</h2>
                  <p>主卡片只保留流式摘要，详细参数放到更多设置里。</p>
                </div>
                <button type="button" class="ghost-button" (click)="openStreamSettingsDialog()">
                  更多设置
                </button>
              </div>

              <div class="stream-summary">
                <div class="stream-summary__row">
                  <span class="mini-pill mini-pill--active">{{ renderModeLabel() }}</span>
                  <span class="mini-pill" [class.mini-pill--active]="isStreaming()">
                    {{ streamStatusLabel() }}
                  </span>
                  <span class="mini-pill mini-pill--active">{{ streamFeatureSummaryLabel() }}</span>
                </div>

                <div class="stream-summary__row stream-summary__row--dense">
                  <span class="stream-summary__item">Chunk {{ streamSpeed() }} chars</span>
                  <span class="stream-summary__item">Delay {{ streamInterval() }}ms</span>
                  <span class="stream-summary__item" [class.stream-summary__item--active]="codeBlockStream()">
                    代码块流式
                  </span>
                  <span class="stream-summary__item" [class.stream-summary__item--active]="debugParse()">
                    {{ debugParse() ? '解析树 debug' : '正常解析' }}
                  </span>
                </div>
              </div>

              <div class="control-actions control-actions--stream-bar">
                <button type="button" class="action-button action-button--primary" (click)="toggleStreamRender()">
                  {{ isStreaming() ? '停止流式渲染' : '开始流式渲染' }}
                </button>
                <button type="button" class="action-button" (click)="resetEditor()">
                  重置样例
                </button>
                <button type="button" class="action-button" (click)="clearEditor()">
                  清空输入
                </button>
                <button type="button" class="action-button" (click)="navigateHome.emit()">
                  返回主 demo
                </button>
              </div>

              <div class="progress-block">
                <div class="progress-track">
                  <div class="progress-fill" [style.width.%]="progress()"></div>
                </div>
                <div class="progress-meta">
                  <span>{{ previewContent().length }} / {{ input().length || 0 }}</span>
                  <span>{{ isStreaming() ? 'Streaming' : 'Static preview' }}</span>
                </div>
              </div>
          </section>

          <section *ngIf="!isSharePreviewMode()" class="panel-card panel-card--share">
              <div class="panel-card__head">
                <div>
                  <h2>分享与排障</h2>
                  <p>把当前输入直接带给别人复现。</p>
                </div>
              </div>

              <div class="share-actions">
                <button type="button" class="action-button action-button--primary" [disabled]="isWorking()" (click)="generateAndCopy()">
                  {{ isCopied() ? '已复制分享链接' : (isWorking() ? '生成中...' : '复制分享链接') }}
                </button>
                <button type="button" class="action-button" (click)="copyRawInput()">
                  复制 Issue 链接
                </button>
                <button type="button" class="action-button" (click)="openIssueInNewTab()">
                  打开 Issue
                </button>
              </div>

              <div class="meta-list">
                <div class="meta-list__row">
                  <span>当前视图</span>
                  <strong>{{ renderModeLabel() }}</strong>
                </div>
                <div class="meta-list__row">
                  <span>分享地址</span>
                  <strong>{{ shareUrl() || '尚未生成' }}</strong>
                </div>
              </div>

              <div *ngIf="tooLong()" class="info-banner info-banner--warning">
                当前内容过长，建议使用 Issue 链接分享完整输入。
              </div>
              <div *ngIf="notice()" class="info-banner" [class.info-banner--success]="noticeType() === 'success'" [class.info-banner--error]="noticeType() === 'error'" [class.info-banner--info]="noticeType() === 'info'">
                {{ notice() }}
              </div>
          </section>

          <section class="workspace-grid" [class.workspace-grid--share-preview]="isSharePreviewMode()">
            <article *ngIf="!isSharePreviewMode()" class="workspace-card workspace-card--pane workspace-card--editor">
              <header class="workspace-card__head">
                <div>
                  <h2>Markdown 输入</h2>
                  <p>左侧编辑，右侧马上验证渲染结果。</p>
                </div>
                <span class="mini-pill">Live editor</span>
              </header>

              <textarea
                class="editor-textarea"
                spellcheck="false"
                placeholder="在这里粘贴你的复现 markdown..."
                [value]="input()"
                (input)="updateInput($event)"
                (paste)="handleEditorPaste($event)"
              ></textarea>

              <footer class="workspace-card__foot">
                <span>可直接粘贴 issue 复现内容</span>
                <span>{{ charCount() }} chars</span>
              </footer>
            </article>

            <article
              #previewCardRef
              class="workspace-card workspace-card--pane workspace-card--preview"
              [class.workspace-card--share-preview]="isSharePreviewMode()"
            >
              <div *ngIf="showImmersivePreviewControls()" class="preview-immersive-shell">
                <div class="preview-immersive-toolbar">
                  <button type="button" class="ghost-button preview-immersive-toolbar__button" (click)="returnToEditableTestPage()">
                    {{ immersiveBackLabel() }}
                  </button>
                  <button type="button" class="ghost-button preview-immersive-toolbar__button" (click)="toggleAppearance()">
                    {{ previewThemeButtonLabel() }}
                  </button>
                  <button
                    *ngIf="!isSharePreviewMode()"
                    type="button"
                    class="ghost-button preview-immersive-toolbar__button"
                    (click)="togglePreviewFullscreen()"
                  >
                    {{ isPreviewFullscreen() ? '退出全屏' : '全屏预览' }}
                  </button>
                </div>
              </div>

              <header *ngIf="!isSharePreviewMode()" class="workspace-card__head">
                <div>
                  <h2>实时预览</h2>
                  <p>
                    {{
                      (isStreaming() ? 'Streaming 中' : '已显示完整输入')
                      + (isPreviewFullscreen() ? ' · 按 Esc 退出全屏' : '')
                    }}
                  </p>
                </div>
                <div class="workspace-card__head-actions">
                  <button type="button" class="ghost-button" (click)="toggleAppearance()">
                    {{ previewThemeButtonLabel() }}
                  </button>
                  <button type="button" class="ghost-button" (click)="generateAndCopyPreview()">
                    {{ previewShareCopied() ? '已复制预览链接' : '复制预览链接' }}
                  </button>
                  <button type="button" class="ghost-button" (click)="togglePreviewFullscreen()">
                    {{ isPreviewFullscreen() ? '退出全屏' : '全屏预览' }}
                  </button>
                  <span class="mini-pill" [class.mini-pill--active]="isStreaming()">
                    {{ streamStatusLabel() }}
                  </span>
                </div>
              </header>

              <div class="preview-surface">
                <markstream-angular
                  [content]="previewContent()"
                  [final]="!isStreaming()"
                  [isDark]="isDark()"
                  [codeBlockDarkTheme]="'vitesse-dark'"
                  [codeBlockLightTheme]="'vitesse-light'"
                  [viewportPriority]="viewportPriority()"
                  [batchRendering]="batchRendering()"
                  [typewriter]="typewriter()"
                  [codeBlockStream]="codeBlockStream()"
                  [renderCodeBlocksAsPre]="renderMode() === 'pre'"
                  [parseOptions]="parseOptions()"
                  [customHtmlTags]="thinkingTags"
                  [customComponents]="customComponents()"
                />
              </div>

              <footer *ngIf="!isSharePreviewMode()" class="workspace-card__foot">
                <span>{{ previewContent().length }} / {{ input().length || 0 }}</span>
                <span>{{ isStreaming() ? renderModeLabel() + ' · Streaming 中' : 'Angular renderer' }}</span>
              </footer>
            </article>
          </section>

          <section *ngIf="!isSharePreviewMode()" class="sandbox-grid">
            <section class="panel-card panel-card--sandbox">
              <div class="panel-card__head">
                <div>
                  <h2>版本沙箱</h2>
                  <p>指定 framework、source 和包版本，在独立 iframe 里对照渲染器。</p>
                </div>
                <span class="mini-pill">{{ sandboxStatusLabel() }}</span>
              </div>

              <div class="control-stack">
                <label class="select-control">
                  <span>目标框架</span>
                  <select [value]="sandboxFrameworkId()" (change)="updateSandboxFramework($event)">
                    <option
                      *ngFor="let framework of sandboxFrameworks"
                      [value]="framework.id"
                    >
                      {{ framework.label }}
                    </option>
                  </select>
                </label>

                <div class="segmented-control">
                  <button
                    type="button"
                    class="segmented-control__button"
                    [class.segmented-control__button--active]="activeSandbox().source === 'workspace'"
                    [disabled]="!activeSandboxFramework().supportsWorkspace"
                    (click)="chooseSandboxSource('workspace')"
                  >
                    workspace
                  </button>
                  <button
                    type="button"
                    class="segmented-control__button"
                    [class.segmented-control__button--active]="activeSandbox().source === 'npm'"
                    (click)="chooseSandboxSource('npm')"
                  >
                    npm
                  </button>
                </div>

                <div class="preset-list">
                  <button
                    *ngFor="let version of sandboxQuickVersions()"
                    type="button"
                    class="preset-chip"
                    [class.preset-chip--active]="sandboxVersion() === version"
                    (click)="chooseSandboxVersion(version)"
                  >
                    {{ version }}
                  </button>
                </div>

                <label class="text-control">
                  <span>包版本</span>
                  <input
                    type="text"
                    [value]="sandboxVersion()"
                    [placeholder]="sandboxVersionPlaceholder()"
                    (input)="updateSandboxVersion($event)"
                  >
                </label>

                <label class="toggle-item">
                  <span>输入变化自动同步到 iframe</span>
                  <input type="checkbox" [checked]="sandboxAutoSync()" (change)="updateSandboxAutoSync($event)">
                </label>
              </div>

              <div class="control-actions control-actions--stacked">
                <button type="button" class="action-button action-button--primary" (click)="syncSandbox()">
                  刷新沙箱
                </button>
                <button type="button" class="action-button" (click)="openSandboxInNewTab()">
                  独立打开
                </button>
              </div>

              <div class="meta-list">
                <div class="meta-list__row">
                  <span>渲染目标</span>
                  <strong>{{ sandboxPackageLabel() }}</strong>
                </div>
                <div class="meta-list__row">
                  <span>运行时</span>
                  <strong>{{ sandboxRuntimeLabel() }}</strong>
                </div>
              </div>

              <div *ngIf="!activeSandboxFramework().supportsWorkspace" class="info-banner info-banner--info">
                {{ activeSandboxFramework().label }} 在这个沙箱里先走 npm 包模式；本地 workspace 对照仍可用上方 framework 切页。
              </div>
              <div *ngIf="sandboxDirty()" class="info-banner info-banner--warning">
                右侧 iframe 还没同步最新输入，点“刷新沙箱”即可用当前 markdown 重载。
              </div>
            </section>

            <article class="workspace-card workspace-card--full workspace-card--sandbox-preview">
              <header class="workspace-card__head">
                <div>
                  <h2>版本沙箱预览</h2>
                  <p>独立 iframe，真正按 framework 与版本重新挂载渲染器。</p>
                </div>
                <span class="mini-pill" [class.mini-pill--active]="!sandboxDirty()">
                  {{ sandboxStatusLabel() }}
                </span>
              </header>

              <div class="sandbox-frame-shell">
                <iframe
                  class="sandbox-frame"
                  [src]="sandboxFrameSrcSafe()"
                  title="Markstream version sandbox"
                  loading="lazy"
                ></iframe>
              </div>

              <footer class="workspace-card__foot">
                <span>{{ sandboxPackageLabel() }}</span>
                <span>{{ sandboxDirty() ? '等待手动同步' : '已加载当前输入快照' }}</span>
              </footer>
            </article>
          </section>
        </div>

        <dialog *ngIf="!isSharePreviewMode()" #streamSettingsDialogRef class="settings-dialog">
          <div class="settings-dialog__panel">
            <header class="settings-dialog__head">
              <div>
                <h2>流式详细设置</h2>
                <p>这里调整节奏、代码块模式和渲染增强开关。</p>
              </div>
              <button type="button" class="ghost-button" (click)="closeStreamSettingsDialog()">
                关闭
              </button>
            </header>

            <div class="control-stack control-stack--dialog">
              <label class="range-control">
                <span>每次追加字符数</span>
                <strong>{{ streamSpeed() }}</strong>
                <input
                  type="range"
                  min="1"
                  max="80"
                  [value]="streamSpeed()"
                  (input)="updateStreamSpeed($event)"
                >
              </label>

              <label class="range-control">
                <span>更新时间间隔</span>
                <strong>{{ streamInterval() }}ms</strong>
                <input
                  type="range"
                  min="8"
                  max="300"
                  step="4"
                  [value]="streamInterval()"
                  (input)="updateStreamInterval($event)"
                >
              </label>

              <label class="select-control">
                <span>代码块模式</span>
                <select [value]="renderMode()" (change)="updateRenderMode($event)">
                  <option value="stream-diffs">Stream Diffs</option>
                  <option value="markdown">CodeBlockNode</option>
                  <option value="pre">PreCodeNode</option>
                </select>
              </label>

              <div class="toggle-grid">
                <label class="toggle-item">
                  <span>代码块流式渲染</span>
                  <input type="checkbox" [checked]="codeBlockStream()" (change)="updateCodeBlockStream($event)">
                </label>
                <label class="toggle-item">
                  <span>viewportPriority</span>
                  <input type="checkbox" [checked]="viewportPriority()" (change)="updateViewportPriority($event)">
                </label>
                <label class="toggle-item">
                  <span>batchRendering</span>
                  <input type="checkbox" [checked]="batchRendering()" (change)="updateBatchRendering($event)">
                </label>
                <label class="toggle-item">
                  <span>typewriter</span>
                  <input type="checkbox" [checked]="typewriter()" (change)="updateTypewriter($event)">
                </label>
                <label class="toggle-item">
                  <span>KaTeX</span>
                  <input type="checkbox" [checked]="mathEnabled()" (change)="updateMathEnabled($event)">
                </label>
                <label class="toggle-item">
                  <span>Mermaid</span>
                  <input type="checkbox" [checked]="mermaidEnabled()" (change)="updateMermaidEnabled($event)">
                </label>
                <label class="toggle-item">
                  <span>解析树 debug</span>
                  <input type="checkbox" [checked]="debugParse()" (change)="updateDebugParse($event)">
                </label>
              </div>
            </div>
          </div>
        </dialog>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestPageComponent implements OnInit, OnDestroy {
  @Output() readonly navigateHome = new EventEmitter<void>()
  @ViewChild('streamSettingsDialogRef') private streamSettingsDialogRef?: ElementRef<HTMLDialogElement>
  @ViewChild('previewCardRef') private previewCardRef?: ElementRef<HTMLElement>
  private readonly domSanitizer = inject(DomSanitizer)

  readonly currentFramework: FrameworkId = CURRENT_FRAMEWORK
  readonly frameworkCards = TEST_LAB_FRAMEWORKS
  readonly sampleCards = TEST_LAB_SAMPLES
  readonly sandboxFrameworks = testSandboxFrameworks
  readonly thinkingTags = ['thinking'] as const

  readonly selectedSampleId = signal<SampleId>(normalizeSampleId(readStoredString('vmr-test-sample', 'baseline')))
  readonly input = signal(this.resolveInitialSample().content)
  readonly viewMode = signal<TestPageViewMode>('lab')
  readonly isDark = signal(readStoredString(DARK_MODE_KEY, 'light') === 'dark')
  readonly isPreviewFullscreen = signal(false)
  readonly previewShareCopied = signal(false)
  readonly streamContent = signal('')
  readonly isStreaming = signal(false)
  readonly streamSpeed = signal(clampInt(readStoredNumber('vmr-test-stream-speed', 4), 1, 80, 4))
  readonly streamInterval = signal(clampInt(readStoredNumber('vmr-test-stream-interval', 24), 8, 300, 24))
  readonly renderMode = signal<RenderMode>(normalizeRenderMode(readStoredString('vmr-test-render-mode', 'stream-diffs')))
  readonly codeBlockStream = signal(readStoredBoolean('vmr-test-code-stream', true))
  readonly viewportPriority = signal(readStoredBoolean('vmr-test-viewport-priority', true))
  readonly batchRendering = signal(readStoredBoolean('vmr-test-batch-rendering', true))
  readonly typewriter = signal(readStoredBoolean('vmr-test-typewriter', true))
  readonly debugParse = signal(readStoredBoolean('vmr-test-debug-parse', false))
  readonly mathEnabled = signal(readStoredBoolean('vmr-test-math-enabled', isKatexEnabled()))
  readonly mermaidEnabled = signal(readStoredBoolean('vmr-test-mermaid-enabled', isMermaidEnabled()))

  readonly shareUrl = signal('')
  readonly tooLong = signal(false)
  readonly notice = signal('')
  readonly noticeType = signal<NoticeType>('success')
  readonly isWorking = signal(false)
  readonly isCopied = signal(false)
  readonly issueUrl = signal('')

  readonly sandboxFrameworkId = signal<SandboxFrameworkId>(resolveSandboxSelection(testSandboxFrameworks, {
    frameworkId: readStoredString('vmr-test-sandbox-framework', 'angular'),
    source: readStoredString('vmr-test-sandbox-source', 'workspace'),
    version: readStoredString('vmr-test-sandbox-version', ''),
  }).frameworkId)

  readonly sandboxSource = signal<SandboxRenderSource>(resolveSandboxSelection(testSandboxFrameworks, {
    frameworkId: this.sandboxFrameworkId(),
    source: readStoredString('vmr-test-sandbox-source', 'workspace'),
  }).source)

  readonly sandboxVersion = signal(resolveSandboxSelection(testSandboxFrameworks, {
    frameworkId: this.sandboxFrameworkId(),
    source: this.sandboxSource(),
    version: readStoredString('vmr-test-sandbox-version', ''),
  }).version)

  readonly sandboxAutoSync = signal(readStoredBoolean('vmr-test-sandbox-auto-sync', false))
  readonly sandboxSnapshot = signal(this.input())
  readonly sandboxRefreshNonce = signal(0)

  readonly activeSample = computed(() => this.sampleCards.find(sample => sample.id === this.selectedSampleId()) ?? this.sampleCards[0])
  readonly previewContent = computed(() => this.isStreaming() ? this.streamContent() : this.input())
  readonly progress = computed(() => {
    if (!this.input().length)
      return 0
    return Math.min(100, Math.round((this.previewContent().length / this.input().length) * 100))
  })

  readonly charCount = computed(() => this.input().length)
  readonly lineCount = computed(() => this.input() ? this.input().split('\n').length : 0)
  readonly streamStatusLabel = computed(() => this.isStreaming() ? 'Streaming' : 'Ready')
  readonly isSharePreviewMode = computed(() => this.viewMode() === 'preview')
  readonly showImmersivePreviewControls = computed(() => this.isSharePreviewMode() || this.isPreviewFullscreen())
  readonly immersiveBackLabel = computed(() => this.isSharePreviewMode() ? '打开 Test Page' : '返回编辑')
  readonly previewThemeButtonLabel = computed(() => this.isDark() ? '切换浅色' : '切换暗色')
  readonly renderModeLabel = computed(() => {
    if (this.renderMode() === 'markdown')
      return 'CodeBlockNode'
    if (this.renderMode() === 'pre')
      return 'PreCodeNode'
    return 'Stream Diffs'
  })

  readonly streamFeatureSummaryLabel = computed(() => {
    const enabledCount = [
      this.codeBlockStream(),
      this.viewportPriority(),
      this.batchRendering(),
      this.typewriter(),
      this.mathEnabled(),
      this.mermaidEnabled(),
      this.debugParse(),
    ].filter(Boolean).length

    return enabledCount ? `已开 ${enabledCount} 项增强` : '基础模式'
  })

  readonly parseOptions = computed(() => this.debugParse() ? { debug: true } : undefined)
  readonly customComponents = computed<Record<string, Type<any>>>(() => {
    const components: Record<string, Type<any>> = {
      thinking: ThinkingNodeComponent,
    }
    if (this.renderMode() === 'pre')
      components.code_block = PreCodeNode as Type<any>
    else if (this.renderMode() === 'markdown')
      components.code_block = CodeBlockNode as Type<any>
    return components
  })

  readonly activeSandbox = computed(() => resolveSandboxSelection(testSandboxFrameworks, {
    frameworkId: this.sandboxFrameworkId(),
    source: this.sandboxSource(),
    version: this.sandboxVersion(),
  }))

  readonly activeSandboxFramework = computed(() => this.activeSandbox().framework)
  readonly sandboxHref = computed(() => buildTestSandboxHref(this.activeSandbox(), this.sandboxSnapshot()))
  readonly sandboxFrameSrc = computed(() => {
    const href = this.sandboxHref()
    const separator = href.includes('#') ? '&' : '#'
    return `${href}${separator}refresh=${this.sandboxRefreshNonce()}`
  })

  readonly sandboxFrameSrcSafe = computed<SafeResourceUrl>(() => this.domSanitizer.bypassSecurityTrustResourceUrl(this.sandboxFrameSrc()))
  readonly sandboxDirty = computed(() => this.sandboxSnapshot() !== this.input())
  readonly sandboxQuickVersions = computed(() => Array.from(new Set([
    this.activeSandboxFramework().defaultVersion,
    'latest',
  ])))

  readonly sandboxVersionPlaceholder = computed(() => `例如 ${this.activeSandboxFramework().defaultVersion} 或 latest`)
  readonly sandboxPackageLabel = computed(() => {
    const active = this.activeSandbox()
    if (active.source === 'workspace')
      return `${active.framework.packageName} (workspace)`
    return `${active.framework.packageName}@${active.version}`
  })

  readonly sandboxRuntimeLabel = computed(() => {
    const active = this.activeSandbox()
    if (active.source === 'workspace')
      return `${active.framework.label} local runtime`
    return `${active.framework.label} runtime ${active.framework.runtimeVersion}`
  })

  readonly sandboxStatusLabel = computed(() => this.sandboxDirty() ? '待同步' : '已同步')

  private timer: number | null = null
  private noticeTimer: number | null = null
  private copiedTimer: number | null = null
  private previewShareTimer: number | null = null
  private fullscreenHandler: (() => void) | null = null

  ngOnInit() {
    this.applyFeatureToggles()
    const restored = decodeMarkdownHash(typeof window === 'undefined' ? '' : (window.location.hash || ''))
    if (restored)
      this.input.set(restored)
    if (typeof window !== 'undefined') {
      this.viewMode.set(resolveTestPageViewMode(window.location.search))
      this.shareUrl.set(basePageUrl())
      this.fullscreenHandler = () => {
        this.isPreviewFullscreen.set(document.fullscreenElement === this.previewCardRef?.nativeElement)
      }
      document.addEventListener('fullscreenchange', this.fullscreenHandler)
    }
    this.sandboxSnapshot.set(this.input())
  }

  ngOnDestroy() {
    this.stopStreamRender()
    if (this.noticeTimer != null && typeof window !== 'undefined')
      window.clearTimeout(this.noticeTimer)
    if (this.copiedTimer != null && typeof window !== 'undefined')
      window.clearTimeout(this.copiedTimer)
    if (this.previewShareTimer != null && typeof window !== 'undefined')
      window.clearTimeout(this.previewShareTimer)
    if (this.fullscreenHandler)
      document.removeEventListener('fullscreenchange', this.fullscreenHandler)
  }

  applySample(sampleId: SampleId) {
    const sample = this.sampleCards.find(item => item.id === sampleId)
    if (!sample)
      return
    this.stopStreamRender()
    this.selectedSampleId.set(sample.id)
    persistStoredValue('vmr-test-sample', sample.id)
    this.input.set(sample.content)
    this.tooLong.set(false)
    this.isCopied.set(false)
    this.showToast(`已切换到“${sample.title}”样例。`, 'info', 1200)
    this.handleInputMutation()
  }

  updateInput(event: Event) {
    this.stopStreamRender()
    this.input.set(readTextInput(event, this.input()))
    this.handleInputMutation()
  }

  handleEditorPaste(event: ClipboardEvent) {
    const textarea = event.currentTarget
    if (!(textarea instanceof HTMLTextAreaElement))
      return

    const pasted = event.clipboardData?.getData('text/plain') ?? ''
    const next = resolveMarkdownTextareaPaste(textarea, pasted)
    if (!next)
      return

    event.preventDefault()
    textarea.value = next.nextValue
    textarea.selectionStart = next.selectionStart
    textarea.selectionEnd = next.selectionEnd
    this.stopStreamRender()
    this.input.set(next.nextValue)
    this.handleInputMutation()
  }

  openStreamSettingsDialog() {
    const dialog = this.streamSettingsDialogRef?.nativeElement
    if (dialog && !dialog.open)
      dialog.showModal()
  }

  closeStreamSettingsDialog() {
    const dialog = this.streamSettingsDialogRef?.nativeElement
    if (dialog?.open)
      dialog.close()
  }

  updateStreamSpeed(event: Event) {
    const next = clampInt(Number(readTextInput(event, String(this.streamSpeed()))), 1, 80, 4)
    this.streamSpeed.set(next)
    persistStoredValue('vmr-test-stream-speed', next)
  }

  updateStreamInterval(event: Event) {
    const next = clampInt(Number(readTextInput(event, String(this.streamInterval()))), 8, 300, 24)
    this.streamInterval.set(next)
    persistStoredValue('vmr-test-stream-interval', next)
  }

  updateCodeBlockStream(event: Event) {
    const next = readCheckedInput(event, this.codeBlockStream())
    this.codeBlockStream.set(next)
    persistStoredValue('vmr-test-code-stream', next)
  }

  updateViewportPriority(event: Event) {
    const next = readCheckedInput(event, this.viewportPriority())
    this.viewportPriority.set(next)
    persistStoredValue('vmr-test-viewport-priority', next)
  }

  updateBatchRendering(event: Event) {
    const next = readCheckedInput(event, this.batchRendering())
    this.batchRendering.set(next)
    persistStoredValue('vmr-test-batch-rendering', next)
  }

  updateTypewriter(event: Event) {
    const next = readCheckedInput(event, this.typewriter())
    this.typewriter.set(next)
    persistStoredValue('vmr-test-typewriter', next)
  }

  updateDebugParse(event: Event) {
    const next = readCheckedInput(event, this.debugParse())
    this.debugParse.set(next)
    persistStoredValue('vmr-test-debug-parse', next)
  }

  updateMathEnabled(event: Event) {
    const next = readCheckedInput(event, this.mathEnabled())
    this.mathEnabled.set(next)
    persistStoredValue('vmr-test-math-enabled', next)
    if (next)
      enableKatex()
    else
      disableKatex()
  }

  updateMermaidEnabled(event: Event) {
    const next = readCheckedInput(event, this.mermaidEnabled())
    this.mermaidEnabled.set(next)
    persistStoredValue('vmr-test-mermaid-enabled', next)
    if (next)
      enableMermaid()
    else
      disableMermaid()
  }

  updateRenderMode(event: Event) {
    const next = normalizeRenderMode(readTextInput(event, this.renderMode()))
    this.renderMode.set(next)
    persistStoredValue('vmr-test-render-mode', next)
  }

  toggleStreamRender() {
    if (this.isStreaming()) {
      this.stopStreamRender()
      return
    }
    this.startStreamRender()
  }

  resetEditor() {
    this.applySample(this.selectedSampleId())
  }

  clearEditor() {
    this.stopStreamRender()
    this.input.set('')
    this.handleInputMutation()
  }

  toggleAppearance() {
    const next = !this.isDark()
    this.isDark.set(next)
    persistStoredValue(DARK_MODE_KEY, next ? 'dark' : 'light')
  }

  async generateAndCopyPreview() {
    const target = buildTestPageHref(basePageUrl(), this.input(), 'preview')

    try {
      await navigator.clipboard.writeText(target)
      this.previewShareCopied.set(true)
      if (this.previewShareTimer != null && typeof window !== 'undefined')
        window.clearTimeout(this.previewShareTimer)
      if (typeof window !== 'undefined') {
        this.previewShareTimer = window.setTimeout(() => this.previewShareCopied.set(false), 1800)
      }
    }
    catch (error) {
      console.warn('copy failed', error)
      this.showToast('复制失败，请手动复制地址栏链接。', 'error', 3000)
    }
  }

  async togglePreviewFullscreen() {
    const previewCard = this.previewCardRef?.nativeElement
    if (!previewCard || typeof document === 'undefined')
      return

    if (document.fullscreenElement === previewCard) {
      if (document.exitFullscreen)
        await document.exitFullscreen()
      return
    }

    if (previewCard.requestFullscreen)
      await previewCard.requestFullscreen()
  }

  returnToEditableTestPage() {
    if (this.isSharePreviewMode()) {
      window.location.href = buildTestPageHref(basePageUrl(), this.input(), 'lab')
      return
    }

    if (typeof document !== 'undefined' && document.fullscreenElement === this.previewCardRef?.nativeElement && document.exitFullscreen)
      void document.exitFullscreen()
  }

  frameworkHref(id: FrameworkId) {
    const framework = this.frameworkCards.find(item => item.id === id)
    if (!framework)
      return '/test'
    return resolveFrameworkTestHref(
      framework,
      this.currentFramework,
      this.input(),
      typeof window !== 'undefined'
        ? { hostname: window.location.hostname, protocol: window.location.protocol }
        : undefined,
    )
  }

  updateSandboxFramework(event: Event) {
    const nextFramework = resolveSandboxSelection(testSandboxFrameworks, {
      frameworkId: readTextInput(event, this.sandboxFrameworkId()),
      source: this.sandboxSource(),
      version: this.sandboxVersion(),
    }).framework
    this.sandboxFrameworkId.set(nextFramework.id)
    this.sandboxSource.set(normalizeSandboxSource(nextFramework, this.sandboxSource()))
    this.sandboxVersion.set(nextFramework.defaultVersion)
    persistStoredValue('vmr-test-sandbox-framework', nextFramework.id)
    persistStoredValue('vmr-test-sandbox-source', this.sandboxSource())
    persistStoredValue('vmr-test-sandbox-version', nextFramework.defaultVersion)
    this.refreshSandbox()
  }

  chooseSandboxSource(source: SandboxRenderSource) {
    const next = normalizeSandboxSource(this.activeSandboxFramework(), source)
    this.sandboxSource.set(next)
    persistStoredValue('vmr-test-sandbox-source', next)
    this.refreshSandbox()
  }

  chooseSandboxVersion(version: string) {
    this.sandboxVersion.set(version)
    persistStoredValue('vmr-test-sandbox-version', version)
    this.refreshSandbox()
  }

  updateSandboxVersion(event: Event) {
    const next = readTextInput(event, this.sandboxVersion())
    this.sandboxVersion.set(next)
    persistStoredValue('vmr-test-sandbox-version', next)
    this.refreshSandbox()
  }

  updateSandboxAutoSync(event: Event) {
    const next = readCheckedInput(event, this.sandboxAutoSync())
    this.sandboxAutoSync.set(next)
    persistStoredValue('vmr-test-sandbox-auto-sync', next)
    if (next)
      this.syncSandbox()
  }

  syncSandbox() {
    this.sandboxSnapshot.set(this.input())
    this.sandboxRefreshNonce.update(value => value + 1)
  }

  openSandboxInNewTab() {
    try {
      window.open(this.sandboxHref(), '_blank', 'noopener')
    }
    catch {
      window.location.href = this.sandboxHref()
    }
  }

  async generateAndCopy() {
    this.isWorking.set(true)
    this.isCopied.set(false)
    this.generateShareLink()

    if (this.tooLong()) {
      this.isWorking.set(false)
      return
    }

    const copied = await this.copyShareLink()
    this.isWorking.set(false)

    if (copied) {
      this.isCopied.set(true)
      this.showToast('分享链接已复制。', 'success', 1800)
      if (this.copiedTimer != null && typeof window !== 'undefined')
        window.clearTimeout(this.copiedTimer)
      if (typeof window !== 'undefined') {
        this.copiedTimer = window.setTimeout(() => this.isCopied.set(false), 1800)
      }
    }
    else {
      this.showToast('复制失败，请手动复制地址栏链接。', 'error', 3000)
    }
  }

  async copyRawInput() {
    const target = buildIssueUrl(this.input())
    this.issueUrl.set(target)

    try {
      await navigator.clipboard.writeText(target)
      this.showToast('Issue 链接已复制。', 'success', 2200)
    }
    catch (error) {
      console.warn('copy failed', error)
      this.showToast('复制失败，请手动打开 Issue。', 'error', 3000)
    }
  }

  openIssueInNewTab() {
    if (!this.issueUrl())
      this.issueUrl.set(buildIssueUrl(this.input()))

    try {
      window.open(this.issueUrl(), '_blank')
    }
    catch {
      window.location.href = this.issueUrl()
    }
  }

  private resolveInitialSample() {
    return this.sampleCards.find(sample => sample.id === this.selectedSampleId()) ?? this.sampleCards[0]
  }

  private handleInputMutation() {
    this.tooLong.set(false)
    this.isCopied.set(false)
    this.previewShareCopied.set(false)
    if (!this.isStreaming() && typeof window !== 'undefined')
      this.shareUrl.set(basePageUrl())
    if (this.sandboxAutoSync())
      this.syncSandbox()
  }

  private applyFeatureToggles() {
    if (this.mathEnabled())
      enableKatex()
    else
      disableKatex()

    if (this.mermaidEnabled())
      enableMermaid()
    else
      disableMermaid()
  }

  private startStreamRender() {
    this.streamSpeed.set(clampInt(this.streamSpeed(), 1, 80, 4))
    this.streamInterval.set(clampInt(this.streamInterval(), 8, 300, 24))
    this.streamContent.set('')
    this.isStreaming.set(true)
    this.scheduleNextChunk()
  }

  private scheduleNextChunk() {
    if (!this.isStreaming() || typeof window === 'undefined')
      return

    const nextLength = Math.min(this.streamContent().length + this.streamSpeed(), this.input().length)
    this.streamContent.set(this.input().slice(0, nextLength))

    if (nextLength >= this.input().length) {
      this.stopStreamRender()
      return
    }

    this.timer = window.setTimeout(() => this.scheduleNextChunk(), this.streamInterval())
  }

  private stopStreamRender() {
    if (this.timer != null && typeof window !== 'undefined') {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    this.isStreaming.set(false)
  }

  private refreshSandbox() {
    if (this.sandboxAutoSync()) {
      this.syncSandbox()
      return
    }
    this.sandboxRefreshNonce.update(value => value + 1)
  }

  private generateShareLink() {
    if (typeof window === 'undefined')
      return

    const full = withMarkdownHash(basePageUrl(), this.input())
    if (full.length > MAX_URL_LEN) {
      this.tooLong.set(true)
      this.shareUrl.set('')
      this.issueUrl.set(buildIssueUrl(this.input()))
      this.showToast('内容太长，建议直接附到 GitHub Issue。', 'info', 4000)
      return
    }

    this.tooLong.set(false)
    this.shareUrl.set(full)
    window.history.replaceState(undefined, '', full)
  }

  private async copyShareLink() {
    const target = this.shareUrl() || (typeof window !== 'undefined' ? basePageUrl() : '')
    try {
      await navigator.clipboard.writeText(target)
      return true
    }
    catch (error) {
      console.warn('copy failed', error)
      return false
    }
  }

  private showToast(message: string, type: NoticeType, duration = 2200) {
    this.notice.set(message)
    this.noticeType.set(type)
    if (this.noticeTimer != null && typeof window !== 'undefined')
      window.clearTimeout(this.noticeTimer)
    if (duration > 0 && typeof window !== 'undefined') {
      this.noticeTimer = window.setTimeout(() => {
        this.notice.set('')
      }, duration)
    }
  }
}
