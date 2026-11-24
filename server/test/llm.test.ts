// The LLM path against a stand-in OpenAI-compatible server: good answers are
// used, hollow ones ("Hi Sam" and nothing else) fall back to the rule-written recap.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

let reply: unknown = {}
let lastBody: { response_format?: unknown } = {}
const server = http.createServer((req, res) => {
  let b = ''
  req.on('data', (c) => (b += c))
  req.on('end', () => {
    lastBody = JSON.parse(b)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }))
  })
})

before(async () => {
  await new Promise<void>((r) => server.listen(0, r))
  process.env.LLM_API_KEY = 'test'
  process.env.LLM_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
after(() => server.close())

const tz = 'Africa/Lagos'
const load = async () => {
  const { makeDrafts } = await import('../src/followup.js')
  const { demoSources, demoMeetings } = await import('../src/demo.js')
  const sources = demoSources({ id: 'u', createdAt: 0, timeZone: tz, demo: true })
  const meeting = (id: string) => demoMeetings(new Date(), tz).find((m) => m.id === id)!
  return { makeDrafts, sources, meeting }
}

test('a full LLM recap is used as written', async () => {
  const { makeDrafts, sources, meeting } = await load()
  reply = {
    message: { channel: 'email', subject: 'x', body: 'Hi Daniel,\n\nThanks for today. I’ll send the revised quote by Friday, and I’ve booked Tuesday to go through phase 2.\n\nBest,\nAlex', sendAt: null },
    invite: { title: 'Harbor Studio · phase 2', start: '2026-12-01T10:00', durationMinutes: 30 },
    reminders: [{ title: 'Send Daniel the revised quote', start: '2026-11-27T09:00' }],
  }
  const drafts = await makeDrafts({ sources, meeting: meeting('demo-daniel'), transcript: 'x', timeZone: tz, preferredChannel: 'email' })
  assert.deepEqual(drafts.map((d) => d.kind), ['email', 'invite', 'reminder'])
  assert.match((drafts[0] as { body: string }).body, /booked Tuesday/)
  assert.ok(lastBody.response_format, 'asks for JSON mode')
})

test('a greeting-only LLM recap is replaced, keeping the LLM invite', async () => {
  const { makeDrafts, sources, meeting } = await load()
  reply = {
    message: { channel: 'email', subject: 'x', body: 'Hi Sam', sendAt: null },
    invite: { title: 'Lumen Labs · checklist review', start: '2026-11-27T09:00', durationMinutes: 30 },
    reminders: [],
  }
  const drafts = await makeDrafts({
    sources,
    meeting: meeting('demo-sam'),
    transcript: 'Send him the onboarding checklist tomorrow, book a review on Friday at 9am',
    timeZone: tz,
    preferredChannel: 'email',
  })
  const email = drafts.find((d) => d.kind === 'email') as { body: string }
  assert.match(email.body, /^Hi Sam,\n\nGreat to see you today/)
  assert.match(email.body, /onboarding checklist/)
  assert.equal(drafts.find((d) => d.kind === 'invite')?.kind, 'invite')
})
