// A small JSON-file store. Enough for a hackathon and a handful of users;
// swap for Postgres when there are real customers.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes, randomInt } from 'node:crypto'
import type { Action, Device, FollowUpSession, User } from './types.js'

interface Data {
  users: Record<string, User>
  devices: Record<string, Device>
  sessions: Record<string, FollowUpSession>
  actions: Record<string, Action>
}

const empty = (): Data => ({ users: {}, devices: {}, sessions: {}, actions: {} })

export class Store {
  private data: Data
  private timer: NodeJS.Timeout | null = null

  constructor(private file: string | null) {
    this.data = empty()
    if (file) {
      try {
        this.data = { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) }
      } catch {
        /* first run */
      }
    }
  }

  /** Debounced atomic write: temp file + rename, so a crash never leaves half a file. */
  private save() {
    if (!this.file || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, 200)
  }

  flush() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data))
    renameSync(tmp, this.file)
  }

  // ── devices and pairing ──────────────────────────────────────────────
  createDevice(): Device {
    const device: Device = { token: id(32), createdAt: Date.now() }
    this.data.devices[device.token] = device
    this.save()
    return device
  }

  device(token: string | undefined): Device | undefined {
    return token ? this.data.devices[token] : undefined
  }

  /** A fresh 6-digit code valid for 5 minutes. Codes are unique among live codes. */
  issuePairCode(device: Device): string {
    const live = new Set(
      Object.values(this.data.devices)
        .filter((d) => d.pairCode && (d.pairCodeExpiresAt ?? 0) > Date.now())
        .map((d) => d.pairCode),
    )
    let code: string
    do code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    while (live.has(code))
    device.pairCode = code
    device.pairCodeExpiresAt = Date.now() + 5 * 60_000
    this.save()
    return code
  }

  deviceByCode(code: string): Device | undefined {
    const clean = code.replace(/\D/g, '')
    return Object.values(this.data.devices).find(
      (d) => d.pairCode === clean && (d.pairCodeExpiresAt ?? 0) > Date.now(),
    )
  }

  linkDevice(device: Device, user: User) {
    device.userId = user.id
    device.pairCode = undefined
    device.pairCodeExpiresAt = undefined
    this.save()
  }

  unlinkDevice(device: Device) {
    delete this.data.devices[device.token]
    this.save()
  }

  // ── users ─────────────────────────────────────────────────────────────
  createUser(partial: Partial<User> = {}): User {
    const user: User = { id: id(12), createdAt: Date.now(), timeZone: 'UTC', demo: false, ...partial }
    this.data.users[user.id] = user
    this.save()
    return user
  }

  user(userId: string | undefined): User | undefined {
    return userId ? this.data.users[userId] : undefined
  }

  updateUser(user: User) {
    this.data.users[user.id] = user
    this.save()
  }

  /** Deletes the user, every linked device and every stored action: the "forget me" button. */
  deleteUser(userId: string) {
    delete this.data.users[userId]
    for (const [k, d] of Object.entries(this.data.devices)) if (d.userId === userId) delete this.data.devices[k]
    for (const [k, s] of Object.entries(this.data.sessions)) if (s.userId === userId) delete this.data.sessions[k]
    for (const [k, a] of Object.entries(this.data.actions)) if (a.userId === userId) delete this.data.actions[k]
    this.save()
  }

  // ── follow-up sessions and actions ───────────────────────────────────
  putSession(s: FollowUpSession) {
    this.data.sessions[s.id] = s
    this.save()
  }

  session(sessionId: string) {
    return this.data.sessions[sessionId]
  }

  putAction(a: Action) {
    this.data.actions[a.id] = a
    this.save()
  }

  action(actionId: string) {
    return this.data.actions[actionId]
  }

  dueActions(now = Date.now()): Action[] {
    return Object.values(this.data.actions).filter(
      (a) => (a.status === 'pending' || a.status === 'scheduled') && a.runAt <= now,
    )
  }
}

export function id(bytes = 12): string {
  return randomBytes(bytes).toString('base64url')
}
