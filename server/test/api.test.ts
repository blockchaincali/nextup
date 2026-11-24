// End-to-end test of the API in demo mode, no network and no keys:
// pair → link via the phone page → meetings + briefs → spoken follow-up →
// approve → undo window → action runs.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

process.env.UNDO_SECONDS = '1'
delete process.env.OPENROUTER_API_KEY

const { createApp } = await import('../src/app.js')
const { Store } = await import('../src/store.js')
const { demoLog } = await import('../src/demo.js')

let server: Server
let base = ''
let token = ''
let cookie = ''
let queueRef: { runDue: (now?: number) => Promise<void> }

before(async () => {
  const { app, queue } = createApp({
    store: new Store(null),
    sessionSecret: 'test-secret',
    transcribe: async () => 'Send him the revised quote Friday, book a check-in next Tuesday',
  })
  queueRef = queue
  server = app.listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => server.close())

const api = (path: string, init: RequestInit = {}) =>
  fetch(base + path, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })

test('pairing links the glasses once the phone picks demo data', async () => {
  const start = await (await fetch(`${base}/api/pair/start`, { method: 'POST' })).json()
  assert.match(start.code, /^\d{6}$/)
  token = start.token

  let status = await (await api('/api/pair/status')).json()
  assert.equal(status.linked, false)

  const bad = await fetch(`${base}/pair`, { method: 'POST', body: new URLSearchParams({ code: '000000x', tz: 'Africa/Lagos' }), redirect: 'manual' })
  assert.equal(bad.status, 400)

  const ok = await fetch(`${base}/pair`, { method: 'POST', body: new URLSearchParams({ code: start.code, tz: 'Africa/Lagos' }), redirect: 'manual' })
  assert.equal(ok.status, 303)
  cookie = ok.headers.get('set-cookie')!.split(';')[0]!

  status = await (await api('/api/pair/status')).json()
  assert.equal(status.linked, false, 'paired but nothing connected yet')

  const demo = await fetch(`${base}/connect/demo`, { method: 'POST', headers: { cookie }, redirect: 'manual' })
  assert.equal(demo.status, 303)
  status = await (await api('/api/pair/status')).json()
  assert.equal(status.linked, true)
  assert.equal(status.demo, true)
})

test('meetings come back with glance-sized briefs and the next one in focus', async () => {
  const data = await (await api('/api/meetings')).json()
  assert.equal(data.items.length, 3)
  const focus = data.items[data.focus]
  assert.equal(focus.meeting.id, 'demo-daniel')
  assert.match(focus.header, /^NEXT UP · IN 1[12] MIN$/)
  assert.equal(focus.brief.who, 'Daniel Reyes · Harbor Studio')
  assert.equal(focus.brief.details.length, 3)
  assert.equal(data.items[0].phase, 'past')
  assert.match(data.items[0].header, /^AFTER · ENDED/)
})

let sessionId = ''
let cards: Array<{ id: string; kind: string; header: string; title: string; body: string; when: string }> = []

test('one spoken sentence becomes a recap email, an invite and a reminder', async () => {
  const pcm = Buffer.alloc(64_000) // 2 s of silence; the test transcriber returns a fixed sentence
  const res = await api('/api/followup?meetingId=demo-daniel', { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: pcm })
  assert.equal(res.status, 200)
  const data = await res.json()
  sessionId = data.sessionId
  cards = data.cards
  assert.deepEqual(cards.map((c) => c.kind), ['email', 'invite', 'reminder'])
  assert.equal(cards[0]!.header, 'DRAFT 1 / 3 · EMAIL')
  assert.match(cards[0]!.title, /^To Daniel · Re: Website rebuild quote/)
  assert.match(cards[0]!.body, /revised quote by Friday/i)
  assert.match(cards[1]!.title, /^Tue .* · 10:00-10:30$/)
  assert.equal(cards[2]!.body, 'Send Daniel the revised quote')
  for (const c of cards) assert.ok(c.title.length <= 40 && c.body.length <= 100, `card fits: ${c.title} / ${c.body}`)
})

test('typed text works too, and revising moves the invite', async () => {
  const res = await api(`/api/sessions/${sessionId}/drafts/${cards[1]!.id}/revise`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'make it Wednesday at 3pm' }),
  })
  const data = await res.json()
  assert.match(data.card.title, /^Wed .* · 15:00-15:30$/)
  assert.equal(data.card.when, 'Clash: you are busy', 'demo calendar is busy at 15:00')
})

test('approve waits out the undo window, then runs; undo cancels', async () => {
  const a1 = await (await api(`/api/sessions/${sessionId}/drafts/${cards[0]!.id}/approve`, { method: 'POST' })).json()
  const a2 = await (await api(`/api/sessions/${sessionId}/drafts/${cards[2]!.id}/approve`, { method: 'POST' })).json()
  assert.equal(a1.summary, 'Email sent')
  assert.match(a2.summary, /^Reminder set · Fri 09:00$/)

  await queueRef.runDue(Date.now())
  assert.equal((await (await api(`/api/actions/${a1.actionId}`)).json()).status, 'pending', 'still inside undo window')

  const undo = await (await api(`/api/actions/${a2.actionId}/undo`, { method: 'POST' })).json()
  assert.equal(undo.ok, true)

  await queueRef.runDue(Date.now() + 5_000)
  assert.equal((await (await api(`/api/actions/${a1.actionId}`)).json()).status, 'done')
  assert.equal((await (await api(`/api/actions/${a2.actionId}`)).json()).status, 'undone')

  const sent = await (await api(`/api/actions/${a1.actionId}/undo`, { method: 'POST' })).json()
  assert.deepEqual(sent, { ok: false, reason: 'Already sent' })
})

test('the demo outbox shows what was sent, and the connect page lists it', async () => {
  const page = await (await fetch(`${base}/connect`, { headers: { cookie } })).text()
  assert.match(page, /Demo outbox/)
  assert.match(page, /Email to Daniel Reyes/)
  assert.ok(demoLog.length >= 0)
})

test('unknown devices and other users’ sessions are refused', async () => {
  const res = await fetch(`${base}/api/meetings`, { headers: { authorization: 'Bearer nope' } })
  assert.equal(res.status, 401)
  const other = await (await fetch(`${base}/api/pair/start`, { method: 'POST' })).json()
  const peek = await fetch(`${base}/api/sessions/${sessionId}`, { headers: { authorization: `Bearer ${other.token}` } })
  assert.equal(peek.status, 409, 'an unpaired device cannot read anything')
})

test('delete everything removes the account and unpairs the glasses', async () => {
  const del = await fetch(`${base}/account/delete`, { method: 'POST', headers: { cookie }, redirect: 'manual' })
  assert.equal(del.status, 303)
  const res = await api('/api/pair/status')
  assert.equal(res.status, 401)
})
