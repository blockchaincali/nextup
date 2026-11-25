// The phone-side web pages: enter the pairing code, connect accounts, see the
// demo outbox, delete your data. Plain HTML so it works in any mobile browser.

/** The Next Up mark: G2-style glasses, a brief in the left lens, "next" in the right. */
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" xmlns:c2pa="http://c2pa.org/manifest">
  <rect width="512" height="512" rx="112" fill="#0B0F0C"/>
  <g fill="none" stroke="#4BFF8A" stroke-width="20" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="156" cy="268" r="74"/>
    <circle cx="356" cy="268" r="74"/>
    <path d="M230 254 Q256 232 282 254"/>
    <path d="M82 250 L58 212"/>
    <path d="M430 250 L454 212"/>
    <path d="M338 234 L372 268 L338 302"/>
  </g>
  <g stroke="#4BFF8A" stroke-width="15" stroke-linecap="round" opacity="0.7">
    <path d="M122 250 H190"/>
    <path d="M122 286 H170"/>
  </g>
<metadata><c2pa:manifest>AAAWgmp1bWIAAAAeanVtZGMycGEAEQAQgAAAqgA4m3EDYzJwYQAAABZcanVtYgAAAEdqdW1kYzJtYQARABCAAACqADibcQN1cm46YzJwYToyZWFkNDA0MC04Yzk3LTQ2ZjQtYjYwMS0zYTlhZDEwZGYyYjQAAAADl2p1bWIAAAApanVtZGMyYXMAEQAQgAAAqgA4m3EDYzJwYS5hc3NlcnRpb25zAAAAALxqdW1iAAAARGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaW5ncmVkaWVudC52MwAAAAAYYzJzaJZ+GjOBH/KDE4FH8CnL9dYAAABwY2JvcqNpZGM6Zm9ybWF0bWltYWdlL3N2Zyt4bWxqaW5zdGFuY2VJRHgseG1wOmlpZDoyYzFkN2JiOS00NmM0LTQwMWItOTExNy1iYzU0NTM0ZTc2MTdscmVsYXRpb25zaGlwaHBhcmVudE9mAAAB4mp1bWIAAABBanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5hY3Rpb25zLnYyAAAAABhjMnNo0lDmB15pFH10iNySTP2YHAAAAZljYm9yomdhY3Rpb25zgqJmYWN0aW9ua2MycGEub3BlbmVkanBhcmFtZXRlcnOha2luZ3JlZGllbnRzgaJjdXJseC1zZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmluZ3JlZGllbnQudjNkaGFzaFggpe0hRDK9KGa3+dPw5QdtacGuHS2eUjzDR003E5Pcs9WkZmFjdGlvbngdY29tLmFudGhyb3BpYy5jbGF1ZGUucHJvdmlkZWRqcGFyYW1ldGVyc6F4H2NvbS5hbnRocm9waWMub3JpZ2luLWNvbmZpZGVuY2VndW5rbm93bmtkZXNjcmlwdGlvbnhmQ2xhdWRlIHByb3ZpZGVkIHRoaXMgZmlsZSBhdCB0aGUgcmVxdWVzdCBvZiBhIHVzZXIgYW5kIG1heSBoYXZlIGNyZWF0ZWQgb3IgbW9kaWZpZWQgdGhlIGZpbGUgY29udGVudHMubXNvZnR3YXJlQWdlbnShZG5hbWVmQ2xhdWRlcmFsbEFjdGlvbnNJbmNsdWRlZPUAAADIanVtYgAAAEBqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmhhc2guZGF0YQAAAAAYYzJzaLVxivDMjkHwqEB8zLw5a4EAAACAY2JvcqVjYWxnZnNoYTI1NmNwYWRMAAAAAAAAAAAAAAAAZGhhc2hYIPFdctSfCcO+eih3/rAV919o3lhkci1CDvOCJ+W73bV/ZG5hbWVuanVtYmYgbWFuaWZlc3RqZXhjbHVzaW9uc4GiZXN0YXJ0GQKzZmxlbmd0aBkeBAAAAj5qdW1iAAAAJ2p1bWRjMmNsABEAEIAAAKoAOJtxA2MycGEuY2xhaW0udjIAAAACD2Nib3KlY2FsZ2ZzaGEyNTZpc2lnbmF0dXJleE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOjJlYWQ0MDQwLThjOTctNDZmNC1iNjAxLTNhOWFkMTBkZjJiNC9jMnBhLnNpZ25hdHVyZWppbnN0YW5jZUlEeCx4bXA6aWlkOjY5NjYwODJiLTNlMjMtNDlkNS1hOTlhLWFjN2U1NzMzMjMxNXJjcmVhdGVkX2Fzc2VydGlvbnODomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCCl7SFEMr0oZrf50/DlB21pwa4dLZ5SPMNHTTcTk9yz1aJjdXJseCpzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmFjdGlvbnMudjJkaGFzaFggo2vw8QMzkIZSrU1gFILDRFDUbAwpskRUxN0OH1HsYXWiY3VybHgpc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFkaGFzaFgg6f9OoNvAqVjBjWToqF+9jDw+zVEj6W2lHdNsiJhNJx10Y2xhaW1fZ2VuZXJhdG9yX2luZm+jZG5hbWVvQW50aHJvcGljIEZpbGVzZ3ZlcnNpb25lMS4wLjBrc3BlY1ZlcnNpb25lMi40LjAAABA4anVtYgAAAChqdW1kYzJjcwARABCAAACqADibcQNjMnBhLnNpZ25hdHVyZQAAABAIY2JvctKEWQISogEmGCFZAgowggIGMIIBjaADAgECAhRA5aAK7sI50L64g/oGQgU9Z1UTADAKBggqhkjOPQQDAzBJMRcwFQYDVQQKEw5BbnRocm9waWMsIFBCQzEuMCwGA1UEAxMlQW50aHJvcGljIENvbnRlbnQgQ3JlZGVudGlhbHMgUm9vdCBDQTAeFw0yNjA4MDcxODQzNTZaFw0yODA4MDYxOTQzNTZaMEQxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMSkwJwYDVQQDEyBBbnRocm9waWMgQ2xhdWRlIENvbnRlbnQgU2lnbmluZzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJh6CmvLUBgFFNU0vUKlOVtE6djd17L5SuwX0LemFisBM3dkd/3cyjxFA3Qo5S46fX0/ihY0VZ7mfb9KF703t5OjWDBWMA4GA1UdDwEB/wQEAwIHgDAVBgNVHSUEDjAMBgorBgEEAYPoXgIBMAwGA1UdEwEB/wQCMAAwHwYDVR0jBBgwFoAUzlHiBIFOZFsj+OPEz5o+nMHXXMIwCgYIKoZIzj0EAwMDZwAwZAIwMXMdFJ4BetLLVY7ORuE9noqbbAZOZn/aArXyTwFAZfKrPzxF2vPoJNf1+UCdg1XGAjBwX1zd9WGqYkqmL5SFqw1QySjr1zJfpJM9+1rdDwSPLMOPOjKuiXjoU/pUUeG9RwmhY3BhZFkNngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPZYQIYx6lI/SI5yRTgxcp0TFYXhHBVe16B/5D+eAMP7snDNJ5wgAiIoEJEQNfHkZuM4Jez77I/thoCUHmteAkyqZRU=</c2pa:manifest></metadata></svg>`

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Next Up</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/favicon.svg">
<meta name="theme-color" content="#0b0f0c">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0f0c;color:#e6efe8;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif}
main{max-width:520px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:26px;margin:0 0 4px}
.brand{display:flex;align-items:center;gap:10px;color:#4bff8a;font-weight:600;letter-spacing:.08em;font-size:13px;text-transform:uppercase;margin-bottom:24px;text-decoration:none}
.brand img{width:32px;height:32px}
.hero h1{font-size:34px;line-height:1.2;min-height:2.4em;margin:8px 0 12px}
.type{white-space:pre-wrap}
.caret{display:inline-block;width:.55em;height:1em;margin-left:2px;background:#4bff8a;vertical-align:-.12em;animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.hud{margin:28px 0 8px;background:#000;border-radius:14px;padding:16px 18px;aspect-ratio:2/1;display:flex;flex-direction:column;justify-content:space-between;color:#4bff8a;font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;border:1px solid #1b2a20}
.hud .dim{opacity:.7;font-size:12px}
.hud .lines{margin:8px 0;white-space:pre-line}
.cta{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:20px 0}
@media (prefers-reduced-motion:reduce){.caret{animation:none}}
p.muted,.muted{color:#9fb3a5}
.card{background:#121a15;border:1px solid #23352a;border-radius:14px;padding:18px;margin:16px 0}
.row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
label{display:block;font-size:14px;color:#9fb3a5;margin:12px 0 6px}
input{width:100%;font:inherit;padding:14px;border-radius:10px;border:1px solid #2c4436;background:#0b0f0c;color:#e6efe8}
input.code{font-size:32px;letter-spacing:.3em;text-align:center}
button,.btn{display:inline-block;font:inherit;font-weight:600;padding:12px 18px;border-radius:10px;border:0;background:#4bff8a;color:#06210f;text-decoration:none;cursor:pointer;min-height:44px}
button.secondary,.btn.secondary{background:transparent;color:#4bff8a;border:1px solid #2c6b45}
button.danger{background:transparent;color:#ff8a80;border:1px solid #6b2c2c}
.ok{color:#4bff8a;font-weight:600}
.err{background:#2a1212;border:1px solid #6b2c2c;color:#ffb4ab;padding:12px;border-radius:10px}
pre{white-space:pre-wrap;font:14px/1.45 ui-monospace,Menlo,monospace;margin:0}
ul{padding-left:20px}
a{color:#4bff8a}
</style>
</head>
<body><main><a class="brand" href="/"><img src="/favicon.svg" alt="" width="32" height="32">Next Up · for Even G2</a>${body}</main></body>
</html>`
}

export function landingPage(): string {
  return page(
    'Home',
    `<section class="hero">
<h1 aria-label="Know who you're meeting. Follow up before you reach the car."><span class="type" id="type" aria-hidden="true">Know who you're meeting.
Follow up before you reach the car.</span><span class="caret" aria-hidden="true"></span></h1>
<p class="muted">Next Up shows a one-glance brief on your Even G2 before an in-person meeting, then turns one spoken sentence into a follow-up email, invite and reminders you approve with a tap.</p>
<div class="cta"><a class="btn" href="/try/">Start with your Google account</a><a class="btn secondary" href="/try/?demo">Quick demo, no sign-in</a></div>
<p class="muted" style="font-size:14px">Runs in your browser, or on Even G2 from the Even Hub. The quick demo uses sample meetings and sends nothing. <a href="/privacy">How we handle your data</a></p>
</section>
<figure class="hud" role="img" aria-label="Example brief on the glasses: Daniel Reyes from Harbor Studio, in 12 minutes. He last asked for a revised quote; you owe a timeline for phase 2.">
<div class="dim">NEXT UP · IN 12 MIN · 14:00</div>
<div class="lines">Daniel Reyes · Harbor Studio

Last: asked for a revised quote
You owe: timeline for phase 2</div>
<div class="dim">Tap: more · Hold: speak · Swipe: next</div>
</figure>
<p class="muted" style="font-size:14px">After the meeting, hold the ring and say "Send him the quote Friday, book a check-in Tuesday". Approve the email, the invite and your reminder with three taps.</p>
<script>
(() => {
  const el = document.getElementById('type')
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const lines = ["Know who you're meeting.", 'Follow up before you reach the car.']
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const run = async () => {
    for (;;) {
      for (const line of lines) {
        for (let i = 1; i <= line.length; i++) { el.textContent = line.slice(0, i); await wait(55) }
        await wait(1600)
        for (let i = line.length; i >= 0; i--) { el.textContent = line.slice(0, i); await wait(22) }
        await wait(300)
      }
    }
  }
  el.textContent = ''
  run()
})()
</script>`,
  )
}

export function pairPage(error = '', code = ''): string {
  return page(
    'Pair',
    `<h1>Pair your glasses</h1>
<p class="muted">Open Next Up on your G2. Enter the 6-digit code it shows.</p>
<p class="muted" style="font-size:14px">No glasses? Open <a href="/try/" target="_blank" rel="noopener">the browser version</a> in another tab: it shows the code. Or <a href="/try/?demo">try the demo</a> with no pairing at all.</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/pair">
<label for="code">Code from your glasses</label>
<input class="code" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required autofocus value="${esc(code.replace(/\D/g, '').slice(0, 6))}">
<input type="hidden" name="tz" id="tz">
<p><button type="submit">Pair</button></p>
</form>
<script>document.getElementById('tz').value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'</script>`,
  )
}

export interface ConnectView {
  googleAvailable: boolean
  telegramAvailable: boolean
  googleEmail?: string
  telegramConnected: boolean
  demo: boolean
  ready: boolean
  outbox: Array<{ at: number; what: string }>
  timeZone: string
}

export function connectPage(v: ConnectView, notice = ''): string {
  const google = v.googleEmail
    ? `<span class="ok">Connected</span> <span class="muted">${esc(v.googleEmail)}</span>
       <form method="post" action="/account/disconnect/google"><button class="secondary">Disconnect</button></form>`
    : v.googleAvailable
      ? `<a class="btn" href="/auth/google">Connect Google</a>`
      : `<span class="muted">Not configured on this server</span>`
  const telegram = v.telegramConnected
    ? `<span class="ok">Connected</span>
       <form method="post" action="/account/disconnect/telegram"><button class="secondary">Disconnect</button></form>`
    : v.telegramAvailable
      ? `<a class="btn secondary" href="/connect/telegram">Connect Telegram</a>`
      : `<span class="muted">Not configured on this server</span>`

  return page(
    'Connect',
    `<h1>${v.ready ? 'You’re set. Look at your glasses.' : 'Connect your accounts'}</h1>
${notice ? `<p class="err">${esc(notice)}</p>` : ''}
<div class="card">
  <div class="row"><strong>Google Calendar + Gmail</strong></div>
  <p class="muted">Reads your meetings and your last emails with the people in them. Sends only what you approve on the glasses.</p>
  <div class="row">${google}</div>
</div>
<div class="card">
  <div class="row"><strong>Telegram</strong> <span class="muted">optional</span></div>
  <p class="muted">Reads your recent private chat with the person you're meeting, and sends the follow-up there if that's where you usually talk.</p>
  <div class="row">${telegram}</div>
</div>
<div class="card">
  <div class="row"><strong>Try it with demo data</strong></div>
  <p class="muted">A sample day of meetings. Nothing is sent anywhere; actions appear in the outbox below.</p>
  ${v.demo ? '<span class="ok">Demo data is on</span>' : `<form method="post" action="/connect/demo"><button class="secondary">Use demo data</button></form>`}
</div>
${
  v.demo
    ? `<div class="card"><div class="row"><strong>Demo outbox</strong><a href="/connect">Refresh</a></div>
${v.outbox.length ? v.outbox.map((o) => `<p><span class="muted">${esc(new Date(o.at).toLocaleTimeString('en-US', { timeZone: v.timeZone }))}</span><br><pre>${esc(o.what)}</pre></p>`).join('') : '<p class="muted">Nothing sent yet. Approve a draft on the glasses.</p>'}</div>`
    : ''
}
<div class="card">
  <strong>Your data</strong>
  <p class="muted">Time zone: ${esc(v.timeZone)}. We keep account tokens and the drafts you approve; we never store audio or full email bodies.</p>
  <form method="post" action="/account/delete" onsubmit="return confirm('Delete your account and unpair your glasses?')"><button class="danger">Delete everything</button></form>
</div>`,
  )
}

export function telegramPage(step: 'phone' | 'code' | 'password', error = '', via: 'app' | 'sms' = 'app'): string {
  const fields = {
    phone: `<label for="phone">Phone number with country code</label>
<input id="phone" name="phone" type="tel" placeholder="+234 800 000 0000" required autofocus>`,
    code: `<p class="muted">${via === 'app' ? 'Telegram sent a login code to your Telegram app: open the chat named <strong>Telegram</strong> (blue tick).' : 'Telegram sent the login code by SMS.'} Don’t forward or screenshot it.</p>
<label for="code">Login code</label>
<input class="code" id="code" name="code" inputmode="numeric" required autofocus>`,
    password: `<input type="hidden" name="code" value="-">
<label for="password">Your Telegram two-step verification password</label>
<input id="password" name="password" type="password" required autofocus>`,
  }[step]
  const action = step === 'phone' ? '/connect/telegram/start' : '/connect/telegram/code'
  return page(
    'Telegram',
    `<h1>Connect Telegram</h1>
<p class="muted">Next Up signs in as you so it can read the chat with the person you're meeting. It never reads group chats or channels, and you can disconnect at any time.</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="${action}">${fields}<p><button type="submit">Continue</button></p></form>
<p><a href="/connect">Back</a></p>`,
  )
}

export function privacyPage(): string {
  return page(
    'Privacy',
    `<h1>How Next Up handles your data</h1>
<ul>
<li>Next Up reads your calendar, and only the emails and Telegram chats with the people in your upcoming meetings.</li>
<li>Nothing is sent without your tap on the glasses. Every approval has a ${'10'}-second undo.</li>
<li>Voice notes are transcribed and discarded. Audio is never stored.</li>
<li>Briefs are generated on demand and cached for a few minutes, not stored.</li>
<li>Your Google tokens and Telegram session stay on our server, never on the glasses.</li>
<li>“Delete everything” on the connect page removes your account, tokens and approved actions.</li>
</ul>
<p><a href="/">Home</a></p>`,
  )
}
