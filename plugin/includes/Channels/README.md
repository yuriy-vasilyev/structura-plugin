# Channels (PHP side)

Thin WordPress-side surface for the Integrations Store. The only job here is
observing post lifecycle events and forwarding them to the cloud Channels
dispatcher. Token storage, OAuth flows, channel adapters, and AI-driven
content adaptation all live in `functions/src/channels/`.

## Files

- `Channel_Event_Forwarder_Interface.php` — contract for any forwarder
  implementation. Keeps the door open for a fake/no-op forwarder in tests.
- `Channel_Event_Forwarder.php` — concrete WP implementation. Subscribes to
  Structura's own `structura/post/inserted` action (fired from `Task_Runner`
  after `wp_insert_post`), so we never see autosaves or revisions, and
  POSTs a minimal payload to `Cloud_Client::post('/channelsPostPublished', …)`
  non-blocking. Logs an `info`-level breadcrumb to `Log_Service` before each
  call so the admin Logs page reflects activity even though the cloud
  response never reaches PHP.

Spec: `specs/integrations-store-spec.md` §3, §7, §10
