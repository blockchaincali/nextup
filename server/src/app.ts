import express, { type NextFunction, type Request, type Response } from 'express'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { ActionQueue } from './actions.js'
import { buildBrief } from './brief.js'
import { config, hasGoogle, hasStt, hasTelegram } from './config.js'
import { demoLog } from './demo.js'
import { makeDrafts, reviseDraft, toCard } from './followup.js'
import * as google from './google.js'
import { connectPage, landingPage, LOGO_SVG, pairPage, privacyPage, telegramPage } from './pages.js'
import { sourcesFor } from './sources.js'
import { id, Store } from './store.js'
import { transcribe } from './stt.js'
import * as telegram from './telegram.js'
import type { Brief, Device, FollowUpSession, Meeting, User } from './types.js'

export interface AppOptions {
  store: Store
  sessionSecret?: string
  /** Replaces speech-to-text in tests. */
  transcribe?: (pcm: Buffer) => Promise<string>
}

export function createApp(opts: AppOptions) {
  const { store } = opts
  const secret = opts.sessionSecret || process.env.SESSION_SECRET || randomBytes(32).toString('hex')
  const stt = opts.transcribe ?? transcribe
  const save = (u: User) => store.updateUser(u)
  const queue = new ActionQueue(
    store,
    (userId) => {
      const user = store.user(userId)
      return user ? { user, sources: sourcesFor(user, save) } : undefined
    },
    config.undoSeconds,
  )

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  // CORS for the glasses WebView and the simulator. The API uses bearer tokens, not cookies.
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin
    const allowed = config.corsOrigins === '*' || (origin && config.corsOrigins.split(',').map((s) => s.trim()).includes(origin))
    if (allowed) res.setHeader('access-control-allow-origin', config.corsOrigins === '*' ? '*' : origin!)
    res.setHeader('access-control-allow-headers', 'authorization, content-type')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    res.setHeader('access-control-max-age', '600')
    if (req.method === 'OPTIONS') return void res.sendStatus(204)
    next()
  })
  app.use(express.json({ limit: '64kb' }))
  app.use(express.urlencoded({ extended: false, limit: '16kb' }))
  app.use(express.raw({ type: 'application/octet-stream', limit: '4mb' }))

  // ── helpers ────────────────────────────────────────────────────────────

  const sign = (v: string) => `${v}.${createHmac('sha256', secret).update(v).digest('base64url')}`
  const unsign = (signed: string | undefined): string | undefined => {
    if (!signed) return undefined
    const i = signed.lastIndexOf('.')
    if (i < 0) return undefined
    const v = signed.slice(0, i)
    const a = Buffer.from(sign(v))
    const b = Buffer.from(signed)
    return a.length === b.length && timingSafeEqual(a, b) ? v : undefined
  }
  const cookie = (req: Request, name: string) =>
    req.headers.cookie
      ?.split(';')
      .map((c) => c.trim().split('='))
      .find(([k]) => k === name)?.[1]
  const setSession = (res: Response, userId: string) =>
    res.setHeader(
      'set-cookie',
      `nu_s=${sign(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${config.publicUrl.startsWith('https') ? '; Secure' : ''}`,
    )
  const webUser = (req: Request) => store.user(unsign(decodeURIComponent(cookie(req, 'nu_s') ?? '')))

  const isReady = (u: User) => u.demo || Boolean(u.google)

  // Tiny in-memory rate limiter for code guessing and expensive calls.
  const hits = new Map<string, number[]>()
  const limited = (key: string, max: number, windowMs: number) => {
    const now = Date.now()
    const list = (hits.get(key) ?? []).filter((t) => t > now - windowMs)
    list.push(now)
    hits.set(key, list)
    return list.length > max
  }

  interface Authed extends Request {
    device: Device
    user?: User
  }
  const device = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const d = store.device(token)
    if (!d) return void res.status(401).json({ error: 'unknown_device' })
    ;(req as Authed).device = d
    ;(req as Authed).user = store.user(d.userId)
    next()
  }
  const linked = (req: Request, res: Response, next: NextFunction) => {
    const u = (req as Authed).user
    if (!u || !isReady(u)) return void res.status(409).json({ error: 'not_paired' })
    next()
  }
  const wrap =
    (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
      fn(req, res).catch(next)

  // ── pairing (glasses side) ─────────────────────────────────────────────

  app.post('/api/pair/start', (req, res) => {
    if (limited(`start:${req.ip}`, 20, 60_000)) return void res.status(429).json({ error: 'slow_down' })
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const d = store.device(token) ?? store.createDevice()
    const code = store.issuePairCode(d)
    res.json({ token: d.token, code, expiresAt: d.pairCodeExpiresAt, pairUrl: `${config.publicUrl}/pair` })
  })

  app.get('/api/pair/status', device, (req, res) => {
    const { user } = req as Authed
    // paired: the phone entered the code; linked: an account (or demo data) is connected too.
    res.json({ paired: Boolean(user), linked: Boolean(user && isReady(user)), demo: user?.demo ?? false })
  })

  app.post('/api/unpair', device, (req, res) => {
    store.unlinkDevice((req as Authed).device)
    res.json({ ok: true })
  })

  // ── meetings and briefs ───────────────────────────────────────────────

  const briefCache = new Map<string, { at: number; brief: Brief }>()
  const BRIEF_TTL = 10 * 60_000

  app.get(
    '/api/meetings',
    device,
    linked,
    wrap(async (req, res) => {
      const user = (req as Authed).user!
      const sources = sourcesFor(user, save)
      const now = new Date()
      const { timeZone, meetings } = await sources.meetings(new Date(now.getTime() - 6 * 3600_000), new Date(now.getTime() + 18 * 3600_000))
      if (timeZone && timeZone !== user.timeZone && !user.demo) {
        user.timeZone = timeZone
        save(user)
      }
      const tz = user.timeZone
      const items = await Promise.all(
        meetings.map(async (m) => {
          const key = `${user.id}:${m.id}:${m.start}`
          const hit = briefCache.get(key)
          let brief = hit && hit.at > Date.now() - BRIEF_TTL ? hit.brief : undefined
          if (!brief) {
            brief = await buildBrief(sources, m, tz, now)
            briefCache.set(key, { at: Date.now(), brief })
          }
          const start = new Date(m.start).getTime()
          const end = new Date(m.end).getTime()
          const minutesUntil = Math.floor((start - now.getTime()) / 60_000)
          const phase = end < now.getTime() ? 'past' : start <= now.getTime() ? 'now' : 'upcoming'
          return { meeting: summarise(m), brief: { ...brief, minutesUntil }, phase, header: headerFor(phase, minutesUntil, end, now) }
        }),
      )
      const focus = Math.max(0, items.findIndex((i) => i.phase !== 'past'))
      res.json({ timeZone: tz, now: now.toISOString(), focus: items.length ? (items[focus]?.phase === 'past' ? items.length - 1 : focus) : -1, items })
    }),
  )

  // ── follow-ups ────────────────────────────────────────────────────────

  /** Text from either a JSON body {text} or raw PCM audio. */
  async function heard(req: Request): Promise<string> {
    if (Buffer.isBuffer(req.body)) {
      if (!hasStt() && !opts.transcribe) throw Object.assign(new Error('Speech-to-text is not configured on the server'), { status: 503 })
      return stt(req.body)
    }
    return String((req.body as { text?: string })?.text ?? '').trim()
  }

  async function findMeeting(user: User, meetingId: string): Promise<Meeting | undefined> {
    const sources = sourcesFor(user, save)
    const now = Date.now()
    const { meetings } = await sources.meetings(new Date(now - 24 * 3600_000), new Date(now + 48 * 3600_000))
    return meetings.find((m) => m.id === meetingId)
  }

  app.post(
    '/api/followup',
    device,
    linked,
    wrap(async (req, res) => {
      const user = (req as Authed).user!
      if (limited(`followup:${user.id}`, 30, 60 * 60_000)) return void res.status(429).json({ error: 'slow_down' })
      const meetingId = String(req.query.meetingId ?? (req.body as { meetingId?: string })?.meetingId ?? '')
      const meeting = await findMeeting(user, meetingId)
      if (!meeting) return void res.status(404).json({ error: 'meeting_not_found' })
      const transcript = await heard(req)
      if (!transcript) return void res.status(422).json({ error: 'nothing_heard' })
      const sources = sourcesFor(user, save)
      const cached = [...briefCache.entries()].find(([k]) => k.startsWith(`${user.id}:${meeting.id}:`))?.[1].brief
      const drafts = await makeDrafts({
        sources,
        meeting,
        transcript,
        timeZone: user.timeZone,
        preferredChannel: cached?.preferredChannel ?? 'email',
      })
      const session: FollowUpSession = { id: id(10), userId: user.id, meetingId, transcript, drafts, createdAt: Date.now() }
      store.putSession(session)
      res.json({
        sessionId: session.id,
        transcript,
        cards: drafts.map((d, i) => toCard(d, i, drafts.length, user.timeZone)),
      })
    }),
  )

  const sessionFor = (req: Request, res: Response) => {
    const user = (req as Authed).user!
    const s = store.session(req.params.sid!)
    if (!s || s.userId !== user.id) {
      res.status(404).json({ error: 'session_not_found' })
      return undefined
    }
    return { user, session: s }
  }

  app.get('/api/sessions/:sid', device, linked, (req, res) => {
    const ctx = sessionFor(req, res)
    if (!ctx) return
    const { session, user } = ctx
    res.json({
      sessionId: session.id,
      cards: session.drafts.map((d, i) => toCard(d, i, session.drafts.length, user.timeZone)),
    })
  })

  app.post('/api/sessions/:sid/drafts/:did/approve', device, linked, (req, res) => {
    const ctx = sessionFor(req, res)
    if (!ctx) return
    const draft = ctx.session.drafts.find((d) => d.id === req.params.did)
    if (!draft) return void res.status(404).json({ error: 'draft_not_found' })
    const action = queue.approve(ctx.user, draft)
    res.json({ actionId: action.id, runsAt: action.runAt, status: action.status, undoSeconds: config.undoSeconds, summary: doneLine(draft, ctx.user.timeZone) })
  })

  app.post(
    '/api/sessions/:sid/drafts/:did/revise',
    device,
    linked,
    wrap(async (req, res) => {
      const ctx = sessionFor(req, res)
      if (!ctx) return
      const { session, user } = ctx
      const i = session.drafts.findIndex((d) => d.id === req.params.did)
      if (i < 0) return void res.status(404).json({ error: 'draft_not_found' })
      const instruction = await heard(req)
      if (!instruction) return void res.status(422).json({ error: 'nothing_heard' })
      const revised = await reviseDraft(session.drafts[i]!, instruction, sourcesFor(user, save), user.timeZone)
      session.drafts[i] = revised
      store.putSession(session)
      res.json({ instruction, card: toCard(revised, i, session.drafts.length, user.timeZone) })
    }),
  )

  app.get('/api/actions/:aid', device, linked, (req, res) => {
    const a = store.action(req.params.aid!)
    if (!a || a.userId !== (req as Authed).user!.id) return void res.status(404).json({ error: 'action_not_found' })
    res.json({ id: a.id, status: a.status, error: a.error })
  })

  app.post(
    '/api/actions/:aid/undo',
    device,
    linked,
    wrap(async (req, res) => {
      const a = store.action(req.params.aid!)
      if (!a || a.userId !== (req as Authed).user!.id) return void res.status(404).json({ error: 'action_not_found' })
      res.json(await queue.undo(a))
    }),
  )

  // ── phone pages: pairing and connecting accounts ──────────────────────

  app.get('/', (_req, res) => res.type('html').send(landingPage()))
  app.get(['/favicon.svg', '/logo.svg'], (_req, res) => res.type('image/svg+xml').set('cache-control', 'public, max-age=86400').send(LOGO_SVG))
  app.get('/favicon.ico', (_req, res) => res.redirect(301, '/favicon.svg'))
  app.get('/privacy', (_req, res) => res.type('html').send(privacyPage()))
  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.get('/pair', (_req, res) => res.type('html').send(pairPage()))

  app.post('/pair', (req, res) => {
    if (limited(`pair:${req.ip}`, 10, 60_000)) return void res.status(429).type('html').send(pairPage('Too many tries. Wait a minute.'))
    const d = store.deviceByCode(String(req.body.code ?? ''))
    if (!d) return void res.status(400).type('html').send(pairPage('That code didn’t match. Check your glasses and try again.'))
    const tz = String(req.body.tz ?? '')
    const validTz = (() => {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz })
        return tz
      } catch {
        return 'UTC'
      }
    })()
    const existing = webUser(req)
    const user = existing ?? store.createUser({ timeZone: validTz || 'UTC' })
    store.linkDevice(d, user)
    setSession(res, user.id)
    res.redirect(303, '/connect')
  })

  const connectView = (u: User) => ({
    googleAvailable: hasGoogle(),
    telegramAvailable: hasTelegram(),
    googleEmail: u.google?.email,
    telegramConnected: Boolean(u.telegramSession),
    demo: u.demo,
    ready: isReady(u),
    outbox: u.demo ? demoLog(u.id) : [],
    timeZone: u.timeZone,
  })

  const requireWeb = (req: Request, res: Response): User | undefined => {
    const u = webUser(req)
    if (!u) res.redirect(303, '/pair')
    return u
  }

  app.get('/connect', (req, res) => {
    const u = requireWeb(req, res)
    if (u) res.type('html').send(connectPage(connectView(u)))
  })

  app.post('/connect/demo', (req, res) => {
    const u = requireWeb(req, res)
    if (!u) return
    u.demo = true
    save(u)
    res.redirect(303, '/connect')
  })

  app.get('/auth/google', (req, res) => {
    const u = requireWeb(req, res)
    if (!u) return
    if (!hasGoogle()) return void res.redirect(303, '/connect')
    res.redirect(303, google.authUrl(sign(`${u.id}:${id(6)}`)))
  })

  app.get(
    '/auth/google/callback',
    wrap(async (req, res) => {
      const state = unsign(String(req.query.state ?? ''))
      const u = store.user(state?.split(':')[0])
      if (!u) return void res.status(400).type('html').send(pairPage('Sign-in expired. Pair again.'))
      if (req.query.error || !req.query.code) return void res.type('html').send(connectPage(connectView(u), 'Google sign-in was cancelled.'))
      u.google = await google.exchangeCode(String(req.query.code))
      u.demo = false
      save(u)
      setSession(res, u.id)
      res.redirect(303, '/connect')
    }),
  )

  app.get('/connect/telegram', (req, res) => {
    if (requireWeb(req, res)) res.type('html').send(telegramPage('phone'))
  })

  app.post(
    '/connect/telegram/start',
    wrap(async (req, res) => {
      const u = requireWeb(req, res)
      if (!u) return
      if (limited(`tg:${u.id}`, 5, 10 * 60_000)) return void res.type('html').send(telegramPage('phone', 'Too many tries. Wait a few minutes.'))
      try {
        await telegram.startLogin(u.id, String(req.body.phone ?? '').replace(/[^\d+]/g, ''))
        res.type('html').send(telegramPage('code'))
      } catch (e) {
        res.type('html').send(telegramPage('phone', (e as Error).message))
      }
    }),
  )

  app.post(
    '/connect/telegram/code',
    wrap(async (req, res) => {
      const u = requireWeb(req, res)
      if (!u) return
      try {
        const result = await telegram.finishLogin(u.id, String(req.body.code ?? ''), req.body.password ? String(req.body.password) : undefined)
        if (result === 'password') return void res.type('html').send(telegramPage('password'))
        u.telegramSession = result
        save(u)
        res.redirect(303, '/connect')
      } catch (e) {
        res.type('html').send(telegramPage('code', (e as Error).message))
      }
    }),
  )

  app.post('/account/disconnect/google', (req, res) => {
    const u = requireWeb(req, res)
    if (!u) return
    delete u.google
    save(u)
    res.redirect(303, '/connect')
  })

  app.post(
    '/account/disconnect/telegram',
    wrap(async (req, res) => {
      const u = requireWeb(req, res)
      if (!u) return
      await telegram.logout(u).catch(() => {})
      delete u.telegramSession
      save(u)
      res.redirect(303, '/connect')
    }),
  )

  app.post(
    '/account/delete',
    wrap(async (req, res) => {
      const u = requireWeb(req, res)
      if (!u) return
      if (u.telegramSession) await telegram.logout(u).catch(() => {})
      store.deleteUser(u.id)
      res.setHeader('set-cookie', 'nu_s=; Path=/; Max-Age=0')
      res.redirect(303, '/')
    }),
  )

  // ── errors ────────────────────────────────────────────────────────────

  app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
    console.error(`[${req.method} ${req.path}]`, err.message)
    if (req.path.startsWith('/api')) res.status(err.status ?? 500).json({ error: 'server_error', message: err.message })
    else res.status(500).type('html').send(pairPage('Something went wrong. Try again.'))
  })

  return { app, queue }
}

// ── formatting helpers ──────────────────────────────────────────────────

function summarise(m: Meeting) {
  return { id: m.id, title: m.title, start: m.start, end: m.end, location: m.location, attendees: m.attendees.map((a) => a.name) }
}

export function headerFor(phase: string, minutesUntil: number, end: number, now: Date): string {
  if (phase === 'upcoming') {
    if (minutesUntil < 60) return `NEXT UP · IN ${minutesUntil} MIN`
    const h = Math.floor(minutesUntil / 60)
    const m = minutesUntil % 60
    return `LATER · IN ${h} H${m ? ` ${m} MIN` : ''}`
  }
  if (phase === 'now') return `NOW · STARTED ${Math.max(0, -minutesUntil)} MIN AGO`
  const ago = Math.round((now.getTime() - end) / 60_000)
  return ago < 60 ? `AFTER · ENDED ${ago} MIN AGO` : `AFTER · ENDED ${Math.round(ago / 60)} H AGO`
}

function doneLine(d: import('./types.js').Draft, timeZone: string): string {
  const day = (iso: string) =>
    `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date(iso))} ${new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso))}`
  switch (d.kind) {
    case 'email':
      return d.sendAt ? `Email scheduled · ${day(d.sendAt)}` : 'Email sent'
    case 'telegram':
      return d.sendAt ? `Telegram scheduled · ${day(d.sendAt)}` : 'Telegram sent'
    case 'invite':
      return `Invite sent · ${day(d.start)}`
    case 'reminder':
      return `Reminder set · ${day(d.start)}`
  }
}
