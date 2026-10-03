# plugin/ — read before changing anything here

Rules for this package: `../agents/plugin.md`. Cross-cutting rules:
`../AGENTS.md`. Channels: `includes/Channels/README.md`.

Non-negotiable here: PHP 7.4 syntax, custom `structura/*` hooks with
hookdoc blocks, no blocking cloud call inside a user's request, sanitise at
the REST boundary, subscribing to an existing hook is a declared behaviour
change, regenerate the `.pot` when strings change.
