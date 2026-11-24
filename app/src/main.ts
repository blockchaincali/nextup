// Glue between the Even Hub SDK and the app core. Inside the Even app this
// drives the glasses; in a plain browser it falls back to an on-page preview
// so the whole flow can be developed and demoed without hardware.
import {
  AudioInputSource,
  CreateStartUpPageContainer,
  OsEventTypeList,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type EvenAppBridge,
} from '@evenrealities/even_hub_sdk'
import { Api } from './api'
import { NextUp, type Input, type Screen } from './core'
import { mountCompanion } from './companion'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8787'

const companion = mountCompanion()
const bridge = await Promise.race([
  waitForEvenAppBridge(),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
]).catch(() => null)

// ── display: three text containers (header, body, footer) ──────────────

const HEADER = { id: 1, name: 'header' }
const BODY = { id: 2, name: 'body' }
const FOOTER = { id: 3, name: 'footer' }

async function createPage(b: EvenAppBridge) {
  const text = (id: number, name: string, y: number, h: number, brightness: number, capture: number) =>
    new TextContainerProperty({
      xPosition: 0,
      yPosition: y,
      width: 576,
      height: h,
      borderWidth: 0,
      borderColor: 5,
      paddingLength: 6,
      containerID: id,
      containerName: name,
      zOrderIndex: id,
      content: ' ',
      textColor: brightness,
      isEventCapture: capture,
    })
  const result = await b.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 3,
      textObject: [text(HEADER.id, HEADER.name, 0, 40, 2, 0), text(BODY.id, BODY.name, 40, 206, 4, 1), text(FOOTER.id, FOOTER.name, 246, 42, 2, 0)],
    }),
  )
  if (result !== 0) console.error('createStartUpPageContainer failed:', result)
}

/** Serialises writes and skips unchanged containers: the Bluetooth link is slow. */
function glassesDisplay(b: EvenAppBridge) {
  const last: Record<string, string> = {}
  let chain: Promise<unknown> = Promise.resolve()
  let pending: Screen | null = null
  return (screen: Screen) => {
    const first = pending === null
    pending = screen
    if (!first) return // a write is queued; it will pick up the newest screen
    chain = chain.then(async () => {
      const s = pending!
      pending = null
      for (const [c, content] of [
        [HEADER, s.header],
        [BODY, s.body],
        [FOOTER, s.footer],
      ] as const) {
        const value = content || ' '
        if (last[c.name] === value) continue
        last[c.name] = value
        await b.textContainerUpgrade(new TextContainerUpgrade({ containerID: c.id, containerName: c.name, content: value }))
      }
    })
  }
}

// ── microphone: buffer PCM while the ring is held ──────────────────────

function glassesMic(b: EvenAppBridge) {
  let chunks: Uint8Array[] = []
  let on = false
  b.onEvenHubEvent((e) => {
    const pcm = e.audioEvent?.audioPcm
    if (on && pcm) chunks.push(pcm)
  })
  return {
    async start() {
      chunks = []
      on = true
      const ok = await b.audioControl(true, AudioInputSource.Glasses)
      if (!ok) {
        on = false
        throw new Error('mic refused')
      }
    },
    async stop() {
      on = false
      await b.audioControl(false)
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const out = new Uint8Array(total)
      let o = 0
      for (const c of chunks) {
        out.set(c, o)
        o += c.length
      }
      chunks = []
      return out
    },
  }
}

// ── input ───────────────────────────────────────────────────────────────

// CLICK_EVENT is 0 and protobuf drops zero values, so a tap arrives with no
// eventType. Resolve the default inside the envelope check (see the SDK templates).
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

function wireInput(b: EvenAppBridge, app: NextUp, cleanup: () => void) {
  const unsubscribe = b.onEvenHubEvent((event) => {
    if (event.audioEvent) return
    const types = [eventTypeOf(event.sysEvent), eventTypeOf(event.textEvent), eventTypeOf(event.listEvent)]
    const has = (t: OsEventTypeList) => types.includes(t)

    // Double-tap always exits, whatever screen we're on.
    if (has(OsEventTypeList.DOUBLE_CLICK_EVENT)) return void b.shutDownPageContainer(1)
    if (has(OsEventTypeList.SYSTEM_EXIT_EVENT) || has(OsEventTypeList.ABNORMAL_EXIT_EVENT)) {
      cleanup()
      unsubscribe()
      return
    }
    if (has(OsEventTypeList.FOREGROUND_ENTER_EVENT)) return void app.resume()
    if (has(OsEventTypeList.IMU_DATA_REPORT) || has(OsEventTypeList.FOREGROUND_EXIT_EVENT)) return

    let input: Input | null = null
    if (has(OsEventTypeList.LONG_PRESS_EVENT)) input = 'holdStart'
    else if (has(OsEventTypeList.LONG_PRESS_RELEASE_EVENT)) input = 'holdEnd'
    else if (has(OsEventTypeList.SCROLL_TOP_EVENT)) input = 'swipeUp'
    else if (has(OsEventTypeList.SCROLL_BOTTOM_EVENT)) input = 'swipeDown'
    else if (has(OsEventTypeList.CLICK_EVENT)) input = 'tap'
    if (input) {
      companion.log(`input: ${input}`)
      void app.input(input)
    }
  })
}

// ── storage ─────────────────────────────────────────────────────────────

function storageFor(b: EvenAppBridge | null) {
  return {
    async get(key: string) {
      if (b) return (await b.getLocalStorage(key)) ?? ''
      return localStorage.getItem(key) ?? ''
    },
    async set(key: string, value: string) {
      if (b) await b.setLocalStorage(key, value)
      else localStorage.setItem(key, value)
    },
  }
}

// ── start ───────────────────────────────────────────────────────────────

const api = new Api(API_BASE)

if (bridge) {
  await createPage(bridge)
  const mic = glassesMic(bridge)
  const show = glassesDisplay(bridge)
  const app = new NextUp({
    api,
    show,
    mic,
    storage: storageFor(bridge),
    now: () => Date.now(),
    notify: companion.notify,
  })
  companion.onTyped((t) => app.typed(t))
  companion.onInput((i) => app.input(i))
  wireInput(bridge, app, () => {
    app.stop()
    void bridge.audioControl(false)
  })
  window.addEventListener('beforeunload', () => app.stop())
  await app.start()
} else {
  // Browser preview: no glasses, so the companion page draws the 576×288 display
  // and offers buttons and keys for the gestures. Voice is replaced by typing.
  companion.enablePreview()
  const app = new NextUp({
    api,
    show: companion.preview,
    mic: {
      async start() {
        throw new Error('no mic in preview')
      },
      async stop() {
        return new Uint8Array()
      },
    },
    storage: storageFor(null),
    now: () => Date.now(),
    notify: companion.notify,
  })
  companion.onTyped((t) => app.typed(t))
  companion.onInput((i) => app.input(i))
  await app.start()
}
