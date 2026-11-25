// Client for the Next Up server. All secrets live there; the glasses only
// hold a random device token.

export interface MeetingItem {
  meeting: { id: string; title: string; start: string; end: string; location?: string; attendees: string[] }
  brief: { who: string; time: string; last: string; owe: string; details: string[]; suggestions?: string[]; minutesUntil: number }
  phase: 'past' | 'now' | 'upcoming'
  header: string
}

export interface Card {
  id: string
  kind: 'email' | 'telegram' | 'invite' | 'reminder'
  header: string
  when: string
  title: string
  body: string
}

export interface Approval {
  actionId: string
  runsAt: number
  status: string
  undoSeconds: number
  summary: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

export class Api {
  token = ''

  constructor(private base: string) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(this.base + path, {
      ...init,
      headers: { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...(init.headers ?? {}) },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? 'error', (data as { message?: string }).message)
    return data as T
  }

  private voiceOrText(input: Uint8Array | string): RequestInit {
    return typeof input === 'string'
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: input }) }
      : { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: input as BodyInit }
  }

  pairStart() {
    return this.call<{ token: string; code: string; expiresAt: number; pairUrl: string }>('/api/pair/start', { method: 'POST' })
  }

  /** Pairs this browser straight to a demo account (sample meetings, nothing is sent). */
  pairDemo(timeZone: string) {
    return this.call<{ token: string }>('/api/pair/demo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timeZone }),
    })
  }

  pairStatus() {
    return this.call<{ paired?: boolean; linked: boolean; demo: boolean }>('/api/pair/status')
  }

  meetings() {
    return this.call<{ timeZone: string; focus: number; items: MeetingItem[] }>('/api/meetings')
  }

  followUp(meetingId: string, input: Uint8Array | string) {
    return this.call<{ sessionId: string; transcript: string; cards: Card[] }>(
      `/api/followup?meetingId=${encodeURIComponent(meetingId)}`,
      this.voiceOrText(input),
    )
  }

  approve(sessionId: string, draftId: string) {
    return this.call<Approval>(`/api/sessions/${sessionId}/drafts/${draftId}/approve`, { method: 'POST' })
  }

  revise(sessionId: string, draftId: string, input: Uint8Array | string) {
    return this.call<{ instruction: string; card: Card }>(`/api/sessions/${sessionId}/drafts/${draftId}/revise`, this.voiceOrText(input))
  }

  undo(actionId: string) {
    return this.call<{ ok: boolean; reason?: string }>(`/api/actions/${actionId}/undo`, { method: 'POST' })
  }
}
