// The phone-side screen of the app (what shows in the Even app while Next Up
// runs). It mirrors the glasses, links to pairing, and lets you type instead
// of speaking: handy in the simulator, in a noisy room, or for the demo.
import type { Input, Screen } from './core'

export function mountCompanion() {
  const root = document.querySelector<HTMLDivElement>('#app')!
  root.innerHTML = `
  <main class="panel">
    <header>
      <h1>Next Up</h1>
      <span id="status" class="chip">Starting…</span>
    </header>
    <section class="hud" aria-label="Glasses display">
      <div id="hud-header" class="hud-dim"></div>
      <pre id="hud-body"></pre>
      <div id="hud-footer" class="hud-dim"></div>
    </section>
    <section id="pair" class="card" hidden>
      <p>Pair on this phone: <a id="pair-link" target="_blank" rel="noopener">open the pairing page</a>, then enter <strong id="pair-code"></strong>.</p>
    </section>
    <section id="gestures" class="card gestures" hidden>
      <button data-input="tap" type="button">Tap</button>
      <button data-input="swipeUp" type="button">Swipe ↑</button>
      <button data-input="swipeDown" type="button">Swipe ↓</button>
      <button id="hold" type="button">Hold</button>
    </section>
    <form id="type" class="card">
      <label for="typed">Type instead of speaking</label>
      <textarea id="typed" rows="2" placeholder="Send him the revised quote Friday, book a check-in next Tuesday"></textarea>
      <button type="submit">Send to glasses</button>
    </form>
    <p id="heard" class="muted"></p>
    <details class="muted"><summary>Log</summary><pre id="log"></pre></details>
  </main>`
  injectStyles()

  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
  const status = $('status')
  const logEl = $('log')
  let typedHandler: (t: string) => unknown = () => {}
  let inputHandler: (i: Input) => unknown = () => {}

  $<HTMLFormElement>('type').addEventListener('submit', (e) => {
    e.preventDefault()
    const box = $<HTMLTextAreaElement>('typed')
    const text = box.value
    box.value = ''
    void typedHandler(text)
  })
  root.querySelectorAll<HTMLButtonElement>('[data-input]').forEach((b) =>
    b.addEventListener('click', () => void inputHandler(b.dataset.input as Input)),
  )
  const hold = $<HTMLButtonElement>('hold')
  hold.addEventListener('pointerdown', () => void inputHandler('holdStart'))
  hold.addEventListener('pointerup', () => void inputHandler('holdEnd'))

  const log = (line: string) => {
    logEl.textContent = `${new Date().toLocaleTimeString()} ${line}\n${logEl.textContent ?? ''}`.slice(0, 4000)
  }

  const preview = (s: Screen) => {
    $('hud-header').textContent = s.header
    $('hud-body').textContent = s.body
    $('hud-footer').textContent = s.footer
  }

  return {
    log,
    preview,
    onTyped(fn: (t: string) => unknown) {
      typedHandler = fn
    },
    onInput(fn: (i: Input) => unknown) {
      inputHandler = fn
    },
    enablePreview() {
      $('gestures').hidden = false
      status.textContent = 'Browser preview'
      document.addEventListener('keydown', (e) => {
        if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
        const map: Record<string, Input> = { Enter: 'tap', ' ': 'tap', ArrowUp: 'swipeUp', ArrowDown: 'swipeDown' }
        const i = map[e.key]
        if (i) {
          e.preventDefault()
          void inputHandler(i)
        }
      })
    },
    notify(event: string, detail?: unknown) {
      if (event === 'screen') return preview(detail as Screen)
      if (event === 'pair') {
        const p = detail as { code: string; pairUrl: string }
        $('pair').hidden = false
        $<HTMLAnchorElement>('pair-link').href = p.pairUrl
        $('pair-code').textContent = `${p.code.slice(0, 3)} ${p.code.slice(3)}`
        status.textContent = 'Waiting for pairing'
      }
      if (event === 'meetings') {
        $('pair').hidden = true
        const n = (detail as { items: unknown[] }).items.length
        status.textContent = `${n} meeting${n === 1 ? '' : 's'} today`
      }
      if (event === 'heard') $('heard').textContent = `Heard: “${String(detail)}”`
      log(`${event}${detail && event !== 'meetings' ? ` ${JSON.stringify(detail).slice(0, 200)}` : ''}`)
    },
  }
}

function injectStyles() {
  const css = `
  :root { color-scheme: dark; }
  html, body { margin: 0; background: #232323; color: #E5E5E5;
    font: 15px/1.45 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    touch-action: manipulation; -webkit-text-size-adjust: 100%; overscroll-behavior: none; }
  .panel { max-width: 640px; margin: 0 auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h1 { font-size: 18px; margin: 0; }
  .chip { font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid #3CFA44; color: #3CFA44; }
  .hud { background: #000; border-radius: 10px; aspect-ratio: 2 / 1; width: 100%; max-width: 576px;
    box-sizing: border-box; padding: 10px 14px; display: flex; flex-direction: column; color: #3CFA44;
    font: 15px/1.35 ui-monospace, Menlo, monospace; overflow: hidden; }
  .hud pre { flex: 1; margin: 6px 0; white-space: pre-wrap; font: inherit; }
  .hud-dim { opacity: .7; font-size: 13px; min-height: 1em; }
  .card { background: #2E2E2E; border: 1px solid #3E3E3E; border-radius: 12px; padding: 14px; }
  .card p { margin: 0; }
  .gestures { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  label { display: block; font-size: 13px; color: #A7A7A7; margin-bottom: 6px; }
  textarea { width: 100%; box-sizing: border-box; font: inherit; background: #232323; color: #E5E5E5;
    border: 1px solid #3E3E3E; border-radius: 8px; padding: 10px; }
  button { font: inherit; font-weight: 600; margin-top: 8px; min-height: 44px; padding: 8px 14px; border-radius: 8px;
    border: 0; background: #3CFA44; color: #0b2a0d; }
  .gestures button { margin: 0; background: transparent; color: #3CFA44; border: 1px solid #3CFA44; }
  a { color: #3CFA44; }
  .muted { color: #A7A7A7; font-size: 13px; }
  #log { white-space: pre-wrap; font-size: 12px; }`
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
}
