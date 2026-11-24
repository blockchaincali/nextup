// Turns one spoken sentence after a meeting into drafts the user approves one
// at a time: a recap message, an invite for the next meeting, and private
// reminders for anything they promised to send later.
import { hasLlm } from './config.js'
import { historyText } from './brief.js'
import { fit, llmJson } from './llm.js'
import type { Context, Sources } from './sources.js'
import { id } from './store.js'
import { dayLabel, hhmm, isoIn, parseWhen, partsIn, zonedToDate } from './time.js'
import type { Draft, DraftCard, Meeting, Person } from './types.js'

interface Plan {
  message?: { channel?: 'email' | 'telegram'; subject?: string; body: string; sendAt?: string | null }
  invite?: { title: string; start: string; durationMinutes?: number } | null
  reminders?: Array<{ title: string; start: string }>
}

export interface FollowUpInput {
  sources: Sources
  meeting: Meeting
  transcript: string
  timeZone: string
  preferredChannel: 'email' | 'telegram'
  now?: Date
}

export async function makeDrafts(input: FollowUpInput): Promise<Draft[]> {
  const { sources, meeting, transcript, timeZone } = input
  const now = input.now ?? new Date()
  const lead = meeting.attendees[0]
  const ctx: Context = lead ? await sources.context(lead) : { mail: [], chat: [] }
  const channel = input.preferredChannel === 'telegram' && ctx.chat.length ? 'telegram' : lead?.email ? 'email' : 'telegram'

  let plan: Plan | null = null
  if (hasLlm()) {
    try {
      plan = await llmJson<Plan>(followUpSystem(now, timeZone, sources.myName()), followUpUser(meeting, transcript, ctx, timeZone, channel))
    } catch (e) {
      console.warn('[followup] LLM failed, using rules:', (e as Error).message)
    }
  }
  const rules = rulePlan(transcript, meeting, now, timeZone, sources.myName())
  if (!plan) plan = rules
  else if (!plan.message?.body || wordCount(coreOf(plan.message.body)) < 6) {
    // The model returned a greeting and little else: keep its invite and
    // reminders, but use the rule-written recap so nothing hollow gets sent.
    console.warn('[followup] LLM message too thin, using rule-written recap')
    plan = { ...plan, message: { ...(plan.message ?? {}), body: rules.message!.body, sendAt: plan.message?.sendAt ?? null } }
  }

  const drafts: Draft[] = []
  const lastThread = ctx.mail[0]

  if (plan.message?.body && lead) {
    const sendAt = localToIso(plan.message.sendAt, timeZone)
    const ch = plan.message.channel ?? channel
    if (ch === 'telegram' && ctx.chat.length) {
      // Chat messages drop the email-style greeting and sign-off.
      drafts.push({ id: id(8), kind: 'telegram', to: lead, body: coreOf(plan.message.body) || plan.message.body.trim(), sendAt })
    } else if (lead.email) {
      const subject = lastThread ? reSubject(lastThread.subject) : plan.message.subject?.trim() || `Following up: ${meeting.title}`
      drafts.push({
        id: id(8),
        kind: 'email',
        to: lead,
        subject,
        body: plan.message.body.trim(),
        threadId: lastThread?.threadId,
        inReplyTo: lastThread?.messageId,
        sendAt,
      })
    }
  }

  if (plan.invite?.start) {
    const start = localToIso(plan.invite.start, timeZone)
    if (start) {
      const end = isoIn(new Date(new Date(start).getTime() + (plan.invite.durationMinutes ?? 30) * 60_000), timeZone)
      const free = await sources.isFree(start, end).catch(() => true)
      drafts.push({ id: id(8), kind: 'invite', title: plan.invite.title || meeting.title, start, end, attendees: meeting.attendees, free })
    }
  }

  for (const r of plan.reminders ?? []) {
    const start = localToIso(r.start, timeZone)
    if (!start) continue
    const end = isoIn(new Date(new Date(start).getTime() + 15 * 60_000), timeZone)
    drafts.push({ id: id(8), kind: 'reminder', title: r.title, start, end })
  }
  return drafts
}

/** Changes one draft from a spoken instruction ("make it Wednesday", "say thanks for lunch too"). */
export async function reviseDraft(draft: Draft, instruction: string, sources: Sources, timeZone: string, now = new Date()): Promise<Draft> {
  if (hasLlm()) {
    try {
      const out = await llmJson<Partial<{ body: string; subject: string; title: string; start: string; durationMinutes: number }>>(
        REVISE_SYSTEM(now, timeZone),
        `Draft (${draft.kind}):\n${JSON.stringify(draftForLlm(draft, timeZone))}\n\nChange requested: ${instruction}`,
      )
      return applyRevision(draft, out, sources, timeZone)
    } catch (e) {
      console.warn('[revise] LLM failed, using rules:', (e as Error).message)
    }
  }
  // Without an LLM: move times when a day is named, otherwise append the note.
  const when = parseWhen(instruction, now, timeZone, draft.kind === 'reminder' ? 9 : 10)
  if ((draft.kind === 'invite' || draft.kind === 'reminder') && when) {
    return applyRevision(draft, { start: localStamp(when, timeZone) }, sources, timeZone)
  }
  if (draft.kind === 'email' || draft.kind === 'telegram') {
    return { ...draft, body: `${draft.body}\n\n${sentence(instruction.replace(/^(also\s+)?(say|add|tell (him|her|them))\s+/i, ''))}` }
  }
  return draft
}

async function applyRevision(
  draft: Draft,
  out: Partial<{ body: string; subject: string; title: string; start: string; durationMinutes: number }>,
  sources: Sources,
  timeZone: string,
): Promise<Draft> {
  if (draft.kind === 'email') return { ...draft, body: out.body?.trim() || draft.body, subject: out.subject?.trim() || draft.subject }
  if (draft.kind === 'telegram') return { ...draft, body: out.body?.trim() || draft.body }
  const start = localToIso(out.start, timeZone) ?? draft.start
  const minutes = out.durationMinutes ?? (new Date(draft.end).getTime() - new Date(draft.start).getTime()) / 60_000
  const end = isoIn(new Date(new Date(start).getTime() + minutes * 60_000), timeZone)
  if (draft.kind === 'invite') {
    const free = start === draft.start ? draft.free : await sources.isFree(start, end).catch(() => true)
    return { ...draft, title: out.title?.trim() || draft.title, start, end, free }
  }
  return { ...draft, title: out.title?.trim() || draft.title, start, end }
}

// ── layout for the glasses ──────────────────────────────────────────────

export function toCard(draft: Draft, index: number, total: number, timeZone: string): DraftCard {
  const n = total > 1 ? `${index + 1} / ${total} · ` : ''
  const first = (p: Person) => p.name.split(' ')[0] ?? p.name
  const whenLabel = (iso?: string) => (iso ? `Sends ${dayLabel(new Date(iso), timeZone).split(' ')[0]} ${hhmm(new Date(iso), timeZone)}` : 'Sends when approved')
  switch (draft.kind) {
    case 'email':
      return {
        id: draft.id, kind: draft.kind, header: `DRAFT ${n}EMAIL`, when: whenLabel(draft.sendAt),
        title: fit(`To ${first(draft.to)} · ${draft.subject}`, 40),
        body: fit(glanceOf(draft.body), 96),
      }
    case 'telegram':
      return {
        id: draft.id, kind: draft.kind, header: `DRAFT ${n}TELEGRAM`, when: whenLabel(draft.sendAt),
        title: `To ${first(draft.to)}`,
        body: fit(glanceOf(draft.body), 96),
      }
    case 'invite': {
      const s = new Date(draft.start)
      return {
        id: draft.id, kind: draft.kind, header: `DRAFT ${n}INVITE`, when: draft.free ? 'Calendar is free' : 'Clash: you are busy',
        title: `${dayLabel(s, timeZone)} · ${hhmm(s, timeZone)}-${hhmm(new Date(draft.end), timeZone)}`,
        body: `${fit(draft.title, 40)}\nYou + ${fit(draft.attendees.map((a) => a.name).join(', '), 34)}`,
      }
    }
    case 'reminder': {
      const s = new Date(draft.start)
      return {
        id: draft.id, kind: draft.kind, header: `DRAFT ${n}REMINDER`, when: 'Only you see this',
        title: `${dayLabel(s, timeZone)} · ${hhmm(s, timeZone)}`,
        body: fit(draft.title, 80),
      }
    }
  }
}

/** The useful middle of a message: drop "Hi X," and the sign-off. */
function coreOf(body: string): string {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean)
  const out: string[] = []
  for (const [i, l] of lines.entries()) {
    if (i === 0 && /^(hi|hey|hello|dear)\b/i.test(l)) continue
    if (/^(best|thanks|thank you|cheers|regards|kind regards|warm regards|talk soon)[,!.]?$/i.test(l)) break
    out.push(l)
  }
  return out.join(' ')
}

const PLEASANTRY = /^(great|good|lovely|nice|thanks|thank you|it was)\b[^.!?]*\b(today|time|meeting|chat|coffee|you)\b[^.!?]*[.!?]\s*/i

/** What the glasses show of a message: the commitments, without the pleasantries. */
function glanceOf(body: string): string {
  const core = coreOf(body)
  const trimmed = core.replace(PLEASANTRY, '')
  return trimmed.length >= 20 ? trimmed : core
}

// ── prompts ─────────────────────────────────────────────────────────────

function nowLine(now: Date, timeZone: string) {
  return `${dayLabel(now, timeZone)} ${partsIn(now, timeZone).year}, ${hhmm(now, timeZone)} (${timeZone})`
}

function followUpSystem(now: Date, timeZone: string, myName: string) {
  return `You turn a short note the user spoke right after an in-person meeting into follow-up actions.
The user approves each action with one tap on smart glasses, so drafts must be ready to send as-is.
Now: ${nowLine(now, timeZone)}. All times you output are local wall-clock times in that zone, formatted YYYY-MM-DDTHH:mm.
Return JSON:
{
 "message": {"channel": "email" | "telegram", "subject": "...", "body": "...", "sendAt": null | "YYYY-MM-DDTHH:mm"},
 "invite": null | {"title": "...", "start": "YYYY-MM-DDTHH:mm", "durationMinutes": 30},
 "reminders": [{"title": "...", "start": "YYYY-MM-DDTHH:mm"}]
}
Rules:
- message: a complete, ready-to-send recap to the person they met, in the user's voice: a greeting line with their first name, then 1-3 full sentences that thank them and state every commitment with its day, then a sign-off. 25-60 words. The body must never be just a greeting${myName ? ` with "${myName}"` : ''}. No placeholders. Never claim something is attached.
- If the user promises to send something later ("send him the quote Friday"), the message says when it will come, and add a reminder for the user at 09:00 that day titled like "Send Daniel the revised quote".
- invite: only if the user asks to book, schedule, meet, call or check in again. Default 10:00, 30 minutes, unless they say otherwise. Title like "Harbor Studio · phase 2 check-in".
- sendAt: only if the user explicitly wants the message itself sent later; otherwise null.
- Use the channel given unless the user names another.`
}

function followUpUser(meeting: Meeting, transcript: string, ctx: Context, timeZone: string, channel: string) {
  return `Meeting: ${meeting.title}
With: ${meeting.attendees.map((a) => a.name).join(', ')}
Channel to use: ${channel}
History (newest first):
${historyText(ctx, timeZone)}

What the user said after the meeting: "${transcript}"`
}

const REVISE_SYSTEM = (now: Date, timeZone: string) => `You edit one follow-up draft based on a short spoken instruction.
Now: ${nowLine(now, timeZone)}. Times are local, formatted YYYY-MM-DDTHH:mm.
Return JSON with only the fields that change, from: "body", "subject", "title", "start", "durationMinutes".
Keep the user's voice and keep messages under 60 words. Never claim something is attached.`

function draftForLlm(d: Draft, timeZone: string) {
  if (d.kind === 'email') return { to: d.to.name, subject: d.subject, body: d.body }
  if (d.kind === 'telegram') return { to: d.to.name, body: d.body }
  return { title: d.title, start: localStamp(new Date(d.start), timeZone), durationMinutes: (new Date(d.end).getTime() - new Date(d.start).getTime()) / 60_000 }
}

// ── rules, used when no LLM is configured ───────────────────────────────

const BOOK_START = /^(please\s+)?(book|schedule|set up|arrange|put in)\b/i
const BOOK = /\b(book|schedule|meet|meeting|call|check[- ]?in|catch[- ]?up)\b/i
const SEND = /\b(send|share|forward)\b/i

export function rulePlan(transcript: string, meeting: Meeting, now: Date, timeZone: string, myName: string): Plan {
  const lead = meeting.attendees[0]
  const first = lead?.name.split(' ')[0] ?? 'there'
  const clauses = transcript
    .replace(/[“”"]/g, '')
    .split(/[,.;]|\band\b|\bthen\b/i)
    .map((c) => c.trim())
    .filter(Boolean)

  const promises: string[] = []
  const reminders: Plan['reminders'] = []
  let invite: Plan['invite'] = null

  for (const clause of clauses) {
    const when = parseWhen(clause, now, timeZone)
    if (BOOK_START.test(clause) || (BOOK.test(clause) && !SEND.test(clause))) {
      const at = when ?? parseWhen('next week', now, timeZone)!
      invite = { title: `${meeting.title.split(/[:(]/)[0]!.trim()} · follow-up`, start: localStamp(at, timeZone), durationMinutes: 30 }
      promises.push(`I've sent an invite for ${weekday(at, timeZone)} at ${hhmm(at, timeZone)} so we can pick this up`)
    } else if (SEND.test(clause)) {
      const thing = clause
        .replace(/\b(today|tomorrow|next week|(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|by|on|at \d.*)\b/gi, '')
        .replace(/^(please\s+)?(send|share|forward)\s+(him|her|them)?\s*/i, '')
        .replace(/\b(over|across)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (!thing) continue
      if (when) {
        const nine = zonedToDate({ ...partsIn(when, timeZone), hour: 9, minute: 0 }, timeZone)
        reminders.push({ title: `Send ${first} ${thing}`, start: localStamp(nine, timeZone) })
        promises.push(`I'll send ${thing.replace(/^(the|a|an|my)\s+/i, 'the ')} by ${weekday(when, timeZone)}`)
      } else {
        promises.push(`I'll send ${thing.replace(/^(the|a|an|my)\s+/i, 'the ')} shortly`)
      }
    }
  }

  const body = [
    `Hi ${first},`,
    '',
    `Great to see you today, thanks for your time.${promises.length ? ` ${promises.map(sentence).join(' ')}` : ''}`,
    '',
    myName ? `Best,\n${myName}` : 'Best,',
  ].join('\n')
  return { message: { body, sendAt: null }, invite, reminders }
}

// ── helpers ─────────────────────────────────────────────────────────────

function sentence(s: string) {
  const t = s.trim()
  if (!t) return t
  return `${t[0]!.toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`
}

function wordCount(s: string) {
  return s.split(/\s+/).filter(Boolean).length
}

function weekday(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(d)
}

function reSubject(subject: string) {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`
}

/** "2026-12-01T10:00" in the user's zone. */
export function localStamp(d: Date, timeZone: string): string {
  return isoIn(d, timeZone).slice(0, 16)
}

/** Accepts "YYYY-MM-DDTHH:mm" (local) or a full ISO string; returns ISO with offset. */
export function localToIso(v: string | null | undefined, timeZone: string): string | undefined {
  if (!v) return undefined
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(v)) {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? undefined : isoIn(d, timeZone)
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) return undefined
  const d = zonedToDate({ year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]! }, timeZone)
  return isoIn(d, timeZone)
}
