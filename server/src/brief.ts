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
    suggestions: [],
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
      suggestions: [],
    }
  }

  const canned = sources.cannedBrief?.(meeting)
  if (canned && !hasLlm()) return { ...base, ...canned }
  const first = lead.name.split(' ')[0] ?? lead.name
  const defaults = [`Thank ${first}, book a follow-up next week`, `Send ${first} a recap today`]

  if (hasLlm() && (ctx.mail.length || ctx.chat.length)) {
    try {
      const me = sources.myEmail()
      const out = await llmJson<{ company?: string; last?: string; owe?: string; details?: string[]; suggestions?: string[] }>(
        BRIEF_SYSTEM,
        `The user (ME in the history) is ${sources.myName() || 'the account owner'}${me ? ` <${me}>` : ''}.\nMeeting: ${meeting.title}${meeting.location ? `\nWhere: ${meeting.location}` : ''}${meeting.description ? `\nNotes on the event: ${meeting.description}` : ''}\nWhen: ${shortDate(start, timeZone)} ${base.time}\nWith: ${meeting.attendees
          .map((a) => `${a.name}${a.email ? ` <${a.email}>` : ''}`)
          .join(', ')}\n\nHistory (newest first):\n${historyText(ctx, timeZone)}`,
      )
      // Whatever the model leaves blank is filled from the messages themselves,
      // so a brief is never empty when there is history.
      const plain = plainSummary(ctx, timeZone)
      const company = notMine(out.company?.trim() ?? '', me) || companyFromEmail(lead?.email)
      const details = (out.details ?? []).map((d) => String(d).replace(/^[•\-\s]+/, '').trim()).filter(Boolean)
      return {
        ...base,
        who: whoLine(meeting.attendees, company),
        last: out.last?.trim() ? fit(`Last: ${out.last.trim().replace(/^last:\s*/i, '')}`, 40) : plain.last,
        owe: out.owe?.trim() ? fit(out.owe.trim(), 40) : plain.owe,
        details: (details.length ? details : plain.details).slice(0, 3).map((d) => fit(d, 36)),
        suggestions: cleanSuggestions(out.suggestions, defaults),
      }
    } catch (e) {
      console.warn('[brief] LLM failed, using plain summary:', (e as Error).message)
    }
  }

  return { ...base, ...plainSummary(ctx, timeZone), suggestions: defaults }
}

/** Up to 3 short, distinct suggestions; generic ones when the model gives none. */
function cleanSuggestions(raw: unknown, defaults: string[]): string[] {
  const list = (Array.isArray(raw) ? raw : [])
    .map((x) => fit(String(x).replace(/^[•\-\d.)\s]+/, ''), 52))
    .filter((x) => x.length > 3)
  const unique = [...new Set(list)]
  return (unique.length ? unique : defaults).slice(0, 3)
}

/** No LLM (or blank fields): the latest messages, whoever sent them. */
function plainSummary(ctx: Context, timeZone: string): Pick<Brief, 'last' | 'owe' | 'details'> {
  const all = [
    ...ctx.mail.map((m) => ({ date: m.date, mine: m.fromMe, text: m.snippet })),
    ...ctx.chat.map((c) => ({ date: c.date, mine: c.fromMe, text: c.text })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime())
  if (!all.length) return { last: 'No messages with them yet', owe: '', details: [] }
  const line = (m: (typeof all)[number]) => `${m.mine ? 'You' : 'They'}: ${m.text}`
  return {
    last: fit(line(all[0]!), 44),
    owe: all[1] ? fit(line(all[1]), 44) : '',
    details: all.slice(2, 5).map((m) => fit(line(m), 36)),
  }
}

/** Drops a "company" that is really the user's own name or domain. */
function notMine(company: string, myEmail: string): string {
  if (!company || !myEmail) return company
  const [local = '', domain = ''] = myEmail.toLowerCase().split('@')
  const c = company.toLowerCase().replace(/[^a-z0-9]/g, '')
  const root = PUBLIC_DOMAINS.has(domain) ? '' : (domain.split('.')[0] ?? '')
  const mine = [local.replace(/[^a-z0-9]/g, ''), root].filter((x) => x.length >= 3)
  return mine.some((m) => c.includes(m) || m.includes(c)) ? '' : company
}

const BRIEF_SYSTEM = `You prepare a glance-sized brief for someone (the user, ME) about to walk into an in-person meeting with the other person (THEM).
It appears on smart glasses with a tiny monochrome display, so every field must be very short.
Summarise the conversation so far from both sides: what was asked, promised and decided, by either of them.
Use only facts in the history and event notes. Never invent numbers, dates or promises.
Return JSON, and fill every field whenever the history has anything in it:
{
 "company": "THEIR organisation, 1-3 words, or empty. Never the user's own name or company",
 "last": "the latest point in the conversation, from either side, max 32 characters, no 'Last:' prefix, e.g. 'you asked for revised quote' or 'they want launch before March'",
 "owe": "the main open item, starting with 'You owe:', 'They owe:', 'Ask:' or 'Bring:', max 36 characters",
 "details": ["up to 3 useful facts (budget, deadline, preferences, how you met), each max 32 characters"],
 "suggestions": ["3 likely follow-ups the user may want after this meeting, written as the instruction they would speak, imperative, max 48 characters, with a day where it fits, e.g. 'Send revised quote Friday, book check-in Tuesday'. Base them on the open items in the history."]
}`
