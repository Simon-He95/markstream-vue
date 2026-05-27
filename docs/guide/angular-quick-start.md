# Angular Quick Start

Get `markstream-angular` rendering markdown in a standalone Angular app.

## Basic Example

```ts
import { Component, signal } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { MarkstreamAngularComponent } from 'markstream-angular'
import 'markstream-angular/index.css'
import 'katex/dist/katex.min.css'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MarkstreamAngularComponent],
  template: `
    <markstream-angular
      [content]="markdown()"
      [final]="true"
      [codeBlockStream]="true"
    />
  `,
})
class AppComponent {
  readonly markdown = signal(`# Hello Angular

This is **markstream-angular**.

\`\`\`ts
export function greet(name: string) {
  return \`hello \${name}\`
}
\`\`\`

\`\`\`mermaid
flowchart LR
  Input --> Parser --> Renderer
\`\`\`

$E = mc^2$
`)
}

bootstrapApplication(AppComponent)
```

## Streaming Example

```ts
import { Component, signal } from '@angular/core'
import { MarkstreamAngularComponent } from 'markstream-angular'

@Component({
  selector: 'app-streaming-demo',
  standalone: true,
  imports: [MarkstreamAngularComponent],
  template: `
    <markstream-angular
      [content]="content()"
      [final]="done()"
      [codeBlockStream]="true"
      [maxLiveNodes]="0"
      [batchRendering]="true"
      [typewriter]="true"
    />
  `,
})
export class StreamingDemoComponent {
  readonly content = signal('# Partial output')
  readonly done = signal(false)
}
```

The default `smoothStreaming="auto"` enables pacing when `typewriter` is on or `maxLiveNodes <= 0`. Use `[smoothStreaming]="true"` only if you want first-screen content to also start from blank — this bypasses the mounted gate and can cause hydration mismatch or blank flash in SSR scenarios.

Fine-tune pacing with `smoothStreamingOptions`:

```html
<markstream-angular
  [content]="content()"
  [final]="done()"
  [smoothStreamingOptions]="{ minCharsPerSecond: 45, maxCharsPerSecond: 1200, targetLatencyMs: 900, catchUpLatencyMs: 350 }"
/>
```

## Trusted Mermaid compatibility

Mermaid strict mode is enabled by default. If a trusted diagram still needs the old loose-mode HTML-label behavior, scope that opt-out to the trusted surface:

```ts
import { Component, signal } from '@angular/core'
import { MarkstreamAngularComponent } from 'markstream-angular'

@Component({
  selector: 'app-trusted-mermaid-demo',
  standalone: true,
  imports: [MarkstreamAngularComponent],
  template: `
    <markstream-angular
      [content]="markdown()"
      [htmlPolicy]="'trusted'"
      [mermaidProps]="{ isStrict: false }"
    />
  `,
})
export class TrustedMermaidDemoComponent {
  readonly markdown = signal(`
\`\`\`mermaid
flowchart TD
  A["<b>Trusted HTML label</b><br/>line 2"] --> B
\`\`\`
`)
}
```

## TypeScript Props

```ts
import type { CodeBlockMonacoOptions, NodeRendererProps } from 'markstream-angular'

const monacoOptions: CodeBlockMonacoOptions = {
  fontSize: 13,
  wordWrap: 'on',
}

const props: NodeRendererProps = {
  content: '# Angular',
  codeBlockMonacoOptions: monacoOptions,
  final: true,
}
```

## Custom Tags

The Angular package supports the same custom HTML tag flow used in the playground `thinking` demos:

```html
<markstream-angular
  [content]="markdown()"
  [customHtmlTags]="['thinking']"
  [customComponents]="customComponents"
/>
```

## Next Steps

- [Angular Installation](/guide/angular-installation)
- [Guide Index](/guide/)
- [Playground Guide](/guide/playground)
