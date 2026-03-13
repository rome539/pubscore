# PubScore

Decentralized profile reputation on Nostr.

PubScore is a single-file web app that lets anyone rate and review Nostr profiles. Reviews are stored as Nostr events on public relays — no backend, no database, no accounts beyond your existing Nostr identity. Scores are validated and served by the [PubScore API](https://github.com/rome539/pubscore-api).

## How It Works

You paste someone's npub (or hex pubkey, or username), see their profile and existing reviews, and leave your own rating + written review. Everything is signed with your Nostr key and broadcast to relays. That's it.

## Features

### Lookup
Search any Nostr profile by npub, hex pubkey, or username. See their score, reviews, rating breakdown, and category tags at a glance.

### Rating Breakdown
Expand "Rating Breakdown" on any profile card to see a star histogram (how many 1–5 star reviews) and a "Tagged as" section showing what percentage of reviewers tagged them as Trustworthy, Knowledgeable, Helpful, Funny, Creative, or Warning.

### Following Tab
See everyone you follow on Nostr with their PubScore. Scored profiles appear first, sorted by rating. Unscored profiles show up too so you can be the first to review them. Paginated.

### Reviewer Reputation Badges
Every review card shows a small badge next to the reviewer's name with their own PubScore. Helps you gauge how established the reviewer is.

### Notifications
Bell icon in the top bar. When someone reviews you, a red dot appears. Tap to see who reviewed you, their rating, and when. Powered by the PubScore API — only validated reviews trigger notifications.

### Dark / Light Mode
Toggle with the moon/sun icon. Preference is saved across sessions.

### Embeddable Badge
Go to My Reviews → "Get Badge" to get a Markdown or HTML snippet you can paste into websites, GitHub READMEs, or blogs. Shows your live score as a visual pill that links to your PubScore profile.

### Share on Nostr
Compose and publish a kind 1 note sharing your PubScore with customizable hashtags.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` or `Cmd+K` | Focus search bar |
| `1` `2` `3` | Switch tabs (Lookup, Following, My Reviews) |
| `T` | Toggle dark/light theme |
| `N` | Open notifications |
| `H` | Go home |
| `Escape` | Close any open modal, drawer, or dropdown |

Shortcuts are disabled while typing in inputs.

## Front Page

On load, PubScore fetches leaderboard data from the API and displays top-rated profiles. The top 3 highest-rated are pinned, and 13 more are randomly selected. Hit Shuffle to re-randomize without re-fetching. A tag leaderboard section shows profiles grouped by category (Trustworthy, Knowledgeable, etc.).

## Event Protocol

### Review Events — Kind 38100

PubScore uses kind 38100, a parameterized replaceable event in the app-specific range (30000–39999). Being replaceable means each user can only have one active review per subject — publishing a new one overwrites the old one automatically.

#### Event Structure

```json
{
  "kind": 38100,
  "pubkey": "<reviewer's hex pubkey>",
  "created_at": 1709312400,
  "tags": [
    ["p", "<subject's hex pubkey>"],
    ["d", "<subject's hex pubkey>"],
    ["rating", "4"],
    ["t", "helpful"],
    ["t", "knowledge"]
  ],
  "content": "Great contributor to the community, always sharing useful resources.",
  "id": "...",
  "sig": "..."
}
```

#### Tag Breakdown

| Tag | Purpose |
|-----|---------|
| `p` | References the subject being reviewed. Standard Nostr profile tag — relays can index on this for efficient querying. |
| `d` | Set to the subject's pubkey. Makes the event parameterized replaceable — one review per reviewer per subject. |
| `rating` | Integer from 1 to 5. Stored as a string per Nostr tag convention. |
| `t` | Optional category tags. Zero or more of: `TRUSTWORTHY`, `KNOWLEDGEABLE`, `HELPFUL`, `FUNNY`, `CREATIVE`, `WARNING`.|

The `content` field holds the free-text review body (max 2000 characters, enforced client-side).

### Deletion Events — Kind 5

Deleting a review publishes a standard NIP-09 deletion event:

```json
{
  "kind": 5,
  "tags": [
    ["e", "<event id of the review to delete>"],
    ["k", "38100"]
  ],
  "content": ""
}
```

## Scoring

### Per-Profile Rating

Scoring is simple and transparent — no weighted algorithms or hidden factors:

1. Fetch all kind 38100 events where the `p` tag matches the subject's pubkey
2. Deduplicate — keep only the newest by `created_at` per author
3. Extract the `rating` tag value (clamped to 1–5)
4. Average — sum all ratings, divide by count

One reviewer = one vote.

### Validated Scores (API)

The [PubScore API](https://api.pubscore.space) adds validation on top of the raw Nostr data:

- Valid Nostr event signature
- Reviewer has ≥30 followers
- Rating between 1–5
- No self-reviews
- One review per reviewer per profile (newest kept)
- Max 20 reviews per reviewer per day

## Relays

PubScore broadcasts to and reads from:

- `wss://relay.damus.io`
- `wss://relay.mostr.pub`
- `wss://relay.nostrplebs.com`
- `wss://relay.primal.net`
- `wss://nos.lol`

Publishing uses `Promise.allSettled` — the event is sent to all relays independently. Reading uses `querySync` to gather and merge results.

## Authentication

### NIP-07 Browser Extension (Recommended)

Uses `window.nostr.getPublicKey()` and `window.nostr.signEvent()` from extensions like Alby, nos2x, or Nostr Connect. The private key never touches PubScore.

### nsec Private Key

For users without an extension. The key is handled by a `SecureKeyStore` — a closure-based store with no `.get()` method:

```javascript
function createSecureKeyStore(NostrTools) {
    let _secretKey = null;
    return Object.freeze({
        set(key)    { _secretKey = key; },
        has()       { return _secretKey !== null; },
        clear()     { /* zeros every byte, then nulls */ },
        signEvent(e){ return NostrTools.finalizeEvent(e, _secretKey); }
    });
}
```

The key lives inside the closure. Even with XSS, an attacker can call `signEvent()` but cannot read the raw key bytes. Additional protections:

- Auto-logout after 15 minutes of inactivity
- `beforeunload` wipes the key when the tab closes
- Byte zeroing on `clear()` — overwrites every byte of the Uint8Array

### View Only (npub)

Browse profiles and reviews without signing capability. No key required.

## Security

### Content Sanitization

All relay data is treated as untrusted:

- `escapeHtml()` on every string before `innerHTML`
- `sanitizeUrl()` blocks `javascript:`, `data:`, `vbscript:`, `file:` protocols
- `capLength()` prevents DOM bloat from oversized strings
- Display names capped at 100 chars, bios at 500, reviews at 2,000

### Content Security Policy

Strict CSP via `<meta>` tag:

- `script-src` limited to self, `unsafe-inline`, and CDNs (unpkg, jsDelivr, esm.sh)
- `connect-src` allows `https:` and `wss:` for relay connections
- `object-src: none`, `base-uri: self`, `form-action: self`, `frame-ancestors: none`
- `upgrade-insecure-requests` enforced
- `referrer` set to `no-referrer`

## Tech Stack

- Single HTML file — no build step, no bundler, no framework
- `nostr-tools` 2.7.2 via esm.sh (ESM import)
- Fonts — Fraunces (serif display) + Karla (body) from Google Fonts
- PubScore API for validated scores, leaderboards, and notifications
- Zero backend for the frontend — everything is client-side + relay/API queries

## File Structure

```
index.html             — The entire app
apple-touch-icon.png   — 180x180 app icon
og-preview.png         — 1200x630 Open Graph preview image
README.md              — This file
```

## Why Kind 38100?

Nostr reserves kind ranges for different purposes:

- 0–9999 — Regular events
- 10000–19999 — Replaceable events
- 20000–29999 — Ephemeral events
- 30000–39999 — Parameterized replaceable events (addressable)

Kind 38100 falls in the parameterized replaceable range, which gives us:

- **One review per person per subject** — enforced at the protocol level by the `d` tag
- **Updatable** — publish a new event with the same `d` value and it replaces the old one
- **App-specific** — avoids collision with well-known kinds like 30023 (long-form posts)

The `d` tag is set to the subject's pubkey, so the "address" of a review is effectively `38100:<reviewer pubkey>:<subject pubkey>` — globally unique per reviewer-subject pair.
