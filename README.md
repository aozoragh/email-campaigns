# Small-Batch Email Sender

A minimal SvelteKit MVP for sending a **small batch** of emails from your own
Gmail or Outlook account. Connect an account → upload a contact list → send now →
download the results. That's the whole product.

It is positioned as a **safe small-batch email sender**, not bulk/spam automation.
There is no stealth, rotation, spoofing, or spam-filter evasion of any kind, and
conservative sending limits are enforced.

## What it does

- Connect **Gmail** (Gmail API) or **Outlook** (Microsoft Graph `sendMail`) with
  **send-only** permission.
- Upload a contact list as **CSV** or **XLSX**.
- Parse, preview, **validate emails**, and **remove duplicates** — invalid/skipped
  rows are shown clearly.
- Enter a **subject**, **body**, and an optional **footer / unsubscribe note**
  (a sensible default is provided).
- **Send now**, one recipient at a time, with live per-recipient status
  (`pending → sending → sent / failed / skipped`).
- **Download** the final results as CSV.

## What it deliberately does NOT do

No database, no saved contacts, no saved campaigns, no sending history, no
scheduling, no analytics, no templates, no team/CRM features, and **no stored
OAuth refresh tokens**.

---

## Safe sending limits (guardrails)

All enforced server-side in [`src/lib/server/email/send-run.ts`](src/lib/server/email/send-run.ts):

| Guardrail | Default | Why |
| --- | --- | --- |
| Max recipients per run | **50** | Keeps it small-batch; rejected before sending. |
| Sequential sending | one at a time | No parallel blasting. |
| Delay between sends | **1200 ms** | Gentle pacing (not an evasion tactic). |
| Consecutive-failure circuit breaker | **5** | Stops the run if something is clearly wrong (e.g. expired token/quota). |
| Duplicate removal | always | De-duplicates by email (case-insensitive). |
| Invalid email skipping | always | Bad addresses are never sent to. |
| Explicit confirmation | required | You must confirm you have permission to email the list. |

---

## Environment variables

Copy [`.env.example`](.env.example) to `.env` and fill it in:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | e.g. `http://localhost:5180/auth/gmail/callback` |
| `MICROSOFT_CLIENT_ID` | Microsoft (Entra) app client ID |
| `MICROSOFT_CLIENT_SECRET` | Microsoft client secret |
| `MICROSOFT_REDIRECT_URI` | e.g. `http://localhost:5180/auth/outlook/callback` |
| `SESSION_SECRET` | Long random string used to sign the session cookie |

A provider's **Connect** button is automatically disabled if its variables are missing.

---

## Setting up Google OAuth (Gmail)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create
   (or pick) a project.
2. **APIs & Services → Library →** enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen:** choose **External**, fill in the
   app name/support email, and add your own Google account under **Test users**
   (so you can use it while the app is unverified).
4. Add the scope `https://www.googleapis.com/auth/gmail.send` (send-only).
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID →
   Web application.**
6. Under **Authorized redirect URIs**, add exactly:
   `http://localhost:5180/auth/gmail/callback`
7. Copy the **Client ID** and **Client secret** into `.env`
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), and set `GOOGLE_REDIRECT_URI`
   to the same callback URL.

> The app uses `access_type=online`, so Google does **not** issue a refresh
> token. When the access token expires, simply reconnect.

## Setting up Microsoft OAuth (Outlook)

1. Go to the [Microsoft Entra admin center](https://entra.microsoft.com/) →
   **App registrations → New registration**.
2. Choose **Accounts in any organizational directory and personal Microsoft
   accounts** (matches the `common` authority used here).
3. Under **Redirect URI**, select platform **Web** and add exactly:
   `http://localhost:5180/auth/outlook/callback`
4. After creating it, copy the **Application (client) ID** into `MICROSOFT_CLIENT_ID`.
5. **Certificates & secrets → New client secret →** copy the secret **Value**
   into `MICROSOFT_CLIENT_SECRET`.
6. **API permissions → Add a permission → Microsoft Graph → Delegated
   permissions →** add **`Mail.Send`** and **`User.Read`**, then grant consent.
7. Set `MICROSOFT_REDIRECT_URI` to the same callback URL.

---

## Run locally

```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev            # http://localhost:5180
```

Type-check / build:

```bash
npm run check
npm run build
npm run preview
```

> **Note:** the dev/prod redirect URIs must match what you registered with Google
> and Microsoft. If you change the port or host, update both the provider config
> and the `*_REDIRECT_URI` env vars.

---

## Why this app does not use a database

The product is intentionally a stateless "connect → upload → send → download"
tool, so there is nothing worth persisting:

- **No contact storage / campaign history / analytics** — out of scope by design.
- **No stored OAuth tokens.** The access token is held **only in server process
  memory**, keyed to a signed **httpOnly** session cookie, with a short TTL, and
  is wiped on disconnect, on expiry, and on restart. We never request refresh
  tokens, never put tokens in `localStorage`, and never send the token to the
  browser.

This minimizes the attack surface: there is no token-at-rest to leak and no
contact data to breach.

### The one tradeoff (durable sessions)

Because tokens live in process memory, the app must run as a **single,
long-running Node instance** (it uses `@sveltejs/adapter-node`). It does **not**
work as-is on multi-instance or serverless/edge deployments, because memory isn't
shared across instances and is recycled between invocations — a user could be
routed to an instance that doesn't hold their token.

Making it horizontally scalable would require a **durable session store** (e.g.
Redis). That is deliberately **not** added here, because it would put OAuth
tokens at rest and contradict the no-persistence goal. If you genuinely need to
scale out, that is the tradeoff to weigh: a shared session store (tokens at rest,
needs encryption + tight TTLs) vs. the current zero-persistence single-instance
model.

---

## Current MVP limitations

- Single-instance only (see the tradeoff above).
- Plain-text emails only (no HTML editor / attachments).
- Up to **50 recipients per run** by default (configurable in `send-run.ts`).
- No automatic retries — a failed recipient is recorded as `failed`; re-run for
  those if needed.
- Sessions/tokens are lost on server restart (by design).
- Sends from the connected account directly; provider sending limits and
  reputation still apply.
- Not a substitute for a proper ESP for large or transactional volumes.

---

## Project structure

```
src/lib/types.ts                      Shared types (ContactRow, ParsedContact, SendStatus, SendResult, ConnectedAccount)
src/lib/server/env.ts                 Validated env access
src/lib/server/session.ts             In-memory token store + signed httpOnly cookie
src/lib/server/oauth/gmail.ts         Google OAuth (auth URL + token exchange)
src/lib/server/oauth/outlook.ts       Microsoft OAuth (auth URL + token exchange)
src/lib/server/email/gmail-send.ts    Gmail API send (MIME)
src/lib/server/email/outlook-send.ts  Graph sendMail
src/lib/server/email/send-run.ts      Sequential runner + safe sending limits
src/lib/server/contacts/parse.ts      CSV (papaparse) + XLSX (SheetJS) parsing
src/lib/server/contacts/validate.ts   Email validation + de-duplication
src/lib/server/results/csv.ts         Results → CSV
src/routes/                           Home, /auth/*, /send, /api/*
```
