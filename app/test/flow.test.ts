// Drives the app core against a real server process in demo mode, the way a
// user would: pair on the phone, read the brief, speak (here: type) a
// follow-up, approve the drafts, undo.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { rmSync } from 'node:fs'
import { Api } from '../src/api'
import { NextUp, type Screen } from '../src/core'

const PORT = 8797
const BASE = `http://127.0.0.1:${PORT}`
let server: ChildProcess
const screens: Screen[] = []
const store = new Map<string, string>()
let app: NextUp
let micBytes = 0

const last = () => screens[screens.length - 1]!
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function until(cond: () => boolean, ms = 8000) {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out; last screen: ${JSON.stringify(last())}`)
    await wait(50)
  }
}

before(async () => {
  rmSync('/tmp/nextup-flow-test.json', { force: true })
  server = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: new URL('../../server/', import.meta.url).pathname,
    env: { ...process.env, PORT: String(PORT), PUBLIC_URL: BASE, DATA_FILE: '/tmp/nextup-flow-test.json', UNDO_SECONDS: '2', OPENROUTER_API_KEY: '', STT_API_KEY: '' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${BASE}/health`).then((r) => r.ok).catch(() => false)) break
    await wait(100)
  }
  app = new NextUp({
    api: new Api(BASE),
    show: (s) => screens.push(s),
    mic: {
      async start() {},
      async stop() {
        return new Uint8Array(micBytes)
      },
    },
    storage: { get: async (k) => store.get(k) ?? '', set: async (k, v) => void store.set(k, v) },
    now: () => Date.now(),
  })
})

after(() => {
  app?.stop()
  server?.kill()
})

test('first run shows a pairing code; the phone pairs and picks demo data', async () => {
  await app.start()
  assert.equal(last().header, 'NEXT UP · CONNECT')
  const code = last().body.match(/(\d{3}) (\d{3})/)!
  assert.ok(code, last().body)

  const pair = await fetch(`${BASE}/pair`, { method: 'POST', body: new URLSearchParams({ code: code[1]! + code[2]!, tz: 'Africa/Lagos' }), redirect: 'manual' })
  const cookie = pair.headers.get('set-cookie')!.split(';')[0]!
  await until(() => last().header === 'NEXT UP · ALMOST THERE')
  assert.match(last().body, /Connect Google/)
  await fetch(`${BASE}/connect/demo`, { method: 'POST', headers: { cookie }, redirect: 'manual' })

  await until(() => last().body.startsWith('Daniel Reyes'))
  assert.match(last().header, /^NEXT UP · IN 1[12] MIN · \d\d:\d\d  2\/3$/)
  assert.equal(last().body, 'Daniel Reyes · Harbor Studio\n\nLast: asked for a revised quote\nYou owe: timeline for phase 2')
  assert.equal(last().footer, 'Tap: more   ·   Hold: speak   ·   Swipe: next')
})

test('tap shows more, then quick follow-ups; swipes move between meetings', async () => {
  await app.input('tap')
  assert.equal(last().body, '• Budget capped at $40k\n• Wants launch before March\n• You met once: Oct 30')
  assert.match(last().footer, /^Tap: quick follow-ups/)
  await app.input('tap')
  assert.equal(last().header, 'QUICK FOLLOW-UP · DANIEL REYES')
  assert.match(last().body, /^> Send revised quote Friday, book check-in next Tuesday\n  Send phase 2 timeline tomorrow/)
  await app.input('swipeUp') // wraps to "Back to brief"
  assert.match(last().body, /\n> Back to brief$/)
  await app.input('tap')
  assert.match(last().body, /^Daniel Reyes/)
  await app.input('swipeDown')
  assert.match(last().body, /^Priya Shah/)
  await app.input('swipeUp')
  await app.input('swipeUp')
  assert.match(last().header, /^AFTER · ENDED/)
  assert.match(last().footer, /^Hold: speak follow-up/)
  await app.input('swipeDown')
  assert.match(last().body, /^Daniel Reyes/)
})

test('one tap on a suggestion drafts the follow-up, no typing or talking', async () => {
  await app.input('tap')
  await app.input('tap')
  await app.input('tap') // use the first suggestion
  await until(() => last().header.startsWith('DRAFT 1 / 3 · EMAIL'))
  assert.match(last().body, /revised quote by Friday/)
  for (let i = 0; i < 3; i++) await app.input('swipeDown') // skip all three
  await until(() => last().header.startsWith('DONE'))
  await app.input('tap')
  assert.match(last().body, /^Daniel Reyes/)
})

test('a voice note with no speech-to-text configured explains itself', async () => {
  micBytes = 64_000
  await app.input('holdStart')
  assert.match(last().header, /^AFTER · DANIEL REYES · REC 0:00$/)
  await app.input('holdEnd')
  await until(() => last().body.startsWith('Voice is off'))
  await app.input('tap')
  assert.match(last().body, /^Daniel Reyes/)
})

test('an accidental short press is ignored kindly', async () => {
  micBytes = 2_000
  await app.input('holdStart')
  await app.input('holdEnd')
  assert.match(last().body, /^Didn't catch that/)
  await app.input('tap')
})

test('typed follow-up → three drafts → approve, change, skip → done → undo', async () => {
  await app.typed('Send him the revised quote Friday, book a check-in next Tuesday')
  await until(() => last().header.startsWith('DRAFT 1 / 3 · EMAIL'))
  assert.equal(last().header, 'DRAFT 1 / 3 · EMAIL · Sends when approved')
  assert.match(last().body, /^To Daniel · Re: Website rebuild quote\n\nI'll send the revised quote by Friday\./)

  await app.input('tap') // approve email
  await until(() => last().header.startsWith('DRAFT 2 / 3 · INVITE'))
  assert.match(last().body, /^Tue \w+ \d+ · 10:00-10:30\n\nHarbor Studio · follow-up\nYou \+ Daniel Reyes$/)

  await app.typed('make it Wednesday at 11') // change the invite by "voice"
  await until(() => /^Wed /.test(last().body))
  assert.match(last().body, /^Wed \w+ \d+ · 11:00-11:30/)
  await app.input('tap') // approve invite

  await until(() => last().header.startsWith('DRAFT 3 / 3 · REMINDER'))
  await app.input('swipeDown') // skip the reminder

  await until(() => last().header.startsWith('DONE'))
  assert.equal(last().header, 'DONE · DANIEL REYES')
  assert.match(last().body, /^• Email sent\n• Invite sent · Wed 11:00\nSkipped 1\n\nNext: \d\d:\d\d · Priya Shah · Northlight VC$/)
  assert.match(last().footer, /^Swipe: undo   ·   \ds   ·   Tap: next meeting$/)

  await app.input('swipeDown') // undo inside the window
  await until(() => last().body.startsWith('Undone'))
  assert.equal(last().body, 'Undone\n\nNothing was sent to Daniel Reyes.')
  await app.input('tap')
  assert.match(last().body, /^Daniel Reyes/)
})

test('after the undo window, approved actions really run', async () => {
  await app.typed('Book a check-in next Monday at 2pm')
  await until(() => last().header.startsWith('DRAFT 1 / 2 · EMAIL'))
  await app.input('tap')
  await until(() => last().header.startsWith('DRAFT 2 / 2 · INVITE'))
  await app.input('tap')
  await until(() => last().header.startsWith('DONE'))
  await wait(3500)
  assert.equal(last().footer, 'Tap: next meeting', 'undo window closed')
  const cookieless = await fetch(`${BASE}/connect`, { redirect: 'manual' })
  assert.equal(cookieless.status, 303, 'outbox is private to the phone session')
})
