// Builds the one-glance brief for a meeting from your last email thread and
// Telegram chat with the people in it.
import { hasLlm } from './config.js'
import { fit, llmJson } from './llm.js'
import type { Context, Sources } from './sources.js'
import { hhmm, shortDate } from './time.js'
import type { Brief, Meeting, Person } from './types.js'

const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'me.com', 'live.com', 'proton.me', 'protonmail.com', 'aol.com',
])

/** "harborstudio.example" → "Harborstudio"; public mail domains give "". */
export function companyFromEmail(email?: string): string {
  const domain = email?.split('@')[1]?.toLowerCase()
  if (!domain || PUBLIC_DOMAINS.has(domain)) return ''
  const root = domain.split('.')[0] ?? ''
  return root ? root[0]!.toUpperCase() + root.slice(1) : ''
}

function whoLine(people: Person[], company: string): string {
  const lead = people[0]?.name ?? 'Meeting'
  const more = people.length > 1 ? ` +${people.length - 1}` : ''
  return fit(company ? `${lead}${more} · ${company}` : `${lead}${more}`, 34)
}

function channelsOf(ctx: Context): { channels: Array<'email' | 'telegram'>; preferred: 'email' | 'telegram' } {
  const channels: Array<'email' | 'telegram'> = []
  if (ctx.mail.length) channels.push('email')
  if (ctx.chat.length) channels.push('telegram')
  const lastMail = ctx.mail[0]?.date.getTime() ?? 0
  const lastChat = ctx.chat[0]?.date.getTime() ?? 0
  return { channels, preferred: lastChat > lastMail ? 'telegram' : 'email' }
}

/** Plain-text history for the LLM, newest first, kept short. */
export function historyText(ctx: Context, timeZone: string): string {
  const lines: string[] = []
  for (const m of ctx.mail.slice(0, 6))
    lines.push(`[email ${shortDate(m.date, timeZone)}] ${m.fromMe ? 'ME' : 'THEM'} — ${m.subject}: ${m.snippet}`)
  for (const c of ctx.chat.slice(0, 12))
    lines.push(`[telegram ${shortDate(c.date, timeZone)}] ${c.fromMe ? 'ME' : 'THEM'}: ${c.text.slice(0, 300)}`)
  return lines.join('\n') || '(no previous messages)'
}

export async function buildBrief(sources: Sources, meeting: Meeting, timeZone: string, now = new Date()): Promise<Brief> {
  const start = new Date(meeting.start)
  const lead = meeting.attendees[0]
  const ctx: Context = lead ? await sources.context(lead) : { mail: [], chat: [] }
  const { channels, preferred } = channelsOf(ctx)
  const base: Brief = {
    meetingId: meeting.id,
    time: hhmm(start, timeZone),
    minutesUntil: Math.floor((start.getTime() - now.getTime()) / 60_000),
    who: whoLine(meeting.attendees, companyFromEmail(lead?.email)),
    last: '',
    owe: '',
    details: [],
    channels,
    preferredChannel: preferred,
  }

  // No person on the event and none in its title: show what the event itself says.
  if (!lead) {
    const notes = (meeting.description ?? '').split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean)
    return {
      ...base,
      who: fit(meeting.title, 34),
      last: meeting.location ? fit(`At: ${meeting.location}`, 40) : '',
      owe: notes[0] ? fit(notes[0], 40) : '',
      details: notes.slice(1, 4).map((n) => fit(n, 36)),
    }
  }

  const canned = sources.cannedBrief?.(meeting)
  if (canned && !hasLlm()) return { ...base, ...canned }

  if (hasLlm() && (ctx.mail.length || ctx.chat.length)) {
    try {
      const out = await llmJson<{ company?: string; last?: string; owe?: string; details?: string[] }>(
        BRIEF_SYSTEM,
        `Meeting: ${meeting.title}${meeting.location ? `\nWhere: ${meeting.location}` : ''}${meeting.description ? `\nNotes on the event: ${meeting.description}` : ''}\nWhen: ${shortDate(start, timeZone)} ${base.time}\nWith: ${meeting.attendees
          .map((a) => `${a.name}${a.email ? ` <${a.email}>` : ''}`)
          .join(', ')}\n\nHistory (newest first):\n${historyText(ctx, timeZone)}`,
      )
      return {
        ...base,
        who: whoLine(meeting.attendees, out.company?.trim() || companyFromEmail(lead?.email)),
        last: out.last ? fit(`Last: ${out.last.replace(/^last:\s*/i, '')}`, 40) : '',
        owe: out.owe ? fit(out.owe, 40) : '',
        details: (out.details ?? []).slice(0, 3).map((d) => fit(d.replace(/^[•\-\s]+/, ''), 36)),
      }
    } catch (e) {
      console.warn('[brief] LLM failed, using plain summary:', (e as Error).message)
    }
  }

  return { ...base, ...plainSummary(ctx, timeZone) }
}

/** No LLM: show the latest message from them and when you last spoke. */
function plainSummary(ctx: Context, timeZone: string): Pick<Brief, 'last' | 'owe' | 'details'> {
  const theirs = [
    ...ctx.mail.filter((m) => !m.fromMe).map((m) => ({ date: m.date, text: m.snippet })),
    ...ctx.chat.filter((c) => !c.fromMe).map((c) => ({ date: c.date, text: c.text })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime())
  const latest = theirs[0]
  if (!latest) return { last: 'No messages with them yet', owe: '', details: [] }
  return {
    last: fit(`Last (${shortDate(latest.date, timeZone)}): ${latest.text}`, 40),
    owe: '',
    details: theirs.slice(1, 3).map((m) => fit(m.text, 36)),
  }
}

const BRIEF_SYSTEM = `You prepare a glance-sized brief for someone about to walk into an in-person meeting.
It appears on smart glasses with a tiny monochrome display, so every field must be very short.
Use only facts in the history. Never invent numbers, dates or promises.
Return JSON:
{
 "company": "their organisation, 1-3 words, or empty",
 "last": "what they last asked for or said, max 30 characters, no 'Last:' prefix",
 "owe": "the most important thing the user owes them or should bring, starting with 'You owe:' or 'Bring:', max 36 characters, or empty",
 "details": ["up to 3 useful facts (budget, deadline, preferences, how you met), each max 32 characters"]
}`
