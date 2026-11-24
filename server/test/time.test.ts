import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isoIn, parseWhen, zonedToDate } from '../src/time.js'
import { localToIso, rulePlan } from '../src/followup.js'

// Monday 23 Nov 2026, 18:00 in Lagos (UTC+1)
const now = new Date('2026-11-23T17:00:00Z')

test('zoned round trip across zones', () => {
  const d = zonedToDate({ year: 2026, month: 12, day: 1, hour: 10, minute: 0 }, 'Africa/Lagos')
  assert.equal(d.toISOString(), '2026-12-01T09:00:00.000Z')
  assert.equal(isoIn(d, 'Africa/Lagos'), '2026-12-01T10:00:00+01:00')
  assert.equal(isoIn(d, 'America/New_York'), '2026-12-01T04:00:00-05:00')
})

test('spoken days and times', () => {
  const iso = (s: string, h?: number) => isoIn(parseWhen(s, now, 'Africa/Lagos', h)!, 'Africa/Lagos')
  assert.equal(iso('friday'), '2026-11-27T10:00:00+01:00')
  assert.equal(iso('Tuesday'), '2026-11-24T10:00:00+01:00')
  assert.equal(iso('next Tuesday'), '2026-12-01T10:00:00+01:00')
  assert.equal(iso('next Monday'), '2026-11-30T10:00:00+01:00')
  assert.equal(iso('tomorrow at 3'), '2026-11-24T15:00:00+01:00')
  assert.equal(iso('Wednesday at 9:30am'), '2026-11-25T09:30:00+01:00')
  assert.equal(iso('monday afternoon'), '2026-11-30T14:00:00+01:00', 'same weekday means next week')
  assert.equal(parseWhen('sometime soon', now, 'Africa/Lagos'), null)
})

test('local stamps from the LLM become offset ISO strings', () => {
  assert.equal(localToIso('2026-12-01T10:00', 'Europe/London'), '2026-12-01T10:00:00+00:00')
  assert.equal(localToIso('nonsense', 'UTC'), undefined)
})

test('rules plan without an LLM', () => {
  const meeting = {
    id: 'm', title: 'Harbor Studio: quote', start: '', end: '',
    attendees: [{ name: 'Daniel Reyes', email: 'd@x.example' }],
  }
  const plan = rulePlan('Send him the revised quote Friday, book a check-in next Tuesday', meeting, now, 'Africa/Lagos', 'Alex')
  assert.match(plan.message!.body, /^Hi Daniel,/)
  assert.match(plan.message!.body, /I'll send the revised quote by Friday\./)
  assert.match(plan.message!.body, /invite for Tuesday at 10:00/)
  assert.equal(plan.invite?.start, '2026-12-01T10:00')
  assert.deepEqual(plan.reminders, [{ title: 'Send Daniel the revised quote', start: '2026-11-27T09:00' }])
})
