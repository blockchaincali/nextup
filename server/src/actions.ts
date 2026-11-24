// Approved drafts wait out a short undo window (or their scheduled send time),
// then run. Nothing is ever sent without an explicit tap on the glasses.
import type { Sources } from './sources.js'
import { id, type Store } from './store.js'
import type { Action, Draft, User } from './types.js'

type Resolve = (userId: string) => { user: User; sources: Sources } | undefined

export class ActionQueue {
  private timer: NodeJS.Timeout | null = null
  private running = new Set<string>()

  constructor(
    private store: Store,
    private resolve: Resolve,
    private undoSeconds: number,
  ) {}

  approve(user: User, draft: Draft): Action {
    const now = Date.now()
    const sendAt = 'sendAt' in draft && draft.sendAt ? new Date(draft.sendAt).getTime() : 0
    const action: Action = {
      id: id(10),
      userId: user.id,
      draft,
      status: sendAt > now + this.undoSeconds * 1000 ? 'scheduled' : 'pending',
      approvedAt: now,
      runAt: Math.max(now + this.undoSeconds * 1000, sendAt),
    }
    this.store.putAction(action)
    return action
  }

  /** Cancels a waiting action, or removes a calendar event that was already created. */
  async undo(action: Action): Promise<{ ok: boolean; reason?: string }> {
    if (action.status === 'pending' || action.status === 'scheduled') {
      action.status = 'undone'
      this.store.putAction(action)
      return { ok: true }
    }
    if (action.status === 'done' && (action.draft.kind === 'invite' || action.draft.kind === 'reminder') && action.externalId) {
      const ctx = this.resolve(action.userId)
      if (!ctx) return { ok: false, reason: 'Account not found' }
      await ctx.sources.deleteEvent(action.externalId)
      action.status = 'undone'
      this.store.putAction(action)
      return { ok: true }
    }
    if (action.status === 'done') return { ok: false, reason: 'Already sent' }
    return { ok: false, reason: `Cannot undo (${action.status})` }
  }

  async runDue(now = Date.now()) {
    for (const action of this.store.dueActions(now)) {
      if (this.running.has(action.id)) continue
      this.running.add(action.id)
      try {
        await this.execute(action)
      } finally {
        this.running.delete(action.id)
      }
    }
  }

  private async execute(action: Action) {
    const ctx = this.resolve(action.userId)
    if (!ctx) {
      action.status = 'failed'
      action.error = 'Account not found'
      this.store.putAction(action)
      return
    }
    const d = action.draft
    try {
      switch (d.kind) {
        case 'email':
          action.result = await ctx.sources.sendEmail({
            to: d.to.email ? `${d.to.name} <${d.to.email}>` : d.to.name,
            subject: d.subject,
            body: d.body,
            threadId: d.threadId,
            inReplyTo: d.inReplyTo,
          })
          break
        case 'telegram':
          action.result = await ctx.sources.sendTelegram(d.to, d.body)
          break
        case 'invite':
          action.externalId = await ctx.sources.createEvent({ title: d.title, start: d.start, end: d.end, attendees: d.attendees })
          action.result = action.externalId
          break
        case 'reminder':
          action.externalId = await ctx.sources.createEvent({ title: d.title, start: d.start, end: d.end, attendees: [] })
          action.result = action.externalId
          break
      }
      action.status = 'done'
    } catch (e) {
      action.status = 'failed'
      action.error = (e as Error).message
      console.error(`[actions] ${d.kind} failed:`, action.error)
    }
    this.store.putAction(action)
  }

  start(intervalMs = 1000) {
    this.timer ??= setInterval(() => void this.runDue(), intervalMs)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
