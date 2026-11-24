# Next Up

**Know who you're meeting before you walk in. Send the follow-up before you reach the car.**

Next Up is an Even G2 app for people with back-to-back in-person meetings: founders, sales and partnerships people, consultants. Ten minutes before a meeting, one glance shows who you're meeting, what they last asked for and what you owe them. Pulling your phone out during a meeting is rude; glancing at your glasses isn't. After the meeting, hold the R1 ring and say one sentence ("send him the revised quote Friday, book a check-in next Tuesday"). Next Up drafts the recap email, the calendar invite and a reminder for yourself, and you approve each with one tap.

Built for the **Heads Up** hackathon (Even Realities × TVM Ventures × Daos Hub).

- **Main track:** 04 · AI Assistants & Work. It uses Google Calendar, Gmail and OpenRouter.
- **Second track:** 01 · Messaging & News. Telegram is part of the same flow: your last chat with the person feeds the brief, and the follow-up goes out on Telegram if that's where you talk.

## How it works on the glasses

| Moment | On the display | Input |
|---|---|---|
| Before | `NEXT UP · IN 12 MIN · 14:00`<br>`Daniel Reyes · Harbor Studio`<br>`Last: asked for a revised quote`<br>`You owe: timeline for phase 2` | **Tap:** 3 more facts · **Swipe:** other meetings today |
| Right after | `AFTER · DANIEL REYES · REC 0:04` | **Hold the ring and speak**, release when done |
| Review | `DRAFT 1 / 3 · EMAIL · Sends when approved`<br>`To Daniel · Re: Website rebuild quote`<br>`I'll send the revised quote by Friday…` | **Tap:** approve · **Swipe:** skip · **Hold:** change it by voice ("make it Wednesday at 3") |
| Done | `• Email sent` `• Invite sent · Tue 10:00` `• Reminder set · Fri 09:00` | **Swipe within 10 s:** undo everything · **Tap:** next meeting |

Double-tap always exits, following the platform convention.

**What Next Up adds to Even's built-in Conversate:** Conversate helps during a conversation. It works from prep notes you upload yourself, shows a live transcript, and saves a summary afterwards. Next Up covers before and after: the brief writes itself from your calendar, email and Telegram, and the follow-up actually gets sent. It never listens to the meeting itself.

## Repository

```
app/      Glasses app: Vite + TypeScript + Even Hub SDK (runs in the Even app WebView)
  src/core.ts       State machine and screen layouts. No SDK imports, unit-tested in Node
  src/main.ts       SDK glue: 3 text containers, input events, mic capture
  src/companion.ts  Phone-side screen: mirror, pairing link, type-instead-of-speak
server/   Backend: Node + Express + TypeScript
  src/google.ts     Calendar + Gmail over REST (no Google SDK)
  src/telegram.ts   Telegram user login (GramJS / MTProto)
  src/brief.ts      Meeting brief from your history with the person
  src/followup.ts   Spoken note → email/Telegram recap, invite, reminders
  src/actions.ts    Approval queue with undo window and scheduled sends
  src/demo.ts       Sample day used when no accounts are connected
```

## Run it locally (no keys needed)

```bash
# 1. Server (demo data, rule-based drafts)
cd server && npm install && npm run dev        # http://localhost:8787

# 2. Glasses app
cd app && npm install && npm run dev           # http://localhost:5173
```

- **In a browser:** open http://localhost:5173. Without glasses the app shows a preview of the 576×288 display, with buttons for tap, swipe and hold, and a box to type instead of speaking. Open http://localhost:8787/pair in another tab, enter the code, and choose **Use demo data**.
- **In the simulator:** `npm i -g @evenrealities/evenhub-simulator`, then `npm run simulate`.
- **On G2:** `npm run qr` and scan it from the Even Realities app (Developer Mode). Set `VITE_API_BASE` to an address the phone can reach.

Tests:

```bash
cd server && npm test   # API end to end in demo mode, time parsing, rule-based drafts
cd app && npm test      # Drives the app core against a real server process: pair → brief → follow-up → approve → undo
```

## Connect real accounts

Copy `server/.env.example` to `server/.env` and fill in what you have. Each integration is optional.

| What | Where to get it | Without it |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google Cloud console → APIs & Services. Enable the Calendar and Gmail APIs, create an OAuth client of type "Web application", and set the redirect URI to `{PUBLIC_URL}/auth/google/callback`. While the app is in testing, add yourself as a test user. | Demo data only |
| `TELEGRAM_API_ID` / `_HASH` | my.telegram.org → API development tools | Email-only briefs and follow-ups |
| `LLM_API_KEY` (+ `LLM_BASE_URL`, `LLM_MODEL`) | Any OpenAI-compatible API: OpenRouter (default), Orbio, OpenAI | Rule-based drafts and plain-text briefs |
| `STT_API_KEY` | Groq or OpenAI (any `/audio/transcriptions` endpoint) | Type on the phone instead of speaking |

Google sign-in can't run inside the glasses WebView, so the user pairs on their phone instead. The glasses show a 6-digit code, the phone opens `/pair`, and accounts are connected from that page.

## Deploy (Railway)

1. Create a service from this repo and set **Settings → Source → Root Directory** to `/server`. Build, start and health-check settings come from `server/railway.json`.
2. Add a volume mounted at `/data`, and set `DATA_FILE=/data/store.json`.
3. Set `PUBLIC_URL`, `SESSION_SECRET` and the keys above.
4. In `app/app.json`, set the `network` whitelist to your server URL. Then build and pack the app:
   ```bash
   cd app && VITE_API_BASE=https://your-server.up.railway.app npm run pack
   ```

## Privacy and safety

- **Nothing is sent without a tap.** Each approval waits 10 seconds (`UNDO_SECONDS`) before it runs, and a swipe cancels it. Calendar events already created are deleted on undo.
- **Never records the meeting.** The mic is only on while you hold the ring after the meeting. Audio is transcribed and thrown away, never stored.
- **Reads narrowly.** It reads only the emails and private Telegram chat with the people in your meetings. It never reads group chats or channels.
- **Tokens stay on the server.** Google tokens and the Telegram session never reach the glasses, which hold only a random device token.
- **Delete everything** on the phone page removes the account, tokens, devices and actions.
- **Honest drafts.** Drafts never claim a file is attached. When you promise to send something later, Next Up sets you a reminder instead.

## What existed before Nov 23, 2026

Nothing in this repository. Everything here was written during the hackathon (Nov 23–29, 2026).

It uses these open-source libraries and public APIs:
- Even Hub SDK, CLI and simulator. The official `evenhub-templates` repo was a reference for the event-handling pattern.
- Express
- GramJS (`telegram`)
- Vite and TypeScript
- Google Calendar and Gmail REST APIs
- OpenRouter
- An OpenAI-compatible Whisper endpoint for speech-to-text

## API feature requests (for the submission)

1. **Even Hub:** a way for an app to show a glanceable notification while it isn't open (for example "Meeting in 10 min, open Next Up"). Right now the user has to remember to open the app.
2. **Even Hub:** read access to the phone's calendar, so apps don't need a separate Google sign-in.
3. **Google:** a lighter Gmail permission scoped to "messages with these addresses", instead of the broad `gmail.readonly`.
4. **Telegram:** read access to one chat at a time for user-approved apps, without a full account session.
5. **Gmail API:** native scheduled send, matching what Gmail offers in its own app.
