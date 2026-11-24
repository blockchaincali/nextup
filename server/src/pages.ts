// The phone-side web pages: enter the pairing code, connect accounts, see the
// demo outbox, delete your data. Plain HTML so it works in any mobile browser.

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
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0f0c;color:#e6efe8;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif}
main{max-width:520px;margin:0 auto;padding:32px 20px 64px}
h1{font-size:26px;margin:0 0 4px}
.brand{color:#4bff8a;font-weight:600;letter-spacing:.08em;font-size:13px;text-transform:uppercase;margin-bottom:24px}
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
<body><main><div class="brand">Next Up · for Even G2</div>${body}</main></body>
</html>`
}

export function landingPage(): string {
  return page(
    'Home',
    `<h1>Know who you're meeting. Follow up before you reach the car.</h1>
<p class="muted">Next Up shows a one-glance brief on your Even G2 before an in-person meeting, then turns one spoken sentence into a follow-up email, invite and reminders you approve with a tap.</p>
<p><a class="btn" href="/pair">Pair my glasses</a></p>
<p class="muted"><a href="/privacy">How we handle your data</a></p>`,
  )
}

export function pairPage(error = ''): string {
  return page(
    'Pair',
    `<h1>Pair your glasses</h1>
<p class="muted">Open Next Up on your G2. Enter the 6-digit code it shows.</p>
${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/pair">
<label for="code">Code from your glasses</label>
<input class="code" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required autofocus>
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

export function telegramPage(step: 'phone' | 'code' | 'password', error = ''): string {
  const fields = {
    phone: `<label for="phone">Phone number with country code</label>
<input id="phone" name="phone" type="tel" placeholder="+234 800 000 0000" required autofocus>`,
    code: `<label for="code">Login code Telegram just sent you</label>
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
