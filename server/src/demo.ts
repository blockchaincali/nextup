// The demo world: a believable day of meetings, email threads and Telegram
// chats, placed relative to "now" so the brief always reads "in 12 min".
// Sending in demo mode changes nothing outside; it is logged instead.
import type { Sources } from './sources.js'
import type { Meeting, Person, User } from './types.js'
import { isoIn } from './time.js'

const daniel: Person = { name: 'Daniel Reyes', email: 'daniel@harborstudio.example' }
const priya: Person = { name: 'Priya Shah', email: 'priya@northlight.vc.example', telegram: '@priyashah_demo' }
const sam: Person = { name: 'Sam Okafor', email: 'sam@lumenlabs.example' }

export interface DemoLogEntry {
  at: number
  what: string
}
const logs = new Map<string, DemoLogEntry[]>()
export function demoLog(userId: string): DemoLogEntry[] {
  return logs.get(userId) ?? []
}
function log(userId: string, what: string) {
  const list = logs.get(userId) ?? []
  list.unshift({ at: Date.now(), what })
  logs.set(userId, list.slice(0, 50))
}

const minute = 60_000
const day = 24 * 60 * minute

function roundToMinute(t: number) {
  return Math.ceil(t / minute) * minute
}

export function demoMeetings(now: Date, timeZone: string): Meeting[] {
  const t = now.getTime()
  const at = (offsetMin: number) => isoIn(new Date(roundToMinute(t + offsetMin * minute)), timeZone)
  return [
    {
      id: 'demo-sam',
      title: 'Lumen Labs onboarding review',
      start: at(-100),
      end: at(-40),
      attendees: [sam],
    },
    {
      id: 'demo-daniel',
      title: 'Harbor Studio: quote and phase 2',
      start: at(12),
      end: at(57),
      location: 'Harbor Studio office',
      attendees: [daniel],
    },
    {
      id: 'demo-priya',
      title: 'Coffee with Priya (Northlight)',
      start: at(190),
      end: at(220),
      location: 'Café on 4th',
      attendees: [priya],
    },
  ]
}

export function demoSources(user: User): Sources {
  const tz = user.timeZone
  const ago = (days: number) => new Date(Date.now() - days * day)
  return {
    async meetings(from, to) {
      const meetings = demoMeetings(new Date(), tz).filter(
        (m) => new Date(m.end).getTime() >= from.getTime() && new Date(m.start).getTime() <= to.getTime(),
      )
      return { timeZone: tz, meetings }
    },

    async context(person) {
      if (person.email === daniel.email) {
        return {
          mail: [
            {
              id: 'm3', threadId: 't1', messageId: '<m3@harborstudio.example>', subject: 'Re: Website rebuild quote',
              from: 'Daniel Reyes <daniel@harborstudio.example>', date: ago(5), fromMe: false,
              snippet: 'Thanks for this. Board approved up to $40k. Could you send a revised quote, and a rough timeline for phase 2? We really want to launch before March.',
            },
            {
              id: 'm2', threadId: 't1', subject: 'Re: Website rebuild quote', from: 'me', date: ago(12), fromMe: true,
              snippet: 'Hi Daniel, attached is the first quote for the rebuild. Phase 2 (booking + CMS) can follow once phase 1 is live.',
            },
            {
              id: 'm1', threadId: 't1', subject: 'Website rebuild quote', from: 'Daniel Reyes <daniel@harborstudio.example>', date: ago(24), fromMe: false,
              snippet: 'Great to meet you on Oct 30. As discussed, we need the new site live before our March season.',
            },
          ],
          chat: [],
        }
      }
      if (person.email === priya.email) {
        return {
          mail: [],
          chat: [
            { date: ago(2), fromMe: false, text: 'Looking forward to Thursday. Bring the latest numbers if you can, especially retention.' },
            { date: ago(2.1), fromMe: true, text: 'Will do. Happy to walk you through the pilot results too.' },
            { date: ago(9), fromMe: false, text: 'Great meeting you at the founders dinner! Let’s grab coffee.' },
          ],
        }
      }
      if (person.email === sam.email) {
        return {
          mail: [
            {
              id: 's1', threadId: 't2', subject: 'Onboarding feedback', from: 'Sam Okafor <sam@lumenlabs.example>', date: ago(3), fromMe: false,
              snippet: 'Team found the setup confusing in week one. Can we review the onboarding checklist together?',
            },
          ],
          chat: [],
        }
      }
      return { mail: [], chat: [] }
    },

    async isFree(start) {
      // The demo calendar is busy at 15:00 every day, so the "free" check shows both outcomes.
      return !start.includes('T15:')
    },
    async createEvent(ev) {
      log(user.id, `Calendar: created “${ev.title}” at ${ev.start}${ev.attendees.length ? ` with ${ev.attendees.map((a) => a.name).join(', ')}` : ''}`)
      return `demo-event-${Date.now()}`
    },
    async deleteEvent(eventId) {
      log(user.id, `Calendar: removed ${eventId} (undo)`)
    },
    async sendEmail(mail) {
      log(user.id, `Email to ${mail.to}: “${mail.subject}”\n${mail.body}`)
      return `demo-mail-${Date.now()}`
    },
    async sendTelegram(person, text) {
      log(user.id, `Telegram to ${person.name}: ${text}`)
      return `demo-tg-${Date.now()}`
    },

    cannedBrief(meeting) {
      if (meeting.id === 'demo-daniel')
        return {
          who: 'Daniel Reyes · Harbor Studio',
          last: 'Last: asked for a revised quote',
          owe: 'You owe: timeline for phase 2',
          details: ['Budget capped at $40k', 'Wants launch before March', 'You met once: Oct 30'],
        }
      if (meeting.id === 'demo-priya')
        return {
          who: 'Priya Shah · Northlight VC',
          last: 'Last: asked for retention numbers',
          owe: 'Bring: pilot results',
          details: ['Met at the founders dinner', 'Prefers Telegram', 'Coffee, 30 min'],
        }
      if (meeting.id === 'demo-sam')
        return {
          who: 'Sam Okafor · Lumen Labs',
          last: 'Last: setup was confusing',
          owe: 'You owe: onboarding checklist',
          details: ['Customer since September', 'Week-one drop-off issue', 'Wants a joint review'],
        }
      return undefined
    },

    myName: () => 'Alex',
  }
}
