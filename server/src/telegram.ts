// Telegram through the user's own account (MTProto via GramJS). Bots cannot
// read a person's private chats, so this is the only way to know what you and
// your contact last said. The session string stays on the server.
import { Api, TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { config } from './config.js'
import type { User } from './types.js'

export interface TgMessage {
  date: Date
  fromMe: boolean
  text: string
}

const clients = new Map<string, TelegramClient>()

function newClient(session = ''): TelegramClient {
  const client = new TelegramClient(new StringSession(session), config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 3,
  })
  client.setLogLevel('error' as never)
  return client
}

async function clientFor(user: User): Promise<TelegramClient> {
  if (!user.telegramSession) throw new Error('Telegram is not connected')
  let client = clients.get(user.id)
  if (!client) {
    client = newClient(user.telegramSession)
    clients.set(user.id, client)
  }
  if (!client.connected) await client.connect()
  return client
}

// ── login (phone → code → optional 2FA password) ────────────────────────

interface PendingLogin {
  client: TelegramClient
  phone: string
  phoneCodeHash: string
  expiresAt: number
}
const pending = new Map<string, PendingLogin>() // keyed by user id

/** Sends the login code. Returns where Telegram sent it. Errors carry a message fit for the user. */
export async function startLogin(userId: string, phone: string): Promise<'app' | 'sms'> {
  if (!/^\+\d{8,15}$/.test(phone)) throw new Error('Enter the full number with country code, like +2348012345678.')
  const client = newClient()
  try {
    const sent = await withTimeout(
      (async () => {
        await client.connect()
        return client.sendCode({ apiId: config.telegram.apiId, apiHash: config.telegram.apiHash }, phone)
      })(),
      25_000,
    )
    pending.get(userId)?.client.disconnect().catch(() => {})
    pending.set(userId, { client, phone, phoneCodeHash: sent.phoneCodeHash, expiresAt: Date.now() + 10 * 60_000 })
    console.log(`[telegram] code sent to ${phone.slice(0, 4)}…${phone.slice(-2)} via ${sent.isCodeViaApp ? 'app' : 'sms'}`)
    return sent.isCodeViaApp ? 'app' : 'sms'
  } catch (e) {
    client.disconnect().catch(() => {})
    const raw = (e as { errorMessage?: string; message?: string }).errorMessage ?? (e as Error).message ?? String(e)
    console.error('[telegram] sendCode failed:', raw)
    throw new Error(friendly(raw))
  }
}

function friendly(raw: string): string {
  if (raw === 'timeout') return 'Telegram did not answer in time. Try again in a minute.'
  if (/PHONE_NUMBER_INVALID/.test(raw)) return 'Telegram says that number is not valid. Use the full international format, like +2348012345678.'
  if (/API_ID_INVALID|API_ID_PUBLISHED_FLOOD/.test(raw)) return 'The server’s Telegram API keys were rejected. Check TELEGRAM_API_ID and TELEGRAM_API_HASH.'
  const wait = raw.match(/FLOOD_WAIT_?(\d+)?|wait of (\d+) seconds/i)
  if (wait) return `Telegram asks to wait${wait[1] || wait[2] ? ` ${Math.ceil(Number(wait[1] || wait[2]) / 60)} min` : ''} before sending another code.`
  if (/PHONE_NUMBER_BANNED|PHONE_NUMBER_FLOOD/.test(raw)) return 'Telegram is refusing new logins for this number right now. Try again later.'
  return `Telegram error: ${raw}`
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)))
  })
}

/** Returns the session string, or 'password' when the account has two-step verification. */
export async function finishLogin(userId: string, code: string, password?: string): Promise<string | 'password'> {
  const p = pending.get(userId)
  if (!p || p.expiresAt < Date.now()) throw new Error('Login expired. Start again.')
  try {
    if (!password) {
      await p.client.invoke(
        new Api.auth.SignIn({ phoneNumber: p.phone, phoneCodeHash: p.phoneCodeHash, phoneCode: code.trim() }),
      )
    } else {
      await p.client.signInWithPassword(
        { apiId: config.telegram.apiId, apiHash: config.telegram.apiHash },
        { password: async () => password, onError: async (e) => { throw e } },
      )
    }
  } catch (e) {
    if ((e as { errorMessage?: string }).errorMessage === 'SESSION_PASSWORD_NEEDED') return 'password'
    throw e
  }
  const session = (p.client.session as StringSession).save()
  clients.set(userId, p.client)
  pending.delete(userId)
  return session
}

export async function logout(user: User) {
  const client = clients.get(user.id)
  clients.delete(user.id)
  if (client) {
    await client.invoke(new Api.auth.LogOut()).catch(() => {})
    await client.disconnect().catch(() => {})
  }
}

// ── reading and sending ─────────────────────────────────────────────────

/**
 * Finds the private chat with a person, by @username if we know it, else by
 * matching their name against your chat titles. Only one-to-one chats count.
 */
async function findChat(client: TelegramClient, person: { name: string; telegram?: string }) {
  if (person.telegram) {
    try {
      return await client.getEntity(person.telegram)
    } catch {
      /* fall through to name match */
    }
  }
  const want = tokens(person.name)
  if (want.length === 0) return undefined
  const dialogs = await client.getDialogs({ limit: 150 })
  const match = dialogs.find((d) => {
    if (!d.isUser || !d.entity) return false
    const have = tokens(d.title ?? '')
    return want.every((w) => have.includes(w)) || (want.length > 1 && have.length > 1 && want[0] === have[0] && want[1] === have[1])
  })
  return match?.entity
}

export async function recentChat(user: User, person: { name: string; telegram?: string }, limit = 15): Promise<TgMessage[]> {
  const client = await clientFor(user)
  const chat = await findChat(client, person)
  if (!chat) return []
  const msgs = await client.getMessages(chat, { limit })
  return msgs
    .filter((m) => typeof m.message === 'string' && m.message.length > 0)
    .map((m) => ({ date: new Date(m.date * 1000), fromMe: Boolean(m.out), text: m.message }))
}

export async function sendMessage(user: User, person: { name: string; telegram?: string }, text: string): Promise<string> {
  const client = await clientFor(user)
  const chat = await findChat(client, person)
  if (!chat) throw new Error(`No Telegram chat found with ${person.name}`)
  const sent = await client.sendMessage(chat, { message: text })
  return String(sent.id)
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
}
