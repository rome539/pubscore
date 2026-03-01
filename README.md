
PubScore

PubScore is a Nostr-native review interface for pubkeys.

It allows users to publish signed, replaceable reviews about npubs.
All data is stored on relays. There is no backend database.

⸻

Overview

PubScore provides:
	•	Profile lookup by npub or hex pubkey
	•	Public 1–5 star reviews
	•	Optional category tags
	•	Replaceable reviews (one per reviewer per subject)
	•	Review history for signed-in users

Every review is a standard Nostr event.

⸻

Review Event Format

Reviews use a custom replaceable kind:

kind: 38383

Tags:
	•	["p", "<subject_pubkey>"] → pubkey being reviewed
	•	["d", "<subject_pubkey>"] → makes review replaceable per reviewer
	•	["rating", "1-5"] → numeric rating
	•	["t", "<category>"] → optional tags
	•	content → review text

Because the event is replaceable, publishing again updates the previous review.

⸻

Authentication

Supported login methods:
	•	NIP-07 browser extensions (recommended)
	•	Manual nsec input

When using nsec:
	•	The key is stored only in memory
	•	It is cleared on logout
	•	It is cleared on tab close
	•	It auto-clears after inactivity

No keys are persisted to storage.

⸻

Architecture
	•	Static frontend (HTML/CSS/JS)
	•	nostr-tools for signing and relay communication
	•	SimplePool for relay connections
	•	No server
	•	No database

All reviews are published directly to relays.

⸻

Security Notes
	•	User-generated content is sanitized before rendering
	•	URLs are protocol-filtered
	•	Private keys are held inside a closure-based key store
	•	Inactivity auto-logout is enforced for nsec sessions

