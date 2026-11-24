export interface GoogleTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  email: string
}

export interface User {
  id: string
  createdAt: number
  /** IANA time zone, read from Google Calendar settings (or set for demo). */
  timeZone: string
  demo: boolean
  google?: GoogleTokens
  /** GramJS StringSession. Kept on the server only; never sent to the glasses. */
  telegramSession?: string
}

export interface Device {
  token: string
  userId?: string
  pairCode?: string
  pairCodeExpiresAt?: number
  createdAt: number
}

export interface Person {
  name: string
  email?: string
  telegram?: string
}

export interface Meeting {
  id: string
  title: string
  start: string // ISO with offset
  end: string
  location?: string
  attendees: Person[]
}

/** What the glasses show before a meeting. Every field is short enough for one line. */
export interface Brief {
  meetingId: string
  time: string // "14:00"
  minutesUntil: number
  who: string // "Daniel Reyes · Harbor Studio"
  last: string // "Last: asked for a revised quote (Nov 18)"
  owe: string // "You owe: timeline for phase 2"
  details: string[] // up to 3 bullet lines
  channels: Array<'email' | 'telegram'>
  preferredChannel: 'email' | 'telegram'
}

export type Draft =
  | {
      id: string
      kind: 'email'
      to: Person
      subject: string
      body: string
      threadId?: string
      inReplyTo?: string
      sendAt?: string // ISO; undefined = right after approval
    }
  | {
      id: string
      kind: 'telegram'
      to: Person
      body: string
      sendAt?: string
    }
  | {
      id: string
      kind: 'invite'
      title: string
      start: string // ISO with offset
      end: string
      attendees: Person[]
      free: boolean
    }
  | {
      /** A private calendar reminder for something you promised to do later. */
      id: string
      kind: 'reminder'
      title: string
      start: string
      end: string
    }

/** A draft laid out for the glasses: three short lines plus a header. */
export interface DraftCard {
  id: string
  kind: Draft['kind']
  header: string // "DRAFT 1 / 3 · EMAIL"
  when: string // "Sends now" / "Calendar is free"
  title: string // "To Daniel · Re: Revised quote"
  body: string // one or two short lines
}

export type ActionStatus = 'pending' | 'scheduled' | 'done' | 'undone' | 'failed'

export interface Action {
  id: string
  userId: string
  draft: Draft
  status: ActionStatus
  approvedAt: number
  /** Earliest time the action may run (approval + undo window, or the draft's sendAt). */
  runAt: number
  result?: string
  error?: string
  /** Set after an invite is created, so undo can remove it. */
  externalId?: string
}

export interface FollowUpSession {
  id: string
  userId: string
  meetingId?: string
  transcript: string
  drafts: Draft[]
  createdAt: number
}
