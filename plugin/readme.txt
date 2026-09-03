=== StructuraWP – Autonomous AI Blog Writer & Scheduler ===
Contributors: xerxio
Tags: ai, content-generation, seo, automation, gutenberg
Requires at least: 6.8
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
wp-admin. The plugin sends nothing anywhere until you choose
**Connect to Structura Cloud** on its first screen; see *External
services* below for exactly what is shared after that. Anonymous Mode
is intentionally limited:

* Paragraph blocks only (no headings, lists, callouts, or images).
* Posts capped at 500 words (all non-paid tiers share this cap).
* A subset of the SEO protocol.
* Manual generation only — no campaigns, no schedules.
* OpenAI is the only provider available at this level.

To unlock more, sign in (free) at **[app.structurawp.com](https://app.structurawp.com/)** and
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
  charges. Cloud Pro adds frontier AI models, photorealistic
  imagery, and AI video generation (Shorts/TikTok/Reels). See
  [structurawp.com/pricing](https://www.structurawp.com/pricing) for
  details.

The plugin's compiled JavaScript at `assets/structura.js` is built
from TypeScript sources hosted publicly at
[github.com/yuriy-vasilyev/structura-plugin](https://github.com/yuriy-vasilyev/structura-plugin)
— see that
repository's README for reproducible build instructions.

== Installation ==

1. Upload the plugin ZIP via *Plugins → Add New → Upload Plugin*, or
   install directly from the WordPress.org plugin directory.
2. Activate *Structura* through the *Plugins* menu.
3. Open *Structura* in the admin sidebar. The first screen explains
   what the plugin shares with Structura Cloud and asks for your OK —
   click **Connect to Structura Cloud** to continue (nothing is sent
   before that). The plugin then starts in **Anonymous Mode**, which
   lets you connect an OpenAI key and manually generate posts right
   away.
4. (Optional, recommended) To unlock the persona engine, more block
   types, image generation, and scheduled campaigns, click *Account &
   License* and connect to
   [app.structurawp.com](https://app.structurawp.com/). A free
   license takes a minute to claim and gates several features.

== Frequently Asked Questions ==

= Do I need a Structura account to use the plugin? =

No. The plugin runs in **Anonymous Mode** out of the box: connect your
own OpenAI key and manually generate posts. The trade-off is that
Anonymous Mode is intentionally minimal (paragraph blocks only, no
images, no campaigns). A free license unlocks meaningfully more.

= Does this plugin send data to external services? =

Yes — but only after you opt in. The plugin is a client for
**Structura Cloud** (the AI service that runs every generation). The
first time you open the Structura admin page it shows a consent screen
listing what will be shared; until you click **Connect to Structura
Cloud** (or enter a license key) no request leaves your site. After
that it also makes a small number of auxiliary calls (license
verification, optional cache pings to the marketing site). Full
disclosure of every endpoint and what is sent is in *External
services* below.

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
data (your account on [app.structurawp.com](https://app.structurawp.com/)) is owned by your
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

When it is first contacted: never on install or activation. The first
time you open the Structura admin page, the plugin shows a consent
screen that lists the data below and asks you to click **Connect to
Structura Cloud**. Until you do, no request of any kind leaves your
site. Entering a license key under *Account & License* counts as the
same opt-in. You can disconnect at any time from *Account & License*.

What is sent and when (all of it only after you opt in):

* **Anonymous workspace bootstrap (once, right after you opt in):** a
  random install ID generated locally by WordPress, your site's host
  name, site title, WordPress version, plugin version, and the site
  identity bundle (site title, tagline, language, logo URL, active
  theme name). This creates the workspace that Anonymous Mode
  generation runs in.
* **License activation:** license key, site URL, site name, WordPress
  version, plugin version, surface identifier (`wp`), site identity
  bundle.
* **Daily license health check:** license key, site URL, plugin
  version, WordPress version. Used to detect lapsed subscriptions.
* **Site identity sync:** the site identity bundle is re-sent when you
  change your site title, tagline, language, or logo, so generated
  content keeps referring to your brand correctly. Licensed installs
  only.
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
* **Generated images:** downloaded from Structura Cloud's storage
  (`storage.googleapis.com`, time-limited signed URLs) into your Media
  Library.
* **Every request** carries the plugin version and, once one exists,
  your activation's bearer token so the cloud can attribute the call to
  your workspace.

This service is provided by Xerx, the plugin author.

* Customer portal: [app.structurawp.com/](https://app.structurawp.com/)
* Terms of service: [www.structurawp.com/terms](https://www.structurawp.com/terms)
* Privacy policy: [www.structurawp.com/privacy](https://www.structurawp.com/privacy)

**Channel destinations** — Slack, Discord, Telegram, LinkedIn, IndexNow,
generic webhooks

What it does: when you connect a channel under *Structura → Channels*,
the webhook URL or OAuth grant you provide is sent to Structura Cloud,
which stores it encrypted and delivers your post announcements to that
destination on your behalf. The plugin itself never calls these
third-party APIs directly; it only forwards what you typed into the
connection form. No channel is connected by default.

What is sent to the destination, and when: a short announcement of
each post (title, link, channel-specific summary text and, where the
destination supports it, the featured image) every time a post
publishes through a campaign or manual run that has that channel
enabled.

* Slack — terms: [slack.com/terms-of-service](https://slack.com/terms-of-service), privacy:
  [slack.com/privacy-policy](https://slack.com/privacy-policy)
* Discord — terms: [discord.com/terms](https://discord.com/terms), privacy:
  [discord.com/privacy](https://discord.com/privacy)
* Telegram — terms: [telegram.org/tos](https://telegram.org/tos), privacy:
  [telegram.org/privacy](https://telegram.org/privacy)
* LinkedIn — terms: [www.linkedin.com/legal/user-agreement](https://www.linkedin.com/legal/user-agreement),
  privacy: [www.linkedin.com/legal/privacy-policy](https://www.linkedin.com/legal/privacy-policy)
* IndexNow (operated by Microsoft Bing) — FAQ / terms:
  [www.indexnow.org/faq](https://www.indexnow.org/faq), privacy:
  [www.microsoft.com/privacy/privacystatement](https://www.microsoft.com/privacy/privacystatement)
* Generic webhooks — a URL you own; its terms are yours.

**Structura customer portal** — `app.structurawp.com`

What it does: hosts your account, billing, license keys, invoices,
subscription management, and the per-workspace dashboards. The plugin
opens this URL in a browser tab when you click *Connect Account* /
*Activate License* so you can sign in and create or pick a license.

What is sent: standard browser navigation. The plugin itself does not
post data to the portal — it links you there for the OAuth-style
sign-in.

* Terms of service: [www.structurawp.com/terms](https://www.structurawp.com/terms)
* Privacy policy: [www.structurawp.com/privacy](https://www.structurawp.com/privacy)

**Structura marketing site** — `www.structurawp.com`

What it does: optional cache-revalidation pings sent from the plugin
to the marketing site so the public Structura blog can mirror selected
posts. Only fires if the marketing-site integration is connected from
the plugin's Settings page.

What is sent: post URL, revalidation tag identifiers. No content body.

* Terms of service: [www.structurawp.com/terms](https://www.structurawp.com/terms)
* Privacy policy: [www.structurawp.com/privacy](https://www.structurawp.com/privacy)

**WordPress.org plugin directory API** — `api.wordpress.org`

What it does: the plugin queries `api.wordpress.org/plugins/info` to
detect whether the running build came from the WordPress.org directory
(so the plugin's auto-update path can step aside cleanly when WP.org
is the source of truth).

What is sent: the plugin slug (`structura`). No site or user data.

* WordPress.org terms: [wordpress.org/about/license/](https://wordpress.org/about/license/)
* WordPress.org privacy: [wordpress.org/about/privacy/](https://wordpress.org/about/privacy/)

**Google Cloud Storage release manifest** — `storage.googleapis.com`

What it does: when the plugin is distributed outside the WordPress.org
directory (direct download, agency-internal use), the auto-update
component checks a JSON manifest hosted on Google Cloud Storage to
discover available updates. On WordPress.org-distributed builds this
code path is disabled and no request is made.

What is sent: a static GET to a public JSON file. No site or user
data is transmitted.

* Google Cloud Storage terms: [cloud.google.com/terms](https://cloud.google.com/terms)
* Google privacy policy: [policies.google.com/privacy](https://policies.google.com/privacy)

== Privacy ==

Nothing leaves your site until you accept the one-time **Connect to
Structura Cloud** screen in wp-admin (or enter a license key). If you
would rather not, deactivate the plugin — at that point it has sent
nothing.

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

1. A real campaign run — the full process timeline from research and
   competitor analysis through writing, link validation, image
   generation, and publishing, with per-step durations.
2. The generated post in the Gutenberg editor — List View shows
   individually selectable blocks, not pasted HTML.
3. A generated post in Yoast SEO — focus keyphrase set, SEO and
   readability analysis both green.
4. The persona library — multiple writing voices with their own
   directives and reading-level targets.
5. Account & License — your tier, workspace, and license activation
   managed inside wp-admin.

== Changelog ==

= 2.24.0 =
* Improved: the plugin's row on the Plugins screen — clearer
  description plus quick links to the dashboard, settings,
  documentation, and support.

= 2.23.0 =
* New: your weekly one-off post allowance is visible right on the
  Generate page ("X of N used this week"), and reaching it raises a
  clear notice in the Notification Center instead of a silent stop.
* New: Send Test Notification verifies your site's error-notification
  pipeline end to end — licensed sites get a real test notice.
* Fixed: upgrading your plan on the customer portal now reaches
  wp-admin immediately — no more stale "Free" badges after paying.
* Fixed: one-off generated posts honor your Post Status choice —
  "Publish" actually publishes (they always saved as drafts before).
* Fixed: gated buttons explain themselves everywhere — tooltips and
  upgrade prompts instead of dead clicks.
* Fixed: honest progress copy while a run waits for your site's cron,
  and no stray cron warnings after deactivating the plugin.
* Improved: Account & License offers "Create Free Account" directly,
  and the AI Engine no longer flashes "connect a provider" at sites
  whose provider is already connected.

= 2.22.0 =
* New: explicit opt-in screen before the plugin contacts Structura
  Cloud — nothing is sent until you consent.
* New: ranked keyword bank on the campaign wizard's Keywords step,
  with per-keyword search volume and difficulty.
* Improved: keyword discovery prefers informational blog topics,
  collapses reworded duplicates, and auto-refreshes the bank when it
  runs low.
* Improved: a two-stage duplicate-topic gate and more varied title
  shapes across a campaign's posts.
* Improved: tags now follow the same reuse-first governance as
  categories — no more tag sprawl.
* Fixed: the Structura admin menu sits right after Settings, admin
  notices load their assets properly, and JSON-LD output is hardened
  against markup injection.

= 2.21.0 =
* New: attach research documents (PDF, DOCX, TXT, MD, HTML) to a
  post generation — the article is grounded on them.
* New: model tier picker (Top / Standard) for every
  bring-your-own-key plan.
* New: Austrian and Swiss German campaign languages with
  variant-aware wording.
* Fixed: campaigns with an empty keyword bank warn instead of
  silently running off-topic.

= 2.20.0 =
* New: Top / Standard model tier picker on campaigns, single posts,
  and image regeneration.
* New: "Run again" asks for confirmation with a summary of what the
  run will do.
* Improved: the Search Console connect prompt moved to a dismissable
  dashboard banner.
* Fixed: the Personas page shows only this site's bound voices, and
  anonymous installs recover automatically from a revoked cloud
  connection.

= 2.19.0 =
* Improved: the weekly Search Console digest email only sends when
  there's a real story to tell, and stays short for agencies.

= 2.18.0 =
* New: Search performance page — trends, an opportunity queue, and a
  per-post table from your Search Console data.
* New: redesigned Search Console connect flow and a dashboard glance
  card.

= 2.17.0 =
* New: Google Search Console integration — connect your property and
  see how generated posts perform inside wp-admin.
* Fixed: notices render translated copy instead of raw message keys,
  and API key fields reject URL-shaped input before the live test.

= 2.16.0 =
* New: share preview links and post export (Markdown, HTML, DOCX).
* Fixed: free-tier weekly and monthly post caps are enforced
  correctly.
* Fixed: generated articles anchor to the current date and no longer
  cite your competitors as sources.
* Fixed: the campaign Posts tab includes draft posts.

= 2.15.0 =
* New: rebuilt video rendering with six polished templates and more
  natural narration voices.
* Improved: image generation falls back to a generic style instead
  of blocking when no visual preset is bound.
* Changed: generated posts default to draft — the "pending" status
  is retired.

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
[github.com/yuriy-vasilyev/structura-plugin/blob/main/CHANGELOG.md](https://github.com/yuriy-vasilyev/structura-plugin/blob/main/CHANGELOG.md)

== Upgrade Notice ==

= 2.24.0 =
Nicer Plugins-screen row with quick links. Safe upgrade — no database
migrations.

= 2.23.0 =
Plan upgrades now sync to wp-admin instantly, one-off posts honor the
Publish status, and weekly allowances are visible up front. Safe
upgrade — no database migrations.
