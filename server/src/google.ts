// Google Calendar + Gmail over plain REST with fetch, so we ship no SDK.
import { config } from './config.js'
import type { GoogleTokens, Meeting, Person, User } from './types.js'

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events', // read meetings, create the follow-up invite
  'https://www.googleapis.com/auth/calendar.freebusy', // check the proposed slot is free
  'https://www.googleapis.com/auth/gmail.readonly', // last thread with the person
  'https://www.googleapis.com/auth/gmail.send', // send the approved follow-up
]

export function authUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: `${config.publicUrl}/auth/google/callback`,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: `${config.publicUrl}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`)
  const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove the app from your Google account and try again.')
  const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${t.access_token}` },
  }).then((r) => r.json() as Promise<{ email: string }>)
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + (t.expires_in - 60) * 1000,
    email: info.email,
  }
}

/** Returns a valid access token, refreshing it when needed. Mutates user.google. */
async function token(user: User, save: (u: User) => void): Promise<string> {
  const g = user.google
  if (!g) throw new Error('Google is not connected')
  if (g.expiresAt > Date.now()) return g.accessToken
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: g.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status}`)
  const t = (await res.json()) as { access_token: string; expires_in: number }
  g.accessToken = t.access_token
  g.expiresAt = Date.now() + (t.expires_in - 60) * 1000
  save(user)
  return g.accessToken
}

async function api<T>(user: User, save: (u: User) => void, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${await token(user, save)}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`Google API ${res.status} on ${new URL(url).pathname}: ${(await res.text()).slice(0, 300)}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

// ── Calendar ────────────────────────────────────────────────────────────

interface GEvent {
  id: string
  summary?: string
  location?: string
  status?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  attendees?: Array<{ email: string; displayName?: string; self?: boolean; responseStatus?: string }>
}

/**
 * Meetings with other people between `from` and `to`. Skips all-day events,
 * cancelled events, events you declined and events with nobody else on them.
 * Also returns the calendar's time zone.
 */
export async function listMeetings(user: User, save: (u: User) => void, from: Date, to: Date) {
  const q = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '25',
  })
  const data = await api<{ timeZone: string; items: GEvent[] }>(
    user,
    save,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`,
  )
  const meetings: Meeting[] = []
  for (const e of data.items ?? []) {
    if (e.status === 'cancelled' || !e.start.dateTime || !e.end.dateTime) continue
    const me = e.attendees?.find((a) => a.self)
    if (me?.responseStatus === 'declined') continue
    const others: Person[] = (e.attendees ?? [])
      .filter((a) => !a.self && !a.email.endsWith('resource.calendar.google.com'))
      .map((a) => ({ name: a.displayName || nameFromEmail(a.email), email: a.email }))
    if (others.length === 0) continue
    meetings.push({
      id: e.id,
      title: e.summary ?? 'Meeting',
      start: e.start.dateTime,
      end: e.end.dateTime,
      location: e.location,
      attendees: others,
    })
  }
  return { timeZone: data.timeZone, meetings }
}

export async function isFree(user: User, save: (u: User) => void, start: string, end: string): Promise<boolean> {
  const data = await api<{ calendars: Record<string, { busy: unknown[] }> }>(
    user,
    save,
    'https://www.googleapis.com/calendar/v3/freeBusy',
    { method: 'POST', body: JSON.stringify({ timeMin: start, timeMax: end, items: [{ id: 'primary' }] }) },
  )
  return (data.calendars.primary?.busy ?? []).length === 0
}

export async function createEvent(
  user: User,
  save: (u: User) => void,
  ev: { title: string; start: string; end: string; attendees: Person[] },
): Promise<string> {
  const created = await api<{ id: string }>(
    user,
    save,
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',
    {
      method: 'POST',
      body: JSON.stringify({
        summary: ev.title,
        start: { dateTime: ev.start },
        end: { dateTime: ev.end },
        attendees: ev.attendees.filter((a) => a.email).map((a) => ({ email: a.email, displayName: a.name })),
      }),
    },
  )
  return created.id
}

export async function deleteEvent(user: User, save: (u: User) => void, eventId: string) {
  await api(user, save, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE',
  })
}

// ── Gmail ───────────────────────────────────────────────────────────────

export interface MailItem {
  id: string
  threadId: string
  messageId?: string
  subject: string
  from: string
  date: Date
  snippet: string
  fromMe: boolean
}

/** The latest few emails to or from a person, newest first. */
export async function recentMail(user: User, save: (u: User) => void, email: string, max = 6): Promise<MailItem[]> {
  const q = new URLSearchParams({ q: `(from:${email} OR to:${email}) newer_than:120d`, maxResults: String(max) })
  const list = await api<{ messages?: Array<{ id: string }> }>(
    user,
    save,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${q}`,
  )
  const out: MailItem[] = []
  for (const m of list.messages ?? []) {
    const msg = await api<{
      id: string
      threadId: string
      snippet: string
      internalDate: string
      payload: { headers: Array<{ name: string; value: string }> }
    }>(
      user,
      save,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID`,
    )
    const h = (n: string) => msg.payload.headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? ''
    const from = h('From')
    out.push({
      id: msg.id,
      threadId: msg.threadId,
      messageId: h('Message-ID') || undefined,
      subject: h('Subject'),
      from,
      date: new Date(Number(msg.internalDate)),
      snippet: decodeEntities(msg.snippet),
      fromMe: user.google ? from.toLowerCase().includes(user.google.email.toLowerCase()) : false,
    })
  }
  return out.sort((a, b) => b.date.getTime() - a.date.getTime())
}

export async function sendEmail(
  user: User,
  save: (u: User) => void,
  mail: { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string },
): Promise<string> {
  const headers = [
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  ]
  if (mail.inReplyTo) headers.push(`In-Reply-To: ${mail.inReplyTo}`, `References: ${mail.inReplyTo}`)
  const raw = Buffer.from(`${headers.join('\r\n')}\r\n\r\n${mail.body}`, 'utf8').toString('base64url')
  const sent = await api<{ id: string }>(user, save, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw, threadId: mail.threadId }),
  })
  return sent.id
}

// ── helpers ─────────────────────────────────────────────────────────────

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
}

function encodeHeader(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
