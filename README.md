# PubScore

Decentralized profile reputation on Nostr.

PubScore is a single-file web app that lets anyone rate and review Nostr profiles. Reviews are stored as Nostr events on public relays — no backend, no database, no accounts beyond your existing Nostr identity.

---

## How It Works

You paste someone's `npub` (or hex pubkey), see their profile and existing reviews, and leave your own rating + written review. Everything is signed with your Nostr key and broadcast to relays. That's it.

### Front Page

On load, PubScore paginates through relays to fetch all review events, deduplicates and aggregates them by subject, and calculates average ratings. The top 3 highest-rated profiles are pinned, and 13 more are randomly selected from the remaining pool to display 16 cards total. Hit "Shuffle" to re-randomize the selection without re-fetching.

---

## Event Protocol

### Review Events — Kind `38383`

PubScore uses **kind 38383**, a parameterized replaceable event in the app-specific range (30000–39999). Being replaceable means each user can only have one active review per subject — publishing a new one overwrites the old one automatically.

#### Event Structure

```json
{
  "kind": 38383,
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
| `p` | References the **subject** being reviewed. Standard Nostr profile tag — relays can index on this for efficient querying. |
| `d` | Set to the subject's pubkey. This is what makes the event **parameterized replaceable** — the combination of `kind` + `pubkey` (author) + `d` tag means one review per reviewer per subject. Publishing again with the same `d` value replaces the previous event. |
| `rating` | Integer from `1` to `5`. Stored as a string per Nostr tag convention. |
| `t` | Optional category tags. Zero or more of: `trade` (Trustworthy), `knowledge` (Knowledgeable), `helpful` (Helpful), `warning` (Warning). |

The `content` field holds the free-text review body (max 2000 characters, enforced client-side).

### Deletion Events — Kind `5`

Deleting a review publishes a standard NIP-09 deletion event:

```json
{
  "kind": 5,
  "tags": [
    ["e", "<event id of the review to delete>"],
    ["k", "38383"]
  ],
  "content": ""
}
```

The `k` tag specifies the kind being deleted. Relays that support NIP-09 will stop serving the referenced event.

---

## Scoring

### Per-Profile Rating

Scoring is simple and transparent — no weighted algorithms or hidden factors:

1. **Fetch** all kind `38383` events where the `p` tag matches the subject's pubkey
2. **Deduplicate** — if multiple events exist from the same author for the same subject (relays sometimes serve both old and new versions of replaceable events), keep only the newest by `created_at`
3. **Extract** the `rating` tag value from each event (clamped to 1–5)
4. **Average** — sum all ratings, divide by count

That's the number displayed on the profile card. No decay, no weighting by follower count, no trust graphs. One reviewer = one vote.

### Featured Profiles (Front Page)

1. Query relays for up to 200 recent review events (no subject filter)
2. Deduplicate the same way
3. Group by subject pubkey
4. Calculate average rating per subject
5. Sort by average rating (highest first), break ties by review count
6. Take the top 20, randomly pick 6 to display

---

## Relays

PubScore broadcasts to and reads from these relays:

- `wss://relay.damus.io`
- `wss://relay.nostr.band`
- `wss://nos.lol`
- `wss://relay.snort.social`
- `wss://relay.primal.net`

Publishing uses `Promise.any` — the event is considered sent as soon as at least one relay accepts it. Reading uses `querySync` to gather results from all relays and merge them.

---

## Authentication

Two methods, both signing Nostr events:

### NIP-07 Browser Extension (Recommended)

Uses `window.nostr.getPublicKey()` and `window.nostr.signEvent()` from extensions like Alby, nos2x, or Nostr Connect. The private key never touches PubScore.

### nsec Private Key

For users without an extension. The key is handled by a **SecureKeyStore** — a closure-based store with no `.get()` method:

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

The key lives inside the closure. Even if an attacker gets XSS, they can call `signEvent()` but cannot read the raw key bytes. On top of that:

- **Auto-logout** after 15 minutes of inactivity (mouse, keyboard, scroll, touch, visibility change)
- **beforeunload** wipes the key when the tab closes
- **Byte zeroing** on `clear()` — doesn't just null the reference, overwrites every byte of the Uint8Array

---

## Security

### Content Sanitization

All relay data is treated as untrusted:

- `escapeHtml()` on every string before `innerHTML`
- `sanitizeUrl()` blocks `javascript:`, `data:`, `vbscript:`, `file:` protocols on avatar/image URLs
- `capLength()` prevents DOM bloat from oversized strings
- Display names capped at 100 chars, bios at 500, reviews at 2000

### Content Security Policy

The HTML includes a strict CSP via meta tag:

- `script-src` limited to `self`, `unsafe-inline` (required for inline module), and the esm.sh CDN
- `connect-src` allows `https:` and `wss:` for relay connections
- `object-src: none`, `base-uri: self`, `frame-ancestors: none`
- `upgrade-insecure-requests` enforced

---

## Tech Stack

- **Single HTML file** — no build step, no bundler, no framework
- **nostr-tools 2.7.2** via esm.sh (ESM import)
- **Fonts** — Fraunces (serif display) + Karla (body) from Google Fonts
- **Zero backend** — everything is client-side + relay queries

---

## File Structure

```
pubscore.html          — The entire app
apple-touch-icon.png   — 180x180 app icon
og-preview.png         — 1200x630 Open Graph preview image
README.md              — This file
```

---

## Why Kind 38383?

Nostr reserves kind ranges for different purposes:

- `0–9999` — Regular events
- `10000–19999` — Replaceable events
- `20000–29999` — Ephemeral events
- `30000–39999` — **Parameterized replaceable events** (addressable)

Kind `38383` falls in the parameterized replaceable range, which gives us:

1. **One review per person per subject** — enforced at the protocol level by the `d` tag
2. **Updatable** — publish a new event with the same `d` value and it replaces the old one
3. **App-specific** — avoids collision with well-known kinds like 30023 (long-form posts)

The `d` tag is set to the subject's pubkey, so the "address" of a review is effectively `38383:<reviewer pubkey>:<subject pubkey>` — globally unique per reviewer-subject pair.
