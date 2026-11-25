// One interface over where a user's data lives: their real Google + Telegram
// accounts, or the built-in demo world. Everything above this file is the same
// for both, so the demo exercises the real code paths.
import { hasTelegram } from './config.js'
import * as google from './google.js'
import * as telegram from './telegram.js'
import { demoSources } from './demo.js'
import type { MailItem } from './google.js'
import type { TgMessage } from './telegram.js'
import type { Brief, Meeting, Person, User } from './types.js'

export interface Context {
  mail: MailItem[]
  chat: TgMessage[]
}

export interface Sources {
  meetings(from: Date, to: Date): Promise<{ timeZone: string; meetings: Meeting[] }>
  context(person: Person): Promise<Context>
  isFree(start: string, end: string): Promise<boolean>
  createEvent(ev: { title: string; start: string; end: string; attendees: Person[] }): Promise<string>
  deleteEvent(eventId: string): Promise<void>
  sendEmail(mail: { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string }): Promise<string>
  sendTelegram(person: Person, text: string): Promise<string>
  /** Demo only: a hand-written brief, used when no LLM is configured. */
  cannedBrief?(meeting: Meeting): Partial<Brief> | undefined
  myName(): string
  /** The user's own address, so their own company is never mistaken for the other side's. */
  myEmail(): string
}

export function sourcesFor(user: User, save: (u: User) => void): Sources {
  if (user.demo) return demoSources(user)
  const tg = Boolean(user.telegramSession && hasTelegram())
  return {
    meetings: (from, to) => google.listMeetings(user, save, from, to),
    async context(person) {
      const [mail, chat] = await Promise.all([
        user.google ? google.recentMail(user, save, person).catch(() => []) : Promise.resolve([]),
        tg ? telegram.recentChat(user, person).catch(() => []) : Promise.resolve([]),
      ])
      // Found by name only: learn their address from the latest email they sent,
      // so the follow-up can go to them.
      if (!person.email) {
        const theirs = mail.find((m) => !m.fromMe && m.fromAddress)
        if (theirs?.fromAddress) person.email = theirs.fromAddress.email
      }
      // The calendar often has no display name ("Terrafirmassociates" is just the
      // address); their own emails usually do ("TerraFirm Associates").
      if (person.email && person.name === google.nameFromEmail(person.email)) {
        const named = mail.find((m) => m.fromAddress?.email === person.email?.toLowerCase() && m.fromAddress?.name)
        if (named?.fromAddress) person.name = named.fromAddress.name
      }
      return { mail, chat }
    },
    isFree: (start, end) => google.isFree(user, save, start, end),
    createEvent: (ev) => google.createEvent(user, save, ev),
    deleteEvent: (eventId) => google.deleteEvent(user, save, eventId),
    sendEmail: (mail) => google.sendEmail(user, save, mail),
    sendTelegram: (person, text) => telegram.sendMessage(user, person, text),
    myName: () => (user.google ? google.nameFromEmail(user.google.email).split(' ')[0]! : ''),
    myEmail: () => user.google?.email ?? '',
  }
}
