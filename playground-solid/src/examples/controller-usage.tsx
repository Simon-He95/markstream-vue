import { NodeRenderer, useSmoothMarkdownStream } from 'markstream-solid'

export function SolidControllerUsage() {
  const stream = useSmoothMarkdownStream({
    startDelayMs: 16,
    minCharsPerSecond: 40,
    maxCharsPerSecond: 80,
  })

  return (
    <section data-solid-controller>
      <p>
        source=
        {stream.source().length}
        {' '}
        visible=
        {stream.visible().length}
        {' '}
        pending=
        {stream.pendingChars()}
        {' '}
        caughtUp=
        {String(stream.caughtUp())}
        {' '}
        final=
        {String(stream.final())}
      </p>
      <button type="button" onClick={() => stream.enqueue('hello ')}>enqueue</button>
      <button type="button" onClick={() => stream.pause()}>pause</button>
      <button type="button" onClick={() => stream.resume()}>resume</button>
      <button type="button" onClick={() => stream.finish()}>finish</button>
      <button type="button" onClick={() => stream.flush()}>flush</button>
      <button type="button" onClick={() => stream.reset()}>reset</button>
      <NodeRenderer
        content={stream.visible()}
        final={stream.final()}
        smoothStreaming={false}
        typewriter={false}
        fade={false}
      />
    </section>
  )
}
