=== Structura ===
Contributors: xerx
Tags: ai, content-generation, seo, automation, gutenberg
Requires at least: 6.2
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 2.14.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Autonomous AI content architect for WordPress — writes, formats, and publishes Gutenberg-native blog posts on a schedule.

== Description ==

Structura turns AI content generation into a real WordPress workflow:
write a post, format it as native Gutenberg blocks, run it through a
20+ point SEO protocol, and publish — manually or on a schedule. You
keep editorial control; Structura handles the repetitive work.

**Highlights**

* **Real Gutenberg blocks.** Output is serialized WordPress blocks,
  not Markdown or pasted HTML — clean in the editor, theme-agnostic,
  and portable if you ever switch tools.
* **Persona engine.** Author multiple writing voices and assign one
  per campaign so different post types sound like different writers.
* **20+ point SEO protocol.** Every post passes a structured technical
  SEO checklist (title, slug, meta description, internal linking,
  keyphrase placement, readability, E-E-A-T writing signals, SERP
  entity coverage) before it publishes. Compatible with Yoast and
  RankMath.
* **Channel fan-out.** When a post publishes, Structura can notify
  your team chat (Slack, Discord, Telegram, generic webhooks) or
  cross-post to social platforms with channel-specific copy.
* **Multi-language.** Generate content in any language. Language
  choice is not gated by tier — pick whichever language you want
  per campaign or per post.
* **Translation-ready UI.** The plugin admin ships in English, German,
  Spanish, and French.

**You can use Structura without creating an account.** A freshly
installed Structura starts in **Anonymous Mode** — connect your own
OpenAI key (BYOK) and you can manually generate posts inside
wp-admin. Anonymous Mode is intentionally limited:

* Paragraph blocks only (no headings, lists, callouts, or images).
* A subset of the SEO protocol.
* Manual generation only — no campaigns, no schedules.
* OpenAI is the only provider available at this level.

To unlock more, sign in (free) at **https://app.structurawp.com/** and
get a free license:

* **Free license** — adds heading blocks, the persona engine, more SEO
  rules, featured-image generation, and Google Gemini as a second BYOK
  provider option.
* **BYOK** (paid) — full Gutenberg block library, body-image
  generation, the full 20+ point SEO protocol, Anthropic Claude as an
  additional provider, scheduled campaigns, channel fan-out, and
  authority-link verification.
* **Cloud / Cloud Pro** (paid) — Structura provisions the AI provider
  for you, with one bill from Structura instead of separate provider
  charges. See https://www.structurawp.com/pricing for details.

The plugin's compiled JavaScript at `assets/structura.js` is built
from TypeScript sources hosted publicly at
https://github.com/yuriy-vasilyev/structura-plugin — see that
repository's README for reproducible build instructions.

== Installation ==

1. Upload the plugin ZIP via *Plugins → Add New → Upload Plugin*, or
   install directly from the WordPress.org plugin directory.
2. Activate *Structura* through the *Plugins* menu.
3. Open *Structura* in the admin sidebar. The plugin starts in
   **Anonymous Mode**, which lets you connect an OpenAI key and
   manually generate posts right away.
4. (Optional, recommended) To unlock the persona engine, more block
   types, image generation, and scheduled campaigns, click *Account &
   License* and connect to https://app.structurawp.com/. A free
   license takes a minute to claim and gates several features.

== Frequently Asked Questions ==

= Do I need a Structura account to use the plugin? =

No. The plugin runs in **Anonymous Mode** out of the box: connect your
own OpenAI key and manually generate posts. The trade-off is that
Anonymous Mode is intentionally minimal (paragraph blocks only, no
images, no campaigns). A free license unlocks meaningfully more.

= Does this plugin send data to external services? =

Yes — the plugin is a client for **Structura Cloud** (the AI service
that runs every generation). It also makes a small number of auxiliary
calls (license verification, optional cache pings to the marketing
site, the WordPress.org update check). Full disclosure of every
endpoint and what is sent is in *External services* below.

= What languages can I generate content in? =

Any language. Language choice is per-campaign (or per-post in manual
generation) and is not gated by your plan tier.

= How do I disconnect the plugin from Structura Cloud? =

*Structura → Account & License → Deactivate*. The plugin clears its
locally-stored credentials and the cloud marks the activation slot as
disconnected. The site can be reactivated later, or the activation
slot can be re-used on a different site.

= What happens to my data when I uninstall? =

By default, **the plugin keeps your data** (campaigns, personas, logs,
settings) when you delete it from WordPress, so you can reinstall and
pick up where you left off.

If you want WordPress to wipe everything on uninstall, turn on
*Structura → Settings → Wipe all data on uninstall* before deleting
the plugin. The toggle is **off by default** for safety. Cloud-side
data (your account on https://app.structurawp.com/) is owned by your
portal account and is not touched by the plugin uninstall — manage it
from the portal.

Posts the plugin generated are regular WordPress posts and stay in
your database regardless of which uninstall mode you choose.

= Does the plugin work on WordPress multisite? =

Single-site only. The plugin is not network-aware.

== External services ==

This plugin connects to several external services to function. The
plugin runs in Anonymous Mode without any of them, but most useful
features (campaigns, personas, channels, image generation) require
Structura Cloud.

**Structura Cloud** — `us-central1-structura-8d158.cloudfunctions.net`

What it does: runs all AI content generation, persona matching,
campaign scheduling, channel dispatch, and license verification.
Hosted on Google Cloud Firebase Functions and operated by Xerx (the
plugin author).

What is sent and when:

* **License activation:** license key, site URL, site name, WordPress
  version, plugin version, surface identifier (`wp`).
* **Daily license health check:** license key, site URL, plugin
  version, WordPress version. Used to detect lapsed subscriptions.
* **Site identity sync (optional, opt-in):** site name, tagline, logo
  URL, theme name. Used so generated content can refer to the brand
  consistently. Disabled by default; you opt in from the plugin's
  Settings page.
* **Campaign run trigger:** campaign settings (persona reference,
  topic / keyword inputs, schedule), plugin trace ID. The cloud
  service generates the post body and pushes it back to the plugin
  via a signed webhook.
* **Post publish event:** post ID, campaign ID, post URL, post title,
  publish state, edit URL, locale. Used by the Channels feature to
  fan out notifications to connected channels (Slack, Discord, etc.).
* **Run acknowledgement and uploads:** generated post artefacts and
  per-step diagnostic metadata, so the post is associated with the
  cloud-side run history.

This service is provided by Xerx, the plugin author.

* Customer portal: https://app.structurawp.com/
* Terms of service: https://www.structurawp.com/terms
* Privacy policy: https://www.structurawp.com/privacy

**Structura customer portal** — `app.structurawp.com`

What it does: hosts your account, billing, license keys, invoices,
subscription management, and the per-workspace dashboards. The plugin
opens this URL in a browser tab when you click *Connect Account* /
*Activate License* so you can sign in and create or pick a license.

What is sent: standard browser navigation. The plugin itself does not
post data to the portal — it links you there for the OAuth-style
sign-in.

* Terms of service: https://www.structurawp.com/terms
* Privacy policy: https://www.structurawp.com/privacy

**Structura marketing site** — `www.structurawp.com`

What it does: optional cache-revalidation pings sent from the plugin
to the marketing site so the public Structura blog can mirror selected
posts. Only fires if the marketing-site integration is connected from
the plugin's Settings page.

What is sent: post URL, revalidation tag identifiers. No content body.

* Terms of service: https://www.structurawp.com/terms
* Privacy policy: https://www.structurawp.com/privacy

**WordPress.org plugin directory API** — `api.wordpress.org`

What it does: the plugin queries `api.wordpress.org/plugins/info` to
detect whether the running build came from the WordPress.org directory
(so the plugin's auto-update path can step aside cleanly when WP.org
is the source of truth).

What is sent: the plugin slug (`structura`). No site or user data.

* WordPress.org terms: https://wordpress.org/about/license/
* WordPress.org privacy: https://wordpress.org/about/privacy/

**Google Cloud Storage release manifest** — `storage.googleapis.com`

What it does: when the plugin is distributed outside the WordPress.org
directory (direct download, agency-internal use), the auto-update
component checks a JSON manifest hosted on Google Cloud Storage to
discover available updates. On WordPress.org-distributed builds this
code path is disabled and no request is made.

What is sent: a static GET to a public JSON file. No site or user
data is transmitted.

* Google Cloud Storage terms: https://cloud.google.com/terms
* Google privacy policy: https://policies.google.com/privacy

== Privacy ==

The plugin defaults to **telemetry off**. Plugin behaviour analytics
(if any) only fire after explicit opt-in from the *Settings → Privacy*
screen.

License credentials are stored in WordPress options. The plugin's log
table records operational metadata (run IDs, error codes, durations) —
not post bodies, prompts, or personally identifiable content.

The *Wipe all data on uninstall* setting (under *Settings*) is **off
by default**; uninstalling Structura keeps your campaigns, personas,
logs, and settings unless you explicitly turn the toggle on first.

== Screenshots ==

1. Campaigns list — at-a-glance view of every campaign and its next
   scheduled publish.
2. Campaign editor — pick a persona, set a schedule, and choose
   taxonomy targets without leaving WordPress.
3. Persona library — author multiple writing voices and assign them
   to campaigns.
4. Run progress drawer — live status of every cloud generation,
   including step durations and image-slot fallbacks.
5. Channels — connect Slack, Discord, LinkedIn, Telegram, IndexNow
   and others; each post fans out automatically with channel-native
   copy.

== Changelog ==

= 2.14.0 =
* Campaign view now shows posts created vs posts published at a
  glance.

= 2.13.0 =
* Channels are now included with every paid plan — no separate
  add-on.
* Draft posts published after a manual review now count toward the
  campaign's published total.
* LinkedIn: connect multiple Pages, wait for uploaded images to
  finish processing before posting, and show clearer Page names.

= 2.12.0 =
* Weave your own referral or affiliate links into relevant posts
  (paid plans).
* AI-powered "Suggest competitors" on the site profile.

= 2.11.0 =
* Video channel (early access): store card, configuration, and
  per-platform caption packages in wp-admin.
* Visual presets now carry video styling alongside image styling.

= 2.10.0 =
* Keyword discovery tuned for realistic blog reach.
* Cleaner article headings (no keyword stuffing) and authority links
  are verified before they are inserted.

= 2.0.0 =
* Keywords, authority sources, and competitors now live on each
  campaign instead of the site, so every campaign can target its own
  niche.
* Channels can also be managed from the Structura customer portal.

For older entries, see the full changelog in the public source
repository:
https://github.com/yuriy-vasilyev/structura-plugin/blob/main/CHANGELOG.md

== Upgrade Notice ==

= 2.14.0 =
Campaign publish counters and LinkedIn publishing reliability
improvements. Safe upgrade — no database migrations.
