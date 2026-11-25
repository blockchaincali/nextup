import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAddress, personFromTitle } from '../src/people.js'

test('people named in event titles', () => {
  const cases: Array<[string, string | undefined]> = [
    ['Coffee with Daniel Reyes', 'Daniel Reyes'],
    ['Call w/ Priya', 'Priya'],
    ['Lunch: Sam Okafor', 'Sam Okafor'],
    ['Meeting with Ada Obi at Harbor', 'Ada Obi'],
    ['Daniel <> Alex', 'Daniel'],
    ['1:1 with Tunde', 'Tunde'],
    ['Catch up with Maya Lin', 'Maya Lin'],
    ['Weekly team sync', undefined],
    ['Dentist', undefined],
    ['Site visit', undefined],
    ['Call with the Board', undefined],
  ]
  for (const [title, want] of cases) assert.equal(personFromTitle(title), want, title)
})

test('email From headers', () => {
  assert.deepEqual(parseAddress('Daniel Reyes <Daniel@Harbor.example>'), { name: 'Daniel Reyes', email: 'daniel@harbor.example' })
  assert.deepEqual(parseAddress('"Reyes, Daniel" <d@x.example>'), { name: 'Reyes, Daniel', email: 'd@x.example' })
  assert.deepEqual(parseAddress('d@x.example'), { name: '', email: 'd@x.example' })
})
