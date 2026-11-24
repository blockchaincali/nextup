// The app's brain, free of the SDK so it can be tested in Node: state,
// what each input does, and what the glasses show for each state.
import { ApiError, type Api, type Approval, type Card, type MeetingItem } from './api'

export type Input = 'tap' | 'swipeUp' | 'swipeDown' | 'holdStart' | 'holdEnd'

/** One glasses frame: a dim header line, the main body, a dim hint line. */
export interface Screen {
  header: string
  body: string
  footer: string
}

export interface Deps {
  api: Api
  show(screen: Screen): void
  mic: { start(): Promise<void>; stop(): Promise<Uint8Array> }
  storage: { get(key: string): Promise<string>; set(key: string, value: string): Promise<void> }
  now(): number
  /** Mirrors status to the phone screen; optional. */
  notify?(event: string, detail?: unknown): void
}

type Mode =
  | { kind: 'boot' }
  | { kind: 'pair'; code: string; url: string; expiresAt: number }
  | { kind: 'list'; detail: boolean }
  | { kind: 'listening'; target: 'followup' | 'revise'; startedAt: number }
  | { kind: 'thinking'; label: string }
  | { kind: 'draft' }
  | { kind: 'done'; until: number }
  | { kind: 'message'; title: string; text: string; back: 'list' | 'draft' | 'pair' }

interface Session {
  id: string
  meetingId: string
  who: string
  cards: Card[]
  index: number
  approvals: Approval[]
  skipped: number
}

const TOKEN_KEY = 'nextup_token'
const POLL_PAIR_MS = 2_000
const REFRESH_MS = 60_000
const MAX_RECORD_MS = 30_000

export class NextUp {
  mode: Mode = { kind: 'boot' }
  meetings: MeetingItem[] = []
  index = 0
  session: Session | null = null
  private timers: Array<ReturnType<typeof setTimeout>> = []
  private busy = false

  constructor(private d: Deps) {}

  // ── lifecycle ─────────────────────────────────────────────────────────

  async start() {
    this.draw()
    this.d.api.token = await this.d.storage.get(TOKEN_KEY).catch(() => '')
    if (!this.d.api.token) return this.beginPairing()
    try {
      const s = await this.d.api.pairStatus()
      if (!s.linked) return this.beginPairing()
      await this.loadMeetings()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return this.beginPairing()
      this.fail("Can't reach Next Up", "Check your phone's connection.", 'list')
    }
  }

  stop() {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
  }

  /** Called when the app comes back to the foreground. */
  async resume() {
    if (this.mode.kind === 'list') await this.loadMeetings(true).catch(() => {})
  }

  // ── pairing ───────────────────────────────────────────────────────────

  private async beginPairing() {
    const p = await this.d.api.pairStart()
    this.d.api.token = p.token
    await this.d.storage.set(TOKEN_KEY, p.token)
    this.mode = { kind: 'pair', code: p.code, url: p.pairUrl, expiresAt: p.expiresAt }
    this.draw()
    this.d.notify?.('pair', p)
    this.pollPairing()
  }

  private pollPairing() {
    this.later(async () => {
      if (this.mode.kind !== 'pair') return
      if (this.d.now() > this.mode.expiresAt) return this.beginPairing()
      const s = await this.d.api.pairStatus().catch(() => ({ linked: false }))
      if (s.linked) return this.loadMeetings()
      this.pollPairing()
    }, POLL_PAIR_MS)
  }

  // ── meetings ──────────────────────────────────────────────────────────

  async loadMeetings(keepPosition = false) {
    const currentId = this.meetings[this.index]?.meeting.id
    const data = await this.d.api.meetings()
    this.meetings = data.items
    const kept = keepPosition ? this.meetings.findIndex((m) => m.meeting.id === currentId) : -1
    this.index = kept >= 0 ? kept : Math.max(0, data.focus)
    if (this.mode.kind === 'boot' || this.mode.kind === 'pair' || this.mode.kind === 'list' || this.mode.kind === 'done' || this.mode.kind === 'message') {
      this.mode = { kind: 'list', detail: this.mode.kind === 'list' ? this.mode.detail : false }
    }
    this.draw()
    this.d.notify?.('meetings', data)
    this.scheduleRefresh()
  }

  private scheduleRefresh() {
    this.later(() => {
      if (this.mode.kind === 'list') void this.loadMeetings(true).catch(() => this.scheduleRefresh())
      else this.scheduleRefresh()
    }, REFRESH_MS)
  }

  get current(): MeetingItem | undefined {
    return this.meetings[this.index]
  }

  // ── input ─────────────────────────────────────────────────────────────

  async input(i: Input) {
    const m = this.mode
    if (this.busy && i !== 'holdEnd') return
    switch (m.kind) {
      case 'pair':
        if (i === 'tap') await this.beginPairing()
        return
      case 'list':
        if (!this.meetings.length) {
          if (i === 'tap') await this.loadMeetings().catch(() => {})
          return
        }
        if (i === 'tap') {
          this.mode = { kind: 'list', detail: !m.detail }
          return this.draw()
        }
        if (i === 'swipeDown' && this.index < this.meetings.length - 1) {
          this.index++
          this.mode = { kind: 'list', detail: false }
          return this.draw()
        }
        if (i === 'swipeUp' && this.index > 0) {
          this.index--
          this.mode = { kind: 'list', detail: false }
          return this.draw()
        }
        if (i === 'holdStart') return this.listen('followup')
        return
      case 'listening':
        if (i === 'holdEnd') return this.finishListening()
        if (i === 'swipeUp' || i === 'swipeDown') return this.cancelListening()
        return
      case 'draft':
        if (i === 'tap') return this.approve()
        if (i === 'swipeDown') return this.skip()
        if (i === 'swipeUp' && this.session && this.session.index > 0) {
          this.session.index--
          return this.draw()
        }
        if (i === 'holdStart') return this.listen('revise')
        return
      case 'done':
        if ((i === 'swipeUp' || i === 'swipeDown') && this.d.now() < m.until) return this.undoAll()
        if (i === 'tap') return this.backToList()
        if (i === 'holdStart') return this.backToList()
        return
      case 'message':
        if (i === 'tap') {
          if (m.back === 'draft' && this.session) {
            this.mode = { kind: 'draft' }
            return this.draw()
          }
          if (m.back === 'pair') return this.beginPairing()
          return this.backToList()
        }
        return
      default:
        return
    }
  }

  /** Typed text instead of voice: used from the phone screen and in the simulator. */
  async typed(text: string) {
    const t = text.trim()
    if (!t) return
    if (this.mode.kind === 'draft' && this.session) return this.submit('revise', t)
    if (this.mode.kind === 'list' && this.current) return this.submit('followup', t)
  }

  // ── voice ─────────────────────────────────────────────────────────────

  private async listen(target: 'followup' | 'revise') {
    if (target === 'followup' && !this.current) return
    this.mode = { kind: 'listening', target, startedAt: this.d.now() }
    this.draw()
    try {
      await this.d.mic.start()
    } catch {
      return this.fail('Microphone unavailable', 'Type on your phone instead.', target === 'revise' ? 'draft' : 'list')
    }
    this.later(() => {
      if (this.mode.kind === 'listening') void this.finishListening()
    }, MAX_RECORD_MS)
    // Keep the timer on screen ticking.
    const tick = () =>
      this.later(() => {
        if (this.mode.kind !== 'listening') return
        this.draw()
        tick()
      }, 1_000)
    tick()
  }

  private async cancelListening() {
    const m = this.mode
    if (m.kind !== 'listening') return
    await this.d.mic.stop().catch(() => new Uint8Array())
    if (m.target === 'revise') this.mode = { kind: 'draft' }
    else this.mode = { kind: 'list', detail: false }
    this.draw()
  }

  private async finishListening() {
    const m = this.mode
    if (m.kind !== 'listening') return
    const pcm = await this.d.mic.stop().catch(() => new Uint8Array())
    if (pcm.length < 16_000) {
      // Under half a second: an accidental press.
      return this.fail("Didn't catch that", 'Hold the ring while you speak.', m.target === 'revise' ? 'draft' : 'list')
    }
    return this.submit(m.target, pcm)
  }

  private async submit(target: 'followup' | 'revise', input: Uint8Array | string) {
    this.busy = true
    try {
      if (target === 'followup') {
        const meeting = this.current!
        this.mode = { kind: 'thinking', label: 'Drafting your follow-up…' }
        this.draw()
        const res = await this.d.api.followUp(meeting.meeting.id, input)
        this.d.notify?.('heard', res.transcript)
        if (!res.cards.length) return this.fail('Nothing to send', `Heard: "${clip(res.transcript, 60)}"`, 'list')
        this.session = {
          id: res.sessionId,
          meetingId: meeting.meeting.id,
          who: meeting.brief.who.split(' · ')[0] ?? '',
          cards: res.cards,
          index: 0,
          approvals: [],
          skipped: 0,
        }
        this.mode = { kind: 'draft' }
      } else {
        const s = this.session!
        this.mode = { kind: 'thinking', label: 'Changing it…' }
        this.draw()
        const res = await this.d.api.revise(s.id, s.cards[s.index]!.id, input)
        this.d.notify?.('heard', res.instruction)
        s.cards[s.index] = res.card
        this.mode = { kind: 'draft' }
      }
      this.draw()
    } catch (e) {
      const back = target === 'revise' ? 'draft' : 'list'
      if (e instanceof ApiError && e.code === 'nothing_heard') return this.fail("Didn't catch that", 'Try again, a bit closer.', back)
      if (e instanceof ApiError && e.status === 503) return this.fail('Voice is off', 'Type on your phone instead.', back)
      return this.fail('Something went wrong', 'Tap to go back.', back)
    } finally {
      this.busy = false
    }
  }

  // ── drafts ────────────────────────────────────────────────────────────

  private async approve() {
    const s = this.session
    if (!s) return
    const card = s.cards[s.index]!
    this.busy = true
    try {
      const a = await this.d.api.approve(s.id, card.id)
      s.approvals.push(a)
      this.d.notify?.('approved', a)
    } catch {
      this.busy = false
      return this.fail("Couldn't approve", 'Tap to try again.', 'draft')
    }
    this.busy = false
    this.next()
  }

  private skip() {
    if (!this.session) return
    this.session.skipped++
    this.next()
  }

  private next() {
    const s = this.session!
    if (s.index < s.cards.length - 1) {
      s.index++
      this.mode = { kind: 'draft' }
      return this.draw()
    }
    const undoMs = (s.approvals[0]?.undoSeconds ?? 10) * 1000
    this.mode = { kind: 'done', until: this.d.now() + undoMs }
    this.draw()
    this.later(() => this.mode.kind === 'done' && this.draw(), undoMs + 50)
  }

  private async undoAll() {
    const s = this.session
    if (!s) return
    const results = await Promise.all(s.approvals.map((a) => this.d.api.undo(a.actionId).catch(() => ({ ok: false }))))
    const undone = results.filter((r) => r.ok).length
    s.approvals = []
    this.fail('Undone', undone ? `Nothing was sent to ${s.who}.` : 'Too late, already sent.', 'list')
  }

  private async backToList() {
    this.session = null
    this.mode = { kind: 'list', detail: false }
    // Jump to the next meeting that hasn't happened yet.
    const nextIdx = this.meetings.findIndex((m) => m.phase !== 'past')
    if (nextIdx >= 0) this.index = nextIdx
    this.draw()
    await this.loadMeetings(true).catch(() => {})
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private fail(title: string, text: string, back: 'list' | 'draft' | 'pair') {
    this.mode = { kind: 'message', title, text, back }
    this.draw()
  }

  private later(fn: () => unknown, ms: number) {
    this.timers.push(setTimeout(() => void fn(), ms))
  }

  draw() {
    const screen = render(this, this.d.now())
    this.d.show(screen)
    this.d.notify?.('screen', screen)
  }
}

// ── what the glasses show ───────────────────────────────────────────────

const HINT = (...parts: string[]) => parts.join('   ·   ')

export function render(app: NextUp, now: number): Screen {
  const m = app.mode
  switch (m.kind) {
    case 'boot':
      return { header: 'NEXT UP', body: 'Loading your day…', footer: '' }

    case 'pair':
      return {
        header: 'NEXT UP · CONNECT',
        body: `On your phone, open\n${m.url.replace(/^https?:\/\//, '')}\nand enter:\n\n${m.code.slice(0, 3)} ${m.code.slice(3)}`,
        footer: HINT('Expires in 5 min', 'Tap: new code'),
      }

    case 'list': {
      const item = app.current
      if (!item) {
        return {
          header: 'NEXT UP',
          body: 'No meetings with people\nin the next 18 hours.\n\nEnjoy the focus time.',
          footer: HINT('Tap: refresh'),
        }
      }
      const b = item.brief
      const position = app.meetings.length > 1 ? `  ${app.index + 1}/${app.meetings.length}` : ''
      const header = `${headerFor(item, now)} · ${b.time}${position}`
      if (m.detail) {
        const lines = b.details.length ? b.details.map((d) => `• ${d}`) : ['No more notes']
        return {
          header: `${b.who.split(' · ')[0]?.toUpperCase()} · MORE${position}`,
          body: lines.join('\n'),
          footer: HINT('Tap: back', 'Hold: speak follow-up'),
        }
      }
      const lines = [b.who, '', b.last, b.owe].filter((l, i) => l || i === 1)
      const past = item.phase === 'past'
      return {
        header,
        body: lines.join('\n'),
        footer: past ? HINT('Hold: speak follow-up', 'Swipe: other meetings') : HINT('Tap: more', 'Hold: speak', 'Swipe: next'),
      }
    }

    case 'listening': {
      const secs = Math.floor((now - m.startedAt) / 1000)
      const who = m.target === 'revise' ? 'CHANGE THIS DRAFT' : `AFTER · ${(app.current?.brief.who.split(' · ')[0] ?? '').toUpperCase()}`
      return {
        header: `${who} · REC ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
        body:
          m.target === 'revise'
            ? 'Listening…\n\nSay what to change, e.g.\n"make it Wednesday at 3"'
            : 'Listening…\n\nSay what happens next, e.g.\n"send the quote Friday,\nbook a check-in next Tuesday"',
        footer: HINT('Release: done', 'Swipe: cancel'),
      }
    }

    case 'thinking':
      return { header: 'NEXT UP', body: m.label, footer: '' }

    case 'draft': {
      const s = app.session!
      const c = s.cards[s.index]!
      return {
        header: `${c.header} · ${c.when}`,
        body: `${c.title}\n\n${c.body}`,
        footer: HINT('Tap: approve', 'Swipe: skip', 'Hold: change'),
      }
    }

    case 'done': {
      const s = app.session!
      const canUndo = now < m.until && s.approvals.length > 0
      const lines = s.approvals.map((a) => `• ${a.summary}`)
      if (s.skipped) lines.push(`Skipped ${s.skipped}`)
      const next = app.meetings.find((x) => x.phase === 'upcoming' && x.meeting.id !== s.meetingId)
      return {
        header: `DONE · ${s.who.toUpperCase()}`,
        body: `${lines.join('\n') || 'Nothing sent'}${next ? `\n\nNext: ${next.brief.time} · ${next.brief.who}` : ''}`,
        footer: canUndo ? HINT('Swipe: undo', `${Math.ceil((m.until - now) / 1000)}s`, 'Tap: next meeting') : HINT('Tap: next meeting'),
      }
    }

    case 'message':
      return { header: 'NEXT UP', body: `${m.title}\n\n${m.text}`, footer: HINT('Tap: back') }
  }
}

/** Same wording as the server's header, recomputed locally so the countdown stays live. */
export function headerFor(item: MeetingItem, now: number): string {
  const start = Date.parse(item.meeting.start)
  const end = Date.parse(item.meeting.end)
  const until = Math.floor((start - now) / 60_000)
  if (start > now) {
    if (until < 60) return `NEXT UP · IN ${until} MIN`
    const h = Math.floor(until / 60)
    const mm = until % 60
    return `LATER · IN ${h} H${mm ? ` ${mm} MIN` : ''}`
  }
  if (end > now) return `NOW · STARTED ${Math.max(0, -until)} MIN AGO`
  const ago = Math.round((now - end) / 60_000)
  return ago < 60 ? `AFTER · ENDED ${ago} MIN AGO` : `AFTER · ENDED ${Math.round(ago / 60)} H AGO`
}

function clip(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
