# Chat state recovery

The chat stores structured briefing fields and the last successful campaign in
chat_briefings, keyed by authenticated user and browser-tab conversation UUID.
The UUID alone grants no access. Raw photos and message history are not stored
in this table. The existing boot migration creates it idempotently.

The atualizar_briefing tool merges explicit updates rather than discarding prior
fields when recent message history is truncated. This still relies on the model
extracting user statements correctly; it is not a deterministic consent parser.
Canonical campaign facts have a dedicated confirmedFacts field.

Generation returns its actual result directly, without a further provider call.
Fact Guard failures preserve the briefing and never solicit approval of invented
claims. A recent campaign link can be retrieved without an LLM after rechecking
ownership. Empty frontend responses never imply success. Concurrent sends are
blocked in the browser and by a five-minute database lease per conversation.

Photo selection uses an explicit zero-based featuredPhotoIndex. The UI displays
photo numbers; the selected attachment is moved to the front before upload.
Results distinguish photos passed to the generator from verified Meta delivery.

Limitations: attachments remain browser memory only; reattach after reload.
Conversation history is not restored visually. Existing campaigns are still
read-only; there is no automatic campaign-copy import. A process crash may leave
a lease until it expires. Timed-out draft tasks retain their existing idempotency
behavior. A real database migration and authenticated browser/provider smoke test
are required before claiming end-to-end production readiness.
