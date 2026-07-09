# Changelog

## [2.15.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.14.1...v2.15.0) (2026-07-09)


### Features

* **post-status:** remove "pending", default to draft, and make run labels status-aware ([38aeea8](https://github.com/yuriy-vasilyev/structura-core/commit/38aeea874631b60fc1e1071ba656567eda63748f))
* **video:** Gemini TTS voices with BYOK-aware key routing ([c1bd9e5](https://github.com/yuriy-vasilyev/structura-core/commit/c1bd9e52c2f5e53164ec7ba0a4fe858f044e7e14))
* **video:** grouped two-provider voice picker across wp-admin and portal ([e57c0aa](https://github.com/yuriy-vasilyev/structura-core/commit/e57c0aa03699464e3b021540065bcdd2e104fdff))
* **video:** raise the monthly video cap 20 → 40 ([25fed69](https://github.com/yuriy-vasilyev/structura-core/commit/25fed69ab620c0a08afa5c780fec440b399f2859))
* **video:** Remotion composition package with six-template lineup ([924ac23](https://github.com/yuriy-vasilyev/structura-core/commit/924ac2359c8098782b4b4d13f51568adc4d50587))
* **video:** remotion render pipeline, default renderer with Shotstack rollback ([70bbf8d](https://github.com/yuriy-vasilyev/structura-core/commit/70bbf8d206ec258fbf70e80cc136912fefe8cbb3))
* **visuals:** fall back to a generic image style instead of blocking when no preset is bound ([ff2bac1](https://github.com/yuriy-vasilyev/structura-core/commit/ff2bac15496a2aef909ccdb215c2ff26c9482e06))


### Bug Fixes

* **none-tier:** gate AI-suggest to paid tiers + stop Visuals fetch when locked ([130f4ef](https://github.com/yuriy-vasilyev/structura-core/commit/130f4efb8b38d3b66d4ce40772f0d39f5200a279))
* **portal:** wider video configure modal + scalable campaign bindings list ([281bc00](https://github.com/yuriy-vasilyev/structura-core/commit/281bc0010bfb65005cf05c7181543c211a063f0a))
* **video:** 4GiB worker + capped render concurrency after first-render OOM ([9bcf2fa](https://github.com/yuriy-vasilyev/structura-core/commit/9bcf2fa2a3deaeadf6e230de397760bf17d42d88))
* **video:** accept Remotion template ids as preset videoStyle values ([610b535](https://github.com/yuriy-vasilyev/structura-core/commit/610b535a9a86a54ce3ae46da20413075b6f7a410))

## [2.14.1](https://github.com/yuriy-vasilyev/structura-core/compare/v2.14.0...v2.14.1) (2026-07-08)


### Bug Fixes

* **none-tier:** wp.org "none"-tier UX fixes across wizard, diagnostics, and run screen ([e6d9cdb](https://github.com/yuriy-vasilyev/structura-core/commit/e6d9cdb3897ee4aa737ef08bc01d1346681e3581))
* **scheduler:** resolve webhook signing secret by workspace for "none" installs ([ff997ac](https://github.com/yuriy-vasilyev/structura-core/commit/ff997ac56aa5ba9ba1936793ec9b89116fc21865))

## [2.14.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.13.0...v2.14.0) (2026-07-08)


### Features

* **campaigns:** show posts created vs published on the campaign view ([0effec8](https://github.com/yuriy-vasilyev/structura-core/commit/0effec8b654055fb2de01571426377a187ac1728))

## [2.13.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.12.0...v2.13.0) (2026-07-08)


### Features

* **billing:** bundle Channels into all paid tiers + pricing-restructure spec ([4f0c161](https://github.com/yuriy-vasilyev/structura-core/commit/4f0c161d903961ed6d5b29d67c6855d10e28fc8c))
* **billing:** collapse catalog to 3 graduated tiers (agency merge) ([5d52720](https://github.com/yuriy-vasilyev/structura-core/commit/5d52720551780a5789b0024f78723bf9287868cd))
* **billing:** one-ladder pricing UI + regenerated catalog (Slice 2C) ([06ee8f9](https://github.com/yuriy-vasilyev/structura-core/commit/06ee8f9351a4f8d48c4d9998dd2f9286090457a3))
* **billing:** retire audience gating — seats derive from site quantity ([02f6d3e](https://github.com/yuriy-vasilyev/structura-core/commit/02f6d3e55959db09740c94fa7402307be60576e8))
* **billing:** retire standalone Channels SKU, bundle into every paid plan ([646583a](https://github.com/yuriy-vasilyev/structura-core/commit/646583a35aedc304e7b9cd535f1599b893ea29ce))
* **channels:** discoverable multi-connection UX for LinkedIn (portal) ([a274d62](https://github.com/yuriy-vasilyev/structura-core/commit/a274d62ccfa262123045f1a450b7bd2539aeffda))
* **channels:** make the per-connection publish cooldown env-tunable ([156c809](https://github.com/yuriy-vasilyev/structura-core/commit/156c8090aaa8f1908de3572f37d00ca7c6cac148))
* **channels:** portal post Channels tab — View post link + throttle display ([eb08745](https://github.com/yuriy-vasilyev/structura-core/commit/eb0874533af99fb6c13ff30347ca4b5d0eed674d))
* **channels:** pre-emptively gate the video Regenerate button ([7a261cc](https://github.com/yuriy-vasilyev/structura-core/commit/7a261ccd8fac5b251fbedc942d49dbba61a188ae))
* **channels:** wp-admin LinkedIn connect radio choice (portal parity) ([19b50c0](https://github.com/yuriy-vasilyev/structura-core/commit/19b50c02c2869c7217c072450eb5cb2813f41031))
* **channels:** write an audit tombstone when a connection is deleted ([3d76065](https://github.com/yuriy-vasilyev/structura-core/commit/3d760650f2faa163f5da3c70853c334cabe6617c))
* **functions:** foundingSeats endpoint for the live scarcity counter ([48a2825](https://github.com/yuriy-vasilyev/structura-core/commit/48a2825eaca16b15cb02eab153c15e12d1e68c0f))
* **www:** add Video to the channels page, badged "New" ([a169e55](https://github.com/yuriy-vasilyev/structura-core/commit/a169e5579b0b6292c96dd45a04fa4bfa3b163c9e))
* **www:** Founding-Customer offer on the pricing page ([16dde08](https://github.com/yuriy-vasilyev/structura-core/commit/16dde0836c6289ae0197acb94cd2f17eeb4dc71c))
* **www:** live founding seat counter ([e8230bb](https://github.com/yuriy-vasilyev/structura-core/commit/e8230bb2957c8d63253556cba8b2ee68a44843cd))
* **www:** show the Founding offer on the ad landing pages ([c1ea4da](https://github.com/yuriy-vasilyev/structura-core/commit/c1ea4da3013c2db92e9fc935f4d67509b83c5ba7))


### Bug Fixes

* **channels:** classify rate_limited as a skip, not a delivery failure ([bba46e0](https://github.com/yuriy-vasilyev/structura-core/commit/bba46e0ec301812e5106d3a28720419ca316f51b))
* **channels:** gate video Regenerate on an active connection + quota ([d25e42c](https://github.com/yuriy-vasilyev/structura-core/commit/d25e42cc0cc5a8bdc49573ccef89de7fcecd532c))
* **channels:** hide Notification language on publish-only channels ([55eacf6](https://github.com/yuriy-vasilyev/structura-core/commit/55eacf641d541cb4d3776f7f43f3f8dcd74f1be9))
* **channels:** key dispatch results by connectionId, not integrationId ([4b94793](https://github.com/yuriy-vasilyev/structura-core/commit/4b94793327b3e90cb4a81f8bf8bcf6a86fdf7afa))
* **channels:** LinkedIn featured images — read bytes binary-safe, not as text ([914e319](https://github.com/yuriy-vasilyev/structura-core/commit/914e31971554ce316bdf4248735cbd312db672c1))
* **channels:** LinkedIn Page picker — versioned organizationAcls contract ([143002e](https://github.com/yuriy-vasilyev/structura-core/commit/143002e52dcb718ae1c62cb0d5f02e94955c497a))
* **channels:** reconcile LinkedIn Page names against a workspace cache ([a24b03c](https://github.com/yuriy-vasilyev/structura-core/commit/a24b03ceeb04593a1da88bc8db6c865c45b47783))
* **channels:** wait for LinkedIn image to be AVAILABLE before posting ([470f4c4](https://github.com/yuriy-vasilyev/structura-core/commit/470f4c465277a63d15982a670e788a7a07ee776f))
* **referral-links:** gate the referral-links editor to paid tiers ([76dc6c0](https://github.com/yuriy-vasilyev/structura-core/commit/76dc6c0a18eb43691373ba8dfb6a053e95085aa2))
* **scheduler:** count posts published after manual review ([d14a36c](https://github.com/yuriy-vasilyev/structura-core/commit/d14a36c949ecfd9d8625475932486d41fa6aca8f))
* **workspaces:** restore COLLECTION index on invitations.email ([a3b9d98](https://github.com/yuriy-vasilyev/structura-core/commit/a3b9d9891fb3f290dd9027578e6b58bdb24c02ab))
* **www:** founding pricing page — design QA ([f7292fa](https://github.com/yuriy-vasilyev/structura-core/commit/f7292faabd81c46ff63f345434f0275d2aea13f1))

## [2.12.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.11.0...v2.12.0) (2026-07-05)


### Features

* **functions,web,client:** client referral/affiliate links woven into relevant posts ([a524a7e](https://github.com/yuriy-vasilyev/structura-core/commit/a524a7eeece9f03c8efbe1b486fd064cffd81c2a))
* **web:** AI "Suggest competitors" on the site profile + subtitle fix ([6cedc87](https://github.com/yuriy-vasilyev/structura-core/commit/6cedc870d9e5e657fc80e9c8b2916df90ed76283))

## [2.11.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.10.2...v2.11.0) (2026-07-04)


### Features

* **client,plugin:** video styling moves onto the visual preset (wp-admin surfaces) ([155e7a0](https://github.com/yuriy-vasilyev/structura-core/commit/155e7a0416a61938b82b965e82807c74b1e0c810))
* **client:** per-platform caption packages on the video Ready row ([ada09cc](https://github.com/yuriy-vasilyev/structura-core/commit/ada09cc5749e8b796c5295b2470a66de17a2b67f))
* **client:** Regenerate on ready videos behind a quota confirmation ([2e30e25](https://github.com/yuriy-vasilyev/structura-core/commit/2e30e252016df2527bede7cc13676448c6a6209f))
* **client:** Video channel UI in wp-admin — premium store card, config modal, activity lifecycle, quota, gates ([2ed99d2](https://github.com/yuriy-vasilyev/structura-core/commit/2ed99d2c3e50522cef0f0cae8f2c1b4f374286c2))
* **discovery:** localize explicit topic seeds + thin-pool augmentation ([438dcea](https://github.com/yuriy-vasilyev/structura-core/commit/438dceac4bd00d38e172f55dbf23a8964566bb00))
* **functions,types:** Stripe price-metadata video entitlement + per-site video quota ([24a4896](https://github.com/yuriy-vasilyev/structura-core/commit/24a48969e20f9e690e3e7293c662a174f21928f6))
* **functions,web:** super-admin "Regenerate (sandbox)" via Shotstack's free stage env ([c9e1f09](https://github.com/yuriy-vasilyev/structura-core/commit/c9e1f09e995dca1ca92d9dd169567b69a198dd7c))
* **functions:** 'your video is ready' owner email (en/de/es/fr) ([10ca259](https://github.com/yuriy-vasilyev/structura-core/commit/10ca259a77407908cc5f27c441f8468a7ede6001))
* **functions:** allowedActivationIds on the workspace member model ([8a0ac29](https://github.com/yuriy-vasilyev/structura-core/commit/8a0ac294bc8e2f9157d9664f783d8a873395d86d))
* **functions:** backfill channel adapt bodyText from generations store ([b6991be](https://github.com/yuriy-vasilyev/structura-core/commit/b6991bee1e788dd42c18f3ab0642abd7d25dd55c))
* **functions:** caption placement + palette accents in the video EDL ([3f9b93a](https://github.com/yuriy-vasilyev/structura-core/commit/3f9b93adbbca8507b1ab3c8b0a450446e5bb43af))
* **functions:** configurable Shotstack environment (stage sandbox vs v1) ([11b9994](https://github.com/yuriy-vasilyev/structura-core/commit/11b9994fdaf50aebbe48dcf78bcde345a75bf2df))
* **functions:** disconnected flag on cycle rows + discount on billing overview ([d4dab6c](https://github.com/yuriy-vasilyev/structura-core/commit/d4dab6c7b48f489dd5c4744153792841d2b37453))
* **functions:** fan headless posts out to channels ([f8a6718](https://github.com/yuriy-vasilyev/structura-core/commit/f8a67189ef6967367afd8a9e245c591a7d3c7a27))
* **functions:** fan out channels when a review post is manually published ([4573530](https://github.com/yuriy-vasilyev/structura-core/commit/45735302183fb309121367a857567a63b38a6327))
* **functions:** first-render feedback batch — useful scripts, safe captions, brand mood, persona voice, real filenames, run milestone ([210893d](https://github.com/yuriy-vasilyev/structura-core/commit/210893d20cc4f7ce9ed96cdab794e1e643fc666d))
* **functions:** join video jobs into channelsListEvents + video category ([2d6bd88](https://github.com/yuriy-vasilyev/structura-core/commit/2d6bd88ad425226d09d1535c62794946a9af97a5))
* **functions:** karaoke captions — word-synced chunks + SRT sidecar ([c4cedcc](https://github.com/yuriy-vasilyev/structura-core/commit/c4cedcc52278d237e375d536dbcc15939faa8b04))
* **functions:** live video quota snapshot for the meter UI ([be33d3a](https://github.com/yuriy-vasilyev/structura-core/commit/be33d3a2daaadb7fa61f3f40ccb287f87d790c89))
* **functions:** make the video channel credential-installable ([58dc8d1](https://github.com/yuriy-vasilyev/structura-core/commit/58dc8d1de290d09d7db818497e59eea5decb7fa9))
* **functions:** member access-change notification emails ([4399422](https://github.com/yuriy-vasilyev/structura-core/commit/43994227ffb936417e33fedecd28db9810bfab29))
* **functions:** mode:'video' usage metering + cloud_pro quota gate ([af3241a](https://github.com/yuriy-vasilyev/structura-core/commit/af3241ab7b9193391df15ea641fcd80f38fb9186))
* **functions:** motion-graphics video assembly — branded cards, numbered step headlines, pipeline seam ([c5a1b69](https://github.com/yuriy-vasilyev/structura-core/commit/c5a1b69881605abc845ba1e376da492a71175573))
* **functions:** open the Video channel in the store (drop comingSoon) ([6888069](https://github.com/yuriy-vasilyev/structura-core/commit/6888069c02e176f6b3856f028481bfbc10cf57f4))
* **functions:** page ops on permanent video render failures ([912087c](https://github.com/yuriy-vasilyev/structura-core/commit/912087cdd5b20175a174a825501840060e9fe876))
* **functions:** per-platform social paste packages for the Video channel ([7746f11](https://github.com/yuriy-vasilyev/structura-core/commit/7746f11bf7cec440ce79a14b50f5507bc59ab959))
* **functions:** prefer preset.videoArtDirection in the video adapt art-direction resolver ([16ea20a](https://github.com/yuriy-vasilyev/structura-core/commit/16ea20a862304f57d15dfd1d02a1e42d9602ca34))
* **functions:** runVideoSynthesis worker + video channel wiring ([a0ad246](https://github.com/yuriy-vasilyev/structura-core/commit/a0ad24680b1f90a002ef5b9e093698578168b865))
* **functions:** ship boundVisualPreset digest on channelsListConnections ([77a23af](https://github.com/yuriy-vasilyev/structura-core/commit/77a23afb108ecd0aa095ce117b5d8294349eb4c9))
* **functions:** Shotstack EDL builder for the video channel ([e295346](https://github.com/yuriy-vasilyev/structura-core/commit/e2953469e5dac7f729751d0ca94d32999c904519))
* **functions:** site-access endpoint + restricted activation listing ([5f390a1](https://github.com/yuriy-vasilyev/structura-core/commit/5f390a1d1851dcb8145d2a1d62617d879feb0db4))
* **functions:** stock-served headless posts get channels dispatch + owner email + persona stamp ([aba1f65](https://github.com/yuriy-vasilyev/structura-core/commit/aba1f65367dbb36a02c7ebf9c9334d9491f11c19))
* **functions:** suppress owner-signup artifacts for invite-driven signups ([076ce5d](https://github.com/yuriy-vasilyev/structura-core/commit/076ce5d0127dcc18374c92c487cd8f94490675dc))
* **functions:** thread invite-time site scope through invite → accept ([6d4e412](https://github.com/yuriy-vasilyev/structura-core/commit/6d4e41298160649aa25a80f738958951db33f529))
* **functions:** TTS, Pexels, and Shotstack clients for video synthesis ([742cafc](https://github.com/yuriy-vasilyev/structura-core/commit/742cafcb64cc4a29de1986d37e669e5971c4358a))
* **functions:** video job metadata for the activity UI + kinetic preset ([21e877d](https://github.com/yuriy-vasilyev/structura-core/commit/21e877d8a64f34503d0bd9da5311b999cd828287))
* **functions:** video retry/regenerate endpoint (bearer + portal) ([e708d6e](https://github.com/yuriy-vasilyev/structura-core/commit/e708d6ea5c7f8470ec34d219a1e033eb784cc0ea))
* **functions:** video synthesis orchestrator ([8525694](https://github.com/yuriy-vasilyev/structura-core/commit/8525694a6dcb40594d0f97543f09e3077baa72f0))
* **functions:** video worker resolves style/placement/accent from the bound visual preset ([b1dea82](https://github.com/yuriy-vasilyev/structura-core/commit/b1dea82f28bf01aef3452e3b8e63af441f1d270d))
* **functions:** video-ready email deep-links to the post view Channels tab ([a157043](https://github.com/yuriy-vasilyev/structura-core/commit/a15704382fed3aa9bf29df4e2c6a2fba8ac522aa))
* **functions:** video-script prompt template, parser, adapt-fn factory ([e23f7f7](https://github.com/yuriy-vasilyev/structura-core/commit/e23f7f75873103c6e63e08406df32bc810464d25))
* **functions:** VideoIntegration (adapt→script, publish→enqueue) ([7129207](https://github.com/yuriy-vasilyev/structura-core/commit/71292070b91757869e51b9a3f914b15186090c63))
* **functions:** visual suggest pass also drafts videoArtDirection + extracts brand palette ([e6b88f3](https://github.com/yuriy-vasilyev/structura-core/commit/e6b88f3e790b150c9e9e7b662eeef03274260a57))
* **functions:** voice personas + video connection settings wire fields ([7ebe6fc](https://github.com/yuriy-vasilyev/structura-core/commit/7ebe6fcfe9c2ffce4bf05d7030030ae0ed9512fe))
* **functions:** workspace-aware headless gate for operate-on-site endpoints ([9107b50](https://github.com/yuriy-vasilyev/structura-core/commit/9107b502f24604ba2d67078f11811da8cd3455e1))
* getHeadlessAccess honors workspace-aware gating for the post editor ([21c9dbc](https://github.com/yuriy-vasilyev/structura-core/commit/21c9dbc1e414c4dc998320bbe6c5155123f18d76))
* **rules:** scope activation reads to the member's allowedActivationIds ([7976e7b](https://github.com/yuriy-vasilyev/structura-core/commit/7976e7b72a099998e875ebdfac9c4c3ab84e91b0))
* **types:** add video styling fields to VisualPreset (packages/types + functions twin) ([06fa24f](https://github.com/yuriy-vasilyev/structura-core/commit/06fa24f0b57702b1bf5bbd8aa8cef87f96c5ac46))
* **ui:** shared VideoChannelGlyph mark (9:16 frame + play wedge) ([14f887b](https://github.com/yuriy-vasilyev/structura-core/commit/14f887b609310b0b23d98b220655521c6cb90d68))
* **ui:** Tabs size=xs + stretch — in-card platform switcher variant ([1a69dc7](https://github.com/yuriy-vasilyev/structura-core/commit/1a69dc7a0cc98119371edc7bdfd399d70903f03c))
* **ui:** video-channel primitives — ProgressBar, QuotaMeter, MediaLightbox, PresetRadioCard, Badge dot, Select adornment ([f252d52](https://github.com/yuriy-vasilyev/structura-core/commit/f252d52f7df1270a3b8d31bffbd5863c15c21970))
* **ui:** video-visuals primitives — VideoStylePreview, PlacementRadio, SectionGateTeaser, PaletteSwatches ([f68c9af](https://github.com/yuriy-vasilyev/structura-core/commit/f68c9afa0548f74f9ca8d229c4389eaf3abd86de))
* **web,client:** Captions (.srt) download on ready videos ([9da9982](https://github.com/yuriy-vasilyev/structura-core/commit/9da998233494d4b0fcdb7c35e7fe899d30c48894))
* **web,ui:** portal single-post detail view per design handoff ([6ff56e1](https://github.com/yuriy-vasilyev/structura-core/commit/6ff56e119fa23896979ba1eeef6458537e1f2243))
* **web:** billing display modes — unmetered usage, renewal variants, site states ([d0a9ffa](https://github.com/yuriy-vasilyev/structura-core/commit/d0a9ffaa70960687b05743fb55ac8d0da93a0d44))
* **web:** brand-derived preset swatches + site-named default presets ([84811f1](https://github.com/yuriy-vasilyev/structura-core/commit/84811f12a2ac48399e5cfdef99e6ce54c42ed945))
* **web:** move video styling into Visuals — preset editor #video section, slimmed channel dialog, wizard row ([b72f43a](https://github.com/yuriy-vasilyev/structura-core/commit/b72f43abe509cb51ebd770b69b5ea4d37ca57b60))
* **web:** per-doc site subscriptions for restricted members ([1fcd9c8](https://github.com/yuriy-vasilyev/structura-core/commit/1fcd9c8225d79fc5d0403532480fdf34871bef4c))
* **web:** per-platform caption packages on the video Ready card ([ed84134](https://github.com/yuriy-vasilyev/structura-core/commit/ed84134c13728b1a0c32a3a904876edccc83b7f1))
* **web:** Regenerate on ready videos behind a quota confirmation ([8f9c2c6](https://github.com/yuriy-vasilyev/structura-core/commit/8f9c2c6c8373650a4ff0fa746094ec07a562fa2f))
* **web:** restructure site Channels page into Store/Connections/Activity tabs ([523cc44](https://github.com/yuriy-vasilyev/structura-core/commit/523cc447dfa33a57f049d8a39c0fbc5d754822b7))
* **web:** restyle Channel Store to the board's uniform card grid + local channel glyphs ([ed2c8ba](https://github.com/yuriy-vasilyev/structura-core/commit/ed2c8bae64eb1e55d5a9150aec4e200b88b7a66f))
* **web:** site access controls on the Members page and invite dialog ([e92f5ad](https://github.com/yuriy-vasilyev/structura-core/commit/e92f5ad7d13eab1b79e06b935faf6dbf8ee8a304))
* **web:** Video channel UI in the customer portal (store, config, activity, quota) ([503ea49](https://github.com/yuriy-vasilyev/structura-core/commit/503ea49567f4be4c9775255c4e3f6fcd89fcc5d9))


### Bug Fixes

* **admin:** resolve firebase-admin via functions/node_modules in voice-sample script ([8b79e2e](https://github.com/yuriy-vasilyev/structura-core/commit/8b79e2ef959f1c6a416828c7c3c9fa65590ecccc))
* **client:** connection-row video meta reads the bound preset's style, not the frozen legacy field ([7aed5c8](https://github.com/yuriy-vasilyev/structura-core/commit/7aed5c8ec779443c2e90bd207ec4b171e659852e))
* **client:** defer the Visuals video-section highlight out of the deep-link effect ([051ae85](https://github.com/yuriy-vasilyev/structura-core/commit/051ae8546ecfb699600b6e522f6256596e475155))
* **client:** make the Ready video thumbnail a Preview button opening the lightbox ([e0e3815](https://github.com/yuriy-vasilyev/structura-core/commit/e0e38155efb39147824be9c51d7cc3a7b57f5cab))
* **client:** show loading state on single stock-post discard confirm ([1b2ba9b](https://github.com/yuriy-vasilyev/structura-core/commit/1b2ba9bb6469812f8acb9b7ac01d47cc3e2cca58))
* **discovery:** rewrite-tolerant re-rank guard + collapse retry ([644027b](https://github.com/yuriy-vasilyev/structura-core/commit/644027b6d3038da196cd2d0adca4dd546b573a26))
* **e2e:** boot portal e2e with committed .env.test firebase config ([9b76b94](https://github.com/yuriy-vasilyev/structura-core/commit/9b76b94bbb0d4bf97b413f395d5da5011c9ebce1))
* **functions,plugin:** prevent auto-mode category sprawl ([5235415](https://github.com/yuriy-vasilyev/structura-core/commit/5235415d39b06c3484cbbe108dfc3582bfdb01d5))
* **functions:** blank-line paragraph gaps in the Shorts description package ([d4a5564](https://github.com/yuriy-vasilyev/structura-core/commit/d4a556459297d1a543cc7e0e51ede12f2d4a07bd))
* **functions:** dark outline on white video captions for bright footage ([9557964](https://github.com/yuriy-vasilyev/structura-core/commit/9557964d9197b5b47c208d9fd7204c4b4c573ca9))
* **functions:** gate portal stock reads on campaigns.read ([d822f37](https://github.com/yuriy-vasilyev/structura-core/commit/d822f37d196d75bb0c5da0f9c35722201b0e786b))
* **functions:** headless site names in usage rows + unmetered flag on cycle view ([6d30d09](https://github.com/yuriy-vasilyev/structura-core/commit/6d30d095cff75e659f5df6b3c676447b844ac2b9))
* **functions:** let the video styling fields through every visual-preset allowlist ([af9f7ef](https://github.com/yuriy-vasilyev/structura-core/commit/af9f7efb85b53b3fa26b52bcd9d40699f23f3f83))
* **functions:** scrim captions (Shotstack drops text-shadow) + video fields on the portal preset list ([eaec82e](https://github.com/yuriy-vasilyev/structura-core/commit/eaec82eccba69c460cbf85658edbb13328870f4c))
* **functions:** snug inline caption scrim + Montserrat font registration + darker pill ([3718e84](https://github.com/yuriy-vasilyev/structura-core/commit/3718e8458c4a299098246520ee0e38c363190747))
* **ui:** preview thumbs show the scrim pill the render actually produces ([36fe471](https://github.com/yuriy-vasilyev/structura-core/commit/36fe471a3429e2a760b9f9968800cc83a671684d))
* **web,client:** clarify voice previews are English-only samples ([c025f3a](https://github.com/yuriy-vasilyev/structura-core/commit/c025f3affeb1c996c67556e5456d130f422972d9))
* **web,functions:** correct public post URLs + persona provenance in the post view ([43a03ab](https://github.com/yuriy-vasilyev/structura-core/commit/43a03aba7eff746e96c649af65bec208682b6aa7))
* **web:** campaign Posts tab + run detail link to the post view, not the editor ([777d984](https://github.com/yuriy-vasilyev/structura-core/commit/777d9840f1db6e23fbbf33010bdfbdf750ce98a6))
* **web:** caption package as full-width row below hero media + clickable video thumbnails ([c4b7181](https://github.com/yuriy-vasilyev/structura-core/commit/c4b718166357a36ff55d5982347f765fb0ab61c3))
* **web:** default body images ON for portal-created campaigns ([59f6d08](https://github.com/yuriy-vasilyev/structura-core/commit/59f6d0872c2827e6243f7024850fc05699c2dd3d))
* **web:** getInitials survives partial pre-provisioning user profiles ([590f82c](https://github.com/yuriy-vasilyev/structura-core/commit/590f82c31f4a4176ca703cca01df0a71fbe8234a))
* **web:** keep disconnected sites out of the site-access pickers ([6c12142](https://github.com/yuriy-vasilyev/structura-core/commit/6c121421836aad6aa98715d4d51e95f92fd1c5e8))
* **web:** resolve persona names from the workspace library on run + post views ([278b3c1](https://github.com/yuriy-vasilyev/structura-core/commit/278b3c189875e4eef243753bc35320143a888c48))
* **web:** stop Finish setup crashing with React [#185](https://github.com/yuriy-vasilyev/structura-core/issues/185) after the draft clears ([78b01ed](https://github.com/yuriy-vasilyev/structura-core/commit/78b01edd4877ad28db931c6861f28776e1aa73e7))
* **web:** wizard Persona step scopes to site membership + seeds a tailored voice ([f28842a](https://github.com/yuriy-vasilyev/structura-core/commit/f28842aa14c2de0f1bb07734cb77105a5e2e9152))
* **www,e2e:** fix pricing FAQ invalid dt/dd nesting (hydration crash) + make portal e2e self-seed ([be61649](https://github.com/yuriy-vasilyev/structura-core/commit/be61649bdce132139c78630a6375b09121cacd6a))
* **www,web,ui:** make Cloud most popular, catalog-drive all prices, fix plan/model/provider copy ([e9fe5b4](https://github.com/yuriy-vasilyev/structura-core/commit/e9fe5b4fcae454e4b72a25925b400ab5213a4931))

## [2.10.2](https://github.com/yuriy-vasilyev/structura-core/compare/v2.10.1...v2.10.2) (2026-07-01)


### Bug Fixes

* **ai:** managed tiers own the model server-side; alert on batch image failures ([b682d66](https://github.com/yuriy-vasilyev/structura-core/commit/b682d66bd1efdaa176b209d3cf0007f057aaf2ee))

## [2.10.1](https://github.com/yuriy-vasilyev/structura-core/compare/v2.10.0...v2.10.1) (2026-07-01)


### Bug Fixes

* **campaigns:** default core/code block off for new portal campaigns ([d77e43c](https://github.com/yuriy-vasilyev/structura-core/commit/d77e43cf65cff6c57872cb902ee689dbf608be02))

## [2.10.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.9.0...v2.10.0) (2026-07-01)


### Features

* **ai:** make Gemini Flash Image the recommended default; seed-tooling fixes ([c0a38fb](https://github.com/yuriy-vasilyev/structura-core/commit/c0a38fb20c65770c340dd6bb7bb8f6f24aea0bb3))
* **discovery:** tune keyword bank for blog reach; hide difficulty selector ([217efa6](https://github.com/yuriy-vasilyev/structura-core/commit/217efa67bdc00bc76545e7f973b27e2ba0b11146))


### Bug Fixes

* **ai:** stop heading keyword-stuffing + never inject unverified authority URLs ([ac5631a](https://github.com/yuriy-vasilyev/structura-core/commit/ac5631aa94fc43a7af797f6641763548cd2989b6))
* **campaigns:** tolerate object-shaped authorityDomains in cluster adapter ([bf31354](https://github.com/yuriy-vasilyev/structura-core/commit/bf3135489b62c986204b5a7e9d4620259b3603f2))
* **headless:** scope internal-link suggestions to the campaign language ([293fb26](https://github.com/yuriy-vasilyev/structura-core/commit/293fb26c14e622642e1f9432d92d6349f76c5666))

## [2.9.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.8.0...v2.9.0) (2026-06-30)


### Features

* **campaigns:** make competitors a site-level fact only ([736ed99](https://github.com/yuriy-vasilyev/structura-core/commit/736ed99795815dfd07631b5ee69d8bd337a53bca))

## [2.8.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.7.0...v2.8.0) (2026-06-30)


### Features

* **campaign:** clearer discovery actions — "Re-discover" (fresh) vs "Find more" (append) ([a43f9de](https://github.com/yuriy-vasilyev/structura-core/commit/a43f9ded3e57ba18013f537f9fd434c04dfe1a55))
* **convert:** tell users on the Done step that campaigns came over paused ([044dfc5](https://github.com/yuriy-vasilyev/structura-core/commit/044dfc5ba8c73514719a8eccfee46433131a9b70))
* **delivery:** pull fallback when the webhook push is blocked ([7b7b4fe](https://github.com/yuriy-vasilyev/structura-core/commit/7b7b4fe12b7f508603fbd270bc0f3871bca729f8))
* **discovery:** buyer-intent keyword seeds, winnability filter, clear-on-language ([6d1e4d9](https://github.com/yuriy-vasilyev/structura-core/commit/6d1e4d931edff239a883f2eeb4cb798892fb5ed6))
* **discovery:** keyword difficulty modes (winnable / balanced / authority) ([6c4095a](https://github.com/yuriy-vasilyev/structura-core/commit/6c4095ae08584a56befa805c9b2ec63392dc0ba9))
* **discovery:** per-language positioning for multilingual campaigns ([18f89fb](https://github.com/yuriy-vasilyev/structura-core/commit/18f89fb44473a355b08c7c976553bc23e1b98145))
* **discovery:** website-grounded seeds, diversity, and precision filters ([f1d0b03](https://github.com/yuriy-vasilyev/structura-core/commit/f1d0b038ceb4a75a6cf296bf65ab907df8c72076))
* **growth:** let users request an unshipped content language from the campaign builder ([8fbeddf](https://github.com/yuriy-vasilyev/structura-core/commit/8fbeddf4db1665fa36752207237e347b3b0df6b0))
* **headless-editor:** editable publish date + status-change confirmations ([0270dbd](https://github.com/yuriy-vasilyev/structura-core/commit/0270dbdf73dccd0e6f5e43028290593fd7d1096f))
* **migrate:** fix in-body internal links after WP→headless import ([2772115](https://github.com/yuriy-vasilyev/structura-core/commit/2772115eef3d70173b1412e9a3d8ae7928badfae))
* **migrate:** vision-derived image alt + scene topic for imported posts ([6385d93](https://github.com/yuriy-vasilyev/structura-core/commit/6385d93fbb2a41c6158cc98a75e574d24d87cc50))
* **migrations:** handle unsupported source language on import ([a3c1040](https://github.com/yuriy-vasilyev/structura-core/commit/a3c1040df034c62293604f112f0c378d838a4cbd))
* **onboarding:** capture the full service range in AI positioning ([2d0ea89](https://github.com/yuriy-vasilyev/structura-core/commit/2d0ea89f92e7ee7152dcdcb5120e9b8346fc3957))
* **permalink:** make %year% and %category% tokens actually resolve ([2aee056](https://github.com/yuriy-vasilyev/structura-core/commit/2aee0561b8ff027159c9c5ccbc8e4d8221dbca1c))
* **posts:** add Published-date column; drop redundant title hover-underline ([dbf72e3](https://github.com/yuriy-vasilyev/structura-core/commit/dbf72e32726f6d82f9d35b03ee42c982f2f4a15a))
* **profile:** inline-editable positioning with AI re-suggest in settings ([cab3c87](https://github.com/yuriy-vasilyev/structura-core/commit/cab3c87eaca902000d31a887e309f64724b2ea86))
* **profile:** move headless site identity from Settings to the profile ([63c6296](https://github.com/yuriy-vasilyev/structura-core/commit/63c629628a21dbede27afd7734c3f87c181f6942))
* **visual-suggest:** ground image-style on homepage screenshot, demote logo ([3c20a14](https://github.com/yuriy-vasilyev/structura-core/commit/3c20a14c0846a2033f749e3aebd7622d31448550))
* **www:** serve the blog from the headless API (cursor pagination, no search) ([81fe1ee](https://github.com/yuriy-vasilyev/structura-core/commit/81fe1ee97b175e8ed4e3bb6a2a52aa7303bfb4c9))


### Bug Fixes

* **campaign-view:** use favicons for authority domains (not letter monograms) ([b819c92](https://github.com/yuriy-vasilyev/structura-core/commit/b819c92e56d2e31993aa27ec672d5bd1985c8cb5))
* **campaigns:** coerce keywordBank entries to strings (no more [object Object]) ([39be6ad](https://github.com/yuriy-vasilyev/structura-core/commit/39be6adf2d6c8351f9e0cddff62bddf1873959b7))
* **campaigns:** honor campaign language across all discovery explorations ([23e56d2](https://github.com/yuriy-vasilyev/structura-core/commit/23e56d22a52a14ef8e8e7d26aa1d0df573e1b701))
* **convert:** carry WP persona bindings (subcollection) onto headless site ([8cf3866](https://github.com/yuriy-vasilyev/structura-core/commit/8cf3866cc6cb4cbe4e47471e51caf7b8b8196404))
* **convert:** make the delete-confirm checkbox checkable on the Done step ([396e145](https://github.com/yuriy-vasilyev/structura-core/commit/396e14556fee8f91ba243a9feccf832516882024))
* **convert:** preserve campaign pregenerationEnabled (don't force it off) ([c3a362c](https://github.com/yuriy-vasilyev/structura-core/commit/c3a362c637a0d93ab97cab8fcb6707b820462d45))
* **www:** allow the headless media bucket in next/image remotePatterns ([a0b03f0](https://github.com/yuriy-vasilyev/structura-core/commit/a0b03f0ee2910230474e03cd2148a24a49e5bcfa))

## [2.7.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.6.0...v2.7.0) (2026-06-28)


### Features

* **convert:** optional source WP app password → authenticated import ([f35658f](https://github.com/yuriy-vasilyev/structura-core/commit/f35658f719deca417833fd6e9b53d7d11c08156c))
* **seo:** AI strategy suggest on single post + tighter SEO Targeting UI ([52ab32c](https://github.com/yuriy-vasilyev/structura-core/commit/52ab32ca6a1fd3a05d623c05df4f8db6f89d8958))
* **seo:** escalate a missing SERPER key to an incident instead of silent decay ([720efd4](https://github.com/yuriy-vasilyev/structura-core/commit/720efd4fbbd5b20a9aa84775cc7779a77053914e))
* **seo:** portal AI "Generate post strategy" on the single-post page ([abf0c3b](https://github.com/yuriy-vasilyev/structura-core/commit/abf0c3b7cd7d00499405a7d2ad2fb9ee685103e6))
* **web:** add "Generate now" to the portal Stock tab's empty state (plugin parity) ([0fb6f33](https://github.com/yuriy-vasilyev/structura-core/commit/0fb6f3388d8f7dd2a4716d4f72182c012369b345))


### Bug Fixes

* **stock:** coerce object keyword-bank entries to strings before research ([bfbb432](https://github.com/yuriy-vasilyev/structura-core/commit/bfbb432f503f9e6923206acf482f3fe5e543b536))
* **stock:** mount SERPER + JINA secrets on the stock-generation functions ([e853b1e](https://github.com/yuriy-vasilyev/structura-core/commit/e853b1e2f66609ca11e9cc5ae301099095622682))
* **stock:** reap FROZEN pending entries in the cleanup cron ([588aa5e](https://github.com/yuriy-vasilyev/structura-core/commit/588aa5ea6bc9b1954961e7e47a483fc4b55acbee))

## [2.6.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.5.0...v2.6.0) (2026-06-28)


### Features

* **functions:** ground campaign keyword discovery in activation positioning ([7c14904](https://github.com/yuriy-vasilyev/structura-core/commit/7c149042d21b92583c6d621a639dc20394eedb10))
* **growth:** server-side Google Ads OCI for signup + purchase (magic-link fix) ([b047d49](https://github.com/yuriy-vasilyev/structura-core/commit/b047d498308f81c79e971b494b2e365cc7f4eb93))
* **migrate:** capture protected SEO meta via new plugin endpoint ([c0ff163](https://github.com/yuriy-vasilyev/structura-core/commit/c0ff163bf394bddff14196c5ab71e1146c392994))
* **scheduler:** reject host-intercepted webhook responses (no phantom publish) ([e527ac4](https://github.com/yuriy-vasilyev/structura-core/commit/e527ac44c52d15bd81483f64bb6209aa8c2b8ff1))
* **seo:** ground per-post focus keyphrase in real DFS long-tails ([36f4eba](https://github.com/yuriy-vasilyev/structura-core/commit/36f4eba8168d033501ba5eea7fd00a944efaf6c7))
* **seo:** ground single-post generation in a real keyphrase + authority ([693e6e7](https://github.com/yuriy-vasilyev/structura-core/commit/693e6e7c047724250471e01fdc30f6c211263309))
* **ui:** share DiscoverableChipList + add EmptyState across surfaces ([25de470](https://github.com/yuriy-vasilyev/structura-core/commit/25de4705fdd3e4adbdff6a421948796d81d28ee6))
* **web:** collapse campaign create/edit into the redesign's Discovery step ([9d1ab6d](https://github.com/yuriy-vasilyev/structura-core/commit/9d1ab6db452c4aad830351ff975fefcf72f85270))
* **web:** Discovery "Replace" — guarded discard-and-rediscover ([3aba8fa](https://github.com/yuriy-vasilyev/structura-core/commit/3aba8fa6a7f6dd9bdf9dc867e5187072b4b02b35))
* **web:** edit campaign as one scrollable form + sticky section-nav ([a975e0c](https://github.com/yuriy-vasilyev/structura-core/commit/a975e0cd30d478ba5b21be02502dd6f99f627559))
* **web:** Editor/Edit polish — section icon headers + consolidated Discovery ([6e13000](https://github.com/yuriy-vasilyev/structura-core/commit/6e13000c060b595989c716764981bb1d44bf56fa))
* **web:** Interview pass — match the create prototype ([a263a0c](https://github.com/yuriy-vasilyev/structura-core/commit/a263a0ca7188c79db9747024d6d5d78d3fff2123))
* **web:** List card "in stock" chip — reuse existing stock-summary hook ([47f61e5](https://github.com/yuriy-vasilyev/structura-core/commit/47f61e5f5050c3d1f590d0d7ba17a16d8ac62a21))
* **web:** List filters + loading skeleton + View output-progress bar ([4d8b9cf](https://github.com/yuriy-vasilyev/structura-core/commit/4d8b9cfa182af772bc86f29223ef04634ad7e9ea))
* **web:** LOW cosmetic batch — paused hint, mode check, neutral tile, recent×3 ([4f3149b](https://github.com/yuriy-vasilyev/structura-core/commit/4f3149b0c8181e280d9fe1f4b030aaf9d445c072))
* **web:** persist the grounded long-tail pool when discovering campaign keywords ([7364ff2](https://github.com/yuriy-vasilyev/structura-core/commit/7364ff2d9c7d0e9111d60f38079e98e1daffd9c0))
* **web:** prototype polish — keyword volume arrows + Strategy validity dots ([3b84a5e](https://github.com/yuriy-vasilyev/structura-core/commit/3b84a5eaf6d4449da1a865fcc61302e4bce1854a))
* **web:** prototype polish — SEO live-data pill, tier pills, stepper gating, delete side-effects ([caebb1e](https://github.com/yuriy-vasilyev/structura-core/commit/caebb1e94a4e93bb8f81cbeac90c9c2da8037605))
* **web:** rebuild campaign List card to the prototype; drop "dark-first" doctrine ([4b5c574](https://github.com/yuriy-vasilyev/structura-core/commit/4b5c5745b1f7292b8a25a4bb1b9b4542373ffde6))
* **web:** Strategy progressive disclosure + shared Collapsible primitive ([7c91b45](https://github.com/yuriy-vasilyev/structura-core/commit/7c91b45062d2cbff2f68449c3675b493b01aab08))
* **web:** View/Delete polish — mode tile, SEO row, competitor chips, dup toast ([a211b3e](https://github.com/yuriy-vasilyev/structura-core/commit/a211b3e80eda9d28aa9627b9ee1660e0d91b5222))
* **web:** wire site-runs into List cards — needs-attention pill + live-run strip ([0277f4c](https://github.com/yuriy-vasilyev/structura-core/commit/0277f4ce0ceda3e01d7c9676d928a61d7a318992))


### Bug Fixes

* **campaigns:** forward authorityDomains through campaignDocToCluster ([6e07826](https://github.com/yuriy-vasilyev/structura-core/commit/6e07826cbf04e1c7dbcabd113dba4b27298f95f0))
* **campaigns:** normalize legacy object-shaped keyword/authority arrays in edit form ([8be93e3](https://github.com/yuriy-vasilyev/structura-core/commit/8be93e3fb27b29c16e3de46296965d94a4fc426d))
* **campaigns:** topic interview step shows AI seeds only, not bank keywords ([3bf318d](https://github.com/yuriy-vasilyev/structura-core/commit/3bf318d8fad2a2b61874471d5b72ff300bddd0c5))
* **convert:** correct Review previews — personas count, provider logos, keywords, switch ([3015306](https://github.com/yuriy-vasilyev/structura-core/commit/3015306c62d307d91314bed3c01e827319812a8f))
* **convert:** schemeless source siteUrl 400'd the move; calmer convert step ([1fac72c](https://github.com/yuriy-vasilyev/structura-core/commit/1fac72c018bdff2f90048967b245661073815ae7))
* **editor:** auto-size + soft-wrap the code block ([c7324a4](https://github.com/yuriy-vasilyev/structura-core/commit/c7324a4363b31ad4a0bff7888f0dca25f290220e))
* **growth:** keep recordAttribution bound to GROWTH_EVENT_SECRETS ([47ae4fc](https://github.com/yuriy-vasilyev/structura-core/commit/47ae4fc2f60257dc2b037b7b9e2aa86263d1bcce))
* **growth:** retry OCI uploads + never permanently lose a signup conversion ([350d184](https://github.com/yuriy-vasilyev/structura-core/commit/350d18452f1159c7a8598bd5c576057ed9d46ab8))
* **headless:** honor postStatus on stock-served posts + diversify authority links ([04d9bc6](https://github.com/yuriy-vasilyev/structura-core/commit/04d9bc6e725db3a6a8b370e392789481c09f5b9f))
* **headless:** strip keyphrase-bolding the model emits despite the prompt ([31da6ed](https://github.com/yuriy-vasilyev/structura-core/commit/31da6eda5cb286bc4d268f384fd784c8e6b8dc0d))
* **migrate:** strip stray &lt;code&gt; wrapper from imported code blocks ([b9ff4e3](https://github.com/yuriy-vasilyev/structura-core/commit/b9ff4e3cd0eb7a86c07decce98297859701a9f5f))
* **portal:** count posts-this-week from workspace-rooted runs ([cf4f7bb](https://github.com/yuriy-vasilyev/structura-core/commit/cf4f7bbed9b599415800790bb0d97de929e2ca57))
* **seo:** AI-relevance-filter the long-tail pool, not just token-match ([b9a2bb4](https://github.com/yuriy-vasilyev/structura-core/commit/b9a2bb41a6be74910151af002b61521a496dd86a))
* **seo:** filter long-tail pool to genuine variations of bank keywords ([cf9cc42](https://github.com/yuriy-vasilyev/structura-core/commit/cf9cc4211f0fbd5ac91c1f931130e05bbda736d5))
* **seo:** stop the monthly keyword refresh from drifting the bank off-topic ([3d2d5fa](https://github.com/yuriy-vasilyev/structura-core/commit/3d2d5fa508789b2f260279d412836b6e79961b58))
* **web:** move campaign filter/needs-attention keys into the campaigns namespace ([6bbc83d](https://github.com/yuriy-vasilyev/structura-core/commit/6bbc83d9c231158abd4bc39443de450e21751a6a))
* **web:** no auto-discovery on the campaign edit screen ([6fe9ad4](https://github.com/yuriy-vasilyev/structura-core/commit/6fe9ad4c69293da4f7d7276ae0312847736237b9))
* **web:** refetch the raw campaign doc after edit so the view isn't stale ([184adb2](https://github.com/yuriy-vasilyev/structura-core/commit/184adb21f992604f9a3c812c0b7453399a2d92f5))

## [2.5.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.4.0...v2.5.0) (2026-06-25)


### Features

* **client:** disable campaign image toggles when uploads dir is unwritable ([20a30da](https://github.com/yuriy-vasilyev/structura-core/commit/20a30daa534f5a63eade40fc0423fc90ea3f1a68))
* **plugin:** warn + guide when the uploads dir blocks image saves ([681b5d3](https://github.com/yuriy-vasilyev/structura-core/commit/681b5d34af5cd72bb6c78723ea26ca9ffba6cf15))
* surface plugin image-sideload failures as "completed with warnings" ([81d8556](https://github.com/yuriy-vasilyev/structura-core/commit/81d85565e42361ff992a66912a5d8d5815613c9f))


### Bug Fixes

* **generate:** honor post status on single-post gen; never surprise-publish ([5a22072](https://github.com/yuriy-vasilyev/structura-core/commit/5a22072f0f38d61eecf00f9ab763962f66382d8a))
* **plugin:** an image sideload failure must not destroy the post ([0851189](https://github.com/yuriy-vasilyev/structura-core/commit/0851189016d936a377a41768d7ef96faf3d4ef34))
* **ui:** center the logo + give the page a dark-mode background ([ffc4626](https://github.com/yuriy-vasilyev/structura-core/commit/ffc46265fc53da2477043881d9494746cf760118))

## [2.4.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.3.0...v2.4.0) (2026-06-25)


### Features

* **conversion:** WP→headless site conversion backend (preview + start) ([dcee28b](https://github.com/yuriy-vasilyev/structura-core/commit/dcee28b37b65499db78f83c937a33f88475d76ed))
* **convert:** "Move to Headless" wizard (portal frontend) ([acccf05](https://github.com/yuriy-vasilyev/structura-core/commit/acccf05045c0158557da08000175b119e5e41718))
* **headless:** add a distinct "draft" post status ([599e5e3](https://github.com/yuriy-vasilyev/structura-core/commit/599e5e36bb7b304b6a5a3c2bae9385e450b16d5a))
* **migrate:** re-polish imported posts + richer html-to-blocks parse ([b5963ec](https://github.com/yuriy-vasilyev/structura-core/commit/b5963ec370aea36f8110375e4a1dd51c5455b4cc))
* **ops:** daily reconciliation cron for paid-but-unprovisioned accounts ([d1dfe69](https://github.com/yuriy-vasilyev/structura-core/commit/d1dfe69d2d98b45602105919ecef1e25c7f72202))
* **ops:** page ops on billing-webhook + signup-provisioning failures ([0364aa9](https://github.com/yuriy-vasilyev/structura-core/commit/0364aa983d30de83979ba8aebbfe4bf2bae1d41c))
* **sites:** Drafts tab + DRAFT badge + 3-way editor status control ([5591647](https://github.com/yuriy-vasilyev/structura-core/commit/5591647492a6e78ba01271481ba694ae3005c8ef))
* **sites:** re-polish action for imported posts + open imports in editor ([a310181](https://github.com/yuriy-vasilyev/structura-core/commit/a3101819a1f20e05608ddedd066303da9ed29a86))
* **web:** Better Stack error tracking (Sentry SDK) + copyable error block ([82022dc](https://github.com/yuriy-vasilyev/structura-core/commit/82022dcd8038140e884b2ae762473b3239e56422))
* **web:** page-level error boundary so a page failure degrades in-shell ([87efc48](https://github.com/yuriy-vasilyev/structura-core/commit/87efc4857719d841271d0671ca58a8240bfbb011))


### Bug Fixes

* **authority:** broaden per-post authority search beyond top-3 domains ([bdc51e3](https://github.com/yuriy-vasilyev/structura-core/commit/bdc51e352e618dbbbf36c594f1ddc50061c4a923))
* **billing:** don't 500 the overview when the invoice list 403s ([5edda76](https://github.com/yuriy-vasilyev/structura-core/commit/5edda76622c488f22432a11a0abc6589e35b4161))
* **growth:** support gbraid/wbraid in Google Ads OCI + bump sunset API version ([7c33b4f](https://github.com/yuriy-vasilyev/structura-core/commit/7c33b4f29e543df0057adf26b01ea960104a3b93))
* **headless:** respect campaign "Publish immediately" on delivery ([e62691f](https://github.com/yuriy-vasilyev/structura-core/commit/e62691f4624cab639fbd071a2033108b51fd9b4b))
* **signup:** key provisioning idempotency on the license, not the user doc ([bf25c1f](https://github.com/yuriy-vasilyev/structura-core/commit/bf25c1f2ee72ba240f762d128edee665ff40e04b))
* **ui:** full-viewport height on AppLoader splash screen ([6eb2c61](https://github.com/yuriy-vasilyev/structura-core/commit/6eb2c6187c3ebd90dc5101306c221ae254a5ac37))

## [2.3.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.2.1...v2.3.0) (2026-06-24)


### Features

* **headless:** email the site owner when a new draft is ready to review ([be879f7](https://github.com/yuriy-vasilyev/structura-core/commit/be879f723c23ff04b97dd4267887caf9a5ba04eb))
* **sites:** top-right "Re-discover" button in campaign discovery steps ([ae110f7](https://github.com/yuriy-vasilyev/structura-core/commit/ae110f780ef76ab29bcc7a69a99ed118ec1e40cf))
* **support:** send the ticket submitter a branded confirmation email ([af22a7d](https://github.com/yuriy-vasilyev/structura-core/commit/af22a7de6c77687a0e1e0e6f5568bc925a3ec006))


### Bug Fixes

* **billing:** redirect checkout to the hosted session url ([fcd384d](https://github.com/yuriy-vasilyev/structura-core/commit/fcd384d9c223b79deb0d91847386ef1532d41d1e))
* **billing:** stop expanding past Stripe's 4-level limit in overview ([8cbca2b](https://github.com/yuriy-vasilyev/structura-core/commit/8cbca2b19f5dfbf84686d6827db191e4f3c19467))
* **headless:** resolve %lang% permalink token so URLs/redirects don't emit a literal ([4958e1b](https://github.com/yuriy-vasilyev/structura-core/commit/4958e1bc8384eb66109d05bc0a5002f73ce0803d))
* **headless:** supply internal-link candidates to stock-generated posts ([d3c85d9](https://github.com/yuriy-vasilyev/structura-core/commit/d3c85d9955283c21529f2e60d06299ea3c3e7142))
* **seo-intel:** ground campaign keyword re-rank on the objective ([328d832](https://github.com/yuriy-vasilyev/structura-core/commit/328d83252e9634fbfd6b64d750f74f1cfbdec5ca))
* **sites:** raise discovery callable client timeout (deadline-exceeded) ([c455be4](https://github.com/yuriy-vasilyev/structura-core/commit/c455be44cdd0ce571141795a4aada64a2e25bc7b))

## [2.2.1](https://github.com/yuriy-vasilyev/structura-core/compare/v2.2.0...v2.2.1) (2026-06-24)


### Bug Fixes

* **connect:** redirect into new site after WordPress connect celebration ([28b2704](https://github.com/yuriy-vasilyev/structura-core/commit/28b2704dfef65ab955d55262de624cf4027f1316))
* **onboarding:** drop "What does your site do?" from the wp-admin wizard ([dc38ee7](https://github.com/yuriy-vasilyev/structura-core/commit/dc38ee70ed4b902b9f35386fdbed700f64598ad7))
* **workspaces:** hide retired/merged workspaces from listMyWorkspaces ([0571502](https://github.com/yuriy-vasilyev/structura-core/commit/057150214ca94eaf91942efb4fe6e1150c348c0f))

## [2.2.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.1.0...v2.2.0) (2026-06-23)


### Features

* **onboarding:** per-site persona membership in the wp-admin wizard ([a8caeff](https://github.com/yuriy-vasilyev/structura-core/commit/a8caefffd710279ddb1f99c96114021f93aca56b))
* **personas:** bearer-auth membership endpoints for the plugin wizard ([6fe54aa](https://github.com/yuriy-vasilyev/structura-core/commit/6fe54aa1ee1d4ee2efca1808b0e6ea547bad411b))
* **plugin:** persona membership REST routes + envelope for the wizard ([95614c3](https://github.com/yuriy-vasilyev/structura-core/commit/95614c3ca6e8d086bb4d2f40efd4f3b75f03e713))


### Bug Fixes

* **onboarding:** SEO auto-draft retry + manual competitor suggest ([c049acb](https://github.com/yuriy-vasilyev/structura-core/commit/c049acbd9709a035089b40ac4c8db4c9d41bdd92))
* **plugin:** /wizard/state returns a quiet fresh state when license-less ([283f16c](https://github.com/yuriy-vasilyev/structura-core/commit/283f16cfc57916f5c8f01038d4a078451d96d760))
* **portal:** redirect to Sites when a site route resolves to a deleted site ([5acf892](https://github.com/yuriy-vasilyev/structura-core/commit/5acf89259002b3a8f5dcafc387597956c8b88c9a))

## [2.1.0](https://github.com/yuriy-vasilyev/structura-core/compare/v2.0.0...v2.1.0) (2026-06-23)


### Features

* **keywords:** show real DFS monthly search volume on keyword chips ([b5d6e87](https://github.com/yuriy-vasilyev/structura-core/commit/b5d6e874d03d18acee045a032406079a773f8fab))
* **onboarding:** auto-add DFS-measured competitors in the wizard SEO step ([cbf0eed](https://github.com/yuriy-vasilyev/structura-core/commit/cbf0eede00dff3bbb350c9c65b71f00c1633e68f))
* **plugin:** "permanently delete all data" checkbox in the disconnect dialog ([1a5d506](https://github.com/yuriy-vasilyev/structura-core/commit/1a5d50675ec77c9b3a3634e192f4321e84e19c7a))
* **portal:** "permanently delete all data" checkbox in the removal dialog ([8aa0f10](https://github.com/yuriy-vasilyev/structura-core/commit/8aa0f100e00006db54b14475fbe646d76454b8bb))
* **portal:** keep AI-guessed competitors as suggestions in onboarding SEO step ([e8d4c19](https://github.com/yuriy-vasilyev/structura-core/commit/e8d4c19ac1858e771ec9a4468f77a393388020dc))
* **workspaces:** hard-purge path for site removal (+ last-site teardown) ([3ea37b5](https://github.com/yuriy-vasilyev/structura-core/commit/3ea37b5636e775f5d03a7c782d660019ec246381))


### Bug Fixes

* **campaigns/site:** poll next-run, human model names, no auto-discover ([2dc5e5c](https://github.com/yuriy-vasilyev/structura-core/commit/2dc5e5c406652b38997a355c3aecf41edb3464a1))
* **client:** graceful recovery in the error boundary for a stale connection ([6822ad9](https://github.com/yuriy-vasilyev/structura-core/commit/6822ad90908c3bc50cfa10e61954a39b9c25f364))
* **i18n:** re-merge + complete de/de_AT/es/fr translations after wizard rebuild ([16b9510](https://github.com/yuriy-vasilyev/structura-core/commit/16b9510a61fffca6cd444ef098350406188a43c1))
* **seo:** stop interstitial pages poisoning keyword/positioning discovery ([8c53d93](https://github.com/yuriy-vasilyev/structura-core/commit/8c53d93827303a9062d20cddb365ddfa936e9e10))
* **usage:** scope the wp-admin cycle-usage widget to the current site ([162b29e](https://github.com/yuriy-vasilyev/structura-core/commit/162b29e8f17be177e4d27615f771ac8bf8c5f611))

## [2.0.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.89.0...v2.0.0) (2026-06-23)


### ⚠ BREAKING CHANGES

* **plugin:** remove site-level keywords + authorities (now campaign-scoped)
* **web:** remove site-level keywords + authorities (now campaign-scoped)

### Features

* **campaigns:** campaign-level competitor augmentation (language-aware) ([46bb8f5](https://github.com/yuriy-vasilyev/structura-core/commit/46bb8f5b45d845eb11ba983662af8e85d2cd4ab2))
* **channels:** manage channels from the portal for non-WP surfaces ([4065d5f](https://github.com/yuriy-vasilyev/structura-core/commit/4065d5fd2e244c7cc9548bf22abcad1a2d6ea808))
* **competitors:** thread campaign language through the plugin suggestion path ([85cbdcb](https://github.com/yuriy-vasilyev/structura-core/commit/85cbdcb7aece16c7d05ae19882987de8398ef9bd))
* **keywords:** drive gap analysis from the campaign's competitor list ([639a4ab](https://github.com/yuriy-vasilyev/structura-core/commit/639a4abbf3587ad77b0c27795606ff3b6ea8e293))
* **migrate:** migrate a WordPress blog into a headless site ([bdd9446](https://github.com/yuriy-vasilyev/structura-core/commit/bdd944660f629b3d1783a0d47ac9e25ae3d4ff49))
* **onboarding:** add the image-medium switcher to the wizard Visuals step ([9e0ee8c](https://github.com/yuriy-vasilyev/structura-core/commit/9e0ee8c5f3ead9892f59aa132c37057eecfb9322))
* **onboarding:** seed a site-specific persona even in a populated workspace ([5bc57e0](https://github.com/yuriy-vasilyev/structura-core/commit/5bc57e0afb6b39a4ae03c92478cdfeff6ff30d70))
* **plugin:** campaign Competitors step + campaign-scoped persistence ([cf25707](https://github.com/yuriy-vasilyev/structura-core/commit/cf257071bbc8e9523f4374f005d81cf1b06ac018))
* **plugin:** remove site-level keywords + authorities (now campaign-scoped) ([a1e4026](https://github.com/yuriy-vasilyev/structura-core/commit/a1e4026966aae4bdab5f0a6cfb24ad26cfcae9b7))
* **seo-intel:** DFS-first multi-seed keyword discovery with smart-model re-rank ([150fa5d](https://github.com/yuriy-vasilyev/structura-core/commit/150fa5dd4fd7f44846738b742659e499b6331adb))
* **setup:** land SEO step prefilled, drop redundant step-1 description ([6f868e4](https://github.com/yuriy-vasilyev/structura-core/commit/6f868e4bc96eedffddb35649e0a7f50011f92348))
* **web:** campaign Competitors step (portal) — language-aware augmentation ([1955f5a](https://github.com/yuriy-vasilyev/structura-core/commit/1955f5a718ac43b978b59ed36d26780d06384c68))
* **web:** remove site-level keywords + authorities (now campaign-scoped) ([3b8e2e2](https://github.com/yuriy-vasilyev/structura-core/commit/3b8e2e211894224211d0ceb983f57d8329c9c403))


### Bug Fixes

* **ai-engine:** keep workspace-key rows single-line for long site names ([d15b40c](https://github.com/yuriy-vasilyev/structura-core/commit/d15b40c91110172d832380b45097619d588ba58c))
* **auth:** magic-link deliverability + signup inbox recovery UX ([8f11f4b](https://github.com/yuriy-vasilyev/structura-core/commit/8f11f4b72d8e5a006743d4529ec325cb93cef6ba))
* **auth:** polish magic-link "check inbox" panel ([de78fe7](https://github.com/yuriy-vasilyev/structura-core/commit/de78fe784009bdb567f0bb9cea9e6da1fe344b10))
* **diagnostics:** make "Run a connection check" actually run the check ([4e48df3](https://github.com/yuriy-vasilyev/structura-core/commit/4e48df32b36f8d20d45fb8fbcf93b54ece2bb97a))
* **onboarding:** localize wizard AI drafts + decode entity in key picker ([fe7886e](https://github.com/yuriy-vasilyev/structura-core/commit/fe7886e415bb5ef20748b4e01689e92345a79987))
* **runs:** scope the "Recent generations" widget to the current site ([5fc9d08](https://github.com/yuriy-vasilyev/structura-core/commit/5fc9d08b79a07e45bc8b65c1d13d2d6875f5846c))
* **site:** skeleton the positioning editor while it loads ([be863ed](https://github.com/yuriy-vasilyev/structura-core/commit/be863edd74ddf971ccff9c8bf142c3198d351bbe))
* **taxonomy:** stop feeding the default category to the model; nudge it to create ([a3f538d](https://github.com/yuriy-vasilyev/structura-core/commit/a3f538d68d7b4194f7b5de374e2394bab76a5d3d))

## [1.89.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.88.0...v1.89.0) (2026-06-20)


### Features

* **channels/linkedin:** brand-voice prompt variant for company Page posts ([988167f](https://github.com/yuriy-vasilyev/structura-core/commit/988167f24e27bdf60e4b68b254f07307a5e46850))


### Bug Fixes

* **channels/linkedin:** hide unreachable "Personal profile" target on org connections ([1daa66a](https://github.com/yuriy-vasilyev/structura-core/commit/1daa66acfd19eea6fc4416f108c1029b072a7c2c))
* **channels/linkedin:** populate company-Page picker via versioned org-ACL read ([804fe6b](https://github.com/yuriy-vasilyev/structura-core/commit/804fe6b2744f23d614277c31c4983dfc97624786))
* **channels:** auto-open Configure modal after OAuth connect (hash params) ([4c48697](https://github.com/yuriy-vasilyev/structura-core/commit/4c4869732740a6ecbcab12d7c518a15405db8a5f))

## [1.88.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.87.0...v1.88.0) (2026-06-19)


### Features

* **personas:** per-site persona membership + in-site rotation; v6 portal Personas/Visuals ([2380f9f](https://github.com/yuriy-vasilyev/structura-core/commit/2380f9f6489ae8ba663c800625814e4e3e2ef539))
* **plugin,web:** all-tier Bridge Diagnostics + cloud-unreachable warning ([756c773](https://github.com/yuriy-vasilyev/structura-core/commit/756c77372acf501a5d053ef3860e9bde0585aec6))
* **plugin:** fold image medium into the Suggest dropdown (wp-admin parity) ([b0317ac](https://github.com/yuriy-vasilyev/structura-core/commit/b0317aca27892a681643e19dcc83bdbd05c8d665))
* **plugin:** image-medium picker on the wp-admin Visuals page ([c589627](https://github.com/yuriy-vasilyev/structura-core/commit/c589627b7c4a01fb1b9cb76efda95dc747783a91))
* **portal:** posts list — thumbnails, click-to-edit rows, three-dot menu ([ebbfa49](https://github.com/yuriy-vasilyev/structura-core/commit/ebbfa49f5a92212fa135ecaff13bc63652f43ab0))
* **visuals:** fold image medium into a "Suggest image style" dropdown (portal) ([e0dc571](https://github.com/yuriy-vasilyev/structura-core/commit/e0dc5714578619bf28de7707a30b8380855c0a50))
* **visuals:** image-medium picker + photography-first art direction ([41cc59c](https://github.com/yuriy-vasilyev/structura-core/commit/41cc59cab59111455b3cea5f76b5221a2229edb6))
* **web:** auto-suggest authority domains on the Site profile tab ([c146dc1](https://github.com/yuriy-vasilyev/structura-core/commit/c146dc13654c633a3e51e40183506927197f914c))


### Bug Fixes

* **ai:** link validator — HEAD is advisory, confirm dead with GET ([a3fda1f](https://github.com/yuriy-vasilyev/structura-core/commit/a3fda1f19cf903718820247db67f41838cc2ca8b))
* **ai:** never let the model invent outbound links — homepages or none ([84e98e4](https://github.com/yuriy-vasilyev/structura-core/commit/84e98e4127cf52bce011055b1dc28b1daddb4c67))
* **headless:** repair fabricated internal links + resolve headless public URL ([cda5d85](https://github.com/yuriy-vasilyev/structura-core/commit/cda5d85a2698ad4c17a87605e8b9c1da38e75c18))
* **scheduler:** link-validate against the real site host, not the UUID ([95852fc](https://github.com/yuriy-vasilyev/structura-core/commit/95852fcf06cbb7d39650e02dbc55afcc1aa0d9ae))
* **stock:** run link validation in the batch path (was bypassed) ([2f82630](https://github.com/yuriy-vasilyev/structura-core/commit/2f826308e560347db26fa830b59f3713f5bd0ed3))
* **suggestions:** route portal visual/persona suggest through the shared getSuggestionBlueprint ([68bf0fe](https://github.com/yuriy-vasilyev/structura-core/commit/68bf0febad4bcfae4800ded3d7e514b77ec7a305))
* **visuals:** cursor + hover affordance on the image-medium cards ([6f4dfd1](https://github.com/yuriy-vasilyev/structura-core/commit/6f4dfd1a4fe5909709496d078270476cadbb2184))
* **visuals:** richer per-medium art-direction prompts + exact-hex palette ([10da0ea](https://github.com/yuriy-vasilyev/structura-core/commit/10da0ea455dd6dff7439bfc4b025cca807f1261c))
* **web:** drop spurious _many plural keys from es/fr locales ([82b3049](https://github.com/yuriy-vasilyev/structura-core/commit/82b3049ecd2fd430a55a8cf1c259cb519c85a5ce))

## [1.87.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.86.0...v1.87.0) (2026-06-18)


### Features

* **headless:** bidirectional cursor pagination for read API ([c68cf06](https://github.com/yuriy-vasilyev/structura-core/commit/c68cf0676c39b35e7a6fd812996101ea021526df))
* **seo:** complete JSON-LD graph on plugin render + dedupe www schema ([760df28](https://github.com/yuriy-vasilyev/structura-core/commit/760df28fb05d4129deb9cd09c6addf6795b9b7cf))
* **sites:** document `before` cursor param on the Delivery API page ([3cc00e6](https://github.com/yuriy-vasilyev/structura-core/commit/3cc00e6701a3577466334feb95d65c19e8605d72))
* **www:** add competitor comparison pages for neuroflash, mindverse, neuronwriter, zimmwriter, writesonic ([2f24ac2](https://github.com/yuriy-vasilyev/structura-core/commit/2f24ac2164085f190737a11a9ef3a0d2915bcbba))


### Bug Fixes

* **headless:** add ascending publishedAt indexes for backward paging ([f8cb66a](https://github.com/yuriy-vasilyev/structura-core/commit/f8cb66af35e47ec66d2d6584a427949b6b32f04a))

## [1.86.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.85.0...v1.86.0) (2026-06-18)


### Features

* **headless:** per-language delivery blogs ([a2fb751](https://github.com/yuriy-vasilyev/structura-core/commit/a2fb751c857025ebcf7de044039249a76675cc51))
* **headless:** regenerate post images with AI ([b418bd5](https://github.com/yuriy-vasilyev/structura-core/commit/b418bd5eb560eb116bd3718b41da0782ab0780f7))
* **headless:** restore trashed posts to their pre-trash status ([e43cb56](https://github.com/yuriy-vasilyev/structura-core/commit/e43cb5630ea9c90b5c964a6c60f2580257bef1a1))
* **headless:** trash, restore, and permanently delete posts ([c1685ac](https://github.com/yuriy-vasilyev/structura-core/commit/c1685ac66ce236ba6d8848a17d0ba9dac430e566))
* **web:** inline text formatting toolbar + create link ([1c703e6](https://github.com/yuriy-vasilyev/structura-core/commit/1c703e6f0d932b3f66be7bf4431f551e2675cc84))
* **web:** real top-bar overflow (3-dot) menu ([715d9d2](https://github.com/yuriy-vasilyev/structura-core/commit/715d9d2c7a08969aa6da957e5f43b458b43e1706))
* **web:** responsive headless editor layout ([e1d2e94](https://github.com/yuriy-vasilyev/structura-core/commit/e1d2e9459486cac7789b5192f15fb8e5a6f5485c))


### Bug Fixes

* **headless:** bind image-gen secrets to regenerateHeadlessImage ([998b59f](https://github.com/yuriy-vasilyev/structura-core/commit/998b59f7ea0b692970fc966b5eb3259eb774923c))
* **stock:** compare keywordBank by keyword text, not object reference ([467e931](https://github.com/yuriy-vasilyev/structura-core/commit/467e931dc33587982128b4a12371e30648736084))
* **web:** confirmations, inline popup errors, status tabs, format polish ([5a3eef5](https://github.com/yuriy-vasilyev/structura-core/commit/5a3eef595f5a9ba2fe1995536f4280f8cf732a7d))

## [1.85.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.84.0...v1.85.0) (2026-06-17)


### Features

* **headless:** FAQ/HowTo JSON-LD schema + section marker classes ([69f2c1f](https://github.com/yuriy-vasilyev/structura-core/commit/69f2c1f64f106123cd92b1ffb6dd1d443e9c5e4a))
* **images:** page ops on inline image-gen provider failures ([04699b2](https://github.com/yuriy-vasilyev/structura-core/commit/04699b2d8d42f8e0a0b2a02098810b6a825b0851))
* **ops:** page Telegram when a campaign hits the stock failure cap ([bd4e9b2](https://github.com/yuriy-vasilyev/structura-core/commit/bd4e9b237cc6e0f6e8fd8001b8e3ed3a1e6270ef))
* **stock:** surface "pre-generation paused — provider errors" in the Stock tab ([633cb1b](https://github.com/yuriy-vasilyev/structura-core/commit/633cb1bae9b544784e99c3cc5129dccf4f6674ec))
* **web:** campaign edit save bar with Cancel ([8041898](https://github.com/yuriy-vasilyev/structura-core/commit/8041898fec093742a309acc2cfc33e7fe626f6e3))


### Bug Fixes

* **ai:** unique writing-variety seed per stock-batch post ([f15b7a5](https://github.com/yuriy-vasilyev/structura-core/commit/f15b7a5d3dd5942f4f983233c6ef85ac119e56df))
* **headless:** deliver action_steps + FAQ as blocks; heal body image ([c41c302](https://github.com/yuriy-vasilyev/structura-core/commit/c41c302b50042cf1f3e3b334ca7af9138ed9a301))
* **headless:** render body image + caption inline in delivered posts ([8cf2ab8](https://github.com/yuriy-vasilyev/structura-core/commit/8cf2ab8ca06b5203117bcb549e554774e160815e))
* **images:** default imageModel to a real image model + heal bad values ([4e3f6d0](https://github.com/yuriy-vasilyev/structura-core/commit/4e3f6d0102bef129caca311b84320aec1214f9e0))
* **runs:** flag failed image steps as warnings, not green checks ([f435973](https://github.com/yuriy-vasilyev/structura-core/commit/f435973dc0cd28216fbf51342d2df8fc7c3de4b7))
* **stock:** forward image alt/caption/fileName/topic in served bundle ([269a425](https://github.com/yuriy-vasilyev/structura-core/commit/269a42505847eb19828ebdf5db7f0a718c89b56f))
* **stock:** invalidate on keyword change; refill only when buffer drains to 0 ([59eb4b3](https://github.com/yuriy-vasilyev/structura-core/commit/59eb4b344561691bda0b22af6dd6e686828dea29))
* **stock:** stop self-cancellations tripping the failure cap; coalesce refills; reap failed entries ([98040cc](https://github.com/yuriy-vasilyev/structura-core/commit/98040cce4fb4bedf530e1131bc1a787c27001e68))
* **web:** render Select dropdown panels (add missing Select.Content) ([ebe12bf](https://github.com/yuriy-vasilyev/structura-core/commit/ebe12bf95229e15f3afc042c74c2556b913f1eb4))

## [1.84.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.83.0...v1.84.0) (2026-06-16)


### Features

* **ai:** per-post writing variety to kill content-farm tells ([a59c5fb](https://github.com/yuriy-vasilyev/structura-core/commit/a59c5fb89f164f88817d55641feb1636c66210a8))
* **campaigns:** bring headless campaign create flow to plugin parity ([6b731a8](https://github.com/yuriy-vasilyev/structura-core/commit/6b731a87f977a09055b6585d3682dcbcfc78da1b))
* **headless:** full Gutenberg-style post editor in the portal ([9a57791](https://github.com/yuriy-vasilyev/structura-core/commit/9a57791ada897081004955fbf1cc2d9653abfbe5))
* **onboarding:** ground wizard keyword suggestions in real demand + two buckets ([dc39d31](https://github.com/yuriy-vasilyev/structura-core/commit/dc39d314aa57a83b2c8536cbd32d2974c3c3fd0e))
* **onboarding:** rebuild portal setup wizard AI/persona/visuals steps ([a6d5d58](https://github.com/yuriy-vasilyev/structura-core/commit/a6d5d58f5372f8451378843a2397ac3b49189d98))
* **onboarding:** rebuild portal setup wizard as a 6-step plugin clone ([bb1bad6](https://github.com/yuriy-vasilyev/structura-core/commit/bb1bad6a9518c50aecaa8e5afe326e3873844577))
* **plugin:** explain intentional readability-score variance to users ([1063fb6](https://github.com/yuriy-vasilyev/structura-core/commit/1063fb65eb6db249d62fb599dcf866f7dee6e933))
* **sites:** 'Fetch from site' favicon button ([3d7d558](https://github.com/yuriy-vasilyev/structura-core/commit/3d7d558155787f33f1db874a189846d32a5b73ad))
* **sites:** cross-campaign Posts page for headless sites ([ce3dd97](https://github.com/yuriy-vasilyev/structura-core/commit/ce3dd974a23543877ade7652b89366fc3107f128))
* **sites:** optional favicon for the dashboard icon + real domain in SERP preview ([75b187e](https://github.com/yuriy-vasilyev/structura-core/commit/75b187ee2a0f9c82e5d5bacb1072ec78923d070f))
* **www:** contextual AI Detector links on landing pages + blog posts ([31e0396](https://github.com/yuriy-vasilyev/structura-core/commit/31e0396196ba3b6f42a43867a44d1eb7f65db223))
* **www:** free in-browser AI Content Detector tool page ([cb117c4](https://github.com/yuriy-vasilyev/structura-core/commit/cb117c48de5b0b4ef5ed77cc5ed270b4c348f17d))
* **www:** link the AI Detector from the footer Resources column ([1755c8e](https://github.com/yuriy-vasilyev/structura-core/commit/1755c8eea9efa662cbd1b2e46912f86091ae1c3b))
* **www:** PostHog events on footer links ([8ebd7a0](https://github.com/yuriy-vasilyev/structura-core/commit/8ebd7a0211b5a96bd807ff4efe6e3b06c335a2c0))


### Bug Fixes

* **campaigns:** UX polish on the headless campaign create flow ([10d38e4](https://github.com/yuriy-vasilyev/structura-core/commit/10d38e4a9feee68961d9843ad0279d33514899db))
* **headless:** editor polish — portaled-popover styling, list editor, DnD, captions ([7b3857e](https://github.com/yuriy-vasilyev/structura-core/commit/7b3857edf83d606d5e48bbc469eb4e11a2b9a10c))
* **headless:** stop editor re-render loop and render full-screen ([e4a0a54](https://github.com/yuriy-vasilyev/structura-core/commit/e4a0a54fccdecaacd20ceb658d4e39d686e2b5f4))
* **portal:** defer account creation to magic-link click ([dfe158c](https://github.com/yuriy-vasilyev/structura-core/commit/dfe158c29b280eb8e9c2e8903272257db685227d))
* **workspaces:** label headless activations by siteName, not the raw id ([11b56cb](https://github.com/yuriy-vasilyev/structura-core/commit/11b56cbc8ee506e44abca1b5c689de58a1b853aa))
* **www:** actually send the AI-detector breakdown email ([e140fc1](https://github.com/yuriy-vasilyev/structura-core/commit/e140fc1e872b7a59d5ac3a6801deb15efc2018b1))
* **www:** add /ai-detector to the sitemap ([b262a6d](https://github.com/yuriy-vasilyev/structura-core/commit/b262a6df88f562109c9a5abf69020e2261d6ebbd))
* **www:** replace AI-detector placeholders with real homepage assets ([a0f6f10](https://github.com/yuriy-vasilyev/structura-core/commit/a0f6f109e93bdd9f7cea33b46d04ded68d3aefca))
* **www:** tidy AI-detector promo spacing on blog posts ([a648dee](https://github.com/yuriy-vasilyev/structura-core/commit/a648dee7d109f25af0297ef6a497823e91cf2203))
* **www:** type the subscribe-test fetch mock so tsc passes ([81e7e9e](https://github.com/yuriy-vasilyev/structura-core/commit/81e7e9e087bb74b40c5b36d98a119d31af5a23e7))
* **www:** use Resend Segments API for AI-detector email capture ([1e85eb5](https://github.com/yuriy-vasilyev/structura-core/commit/1e85eb5cfb6d6ddb1c090b6a83d0a89722599d39))

## [1.83.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.82.0...v1.83.0) (2026-06-12)


### Features

* **functions,web:** AI-guess transparency notes + pipeline fixes from live run ([54a1d9f](https://github.com/yuriy-vasilyev/structura-core/commit/54a1d9fa945f4debcb4e0ea2a279c35820bb7b52))
* **functions,web:** close plugin-parity gaps — stock/run control, key testing, channels store, billing + chunk fixes ([334afb5](https://github.com/yuriy-vasilyev/structura-core/commit/334afb54aa2d2d00230db0a7ef67370f246b4124))
* **functions,web:** headless campaign engine — full surface parity ([e932656](https://github.com/yuriy-vasilyev/structura-core/commit/e93265654893f81dc703c88f158bea55d3e3fa89))
* **functions,web:** headless campaigns consume pre-generation stock ([ec4417d](https://github.com/yuriy-vasilyev/structura-core/commit/ec4417d5c2ae868b1f8f0ce00505fcec2955e213))
* **functions,web:** persona + visual-preset CRUD in the portal ([fb3fb35](https://github.com/yuriy-vasilyev/structura-core/commit/fb3fb35390e2d6192453533c25f8ac98b7a85a16))
* **functions,web:** portal-triggered WP generation — Run now + single post ([f306cb9](https://github.com/yuriy-vasilyev/structura-core/commit/f306cb9f4f2b0f20e6dd57699cca74ead63c137f))
* **functions,web:** v3 paid billing — plan hero, cycle meters, payment method, invoices ([228ed6f](https://github.com/yuriy-vasilyev/structura-core/commit/228ed6f994ba633ffc4f0b2fbf4f9def229496d4))
* **functions:** activation-reminder cron, personal sender, localized greeting ([958ebf5](https://github.com/yuriy-vasilyev/structura-core/commit/958ebf5c091dba0207fc967cf76d90c504006e71))
* **functions:** createHeadlessSite callable (dogfood-gated) ([7d2f5eb](https://github.com/yuriy-vasilyev/structura-core/commit/7d2f5eb6da34e43ae9e62b7b29a1ef55ca750211))
* **functions:** durable headless image storage + upload endpoint (Tier-2 [#7](https://github.com/yuriy-vasilyev/structura-core/issues/7)b) ([c3f3449](https://github.com/yuriy-vasilyev/structura-core/commit/c3f344955d61a353e0fe37676e2bc7a61878a792))
* **functions:** feed real site context to headless generation (+ slug foundation) ([8ea87ec](https://github.com/yuriy-vasilyev/structura-core/commit/8ea87ec85ae410c8e7a14ab41f0a4992f329e4f2))
* **functions:** generate on headless — store posts instead of webhooking WP (Tier-2 [#8](https://github.com/yuriy-vasilyev/structura-core/issues/8)) ([cf32ad4](https://github.com/yuriy-vasilyev/structura-core/commit/cf32ad4f094a2827b99cc445953a772b0736ad4a))
* **functions:** hard maxSites gate on createHeadlessSite ([d4eac63](https://github.com/yuriy-vasilyev/structura-core/commit/d4eac633dfb8ceb081206def48c29de66f1e6913))
* **functions:** headless auto-pilot scheduler backend (Tier-3 [#19](https://github.com/yuriy-vasilyev/structura-core/issues/19)) ([42db678](https://github.com/yuriy-vasilyev/structura-core/commit/42db6784029f713c288fab8e03abe9f5c95eb43c))
* **functions:** headless block→HTML renderer (Tier-2 [#6](https://github.com/yuriy-vasilyev/structura-core/issues/6)) ([b4bae8f](https://github.com/yuriy-vasilyev/structura-core/commit/b4bae8f2eb12ee2bc8a25038f48f825a77414e89))
* **functions:** headless categories/tags archives + pagination ([4a792d5](https://github.com/yuriy-vasilyev/structura-core/commit/4a792d52aa09ab1420851f709270912c4fb79702))
* **functions:** headless editor backend + image-block rendering (Tier-3 [#2](https://github.com/yuriy-vasilyev/structura-core/issues/2)a) ([33ddb55](https://github.com/yuriy-vasilyev/structura-core/commit/33ddb5519498fe2a6334146252879eb5a37f063b))
* **functions:** headless image normalization core (Tier-2 [#7](https://github.com/yuriy-vasilyev/structura-core/issues/7)a) ([5d22126](https://github.com/yuriy-vasilyev/structura-core/commit/5d22126fb1399ce55d14a25e76156da382e9328a))
* **functions:** headless read endpoint + publish action — Tier 2 complete ([#9](https://github.com/yuriy-vasilyev/structura-core/issues/9)) ([28bd0b0](https://github.com/yuriy-vasilyev/structura-core/commit/28bd0b06744902a15151f0916f959eefa577ede1))
* **functions:** headless run-now + posts list backend (Tier-3 [#1](https://github.com/yuriy-vasilyev/structura-core/issues/1)a) ([1229f03](https://github.com/yuriy-vasilyev/structura-core/commit/1229f03b007766f90468ae25530670156c71a75b))
* **functions:** headless surface type foundation + dogfood gate ([2916f11](https://github.com/yuriy-vasilyev/structura-core/commit/2916f11a3ff3aae4c37d4b9f35b01a3d85088fc1))
* **functions:** import existing posts into a headless site (Tier-3 [#3](https://github.com/yuriy-vasilyev/structura-core/issues/3)a) ([54ff40c](https://github.com/yuriy-vasilyev/structura-core/commit/54ff40cedb2edcb8edc514cba1da0499232a0a43))
* **functions:** send a free-tier welcome email on signup ([868209f](https://github.com/yuriy-vasilyev/structura-core/commit/868209fa06f555af8c3751a46e999b7756cdad24))
* **headless:** release gate toggle (Firestore flag, no deploy to flip) ([ca57d59](https://github.com/yuriy-vasilyev/structura-core/commit/ca57d59b6a7fd6708fd4250f237bb5a0a1cc5011))
* **ui,web:** shared Stepper component — one wizard strip everywhere ([1df1b62](https://github.com/yuriy-vasilyev/structura-core/commit/1df1b62be1296bae35ef97eec1f3145675e79ce5))
* **ui,web:** shared zod form-validation layer — required fields highlight in place ([f44ab29](https://github.com/yuriy-vasilyev/structura-core/commit/f44ab2952bf283b05a877123f3c4c3a73d376bc9))
* **web,functions:** plan-tier gating for invites + AI providers; show stats for free ([4ee25a4](https://github.com/yuriy-vasilyev/structura-core/commit/4ee25a42bd45ac3f46248e4043f9aaceafe1a20f))
* **web,functions:** plugin-parity campaign UX — catalog dropdowns, AI Engine, campaign tabs ([34dc871](https://github.com/yuriy-vasilyev/structura-core/commit/34dc87180df638fa092a27a43635f341702ed918))
* **web,functions:** portal two-world redesign — site world, wizard, campaign flow ([ac53ce1](https://github.com/yuriy-vasilyev/structura-core/commit/ac53ce18251e45889dbf3f1965235475c966a66d))
* **web:** block-list editor + image paste for headless posts (Tier-3 [#2](https://github.com/yuriy-vasilyev/structura-core/issues/2)b) ([e0fa4a6](https://github.com/yuriy-vasilyev/structura-core/commit/e0fa4a6d7c0c68091d419bc02045bd9ec1540f06))
* **web:** clearer Download Plugin card — drop "Pro", add free/paid note ([5c307c1](https://github.com/yuriy-vasilyev/structura-core/commit/5c307c10ca7b920c3faf361e58ea51638acbb0b9))
* **web:** Connect a site CTA in Overview empty state ([e35fc9a](https://github.com/yuriy-vasilyev/structura-core/commit/e35fc9a30d5becfcc951f43040e27e8a56c6bf98))
* **web:** explicit free-activation CTA on Subscription page ([53cbc97](https://github.com/yuriy-vasilyev/structura-core/commit/53cbc974288c2a17039813890ff7f85457c8b22b))
* **web:** headless auto-pilot schedule UI — GA scheduler complete ([2f677a3](https://github.com/yuriy-vasilyev/structura-core/commit/2f677a38e7f4046d64ddc36bf9f0d9819b7f8077))
* **web:** headless integration instructions — Tier 1 complete ([50e0969](https://github.com/yuriy-vasilyev/structura-core/commit/50e09690963d29df3c76dd335b0ec110c77f586f))
* **web:** home attention slot — failed-run / all-paused / nothing-scheduled states ([8f7f9a1](https://github.com/yuriy-vasilyev/structura-core/commit/8f7f9a169caf4a77f8eae01dd10b6f91589de3c9))
* **web:** import UI for headless sites — Tier 3 complete ([#3](https://github.com/yuriy-vasilyev/structura-core/issues/3)b) ([ca6d313](https://github.com/yuriy-vasilyev/structura-core/commit/ca6d3130f6ae122244f388ec7182cfc36a93cd79))
* **web:** minimal Add-Site portal UI (dogfood-gated) ([4ce31b8](https://github.com/yuriy-vasilyev/structura-core/commit/4ce31b856fcfe4f054b8224f27e2239ebf687adb))
* **web:** move headless site management to the Sites page ([0c11d98](https://github.com/yuriy-vasilyev/structura-core/commit/0c11d985a605e33daebc30235d8ef8037f9e4dff))
* **web:** one-click legacy schedule → campaign conversion ([07948a1](https://github.com/yuriy-vasilyev/structura-core/commit/07948a1aba5273346ce81fb8fbab44719753836e))
* **web:** per-site headless area — generate → review → publish (Tier-3 [#1](https://github.com/yuriy-vasilyev/structura-core/issues/1)b) ([4c24212](https://github.com/yuriy-vasilyev/structura-core/commit/4c2421268052b3a592e8a857e94e7c19d64c8a71))
* **web:** remove coming-soon surface waitlist from the Overview ([ff42f68](https://github.com/yuriy-vasilyev/structura-core/commit/ff42f68cced02808d5ac9995a9d1ccb4862b51b7))
* **web:** schedule-pulse home header — posts this week + next-post derivation ([747cd31](https://github.com/yuriy-vasilyev/structura-core/commit/747cd3190e43e54052506402fb844f3aa17d009f))
* **web:** surface archive + pagination routes in the headless guide ([8227927](https://github.com/yuriy-vasilyev/structura-core/commit/8227927a38c7394c49f93b7b58c4e621e70c50f3))
* **web:** v3 workspace pages redesign — keys, personas, presets, members, billing, settings, account ([b387680](https://github.com/yuriy-vasilyev/structura-core/commit/b3876803c83af9b49a26ed3d31bdf6b5f86eb575))
* **www:** /autoblogging landing page + /vs/machined-ai comparison ([610e4f8](https://github.com/yuriy-vasilyev/structura-core/commit/610e4f80db8604b941832215f9925eae5c68b515))
* **www:** add missing pages ([fd317c0](https://github.com/yuriy-vasilyev/structura-core/commit/fd317c0a577008064bb0a00e6416b7786be58065))
* **www:** add Structura vs. AI Buster comparison page ([15e6cfa](https://github.com/yuriy-vasilyev/structura-core/commit/15e6cfa9827dd76700db22fb38b01c4adb087c10))
* **www:** per-locale blog sources — de/es/fr blogs empty until their content campaigns launch ([2945a72](https://github.com/yuriy-vasilyev/structura-core/commit/2945a7200a5aaed268fb140785bb781c2e36fe7e))


### Bug Fixes

* **functions,web:** DFS instant_pages 404 + explicit site-name field in headless connect ([2f9eeb7](https://github.com/yuriy-vasilyev/structura-core/commit/2f9eeb71ecbb5a34146ba730a089a33894edf9ea))
* **functions,web:** portal runs visibility — canonical path + missing doc fields ([d968fb0](https://github.com/yuriy-vasilyev/structura-core/commit/d968fb0cd1e7cdf79467dbbc166061b525df81b6))
* **functions:** EmailOwnerIntegration sends from the verified Resend domain ([0091add](https://github.com/yuriy-vasilyev/structura-core/commit/0091adda11fdbc2bade8ad564e4027e5700da2f4))
* **release:** force plugin .zip to download as a file (Content-Disposition) ([20ed606](https://github.com/yuriy-vasilyev/structura-core/commit/20ed60607beaef5305f4a37ff56edfb83da694b3))
* **ui:** CodeBlock preserves newlines + bounds width ([0869d1d](https://github.com/yuriy-vasilyev/structura-core/commit/0869d1d054b9ece7a7220f210b02eb9e89c8c974))
* **web,functions:** wizard magic results survive remounts + headless identity fallback ([ec16035](https://github.com/yuriy-vasilyev/structura-core/commit/ec16035cd11b8c55a67288410642020d16632242))
* **web:** campaign-flow grids cap at 2 columns — selects were truncating ([8b395cc](https://github.com/yuriy-vasilyev/structura-core/commit/8b395cca946fa3e7e674e39b74f8536abeef6231))
* **web:** sites table fidelity — tinted header band, flush accent add-row ([51d6636](https://github.com/yuriy-vasilyev/structura-core/commit/51d6636ddf258f590d582ad9167c1215541af38f))
* **web:** sync admin Test Email template list with the server registry ([3e977ff](https://github.com/yuriy-vasilyev/structura-core/commit/3e977fffb5679bf6bca9badc83e108f32b2fb6a1))
* **www:** stop dropping landing pageviews — queue captures behind PostHog init, re-emit on consent grant ([9f33f54](https://github.com/yuriy-vasilyev/structura-core/commit/9f33f542d018cc0a5f734e3fe532d2e1b88d60d3))


### Reverts

* **www:** back out marketing/www files swept into c3f344955 ([7cb4151](https://github.com/yuriy-vasilyev/structura-core/commit/7cb415157dce4cb97304a64c599e8904790c0709))

## [1.82.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.81.0...v1.82.0) (2026-06-07)


### Features

* **client:** wizard auto-suggests the whole brand layer ([05ef886](https://github.com/yuriy-vasilyev/structura-core/commit/05ef886e87e67c49f1d86b36317f4abed2fa5173))


### Bug Fixes

* **client:** license gate success state + centered connect form ([701a2ab](https://github.com/yuriy-vasilyev/structura-core/commit/701a2abaff442b647340a38ed605d2e287b092c3))

## [1.81.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.80.0...v1.81.0) (2026-06-07)


### Features

* **client:** default new campaigns to pending-review post status ([bb9a777](https://github.com/yuriy-vasilyev/structura-core/commit/bb9a777cd1f83917aae1e5d213eda323a4e24fce))
* **functions,plugin,client:** feed confirmed keywords + authority domains into AI suggest prompts ([c2f5905](https://github.com/yuriy-vasilyev/structura-core/commit/c2f5905d73ade20f83d6eed5cf41e140dcf7a532))
* **www:** surface structural benchmarks + rankings-based internal links in marketing copy ([13dc87d](https://github.com/yuriy-vasilyev/structura-core/commit/13dc87d2cad264222f542f4cbe885a025b1c8710))


### Bug Fixes

* **client:** scope wp-admin cycle-usage widget + quota banner to the current activation ([a84d2b2](https://github.com/yuriy-vasilyev/structura-core/commit/a84d2b22dcf68387badefa0e4bc9718ea48315f8))
* **functions,client:** scope competitor suggestions to the analyzed site + AI prompt context ([f53bda4](https://github.com/yuriy-vasilyev/structura-core/commit/f53bda46c61809b1fcac71c690b370d972afe503))
* **plugin,functions,client:** cache workspace audience so the plan badge doesn't flash ([d712cda](https://github.com/yuriy-vasilyev/structura-core/commit/d712cdaa60fe6300d55c6649540c99ce5a8cdc92))

## [1.80.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.79.0...v1.80.0) (2026-06-06)


### Features

* **client:** plan-aware setup wizard — skip AI step on cloud, license gate first ([fa3c926](https://github.com/yuriy-vasilyev/structura-core/commit/fa3c9260b39f67602db5190be55f6d37017e4e93))
* **plugin:** carry provider_count_cap + is_anonymous on the settings payload ([35c68f3](https://github.com/yuriy-vasilyev/structura-core/commit/35c68f394e1c5ab7845d07f9e6b18ae735a2cbc2))

## [1.79.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.78.0...v1.79.0) (2026-06-06)


### Features

* **ai:** E-E-A-T writing signals + SERP entity coverage as toggleable SEO directives ([2f0bcaf](https://github.com/yuriy-vasilyev/structura-core/commit/2f0bcafcc243ec854b5d5418bb1cc4f65b727664))
* **www:** add Agility Writer comparison page, reorder compare links by directness ([ab24a30](https://github.com/yuriy-vasilyev/structura-core/commit/ab24a307ed4fb937dcb8729529542acabb3a620c))


### Bug Fixes

* **client:** default the Code content block off for new campaigns ([7af341a](https://github.com/yuriy-vasilyev/structura-core/commit/7af341a01f68562abe8ef016c956aa7cf8cf5993))
* **client:** remove the 300ms transient frame in interview single-select ([dcfdb96](https://github.com/yuriy-vasilyev/structura-core/commit/dcfdb9667dfedad1acbf10231cc524f0c75acf41))
* **client:** stop interview chip rows rewrapping when the checkmark appears ([5bc4f40](https://github.com/yuriy-vasilyev/structura-core/commit/5bc4f40c60bb47e794494147f4e459db1bc47401))
* **www:** give every responsive grid an explicit grid-cols-1 base ([4d55987](https://github.com/yuriy-vasilyev/structura-core/commit/4d55987b24a4eb0184f9291c561e7eeb577d8931))
* **www:** unstick mobile scroll lock + viewport-wide overflow on phones ([123011c](https://github.com/yuriy-vasilyev/structura-core/commit/123011cb342d550b028b04a949a4501ca2e52305))

## [1.78.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.77.0...v1.78.0) (2026-06-05)


### Features

* **admin:** debugging drill-down — site search, activation debug view, run traces ([3333755](https://github.com/yuriy-vasilyev/structura-core/commit/3333755ad57a049bb100b77ce963d4de767ba7e3))
* **stock:** campaign Stock tab — visibility + control over pre-generated posts ([58a44db](https://github.com/yuriy-vasilyev/structura-core/commit/58a44db66ab77e75b478aad5e24ac0b618a32b1f))
* **stock:** cancel frozen batches at the timeout ceiling and notify the owner ([263dd86](https://github.com/yuriy-vasilyev/structura-core/commit/263dd86f7b9c847cf645d8aa454f931c92403f6a))


### Bug Fixes

* **research:** restore competitor analysis, site-level authority fallback, and stock enrichment ([38c2d9c](https://github.com/yuriy-vasilyev/structura-core/commit/38c2d9c9454174e212ce3d1a9f62dd6723058817))
* **web:** stop dark-mode login logo from stacking icon over wordmark ([75c6d76](https://github.com/yuriy-vasilyev/structura-core/commit/75c6d765419bdc1cfe314db0a8d24ed5e2f7b801))

## [1.77.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.76.0...v1.77.0) (2026-06-04)


### Features

* **analytics:** route browser PostHog through first-party reverse proxy ([5c04be9](https://github.com/yuriy-vasilyev/structura-core/commit/5c04be94965f3f416f42c19d6d5a241b0052bed1))
* **functions:** log provider-native batch state on still-pending poller ticks ([8728225](https://github.com/yuriy-vasilyev/structura-core/commit/8728225895ffcc184ba8c5894b23ebeeeab3696d))
* **suggestions:** ground campaign/topic suggestions on positioning + target keywords ([164f4a7](https://github.com/yuriy-vasilyev/structura-core/commit/164f4a7bce16e3f8c58d61e0b18994c6fede4722))


### Bug Fixes

* **ai:** clean up prompt-audit findings from a production system prompt ([3b3619a](https://github.com/yuriy-vasilyev/structura-core/commit/3b3619a346a1c7cf5dc78cef7ad3bfd2120ccbfe))
* **client:** backfill empty campaign model fields at the form-provider level ([d4a232d](https://github.com/yuriy-vasilyev/structura-core/commit/d4a232d1185b9567ca365d2c90e199f056229354))
* **functions:** key internal-link candidates by the activation's site URL ([6ea3a40](https://github.com/yuriy-vasilyev/structura-core/commit/6ea3a40f548ce1688dfac3912b2487d71ca862a4))

## [1.76.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.75.1...v1.76.0) (2026-06-03)


### Features

* **growth:** fire purchase milestone server-side (PostHog-only) ([392b511](https://github.com/yuriy-vasilyev/structura-core/commit/392b51191e943314c9f00cf6add98df1bd9f38e8))
* **growth:** persist utm_source through the funnel for partner referrals ([2d07a4a](https://github.com/yuriy-vasilyev/structura-core/commit/2d07a4a5f29553d51c44a56df07ed7660a09e328))
* **www:** add audience landing pages for individual + agency ad campaigns ([a1cbab6](https://github.com/yuriy-vasilyev/structura-core/commit/a1cbab64652a7b137c68392bd4bfc0dc859d9fec))


### Bug Fixes

* **onboarding:** hydrate visuals over a pristine stale draft + make Exit stick ([4ac5397](https://github.com/yuriy-vasilyev/structura-core/commit/4ac5397f512a4191551e2f5fd0057bc8b8615118))

## [1.75.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.75.0...v1.75.1) (2026-06-03)


### Bug Fixes

* **onboarding:** restore Step 1 logo + hydrate Step 4 visuals from the bound preset ([2f9065d](https://github.com/yuriy-vasilyev/structura-core/commit/2f9065dd35dc1efef9bf2a0dfca93c00afcb7961))

## [1.75.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.74.0...v1.75.0) (2026-06-03)


### Features

* **generations:** persist the full prompt on text generation docs ([d40c9a9](https://github.com/yuriy-vasilyev/structura-core/commit/d40c9a9a4ebde9bf728ede39530c01f2b36092a2))
* **growth:** deep funnel events to PostHog, Telegram + Google Ads OCI ([2def422](https://github.com/yuriy-vasilyev/structura-core/commit/2def4220e5af0799b91ddec97f72c9875f4e55d6))
* **growth:** enrich funnel Telegram cards with name, plan, uid ([7e2a381](https://github.com/yuriy-vasilyev/structura-core/commit/7e2a38106a9fb0d8bd4b0dcac316de14488a90d3))
* **growth:** reframe Overview as multi-surface activation + waitlist ([4946844](https://github.com/yuriy-vasilyev/structura-core/commit/4946844f7519933305e22f09d4c4466928836bb5))


### Bug Fixes

* **content:** normalize slug/keyphrase/heading/anchors before publish ([757356a](https://github.com/yuriy-vasilyev/structura-core/commit/757356ab1f4d4966ddcb7d6627350dbcfa035706))
* **growth:** drop undefined click ids before the attribution set ([106a17b](https://github.com/yuriy-vasilyev/structura-core/commit/106a17ba54a6cad9754143cbe553e41e1704e8e3))
* scope site positioning + seoIntel to the activation, not the workspace ([ca10450](https://github.com/yuriy-vasilyev/structura-core/commit/ca104507a0aa9988106a719f449add3053d1f277))
* **stock:** run the repetition guard on batch-generated posts ([e97bcd0](https://github.com/yuriy-vasilyev/structura-core/commit/e97bcd04f0f448d5bb395f3fa157491ddced0241))
* **web:** commit public prod env so PostHog can't drop out of a build ([0e12243](https://github.com/yuriy-vasilyev/structura-core/commit/0e12243ccb54e03b956673197ed478c19159b867))
* **web:** PostHog opt-state from consent at init, not a post-load flip ([d229230](https://github.com/yuriy-vasilyev/structura-core/commit/d2292308ba9c239838074e5d97590b1e469e8ed4))

## [1.74.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.73.0...v1.74.0) (2026-06-01)


### Features

* **seo:** AI fallback for competitors + honest 'AI-guess' notices ([0d8f189](https://github.com/yuriy-vasilyev/structura-core/commit/0d8f189e8d77cbf72832df13354e7a7e827a010c))

## [1.73.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.72.1...v1.73.0) (2026-06-01)


### Features

* **site:** Save button + Add all on Keywords/Competitors/Authority editors ([41e5444](https://github.com/yuriy-vasilyev/structura-core/commit/41e544439206648f97f7997d3e1c04fc557abd2a))


### Bug Fixes

* **client:** namespace persisted localStorage per activation ([dbdc391](https://github.com/yuriy-vasilyev/structura-core/commit/dbdc391ef8c5a4a8f0ee3d79aeb16b86be5ddbf3))

## [1.72.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.72.0...v1.72.1) (2026-06-01)


### Bug Fixes

* **onboarding:** correct a test cast that broke the release build ([fcedb22](https://github.com/yuriy-vasilyev/structura-core/commit/fcedb22a9ceaf8401582d33c91d6f83495e3b986))

## [1.72.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.71.0...v1.72.0) (2026-06-01)


### Features

* **campaigns:** show creation date on the campaign overview ([3eb7c76](https://github.com/yuriy-vasilyev/structura-core/commit/3eb7c76b6ba4e816dcf0d245d52d9abd55e3e28c))
* **onboarding:** auto-start the wizard on every activation, including free/none ([fcec255](https://github.com/yuriy-vasilyev/structura-core/commit/fcec255989320be6eedad3173b4ffc4d1b1c8fd7))
* **onboarding:** free/none get real Site/AI/Visuals/Personas steps; only SEO locked; hide campaign CTA for none ([f30dafb](https://github.com/yuriy-vasilyev/structura-core/commit/f30dafbbd07ce0a45bf100295af7b3c10af95255))
* **onboarding:** Pro-gate format encoding + optimize-on-upload in the wizard Visuals step ([a516732](https://github.com/yuriy-vasilyev/structura-core/commit/a516732f80654f123812d03a749624d4732e251d))


### Bug Fixes

* **campaigns:** close create wizard when the per-tier cap is hit on launch ([253ca57](https://github.com/yuriy-vasilyev/structura-core/commit/253ca579f80aea1fb3364af2c16891681e9d027d))
* **campaigns:** reset margins on the launch-CTA heading + paragraph ([52be682](https://github.com/yuriy-vasilyev/structura-core/commit/52be682d60cb431552ff10e2450498c596d017ab))
* **site:** free tiers can restart the wizard + disabled Select now looks disabled ([a1ee96d](https://github.com/yuriy-vasilyev/structura-core/commit/a1ee96d12d7d8dc13eac6de075f3fbd849e501c2))
* **site:** pad the locked-panel overlay so the lock card isn't flush ([7044208](https://github.com/yuriy-vasilyev/structura-core/commit/7044208bced7de332deaf2c2609f1b7937bd7c2d))

## [1.71.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.70.0...v1.71.0) (2026-06-01)


### Features

* **campaigns:** inherit SEO inputs from global settings; drop Competitors step ([fc38540](https://github.com/yuriy-vasilyev/structura-core/commit/fc385400622e50dc600696e0cf1af12cba125242))
* **campaigns:** prominent keyword chips + prefill-from-site note ([8358d1a](https://github.com/yuriy-vasilyev/structura-core/commit/8358d1ae43256e9192f5007c8a83733a0b34ca59))
* **generation:** ground post synthesis in brand positioning (tier-gated) ([50c0566](https://github.com/yuriy-vasilyev/structura-core/commit/50c0566ebae481d3faff92b309efc737035ad9f3))
* **growth:** dedicated growth Telegram bot + Send-test, separate from ops alerts ([3119887](https://github.com/yuriy-vasilyev/structura-core/commit/311988799bd742d7ac9849868f934cd7af4f666d))
* **growth:** GROWTH_TELEGRAM_CHAT_ID accepts a comma-separated recipient list ([08bf644](https://github.com/yuriy-vasilyev/structura-core/commit/08bf64476a24a0289d0618246b673792bf25533b))
* **onboarding:** logo→Step 1, unified magic loader, multi-persona, Step 6 CTA finish ([887dda8](https://github.com/yuriy-vasilyev/structura-core/commit/887dda804225d28c34a5a7e6fc54df7100e1f146))
* **onboarding:** restart-wizard on Site→Settings, drop stale moved-widget, logo to top of Step 1 ([5090917](https://github.com/yuriy-vasilyev/structura-core/commit/50909174d9a4b6184c46269804fdb95a5ced4a3b))
* **seo:** promote authority domains to a global workspace setting + fix dropped fields ([0e55882](https://github.com/yuriy-vasilyev/structura-core/commit/0e55882dbbc4c39bbf304aa747fc70b3a2d0bf43))
* **site:** re-run AI keyword suggestions on the Keywords tab ([d056e1d](https://github.com/yuriy-vasilyev/structura-core/commit/d056e1d813bbd2bee0d76fdc511ff40c51a73861))
* **site:** surface + edit positioning on Site → Info with magic re-draft ([81e9f6e](https://github.com/yuriy-vasilyev/structura-core/commit/81e9f6e96d0158ea409aa23aa85e4512684dd1ec))
* **site:** surface target keywords on the Keywords tab ([3849009](https://github.com/yuriy-vasilyev/structura-core/commit/38490090e0d5b9a66e7cd7044f874518988e6a7a))
* **stock:** positioning-aware stock pre-generation (parity with live synthesis) ([3a56df4](https://github.com/yuriy-vasilyev/structura-core/commit/3a56df42d83b3c78f1a0af22b83eae742de8ee8c))
* **ui:** FileUpload drag-and-drop component; use it for the wizard logo ([384a525](https://github.com/yuriy-vasilyev/structura-core/commit/384a52514ced73bcc8442a766e1d43aa7bf3772d))


### Bug Fixes

* **ai-engine:** dialogs unusable inside onboarding wizard + auto-default sole provider ([aafdc65](https://github.com/yuriy-vasilyev/structura-core/commit/aafdc652131be5b06f6971dd80432e7169f97185))
* **growth:** surface Telegram rejection reason in Send-test + consistent button ([cf76820](https://github.com/yuriy-vasilyev/structura-core/commit/cf7682037e99a87355829fe5cece7552fe60c815))
* **onboarding:** block Finish until complete instead of jumping to a step ([f861cea](https://github.com/yuriy-vasilyev/structura-core/commit/f861cea6ecafbe4b500b5bab28ac1943941ff51e))
* **onboarding:** connect wizard personas to the shared library + prefill logo from custom_logo ([4c415e0](https://github.com/yuriy-vasilyev/structura-core/commit/4c415e00a630c7d451c6569d1be007a0c89411be))
* **onboarding:** Finish setup dead-ended after reload — persist validity + route to gaps ([d4b260b](https://github.com/yuriy-vasilyev/structura-core/commit/d4b260bc76729a3dd20d86ed9501771508131929))
* **onboarding:** modals invisible, loader spacing, empty visual draft, step-5-submit flow ([bd03fde](https://github.com/yuriy-vasilyev/structura-core/commit/bd03fde4dbada3d170c8ae311f7ec1411357e6b6))
* **onboarding:** positioning/keyword AI-draft truncated — cap thinking budget, raise output cap ([5155513](https://github.com/yuriy-vasilyev/structura-core/commit/5155513f15e0163b8d132f08013845b5fe8d14ab))
* **onboarding:** React [#310](https://github.com/yuriy-vasilyev/structura-core/issues/310) — finishedRef useRef called after loading early return ([cabd532](https://github.com/yuriy-vasilyev/structura-core/commit/cabd532c371011aab5709bfb60b1fdc9ab896677))
* **onboarding:** widen the wizard container on the Personas step ([144dd4d](https://github.com/yuriy-vasilyev/structura-core/commit/144dd4d754971131480c4a8804099c5343e50b5b))
* **onboarding:** wizard logo stacked vertically — variant-swap classes clobbered LogoFull's flex ([1811a02](https://github.com/yuriy-vasilyev/structura-core/commit/1811a024fe6651c07fdb571f02c14f2bd1b05733))
* **personas:** keep New/Templates buttons in the Personas page header ([8b511de](https://github.com/yuriy-vasilyev/structura-core/commit/8b511de75fe3e873f6de62c8f01e387088045555))


### Performance Improvements

* **authority:** cap Gemini thinking + tighten liveness checks to fit the sync request budget ([cd787e0](https://github.com/yuriy-vasilyev/structura-core/commit/cd787e0e477c51b5adbc91050f8fcc52cce7002d))

## [1.70.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.69.1...v1.70.0) (2026-05-29)


### Features

* **onboarding:** polish round — clickable stepper, favicon competitor chips, Step 6 redesign, title relocation, Continue spinner ([4b3dab3](https://github.com/yuriy-vasilyev/structura-core/commit/4b3dab357a83fe1e6c257f7cf8f350035002b888))
* **onboarding:** W-A wizard skeleton — routes, persistence, steps 1+6 ([5213569](https://github.com/yuriy-vasilyev/structura-core/commit/52135694a75b2d89f3671dc4d37758036c6f0719))
* **onboarding:** W-A.1 — auto-redirect, dashboard resume tile, step 1 inline edit ([687765a](https://github.com/yuriy-vasilyev/structura-core/commit/687765aa43e9a49914d691f3d3a68f8d172cf679))
* **onboarding:** W-B — step 2 AI engine + blocking connection test ([b3c1746](https://github.com/yuriy-vasilyev/structura-core/commit/b3c1746d14e08f67ffbf2f0d5a2bb3b792ef4fce))
* **onboarding:** W-C — step 3 SEO intelligence (positioning + competitors + keywords) ([7ced91e](https://github.com/yuriy-vasilyev/structura-core/commit/7ced91e2140ccc79f76e9ba8c3170ce242f74675))
* **onboarding:** W-D — steps 4 (Visuals) + 5 (Persona) ([f681627](https://github.com/yuriy-vasilyev/structura-core/commit/f681627890349eae95193ccf9d23ad0db7ed5a8e))
* **onboarding:** W-E — tier-change reaction + campaign-side gate ([c18b41e](https://github.com/yuriy-vasilyev/structura-core/commit/c18b41e608f24f4130b7bc4e12cc1cfce337f831))
* **onboarding:** wizard restart endpoint + Step 6 button + ?restart=1 URL trick ([f065aba](https://github.com/yuriy-vasilyev/structura-core/commit/f065abaf0540b05357d076012730d715cfc92843))


### Bug Fixes

* **onboarding:** Continue stuck post-restart + full wordmark + centered title in header ([9fc4e04](https://github.com/yuriy-vasilyev/structura-core/commit/9fc4e042d0a86889227ab493ac8ab026ef79ac9c))
* **onboarding:** critical wizard bugs — back button, dropdowns, cache merge, finish, headings ([1ccf9d9](https://github.com/yuriy-vasilyev/structura-core/commit/1ccf9d974d8526128d18bda0ff629ca4b3e2da57))
* **onboarding:** hoist OnboardingPage hooks above the loading-state early return ([8070751](https://github.com/yuriy-vasilyev/structura-core/commit/80707519491d7951cd297c2a437703d990d1d666))
* **onboarding:** portal wizard out of wp-admin chrome, mirror dark class to body ([4c7d796](https://github.com/yuriy-vasilyev/structura-core/commit/4c7d79605b547a921097a308f86ad18fdf8214f8))
* **onboarding:** seven issues from in-browser test — logo, exit color, footer gap, navigation model ([ab759cd](https://github.com/yuriy-vasilyev/structura-core/commit/ab759cd3bc5407be64cda4bcba37b5357b4e342f))
* **onboarding:** use icon logo variant in wizard header, mono ink for dark ([7779f20](https://github.com/yuriy-vasilyev/structura-core/commit/7779f203df17daee17842785ef9b40e173fa788e))
* **seo-intel:** hide numeric category IDs from Site Intelligence niche display ([f2d642a](https://github.com/yuriy-vasilyev/structura-core/commit/f2d642a06618ef963334c6eeba25f35bc4554fc6))

## [1.69.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.69.0...v1.69.1) (2026-05-29)


### Bug Fixes

* **seo-intel:** real DFS response shapes — categories objects, organic-footprint authority, ETV sort ([d9a978a](https://github.com/yuriy-vasilyev/structura-core/commit/d9a978af65300374c95632c792231b4f3b4f1177))

## [1.69.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.68.0...v1.69.0) (2026-05-28)


### Features

* **seo-intel:** surface analyzed URL + source so headless setups are verifiable ([07980f9](https://github.com/yuriy-vasilyev/structura-core/commit/07980f95e2adf090975c20f57b6aac737933e1ec))
* **site:** interactive Competitors + Settings CRUD; vertical spacing fix; DFS payload logs ([dbbf52e](https://github.com/yuriy-vasilyev/structura-core/commit/dbbf52e62b2966d1c3ebe38e5d751959e82d3a1c))
* **site:** SitePanelHeader for consistent layout; auto-discover SERP competitors ([5f3e162](https://github.com/yuriy-vasilyev/structura-core/commit/5f3e162c8c77002ac9099b42fb0b27e016c99dca))

## [1.68.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.67.0...v1.68.0) (2026-05-28)


### Features

* **ai:** internal-link picker — surface workspace's ranking URLs in prompts ([ebfb6ff](https://github.com/yuriy-vasilyev/structura-core/commit/ebfb6ff740b6a9645439983a66c213ad8c14b06e))
* **ai:** wire SEO intel provider into post-synthesis research + prompt ([8a07d3d](https://github.com/yuriy-vasilyev/structura-core/commit/8a07d3d23379054c4de795cada1db2c693b415f2))
* **campaigns:** add Competitors wizard step; rename 'Excluded Domains' ([3abf2b4](https://github.com/yuriy-vasilyev/structura-core/commit/3abf2b4cb3a46441f8dfdbd1641dbb9882d16ce2))
* **campaigns:** data-source badge — Live data vs AI estimate ([60625c6](https://github.com/yuriy-vasilyev/structura-core/commit/60625c61ffaeaa25424b2e5aff4fd38cf94a3876))
* **campaigns:** persist wizard competitor URLs to workspace; thread to keyword discovery ([d2e8617](https://github.com/yuriy-vasilyev/structura-core/commit/d2e8617a63afcf12fcdfc2eed092cd533e08ea59))
* **channels:** route LinkedIn org connections through a second OAuth app ([968dd4d](https://github.com/yuriy-vasilyev/structura-core/commit/968dd4df17237313f6ccf09b81753525d0266752))
* **seo-intel:** add monthly refresh cron + workspace notices ([2ec5188](https://github.com/yuriy-vasilyev/structura-core/commit/2ec5188ee3acbdb8b02e8ff73f184b40f745856a))
* **seo-intel:** extend campaign + workspace schemas; add updateWorkspaceSeoSettings ([ef9b37b](https://github.com/yuriy-vasilyev/structura-core/commit/ef9b37b4c7eff71354335f5f6316037d10774150))
* **seo-intel:** hourly balance watch with Telegram critical alerts ([473ba1f](https://github.com/yuriy-vasilyev/structura-core/commit/473ba1fd601bb605b8a821cd4f238f939cb73c13))
* **seo-intel:** implement DataForSEO OnPage client; wire analyzeCompetitorPages end-to-end ([547f826](https://github.com/yuriy-vasilyev/structura-core/commit/547f826313cf39cf39fd425fb8d28eca3365c7cc))
* **seo-intel:** real discoverKeywords impl with gap analysis ([c6c4d79](https://github.com/yuriy-vasilyev/structura-core/commit/c6c4d79fbb2c2f19aeaae3c1abdcaa771c1ce2e1))
* **seo-intel:** scaffold DataForSEO provider foundation ([772843c](https://github.com/yuriy-vasilyev/structura-core/commit/772843c7a7e62d9fe1799c4b79159480d3a183eb))
* **seo-intel:** wire keyword-discovery through the provider ([2b4de26](https://github.com/yuriy-vasilyev/structura-core/commit/2b4de2659b3e66f8604cbb4025ccb0b19b86ed8e))
* **seo-intel:** workspace activation hook — warm /site cache on first activate ([b67d7b1](https://github.com/yuriy-vasilyev/structura-core/commit/b67d7b14972dcd3e2670d16422d8d539b01f84ba))
* **site:** add /site route with 5 tabs; relocate Headless Mode toggle ([6e683bd](https://github.com/yuriy-vasilyev/structura-core/commit/6e683bd0167c1d9636263864d8464eddc34c0997))
* **site:** Authority tab — real backlinks-driven authority metrics ([3f1decf](https://github.com/yuriy-vasilyev/structura-core/commit/3f1decf6eac191a66c5b78b497d4c7f9a0cfdbf5))
* **site:** manual analyze trigger — real DataForSEO impls + Keywords/Info tabs ([36e7721](https://github.com/yuriy-vasilyev/structura-core/commit/36e772150996b2b0e2a0aec4e0597370902d5d82))


### Bug Fixes

* **seo-intel:** bind DATAFORSEO_SECRETS to TEXT_GENERATION_SECRETS ([909114a](https://github.com/yuriy-vasilyev/structura-core/commit/909114ab78b32013d0364df874cc69b69b59eb58))
* **seo-intel:** convert dynamic imports to static (.js extension) ([ad23d38](https://github.com/yuriy-vasilyev/structura-core/commit/ad23d385e784ac7a5743297c9650a34a39db873b))
* **site:** empty-result UX, niche fallback, real Competitors/Settings data ([5167222](https://github.com/yuriy-vasilyev/structura-core/commit/5167222e301077509fd8a97b488e6a34909c6569))
* **site:** LockedPanel overlay overflows when preview is shorter ([1ffc248](https://github.com/yuriy-vasilyev/structura-core/commit/1ffc248157f6e19b0c68910368eb07ef37511aaa))
* **site:** reset heading + paragraph margins against wp-admin globals ([6fe9194](https://github.com/yuriy-vasilyev/structura-core/commit/6fe9194f95fb1e34ba9985cbcd3de11ebdb5b77c))

## [1.67.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.66.1...v1.67.0) (2026-05-27)


### Features

* **ai:** guard generated content against degenerate repetition ([cd365a8](https://github.com/yuriy-vasilyev/structura-core/commit/cd365a8935ea432465772c933aaa6f0cca626dfb))
* **campaigns:** warn when BYOK image gen is on but no image model picked ([48a5cc5](https://github.com/yuriy-vasilyev/structura-core/commit/48a5cc593c8cf9a29d06939037948fd6cb685198))


### Bug Fixes

* **ai:** resolve BYOK image model from catalog default instead of failing ([dee8f11](https://github.com/yuriy-vasilyev/structura-core/commit/dee8f1141f5b64ee6763471656e777867374636d))
* **billing:** drop undefined fields in recordUsage so keyless runs record ([779801f](https://github.com/yuriy-vasilyev/structura-core/commit/779801fd80d8d08029179770049611f3ed3152ed))
* **client:** remove double spinner from campaign Posts tab loading state ([c65d7b7](https://github.com/yuriy-vasilyev/structura-core/commit/c65d7b7d3662b499b46e62e037d37cccb153865a))

## [1.66.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.66.0...v1.66.1) (2026-05-27)


### Bug Fixes

* **plugin:** sync WP header Version with release-please (was stuck at 1.59.0) ([e3377ed](https://github.com/yuriy-vasilyev/structura-core/commit/e3377ed4b913418cedc14e4c2a84458e20e19e9e))

## [1.66.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.65.0...v1.66.0) (2026-05-27)


### Features

* **ai:** single source of truth for language→geo, extend to ~55 languages ([4ee55c5](https://github.com/yuriy-vasilyev/structura-core/commit/4ee55c5c90d533a8c2af0043ed1686558ba66900))
* **personas:** ground Magic Suggest on the site's own voice ([b6e5b58](https://github.com/yuriy-vasilyev/structura-core/commit/b6e5b58a4821889224f7dc247d14ee76247f3abf))
* **progress:** surface competitor-analysis and authority research steps ([e7b5258](https://github.com/yuriy-vasilyev/structura-core/commit/e7b5258edae15987ae2750750e0a588d1e7d23de))
* **seo:** fallback /llms.txt that defers to Yoast/Rank Math ([8e70093](https://github.com/yuriy-vasilyev/structura-core/commit/8e700933fc4b3a7fdfc3a71928388c7e3cb8aa32))
* **ui:** monochrome logo variant for colored backgrounds ([d730715](https://github.com/yuriy-vasilyev/structura-core/commit/d730715d98baef27f7be227ba135bc07e0ee1f0c))
* **web:** split-screen login, Overview dashboard, system-pref theme ([d2fd320](https://github.com/yuriy-vasilyev/structura-core/commit/d2fd3204641f8b61b7b96b464cb8d9efc98eba1a))
* **www:** Structura vs. Outrank comparison page ([91247d7](https://github.com/yuriy-vasilyev/structura-core/commit/91247d798f2e4ccf1630e2a6e8b2c9128eed46bc))
* **www:** surface multi-channel distribution + GEO on the homepage ([8bbb750](https://github.com/yuriy-vasilyev/structura-core/commit/8bbb750cbc2759ef70191085b388652a9ed3c237))


### Bug Fixes

* **auth:** authoritative isNewUser for magic-link sign_up conversion ([d80f777](https://github.com/yuriy-vasilyev/structura-core/commit/d80f777f7f302a70a1e22fc50a59cb47c4021460))
* **www:** link the Outrank comparison page from nav + homepage ([63f7725](https://github.com/yuriy-vasilyev/structura-core/commit/63f77251a920825dcdc596c6973c2222f44ce506))

## [1.65.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.64.0...v1.65.0) (2026-05-26)


### Features

* **channels:** LinkedIn company-page posting ([d40eeca](https://github.com/yuriy-vasilyev/structura-core/commit/d40eecad6356866ea896ddc6209bcb35e0c6ea15))
* **client:** swap dashboard upgrade banner for a permanent tiered upsell card ([6572a95](https://github.com/yuriy-vasilyev/structura-core/commit/6572a95226df43b8eceede7693361c4e61c54ce7))


### Bug Fixes

* **client:** restrict header Upgrade to none/free, restyle, order internal links first ([550f060](https://github.com/yuriy-vasilyev/structura-core/commit/550f060dce58bee8db64d2d8e4b55a77176ab7d1))
* **www:** sync channels page to catalog — drop X, add Telegram/WhatsApp/Email/Webhook ([ce825f1](https://github.com/yuriy-vasilyev/structura-core/commit/ce825f1986964fcce0b1944d1c5ddcbf1b3c8ab0))

## [1.64.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.63.0...v1.64.0) (2026-05-26)


### Features

* **channels:** page ops Telegram on permanent channel-dispatch failures ([f31a419](https://github.com/yuriy-vasilyev/structura-core/commit/f31a419e82bc165433c48474dea5e39f1e4bf89e))
* **client:** add Manage account button to the account page ([4d55ac5](https://github.com/yuriy-vasilyev/structura-core/commit/4d55ac5fe3b7e687d5babd05a169585fe8c6547d))
* **client:** move Account & Settings into a header account menu ([111446c](https://github.com/yuriy-vasilyev/structura-core/commit/111446c707f5b4ddf2ab77352fa2aa723978c50c))
* **runs:** surface partial channel-dispatch failures on the run ([2541760](https://github.com/yuriy-vasilyev/structura-core/commit/254176072b33d7acd2719e4eb967f313bc5a1812))


### Bug Fixes

* **i18n:** translate the bare "Upgrade" string for es/fr ([e3eaad3](https://github.com/yuriy-vasilyev/structura-core/commit/e3eaad32ec08bcc11de9c93a9e13ad161b4d3302))

## [1.63.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.62.0...v1.63.0) (2026-05-25)


### Features

* **admin:** analytics dashboard, workspace drill-down, and shell parity ([e2666a0](https://github.com/yuriy-vasilyev/structura-core/commit/e2666a05edce6fa9196e2aba7e785cce1245e1a0))
* **admin:** make signups KPI 'today' (viewer-local) instead of rolling 24h ([e2e380d](https://github.com/yuriy-vasilyev/structura-core/commit/e2e380d092e5d745b87c107f8c5aceeba2e9e6d5))
* **campaigns:** cap Free tier to one post per week ([5f57dd2](https://github.com/yuriy-vasilyev/structura-core/commit/5f57dd288c9e9c60817d026ffb262068ccd18c0a))
* **channels/prompts:** tune LinkedIn + X social copy for subtle conversion ([7185ef1](https://github.com/yuriy-vasilyev/structura-core/commit/7185ef1a241369ccb9a65b36f5ad72db05f7924f))
* **consent:** env-gated opt-out default for US-only launch ([ec422ee](https://github.com/yuriy-vasilyev/structura-core/commit/ec422ee85cfa457cbc2ff2111249e45a4e61a2db))
* **notices:** surface generation failures + retire in-app System Logs strings ([7162298](https://github.com/yuriy-vasilyev/structura-core/commit/7162298668feed510590f64886295f42f21576c7))
* **personas:** block campaign and single-post creation when no personas exist ([30c5d24](https://github.com/yuriy-vasilyev/structura-core/commit/30c5d240e9ae807da8cd8d93101aa9d34c24fe9b))
* **users:** workspace-aware account deletion with guard rails ([cc198a3](https://github.com/yuriy-vasilyev/structura-core/commit/cc198a3f53039300d85ca4dff72770d0d626aee9))
* **web/account:** make delete dialog role-aware ([9807397](https://github.com/yuriy-vasilyev/structura-core/commit/980739773fd944a0fb76890a500bbf7f14c88a24))
* **web/account:** restyle danger zone and make delete dialog descriptive ([4a02ca0](https://github.com/yuriy-vasilyev/structura-core/commit/4a02ca0b4ff015caab573868620ec032fad3923f))


### Bug Fixes

* **channels/x:** drop ungrantable media.write scope so X OAuth can connect ([8994311](https://github.com/yuriy-vasilyev/structura-core/commit/8994311890fdb84477c80dbe21571d64b993cc27))
* **channels:** stop LinkedIn truncation + strip AI-tell em-dashes ([fe3735e](https://github.com/yuriy-vasilyev/structura-core/commit/fe3735ea1bcca9579d2fbb0a943766fac4988517))
* **client/channels:** stop /channels/* redirect from racing the entitlement heartbeat ([14bb0bd](https://github.com/yuriy-vasilyev/structura-core/commit/14bb0bda72cc2ad3a4f70f2b8611d04ae16fa086))
* **client/license:** invalidate entire query cache on connect/disconnect ([7f0d36b](https://github.com/yuriy-vasilyev/structura-core/commit/7f0d36b73647486251ceda874febb7649148fa88))
* **plugin/license:** re-seed default persona after reconnecting to a new workspace ([2186723](https://github.com/yuriy-vasilyev/structura-core/commit/2186723d151994699283a278b519a48e576aa16f))
* **progress:** reflect stock-served progress instead of freezing at 25% ([111ae53](https://github.com/yuriy-vasilyev/structura-core/commit/111ae53b91d49f624917ae1a7c1ff3cd97b07d2c))


### Reverts

* **channels/prompts:** restore original LinkedIn + X social prompts ([153c87c](https://github.com/yuriy-vasilyev/structura-core/commit/153c87ca05d3daad737e2de45af4c87bc8845162))

## [1.62.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.61.1...v1.62.0) (2026-05-24)


### Features

* **admin:** add "Test Telegram" button to the admin dashboard ([173f4f6](https://github.com/yuriy-vasilyev/structura-core/commit/173f4f63de85ec0dfbd2c89c46c67dfb3936aae8))
* **ops:** critical-alert fan-out + stalled-run watchdog; fix campaign-step OOM ([2a6a861](https://github.com/yuriy-vasilyev/structura-core/commit/2a6a8618177be47a239a0cba87b5adeee7158816))


### Bug Fixes

* **functions/email:** use the friendly run-timeline copy in failure emails ([0839108](https://github.com/yuriy-vasilyev/structura-core/commit/0839108f080049e00065e066e9e25bec6d78668d))
* **functions:** raise global HTTP timeout so long generations don't die at 5 min ([24a3a8f](https://github.com/yuriy-vasilyev/structura-core/commit/24a3a8f78fa0ccbd36a34b4cc2b298c27e60f004))
* increase memory ([9c7943a](https://github.com/yuriy-vasilyev/structura-core/commit/9c7943ac1e5ee1cd4c3480435793e99a932c32ca))
* **runs:** correct stalled-run index scope; add image-gen timing metrics ([82d5748](https://github.com/yuriy-vasilyev/structura-core/commit/82d5748eac20ff41893a3839de2e09ecb6814695))

## [1.61.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.61.0...v1.61.1) (2026-05-23)


### Bug Fixes

* **client/types:** Job.persona_id accepts nanoid strings (type hygiene) ([b010e4e](https://github.com/yuriy-vasilyev/structura-core/commit/b010e4e7311fc345911379b88aa74b8b5755fbe9))
* **plugin/campaigns:** preserve nanoid in Campaign_Shape_Transformer::normalize_persona_id ([742c848](https://github.com/yuriy-vasilyev/structura-core/commit/742c848fa0b9d5123600844a6140e8437d2e8cd3))

## [1.61.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.60.1...v1.61.0) (2026-05-23)


### Features

* **personas:** Phase 2b — per-activation binding becomes the canonical author-attribution path ([7905c71](https://github.com/yuriy-vasilyev/structura-core/commit/7905c71ce64127b167efe5c5e56699afbfe69d54))


### Bug Fixes

* **personas/page:** always render the personas grid when the editor is open ([fb2b38c](https://github.com/yuriy-vasilyev/structura-core/commit/fb2b38cfbd71bbf60f1624eeea22e906aa918476))
* **plugin/campaigns,cloud/types:** preserve nanoid string in personaId end-to-end ([c0f7f1d](https://github.com/yuriy-vasilyev/structura-core/commit/c0f7f1db9681b7ebcec1af0007d0ae4a8f361891))
* **plugin:** wp.org Plugin Check security pass — escape output, sanitize input ([ab5192b](https://github.com/yuriy-vasilyev/structura-core/commit/ab5192bb854f820e7388926fd19cf51b2b24829e))
* **scheduler/plugin,types/cloud:** defensive sweep — preserve persona nanoids in remaining (int) casts ([0a5a495](https://github.com/yuriy-vasilyev/structura-core/commit/0a5a495ce9c217e595e984c45c0c11e5c32903c7))
* **scheduler:** write the resolved nanoid persona id on generation docs ([f9abe16](https://github.com/yuriy-vasilyev/structura-core/commit/f9abe1638dedc6ddaef807345d2f44cea7aeb44c))

## [1.60.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.60.0...v1.60.1) (2026-05-22)


### Bug Fixes

* **channels/linkedin:** read post URN from x-restli-id header + diagnostic logging ([d9dcf52](https://github.com/yuriy-vasilyev/structura-core/commit/d9dcf52fa9a1d59cc36b4757fd24e7831ba705a0))
* **plugin/channels:** forward attach_featured_image through the settings REST proxy ([2f85f0a](https://github.com/yuriy-vasilyev/structura-core/commit/2f85f0ab2b539ff4d4ebc48fc93cdba19a66bbf6))

## [1.60.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.59.0...v1.60.0) (2026-05-22)


### Features

* **channels:** per-connection "attach featured image" toggle (default on) ([478ea8c](https://github.com/yuriy-vasilyev/structura-core/commit/478ea8cf15c1c392b52defa8ae547b2e16ba8037))
* **notices,client,plugin:** Phase 3a — wp-admin Notices page ([d5e0117](https://github.com/yuriy-vasilyev/structura-core/commit/d5e01172f18aed778fb10fac504d35d464fafa60))
* **notices,client:** bell + popover, shared utils, translations, indexes ([8ad98a5](https://github.com/yuriy-vasilyev/structura-core/commit/8ad98a5d4c4bc96ed700a4607dcff123a03340e2))
* **notices,plugin,client:** Phase 3b — retire local logs surface ([77318cf](https://github.com/yuriy-vasilyev/structura-core/commit/77318cf1630cac9293f15a604f6089c6a1d150f4))
* **notices,plugin,client:** plugin-health diagnostics button ([fb039f7](https://github.com/yuriy-vasilyev/structura-core/commit/fb039f7f12492986c01a34773b55f23293241f37))
* **notices,web:** portal NoticesBell ([17ac427](https://github.com/yuriy-vasilyev/structura-core/commit/17ac427442617e9fcfc8eb141967c1143acf9954))
* **notices:** Phase 1 — cloud-side Notification Center ([f13bdf1](https://github.com/yuriy-vasilyev/structura-core/commit/f13bdf1aa4b049423eedfcad1566c7a5f1d766cd))
* **notices:** Phase 1.1b — wire remaining audit-gap error branches ([4cc3669](https://github.com/yuriy-vasilyev/structura-core/commit/4cc3669c21d33f9f272ed6e26ce9a744eb53e4a2))
* **notices:** Phase 2 — portal Notice Center page ([5d4b055](https://github.com/yuriy-vasilyev/structura-core/commit/5d4b0554f4a8d7e3dbf24e36560b9592d39aea3c))


### Bug Fixes

* **channels,scheduler:** force OAuth landing on #/channels/connections; stamp link_validation milestone on paid-tier always-on runs ([3693950](https://github.com/yuriy-vasilyev/structura-core/commit/3693950b6128be0c63619ccc4f2d709e77b5f39e))
* hook ordering, webhook timeout, link_validation milestone, timeline rail ([b2804bd](https://github.com/yuriy-vasilyev/structura-core/commit/b2804bd239edca8a53a1c7782091c2e8c8d35e31))
* **notices,web:** portal page theming + missing Firestore index ([25500bc](https://github.com/yuriy-vasilyev/structura-core/commit/25500bc8a2ecda483668f1b6ea246fc3fa7f9759))
* **progress/timeline:** per-tier image-row matrix (None tier-locks both; Free tier-locks body only) ([b3662e4](https://github.com/yuriy-vasilyev/structura-core/commit/b3662e4f683c14ed4b128965baa043411a56ed6c))

## [1.59.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.58.1...v1.59.0) (2026-05-22)


### Features

* **progress:** split image gen into per-slot milestones (featured + body) ([38d4e81](https://github.com/yuriy-vasilyev/structura-core/commit/38d4e81e842d6d2f5768fd551cba9cd03c5b7e3a))


### Bug Fixes

* **ai/gemini:** disable reasoning on schema-constrained calls + breadcrumb the image phase ([788d390](https://github.com/yuriy-vasilyev/structura-core/commit/788d39087c44e0f65086988963741ccc6ccbc65b))
* **generate-post:** block sync generation when no visual preset is bound ([0c064d8](https://github.com/yuriy-vasilyev/structura-core/commit/0c064d8b10ec1f848e9cf2f001ae2ecb6b34e493))
* **progress/timeline:** default to SHOWING the images row unless explicitly disabled ([415bade](https://github.com/yuriy-vasilyev/structura-core/commit/415bade195a1f24dd6474d6ac446166f8fbd4233))
* **scheduler:** bound webhook delivery + inline image gen with wall-clock deadlines ([b74cc8c](https://github.com/yuriy-vasilyev/structura-core/commit/b74cc8c8230467667a4472c1682a666f0211be83))


### Reverts

* **ai/gemini:** drop thinkingBudget: 0 — Gemini 3.x Pro rejects it ([e42d906](https://github.com/yuriy-vasilyev/structura-core/commit/e42d9061ca261c3941ca7a0429b5abf96742a5f9))

## [1.58.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.58.0...v1.58.1) (2026-05-21)


### Bug Fixes

* **channels/dispatcher:** give adapt 30s and degrade timeout to title-only ([aa584c5](https://github.com/yuriy-vasilyev/structura-core/commit/aa584c59a5ed1188212dd6d2d03bbf5ac8f51718))
* **channels:** mount the BYOK + provider master keys on channelsPostPublished ([28bd2fb](https://github.com/yuriy-vasilyev/structura-core/commit/28bd2fb976fe81d9a5eac3102210e6e3b15079d6))
* **progress/timeline:** rescue render when currentStep was filtered out of the visible order ([5dd73dc](https://github.com/yuriy-vasilyev/structura-core/commit/5dd73dc110e7c231a3a26b9c172675df00b0252e))
* **scheduler:** give synthesis 30 min instead of 9, log terminal completion ([452e283](https://github.com/yuriy-vasilyev/structura-core/commit/452e283ed40a0625e978afa24f47c234a8ecb0a2))
* **stock/text-batch:** give blueprint requests 64k output to survive reasoning models ([979fab9](https://github.com/yuriy-vasilyev/structura-core/commit/979fab9020df7a2cc4524fd9712200414b935478))

## [1.58.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.57.0...v1.58.0) (2026-05-21)


### Features

* **analytics:** wire PostHog across www, web, and plugin SPA ([563433e](https://github.com/yuriy-vasilyev/structura-core/commit/563433ef1a4f5ea050159d604066f7ada970ce15))

## [1.57.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.56.0...v1.57.0) (2026-05-21)


### Features

* **analytics:** migrate to GTM + emit sign_up event from new-account flows ([f4be79d](https://github.com/yuriy-vasilyev/structura-core/commit/f4be79d750acaf4fce371871fce8146c2b9745c9))
* **pricing:** hide WP.org column in comparison matrix when plugin unpublished ([840cdfe](https://github.com/yuriy-vasilyev/structura-core/commit/840cdfed5c8506f5a665d5b125f4614fbcdd31c3))
* **www:** gate wp.org plugin surfaces behind WP_PLUGIN_PUBLISHED flag ([1726ab4](https://github.com/yuriy-vasilyev/structura-core/commit/1726ab4e81c4904abfbe5b269cb3cfd4836af08a))


### Bug Fixes

* **www:** mobile-friendly layouts for comparison + agency-volume tables ([1406874](https://github.com/yuriy-vasilyev/structura-core/commit/1406874f428063c3e650069288d4844a1094bc4e))

## [1.56.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.55.0...v1.56.0) (2026-05-21)


### Features

* **channels/x:** attach featured image to tweets via v2 media upload ([54ff326](https://github.com/yuriy-vasilyev/structura-core/commit/54ff326242cad8764a83fdb7dde2f18bc9c444d3))
* **channels:** AI-adapted social commentary (first-person + hashtags) for LinkedIn & X ([0a5288f](https://github.com/yuriy-vasilyev/structura-core/commit/0a5288f56cc7d8acade038f35fd48cd6832e6389))
* **channels:** enrich post-published payload + auto-pick prefixSwap on headless ([9c47734](https://github.com/yuriy-vasilyev/structura-core/commit/9c47734e4e5b6c7c67b3af1a126a4cc8f9b198cd))


### Bug Fixes

* **channels/oauth:** land users on the real SPA route after OAuth, not a phantom admin slug ([198e484](https://github.com/yuriy-vasilyev/structura-core/commit/198e4843c8c68d5e3f4084ad3d0e5c8e1de06d21))
* **channels/oauth:** write OAuth secret doc under the workspace, not the license ([329dd37](https://github.com/yuriy-vasilyev/structura-core/commit/329dd3726e923928ab1b459b3c02507690fe189d))
* **settings:** kill the headless+inherit contradiction end-to-end ([b13ceb0](https://github.com/yuriy-vasilyev/structura-core/commit/b13ceb02e7e2015dcefdbd87e96203efd5d86479))
* **stock:** cron refills only when buffer fully drained (matches consume trigger + spec) ([1c8a2e6](https://github.com/yuriy-vasilyev/structura-core/commit/1c8a2e6890745e8c10a0ece2a84488c977ab4d8c))

## [1.55.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.54.2...v1.55.0) (2026-05-20)


### Features

* **analytics:** wire Google Ads conversion tracking to consent banner ([aa52b7d](https://github.com/yuriy-vasilyev/structura-core/commit/aa52b7d828cc8bd1bbe50489d39d86689aaa946d))
* **channels:** per-connection campaign bindings + every-Nth-post cadence for OAuth ([e86e709](https://github.com/yuriy-vasilyev/structura-core/commit/e86e709a6dfd240423a79c08bc89eda175d8b6a5))


### Bug Fixes

* **plugin:** status badge ([151ea04](https://github.com/yuriy-vasilyev/structura-core/commit/151ea04fdc8eb4adcbe727de3d1bdf56636a9277))

## [1.54.2](https://github.com/yuriy-vasilyev/structura-core/compare/v1.54.1...v1.54.2) (2026-05-20)


### Bug Fixes

* **channels:** forwarder reliability + honest "skipped" chip + de/es/fr i18n ([f2dc492](https://github.com/yuriy-vasilyev/structura-core/commit/f2dc49241d5d0024878e71059bd99432918ba60d))

## [1.54.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.54.0...v1.54.1) (2026-05-20)


### Bug Fixes

* **client/billing:** rebind cycle quota banner to token-based usage view ([cf05a62](https://github.com/yuriy-vasilyev/structura-core/commit/cf05a6249d5a514af3541c9395c9bb41a4df3d99))

## [1.54.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.53.1...v1.54.0) (2026-05-20)


### Features

* **progress:** mark bypassed steps as Skipped and add a Channels tail step ([6928c8e](https://github.com/yuriy-vasilyev/structura-core/commit/6928c8e3fb431df5449801cb9218206b78856cbb))

## [1.53.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.53.0...v1.53.1) (2026-05-20)


### Bug Fixes

* **channels/oauth:** land users on the right wp-admin URL after the OAuth dance ([050a814](https://github.com/yuriy-vasilyev/structura-core/commit/050a814fca6bf145b01a15ce39da15798daa96b2))
* **channels:** stop coercing nanoid campaignIds to int across the stack ([a949926](https://github.com/yuriy-vasilyev/structura-core/commit/a949926ec33b47f5c8c3398207a4a26b168c6358))
* **runs:** stop ephemeral generate-post runs from creating phantom campaign docs ([ce06cd8](https://github.com/yuriy-vasilyev/structura-core/commit/ce06cd8f5f5d0fa2de9e9d863ef8231ae8739219))

## [1.53.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.52.4...v1.53.0) (2026-05-20)


### Features

* **billing:** make per-tier campaign cap a per-license Stripe field ([781292a](https://github.com/yuriy-vasilyev/structura-core/commit/781292aa61d038017fb9c4e557b55715f9dd936b))

## [1.52.4](https://github.com/yuriy-vasilyev/structura-core/compare/v1.52.3...v1.52.4) (2026-05-19)


### Bug Fixes

* **billing/catalog-sync:** tolerate restricted keys without meter-read permission ([db08f10](https://github.com/yuriy-vasilyev/structura-core/commit/db08f1058ea1acb98c9c1e3dfddb77522a510f3b))

## [1.52.3](https://github.com/yuriy-vasilyev/structura-core/compare/v1.52.2...v1.52.3) (2026-05-19)


### Bug Fixes

* **client:** stabilize single-post run page and refine timeline chips ([fda3d37](https://github.com/yuriy-vasilyev/structura-core/commit/fda3d379f1a6b01600c014d497410038971cb9e5))
* **subscriptions:** cancel standalone Channels item when plan now bundles it ([ece4484](https://github.com/yuriy-vasilyev/structura-core/commit/ece44840ae09cbe7ef75a89a1befb1a4100b892f))

## [1.52.2](https://github.com/yuriy-vasilyev/structura-core/compare/v1.52.1...v1.52.2) (2026-05-19)


### Bug Fixes

* **billing:** rollup cron resolves planId/maxSites from the bound License ([ffe20ea](https://github.com/yuriy-vasilyev/structura-core/commit/ffe20eab5737621ef00f4596804689358d73457f))
* **client,functions:** audience-aware plan labels in the wp-admin SPA ([da315aa](https://github.com/yuriy-vasilyev/structura-core/commit/da315aab65fcdc4734be71df163cff7206be5521))
* **i18n:** wire audienceMissingOrInvalid in the contracts source ([57898a2](https://github.com/yuriy-vasilyev/structura-core/commit/57898a22735170d629234be12a9b4c87744c412a))
* **subscriptions:** require explicit audience on Stripe plan products ([a700664](https://github.com/yuriy-vasilyev/structura-core/commit/a70066418a413795caef22b0e629be3fea0c5120))
* **web/billing:** single Stripe-portal funnel + audience-aware plan label ([210622b](https://github.com/yuriy-vasilyev/structura-core/commit/210622b3d850e24d92abc272905af6d44a823f46))

## [1.52.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.52.0...v1.52.1) (2026-05-18)


### Bug Fixes

* **channels,billing:** OAuth redirect_uri + launch chrome + channels load race ([#97](https://github.com/yuriy-vasilyev/structura-core/issues/97)) ([ee4955b](https://github.com/yuriy-vasilyev/structura-core/commit/ee4955b27ea7cdb72f2ce795574356235a0fff1d))

## [1.52.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.51.1...v1.52.0) (2026-05-18)


### Features

* **client:** use website favicons on workspace-keys provider chips ([d957ed1](https://github.com/yuriy-vasilyev/structura-core/commit/d957ed151ac912689ed473cb11d1878e131f9314))

## [1.51.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.51.0...v1.51.1) (2026-05-18)


### Bug Fixes

* **client:** per-row binding state on workspace keys + brand chips + reorder ([3e191f7](https://github.com/yuriy-vasilyev/structura-core/commit/3e191f7717d54269c73cf60070ec81e47d85d089))

## [1.51.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.50.1...v1.51.0) (2026-05-17)


### Features

* **plugin,client:** cleanup + warn on disconnect, pin cross-license switch ([2364dcd](https://github.com/yuriy-vasilyev/structura-core/commit/2364dcd09c4845c565a830acd71437b19c904ddf))


### Bug Fixes

* recent-posts widget cross-campaign leak + empty textModel synthesis crash ([6656c51](https://github.com/yuriy-vasilyev/structura-core/commit/6656c515c4901cf953867cfbec181e71f9c11694))

## [1.50.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.50.0...v1.50.1) (2026-05-17)


### Bug Fixes

* **client:** drop the duplicate sync spinner on the Posts tab toolbar ([eceb189](https://github.com/yuriy-vasilyev/structura-core/commit/eceb189849131f3f3c917888c2682b1ac6a256cd))

## [1.50.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.49.9...v1.50.0) (2026-05-17)


### Features

* **channels:** gate save+dispatch on entitlements; fix client agency conflation ([94ef6e6](https://github.com/yuriy-vasilyev/structura-core/commit/94ef6e681396f760641288dec822f81b86a0f827))

## [1.49.9](https://github.com/yuriy-vasilyev/structura-core/compare/v1.49.8...v1.49.9) (2026-05-17)


### Bug Fixes

* **client,plugin:** drop fabricated "up to 5,000 words" claim ([9e1dccd](https://github.com/yuriy-vasilyev/structura-core/commit/9e1dccde15541d22c8f4a41cafe94ea18c0f43d0))

## [1.49.8](https://github.com/yuriy-vasilyev/structura-core/compare/v1.49.7...v1.49.8) (2026-05-17)


### Bug Fixes

* **client:** move 500-word help text below the post-length grid ([68a8b5d](https://github.com/yuriy-vasilyev/structura-core/commit/68a8b5d8a1ec76b38d531ec3870fdb813ad0a9ea))

## [1.49.7](https://github.com/yuriy-vasilyev/structura-core/compare/v1.49.6...v1.49.7) (2026-05-17)


### Bug Fixes

* **ai:** downgrade non-active licenses to anonymous tier so None→Free→None keeps working ([d9d5a0b](https://github.com/yuriy-vasilyev/structura-core/commit/d9d5a0b34d0ecb190e60f486049d93cc7c0cc12e))

## [1.49.6](https://github.com/yuriy-vasilyev/structura-core/compare/v1.49.5...v1.49.6) (2026-05-17)


### Bug Fixes

* **campaigns:** help-text under 500-word cap + honest engine-ready gate for None/Free ([1e7f492](https://github.com/yuriy-vasilyev/structura-core/commit/1e7f4928170835ef8d27f553dec3a56c2159f53c))

## [1.49.5](https://github.com/yuriy-vasilyev/structura-core/compare/v1.49.4...v1.49.5) (2026-05-17)


### Bug Fixes

* **campaigns:** cap postLength input + form default at 500 for None tier (matches Free) ([65895f1](https://github.com/yuriy-vasilyev/structura-core/commit/65895f10c297fad027db108438760107de2deb0b))

## [1.49.4](https://github.com/yuriy-vasilyev/structura-core/compare/v1.49.3...v1.49.4) (2026-05-16)


### Bug Fixes

* **scheduler:** swap persona block to picked persona's fields for random campaigns ([044cf8f](https://github.com/yuriy-vasilyev/structura-core/commit/044cf8fbe5c325c76e27a33fdf8dd277e2e6731c))

## [1.49.3](https://github.com/yuriy-vasilyev/structura-core/compare/v1.49.2...v1.49.3) (2026-05-16)


### Bug Fixes

* **scheduler:** resolve random persona to a workspace persona so post_author lands correctly ([84d5a6c](https://github.com/yuriy-vasilyev/structura-core/commit/84d5a6cfbc8519d93d693447f99a809655cc6806))

## [1.49.2](https://github.com/yuriy-vasilyev/structura-core/compare/v1.49.1...v1.49.2) (2026-05-16)


### Bug Fixes

* **progress:** localise milestone subtext + filter Free-tier no-op steps from timeline ([7c0ebd2](https://github.com/yuriy-vasilyev/structura-core/commit/7c0ebd2052cb6a83a3f75b9f10d89b892e522281))

## [1.49.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.49.0...v1.49.1) (2026-05-16)


### Bug Fixes

* atomic cloud-side bump of campaign.postsPublished to close the read-then-write race ([3db09d9](https://github.com/yuriy-vasilyev/structura-core/commit/3db09d9ca3327ad16093c4eaebb5a1cc58c434ac))

## [1.49.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.48.0...v1.49.0) (2026-05-16)


### Features

* **ai:** cap Free post length at 500 + ban outbound links on Free/None tier ([619237f](https://github.com/yuriy-vasilyev/structura-core/commit/619237f18785d9d9fa617541713154e73a1295d5))
* **plugin:** hard-strip external `<a>` tags for non-Pro tiers in Block_Serializer ([476873e](https://github.com/yuriy-vasilyev/structura-core/commit/476873ec7379f66c02cb560faa5c77ae9b5ecb1b))

## [1.48.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.47.0...v1.48.0) (2026-05-15)


### Features

* **ai:** strip always-on SEO rules for anonymous (None) tier ([121070f](https://github.com/yuriy-vasilyev/structura-core/commit/121070fad925c8d9ee739d51eaa10302a485b321))

## [1.47.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.46.0...v1.47.0) (2026-05-15)


### Features

* **campaigns:** make pre-generation Pro-only on Free + fix client POT extractor ([9300efd](https://github.com/yuriy-vasilyev/structura-core/commit/9300efdf3212c5fd8f7f65701f3737258949c5bc))
* **pricing:** point Free upgrade CTA at portal + sync feature lists across www/web/portal ([49b9a10](https://github.com/yuriy-vasilyev/structura-core/commit/49b9a102d7c884460d95cd7a8f1e793b988c2a76))


### Bug Fixes

* **client,web:** polish free-tier keyword/authority teasers and route unlock intents to /billing ([a0c3c5c](https://github.com/yuriy-vasilyev/structura-core/commit/a0c3c5c0ae4ce24ef4b8878c887259f341d6a949))
* close Free-tier value leaks in meta prompts, internal-link injection, and image format ([b1df889](https://github.com/yuriy-vasilyev/structura-core/commit/b1df889deb89274ac2742ad8fbb1924fe0554270))
* drop pregen rollout banner, retire cadence-sync flag gate, hide Free-tier cap warning ([8a23995](https://github.com/yuriy-vasilyev/structura-core/commit/8a23995d0240bc732ce6ebb2d03cfba288192938))
* **plugin:** mint progress runId for Free tier so Run-now lights up the strip without reload ([d92c426](https://github.com/yuriy-vasilyev/structura-core/commit/d92c4267c53b5926321bb2a218a19afbc892e58e))

## [1.46.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.45.0...v1.46.0) (2026-05-14)


### Features

* **ui,web:** top-bar portal shell + workspace-first navigation ([cb9e720](https://github.com/yuriy-vasilyev/structura-core/commit/cb9e7203efba209e730833b76ad05eeeda024cab))


### Bug Fixes

* **ui,web:** portal shell polish + Select dropdown + role-based nav ([332d943](https://github.com/yuriy-vasilyev/structura-core/commit/332d9439519a519b4ba6b89c890132b232f9374e))
* **web:** hide Members tab + sidebar link for editors and viewers ([b696225](https://github.com/yuriy-vasilyev/structura-core/commit/b6962250542f5ee5752ba4b3e353156fc89b8325))

## [1.45.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.44.1...v1.45.0) (2026-05-12)


### Features

* **client,web:** context-aware upgrade flow with wizard resume links ([60b4fd3](https://github.com/yuriy-vasilyev/structura-core/commit/60b4fd3771345df9def514840032b67525b52e6e))

## [1.44.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.44.0...v1.44.1) (2026-05-12)


### Bug Fixes

* **billing,functions,client:** meter stock-served runs + retire usage_logs ([b14a543](https://github.com/yuriy-vasilyev/structura-core/commit/b14a543b70ee05c7692e8cbee63c02f76fc14868))

## [1.44.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.43.1...v1.44.0) (2026-05-11)


### Features

* **i18n:** translate the 643 newly-extracted SPA strings (de/es/fr) ([9d9d6ea](https://github.com/yuriy-vasilyev/structura-core/commit/9d9d6ea8ad2ef3958064392aa334a60260c740e6))


### Bug Fixes

* **client:** de-block none-tier campaigns teaser, lead with Generate Post ([9eee7a9](https://github.com/yuriy-vasilyev/structura-core/commit/9eee7a9a0b9e83f84f92446e0a10b8fbe5d6a4f1))
* **client:** make AppErrorBoundary's nav-reset opt-in ([95238dc](https://github.com/yuriy-vasilyev/structura-core/commit/95238dce00203e3d898a1be99c06af1a26658118))
* **i18n:** extract SPA strings + regen .pot via TS-aware scanner ([0728266](https://github.com/yuriy-vasilyev/structura-core/commit/07282665c38311b96813c740ad87a17c90e967d2))

## [1.43.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.43.0...v1.43.1) (2026-05-11)


### Bug Fixes

* **client:** break Visuals render-loop, reset error boundary on nav ([2096d77](https://github.com/yuriy-vasilyev/structura-core/commit/2096d77e247a61d596cbcb11ee7a0954685221b8))
* **functions:** wire recent titles into stock pre-gen dedup context ([9fd10cb](https://github.com/yuriy-vasilyev/structura-core/commit/9fd10cb3baa0822fa331fefa4572a7a4dab72d14))
* **plugin:** log skipped campaigns in cadence sync ([b8decfc](https://github.com/yuriy-vasilyev/structura-core/commit/b8decfc05335d41fac870beefabe5a84ba95d3a0))

## [1.43.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.42.0...v1.43.0) (2026-05-10)


### Features

* **client:** useLicense().hasWorkspace + flip 7 hook gates + AI Engine cap restrictions (Phase 1.8 PR7b) ([ff93817](https://github.com/yuriy-vasilyev/structura-core/commit/ff9381701634c289ffc9658dfe93ad9d5f37113c))
* **functions:** bootstrapAnonymousInstall endpoint + anonymous-bootstrap rate limiter (Phase 1.8 PR6) ([e89ba78](https://github.com/yuriy-vasilyev/structura-core/commit/e89ba78251cf0bceb2e7cff0cec776221b179729))
* **functions:** flip free + none tiers to BYOK-only; flatten anti-abuse cap to 100/site/mo ([d9bd190](https://github.com/yuriy-vasilyev/structura-core/commit/d9bd190cbc7046ab43b70d30a0806ced0f39c375))
* **functions:** Phase 1.8 foundation — Workspace + AnonymousInstall types, anonymous-aware bearer middleware, endpoint classification ([93b1f95](https://github.com/yuriy-vasilyev/structura-core/commit/93b1f9516f7d22804f0afbe117447589504885ca))
* **plugin,client,functions:** suppress fresh-install banners and add "Forget this site" flow ([d650c49](https://github.com/yuriy-vasilyev/structura-core/commit/d650c49cc272582f140683e429f1d20c8075bb70))
* **plugin,functions:** anonymous-install bootstrap + claim flow + structuraConfig surface (Phase 1.8 PR7a) ([8f67d8b](https://github.com/yuriy-vasilyev/structura-core/commit/8f67d8b115ee3e725f16cbf790d5a5506237c2e8))


### Bug Fixes

* **client:** gate workspace-keys + wp-users queries on license; render unlicensed teaser on Visuals ([55634bf](https://github.com/yuriy-vasilyev/structura-core/commit/55634bf41b20b7fe76b40eeb512242794af80d3c))
* pre-publish polish — unblock None tier end-to-end, harden error/block paths, dashboard cleanup ([5feebfe](https://github.com/yuriy-vasilyev/structura-core/commit/5feebfe8a8f8743e9450ed15158be7bd1112e666))
* **www:** hide HeroEyebrow rule on mobile so the label aligns left ([e0b7366](https://github.com/yuriy-vasilyev/structura-core/commit/e0b7366bd4a1f882cf21565343bcaa4e4b0b116d))

## [1.42.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.41.0...v1.42.0) (2026-05-09)


### Features

* **ui,web:** add CodeBlock component and use it for the activation key ([62c28f0](https://github.com/yuriy-vasilyev/structura-core/commit/62c28f049d8237e388079b61b2c372660cb699d5))

## [1.41.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.40.1...v1.41.0) (2026-05-09)


### Features

* per-activation scoping for visual styles, personas, and AI keys ([7e50d40](https://github.com/yuriy-vasilyev/structura-core/commit/7e50d40da618c199b7b3995520e6fcb43f306d7d))
* **web,functions:** portal viewers for personas + visual presets, plus binding tests ([4e5b5c8](https://github.com/yuriy-vasilyev/structura-core/commit/4e5b5c818dad67f1d88be6efa5501d4f2ce6c99f))


### Bug Fixes

* **client:** type the had_prior_activation bootstrap flag on StructuraConfig ([3229ecd](https://github.com/yuriy-vasilyev/structura-core/commit/3229ecdb149687cb769f86c0f2041cce3ccbb6ce))

## [1.40.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.40.0...v1.40.1) (2026-05-09)


### Bug Fixes

* **client:** gate Channels routes by per-site seat assignment ([74fc5ed](https://github.com/yuriy-vasilyev/structura-core/commit/74fc5ed59cb69b184d7c8fb2f005c4c2326bff6b))
* **functions:** stock pre-gen now uses sync prompt builder for full SEO parity ([9c4f951](https://github.com/yuriy-vasilyev/structura-core/commit/9c4f951266f568f33f7e458733fe62c2591bab02))
* **plugin:** meta-box image regen — reset apply button + body-image new_url ([23548e2](https://github.com/yuriy-vasilyev/structura-core/commit/23548e2ade9f77d932f4f2edc70605376a142bac))

## [1.40.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.39.1...v1.40.0) (2026-05-08)


### Features

* **functions:** stock pre-gen failure insurance — timeout, daily cap, rich incidents ([6bcff97](https://github.com/yuriy-vasilyev/structura-core/commit/6bcff97d2f21dc3719165ac8c8d721937f52dc4e))


### Bug Fixes

* **functions:** re-sign stock-image URLs at consume time, not write time ([391f305](https://github.com/yuriy-vasilyev/structura-core/commit/391f30565112deddc087a7236f90bc0341e36564))
* **plugin:** meta-box image regen — trim loaders, support body-from-placeholder ([50d1dc9](https://github.com/yuriy-vasilyev/structura-core/commit/50d1dc9eb9c5a252b4e2889996168907b976938d))
* **plugin:** persist pregeneration_enabled toggle through the validator ([0c5bd4f](https://github.com/yuriy-vasilyev/structura-core/commit/0c5bd4fc985c048312b0c5098a783b26ff2372e6))


### Performance Improvements

* **client:** swap AppLoader → PageLoader on route loaders, deduplicate AI Engine settings query ([aa4ef32](https://github.com/yuriy-vasilyev/structura-core/commit/aa4ef32401d62bae876d6b6ecef94642aacb476c))

## [1.39.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.39.0...v1.39.1) (2026-05-08)


### Performance Improvements

* **plugin,client:** bootstrap settings on page load to skip first-paint roundtrip ([5cc10f9](https://github.com/yuriy-vasilyev/structura-core/commit/5cc10f9f1bd3f3faff71a61c9383a1b64b7f689c))

## [1.39.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.38.0...v1.39.0) (2026-05-08)


### Features

* **client:** persist new-campaign draft across navigation ([cce0b1b](https://github.com/yuriy-vasilyev/structura-core/commit/cce0b1b79bf8e6347bf3eae80dde3dcfd97dee41))
* freeze plugin → cloud surface for wp.org submission ([9ca6c4b](https://github.com/yuriy-vasilyev/structura-core/commit/9ca6c4be5aae677a1029d44170c0af0397273c8a))
* **functions:** Phase 4.5 follow-up — auto-attach metered overage item on subscribe ([301375b](https://github.com/yuriy-vasilyev/structura-core/commit/301375b0f708fcf04f96c847702f7acf1a4a4c43))
* **functions:** provider fallback for interview/suggestion calls ([75e4f72](https://github.com/yuriy-vasilyev/structura-core/commit/75e4f7299155660af3bbf35315b0e97d9d879686))
* **plugin,client:** humanize provider error toasts in suggestion flow ([cd3be77](https://github.com/yuriy-vasilyev/structura-core/commit/cd3be77f3f86bcbd1fce10118c272233a645eff0))


### Bug Fixes

* **ci:** wporg-zip workflow — replace multi-line sed with head/tail splice ([e2dd5b3](https://github.com/yuriy-vasilyev/structura-core/commit/e2dd5b3240d7a182c9623094da6a9f306cfd00c6))
* **client:** preselect recommended model in provider setup wizard ([cf2e7be](https://github.com/yuriy-vasilyev/structura-core/commit/cf2e7be679e0fbc45b90e8c69341ac7501fae690))
* **client:** wrap multi-pick answers as chips in interview review ([d4108f1](https://github.com/yuriy-vasilyev/structura-core/commit/d4108f1064e140341662f8378a4478958a5fa2b1))
* **firestore:** add COLLECTION_GROUP index override for members.userId ([3ebae4e](https://github.com/yuriy-vasilyev/structura-core/commit/3ebae4e5ffc6118c8cb74fb24b32d8b9d8036b22))
* **functions:** route add-on assignment funnel reads/writes through workspaces (Phase 3.3 leftover) ([1f5a809](https://github.com/yuriy-vasilyev/structura-core/commit/1f5a809bb14fce3f705891f933d2e84a7f0eee0b))
* **functions:** route stock refill through canonical resolver to support BYOK ([5feaa6a](https://github.com/yuriy-vasilyev/structura-core/commit/5feaa6af6a8e0c62aafdb0fbbca247fe69901018))
* **plugin:** bump cloud-discovery cURL timeouts from 120s to 240s ([e5e0a00](https://github.com/yuriy-vasilyev/structura-core/commit/e5e0a0080b196eab8118d4cd1f2ff8e091f11318))

## [1.38.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.37.0...v1.38.0) (2026-05-07)


### Features

* **functions,web:** Phase 4.4c — portal cycle-usage widget ([4d74a13](https://github.com/yuriy-vasilyev/structura-core/commit/4d74a13a76f478512bed2def6e58a65a50a48640))

## [1.37.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.36.0...v1.37.0) (2026-05-07)


### Features

* **functions,web:** Phase 3.7 Pass C — workspace rename ([8c656a9](https://github.com/yuriy-vasilyev/structura-core/commit/8c656a96a8680497dd3b5db44711a597d8890b4a))
* **functions,web:** Phase 3.7 Pass D — workspace ownership transfer ([2dd2cf2](https://github.com/yuriy-vasilyev/structura-core/commit/2dd2cf254317402b807eeb05591faa1b0ffe4821))
* **functions,web:** Phase 3.7 Pass E — multi-workspace switcher ([6656fbe](https://github.com/yuriy-vasilyev/structura-core/commit/6656fbe8e8d96b82f2e1d32810ab9adc5ee61214))

## [1.36.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.35.0...v1.36.0) (2026-05-07)


### Features

* **client,functions:** Phase 3.7 — wp-admin "this site is part of workspace X" ([c14509e](https://github.com/yuriy-vasilyev/structura-core/commit/c14509ed05ce50b8124f53fbaf503c46eccb0d38))
* **client,plugin:** cycle-quota site-wide banner + delete legacy Campaign_Repository ([359f94e](https://github.com/yuriy-vasilyev/structura-core/commit/359f94e7ea431aeb62f69ead0f5c6c17000f718c))
* **client:** Phase 4.4b — wp-admin Cycle Usage widget ([86e1845](https://github.com/yuriy-vasilyev/structura-core/commit/86e18459f0e885c8c66f91f7fc8149a08f6b9a91))
* **functions:** Phase 3.4 — hoist personas to workspace root ([4dcc0f2](https://github.com/yuriy-vasilyev/structura-core/commit/4dcc0f2203d55ef439aa6abc93e867724908eeb9))
* **functions:** Phase 3.4 — hoist visualSettings to workspace root ([2134bfa](https://github.com/yuriy-vasilyev/structura-core/commit/2134bfaff968213f6d78b5868f1e29a19373d12d))
* **functions:** Phase 4.1 — per-tier × audience quota config ([096c18a](https://github.com/yuriy-vasilyev/structura-core/commit/096c18adb039c6acbc473b2721a453ca146e1c28))
* **functions:** Phase 4.2 — per-generation usage metering + nightly rollup ([4405e39](https://github.com/yuriy-vasilyev/structura-core/commit/4405e3924982edf1d43c4c7554269c8edca3bab4))
* **functions:** Phase 4.3 — Stripe metered overage reporting cron ([a0f3111](https://github.com/yuriy-vasilyev/structura-core/commit/a0f3111abe8d4bd7f81027b5fbda00cb19ebac09))
* **functions:** Phase 4.3a — metered prices + Stripe Meters in the catalog ([f26a959](https://github.com/yuriy-vasilyev/structura-core/commit/f26a9591a57632eede6fa917952ab96d8f90e67d))
* **functions:** Phase 4.4a — cycle usage view + getUsageAnalytics extension ([963aa1a](https://github.com/yuriy-vasilyev/structura-core/commit/963aa1a2ea1f31cd9d84b3bcd102fbea09ec10a9))
* **plugin,functions:** Phase 1.0h — retire AS image chain across both surfaces ([7e8bef5](https://github.com/yuriy-vasilyev/structura-core/commit/7e8bef5dd8934b677dfd9bf9b67abf8b051c3d8d))


### Bug Fixes

* **ai:** honour resolver's provider override in executeCloudSuggestion ([2497270](https://github.com/yuriy-vasilyev/structura-core/commit/24972703ca8cbb9d3cb9bf20c4f063ab987d8734))
* **functions:** route campaigns store through workspaces path ([56b0b35](https://github.com/yuriy-vasilyev/structura-core/commit/56b0b35cef50c5f1c9ab97a52123748b016908d3))

## [1.35.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.34.1...v1.35.0) (2026-05-07)


### Features

* **plugin,functions:** cloud-only generation Phases 3-6 — retire BYOK adapters ([7e30fd7](https://github.com/yuriy-vasilyev/structura-core/commit/7e30fd745c3316814cbf329cba3d09e26390e104))

## [1.34.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.34.0...v1.34.1) (2026-05-07)


### Bug Fixes

* **plugin:** regen-image modal — multi-provider picker, 60s timeout, prompt prefill ([03646dd](https://github.com/yuriy-vasilyev/structura-core/commit/03646ddf9337b3951e6c0b074375520d4d3c0060))
* **www:** xerx url ([9473127](https://github.com/yuriy-vasilyev/structura-core/commit/947312711ea749144cdef05e1be4c027eda29a64))

## [1.34.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.33.3...v1.34.0) (2026-05-06)


### Features

* **www:** add "Why not Koala/SEOWriting AI?" sibling comparison on home ([de1dcac](https://github.com/yuriy-vasilyev/structura-core/commit/de1dcac6808ef34943fdc9809c7ebf993fcf26b6))
* **www:** expose the "20+ point SEO protocol" as a real disclosure list ([4c2f2da](https://github.com/yuriy-vasilyev/structura-core/commit/4c2f2daaf6a67349150f98a5af6914394b7c7254))
* **www:** GDPR/EU trust strip in footer ([7d09198](https://github.com/yuriy-vasilyev/structura-core/commit/7d09198c02f79716f589a9112a11945f2e67e220))
* **www:** outcome-framed pricing CTAs + box SERP claim against autobloggers ([8d5dd32](https://github.com/yuriy-vasilyev/structura-core/commit/8d5dd3284a53adc0f0718227addabceb8929936b))
* **www:** sticky mobile CTA on pricing page ([05720e2](https://github.com/yuriy-vasilyev/structura-core/commit/05720e20df238745dbe424456e3f4ebd249fc4f0))


### Bug Fixes

* **ai:** preserve user-picked orientation for OpenAI image gen ([6ee290e](https://github.com/yuriy-vasilyev/structura-core/commit/6ee290ed652f8b45e89d1ea6124c38c910657c87))
* **functions:** wipe lib/ on prebuild to prevent stale orphan re-deploys ([f7e1f5e](https://github.com/yuriy-vasilyev/structura-core/commit/f7e1f5ef1b27c15d0e50fffd41b11fd52d537b42))
* **www:** remove brand duplication in &lt;title&gt; tags + noindex thin blog archives ([74f5e3d](https://github.com/yuriy-vasilyev/structura-core/commit/74f5e3d684641287819860e60d71988b33cb9881))
* **www:** sitemap hygiene + meta description audit across 4 locales ([82a2fcc](https://github.com/yuriy-vasilyev/structura-core/commit/82a2fcc667437a4279da1267e9d198c235d6a0e4))

## [1.33.3](https://github.com/yuriy-vasilyev/structura-core/compare/v1.33.2...v1.33.3) (2026-05-06)


### Bug Fixes

* **functions:** make keyword + authority discovery work end-to-end ([c0d06fc](https://github.com/yuriy-vasilyev/structura-core/commit/c0d06fca6c7c5843325d4c3139379caff48b12ac))

## [1.33.2](https://github.com/yuriy-vasilyev/structura-core/compare/v1.33.1...v1.33.2) (2026-05-06)


### Bug Fixes

* **functions:** mount BYOK_MASTER_KEY on every function that resolves BYOK keys ([7f9b3d0](https://github.com/yuriy-vasilyev/structura-core/commit/7f9b3d095157c7a5ea0797778a16cf9aca3045b8))

## [1.33.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.33.0...v1.33.1) (2026-05-06)


### Bug Fixes

* **client:** unblock provider setup wizard's Configure step on cloud-only heartbeat ([2041c3c](https://github.com/yuriy-vasilyev/structura-core/commit/2041c3c04d07109bcca7b0b630abd13185c107cc))
* **tests,i18n:** unblock CI workflows on main ([b576e0e](https://github.com/yuriy-vasilyev/structura-core/commit/b576e0ef96790506cc173a03762f99445d94c6a6))

## [1.33.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.32.0...v1.33.0) (2026-05-06)


### Features

* **functions,plugin:** forward AI key save through cloud, retire wp_options storage ([f63f4cd](https://github.com/yuriy-vasilyev/structura-core/commit/f63f4cd4feb3c34359838a7ce0a0c45e5b8284fb))
* **functions,web:** add workspace credential library endpoints + portal page ([0302c9b](https://github.com/yuriy-vasilyev/structura-core/commit/0302c9ba801f3bd1b9979c12eff7b273adf1edd8))
* **functions:** activation-scoped credential bindings + resolver rewrite ([a7dd11e](https://github.com/yuriy-vasilyev/structura-core/commit/a7dd11eabc0875fd67a42cb0e7f1ba23cccb8c8e))

## [1.32.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.31.0...v1.32.0) (2026-05-05)


### Features

* **personas,licenses,client:** auto-seed default "House voice" persona on activation ([0f9163b](https://github.com/yuriy-vasilyev/structura-core/commit/0f9163b140f230e02451e2046ceadea08d46e516))


### Bug Fixes

* **client:** seed Single Post form from connected provider, not Gemini ([bcad11a](https://github.com/yuriy-vasilyev/structura-core/commit/bcad11aba3895e33d735ecae895595a9e157d041))
* **personas,plugin,client:** require author on save and stop ghost upserts ([6fd1bc7](https://github.com/yuriy-vasilyev/structura-core/commit/6fd1bc795343a7812033f98211ea77dc85e08a93))

## [1.31.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.30.0...v1.31.0) (2026-05-05)


### Features

* **ai,billing:** cloud-only-gen Phase 2 — resolver + rate limit ([48e5c78](https://github.com/yuriy-vasilyev/structura-core/commit/48e5c78ac7662abefd587f7081a4ae486b4d151c))
* **ai:** cloud-only-gen Phase 2 — wire resolver into text engine ([523de4b](https://github.com/yuriy-vasilyev/structura-core/commit/523de4bb0afca7b3e8777e6d5274b032d2375a20))
* **plugin,licenses:** cloud-only-gen Phase 3 — gated plugin cutover ([e639dec](https://github.com/yuriy-vasilyev/structura-core/commit/e639dec0f15a7eec5d0fd2dc70a2673292e7fabc))
* **scheduler:** cloud-only-gen Phase 2 — image path + dispatcher catch ([194c5b0](https://github.com/yuriy-vasilyev/structura-core/commit/194c5b0b961cdebd18d79688b3cb4b539b876abc))
* **workspaces:** cloud-only-gen Phase 1 — workspace credentials store ([a5e2e1e](https://github.com/yuriy-vasilyev/structura-core/commit/a5e2e1e33b4a77aecaa4901282b7ebae3c273c74))


### Bug Fixes

* **licenses,plugin,client:** activation cycle no longer self-deactivates ([5ad36d1](https://github.com/yuriy-vasilyev/structura-core/commit/5ad36d1f9367285ea3a71e86e119f7dace8a05c2))

## [1.30.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.29.0...v1.30.0) (2026-05-05)


### Features

* **emails,spec:** tier+audience in over-cap warning + retire pricing-v2 §4.5 ([1703691](https://github.com/yuriy-vasilyev/structura-core/commit/17036918927769627d3b21f2ec2206def34513b8))
* **workspaces,channels,plugin:** Phase 3.3 — UUID activation + surface discriminator ([2273539](https://github.com/yuriy-vasilyev/structura-core/commit/22735391b06c6de022a0d517458309df7d9a931a))
* **workspaces,permissions:** Phase 3.1 + 3.2 — workspace tenant root + RBAC ([644ed56](https://github.com/yuriy-vasilyev/structura-core/commit/644ed56ccd2663b274916cf2d431f96aa0c9e0ab))
* **workspaces,plugin:** Phase 3.5 — API tokens + Bearer auth middleware ([8b32563](https://github.com/yuriy-vasilyev/structura-core/commit/8b325636a2418f6b011867e3b73ebae3549dfb23))
* **workspaces,web:** Phase 3.7 Pass A — member role + remove ([a900388](https://github.com/yuriy-vasilyev/structura-core/commit/a900388e23c2d7b669842db807768c49ce9af12e))
* **workspaces,web:** Phase 3.7 Pass B — invite-by-email + acceptance route ([4e8f958](https://github.com/yuriy-vasilyev/structura-core/commit/4e8f958f104d31b331609870edd55e4609793aa8))
* **workspaces,web:** Phase 3.7 walking skeleton — workspace settings page ([8c772f9](https://github.com/yuriy-vasilyev/structura-core/commit/8c772f9273fe66b3ddbc2381c0bcb1b90813dd4b))
* **www:** improve mobile menu ([bece2b8](https://github.com/yuriy-vasilyev/structura-core/commit/bece2b878c42cc5df508a28917f02fefd41556b6))
* **www:** refine pricing toggle layout + recommend BYOK for agencies ([ad9b400](https://github.com/yuriy-vasilyev/structura-core/commit/ad9b400359d08c3df0585aa54fb92ed1def9e507))

## [1.29.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.28.1...v1.29.0) (2026-05-04)


### Features

* **catalog,web,i18n:** lock Cloud Pro Individual + BYOK Agency + Cloud Agency prices ([3293f07](https://github.com/yuriy-vasilyev/structura-core/commit/3293f078957badf443ffd3d2205761f3cb140ade))
* **functions,client,plugin:** per-tier campaign-count cap (BYOK abuse prevention) ([16694c5](https://github.com/yuriy-vasilyev/structura-core/commit/16694c5aa82bbe79863418d580789bb439be4dd3))
* **functions,client:** tier policy — auto-pause on "none" + per-tier provider gating ([6bd81fc](https://github.com/yuriy-vasilyev/structura-core/commit/6bd81fcb8df49657c6c5947ae3c47b16d720d12b))
* **functions:** Phase 1.0j — UUID-keyed activations + read-path cutover ([afe6879](https://github.com/yuriy-vasilyev/structura-core/commit/afe68793d980d8879937c031abc2efb0e8357f8c))
* **plugin:** add model switch when regenerating images ([25dbe29](https://github.com/yuriy-vasilyev/structura-core/commit/25dbe29532a6526e94520d42600d5b564fa78657))
* **web,www,packages/ui,i18n:** two-grid pricing UI + JustThePluginSection 2-column refactor ([0733c8b](https://github.com/yuriy-vasilyev/structura-core/commit/0733c8b726883be33afb98bf09039a80e6e7ae43))


### Bug Fixes

* **catalog:** match products by (plan_id, audience), not plan_id alone ([a686a0a](https://github.com/yuriy-vasilyev/structura-core/commit/a686a0a457da82f76d4ed6fe89c8b9af3340ca4d))
* **client:** silence "Active license required" toast storm on disconnected installs ([350f497](https://github.com/yuriy-vasilyev/structura-core/commit/350f4970dc40191e165d2ee260e87068f21579e0))
* **plugin:** persist authority + keyword bank to cloud campaigns ([ab632f5](https://github.com/yuriy-vasilyev/structura-core/commit/ab632f5597d2553de6dd74343839cb0d793b710b))

## [1.28.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.28.0...v1.28.1) (2026-05-02)


### Bug Fixes

* **plugin:** body image regeneration ([889f90c](https://github.com/yuriy-vasilyev/structura-core/commit/889f90ca504332900b7b62802782e3861f59736e))

## [1.28.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.27.4...v1.28.0) (2026-05-02)


### Features

* **plugin:** add body image regeneration feature ([8acfd8e](https://github.com/yuriy-vasilyev/structura-core/commit/8acfd8e7695a2f51fff16ccf89610a429b53f5e0))


### Bug Fixes

* **plugin:** single post gen ([3cf67d5](https://github.com/yuriy-vasilyev/structura-core/commit/3cf67d523dad199b5bfa1f705c0b9edda903973a))
* update indexes ([3fed3a5](https://github.com/yuriy-vasilyev/structura-core/commit/3fed3a51d29044aec6c75396bb33a60d1590c89d))

## [1.27.4](https://github.com/yuriy-vasilyev/structura-core/compare/v1.27.3...v1.27.4) (2026-05-01)


### Bug Fixes

* **plugin:** image generation ([bade807](https://github.com/yuriy-vasilyev/structura-core/commit/bade80739bcef2a0aefd1402fedd5bcfe445bbeb))

## [1.27.3](https://github.com/yuriy-vasilyev/structura-core/compare/v1.27.2...v1.27.3) (2026-05-01)


### Bug Fixes

* **plugin:** broken endpoints ([98d98cf](https://github.com/yuriy-vasilyev/structura-core/commit/98d98cf5c75ed477b98474b601ff4d1abb1fcc13))
* **plugin:** indexnow channel verification ([50c3ebe](https://github.com/yuriy-vasilyev/structura-core/commit/50c3ebe06380173d70a7764310937c97ddca5602))
* **www:** languages ([34c6d19](https://github.com/yuriy-vasilyev/structura-core/commit/34c6d1956f8df099ee128837480186431a6c1673))

## [1.27.2](https://github.com/yuriy-vasilyev/structura-core/compare/v1.27.1...v1.27.2) (2026-05-01)


### Bug Fixes

* **plugin:** persona ID ([da5e59d](https://github.com/yuriy-vasilyev/structura-core/commit/da5e59deee213f6f0d3200cb78a1632061f0cc8a))

## [1.27.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.27.0...v1.27.1) (2026-05-01)


### Bug Fixes

* **plugin:** single post generation ([8e2059c](https://github.com/yuriy-vasilyev/structura-core/commit/8e2059c1d7aa79d0901429a25b70f17fedac9297))

## [1.27.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.26.2...v1.27.0) (2026-04-30)


### Features

* **plugin:** connect generations and posts ([3376d59](https://github.com/yuriy-vasilyev/structura-core/commit/3376d59ff1270ded4116a786a672d4efe24ef024))

## [1.26.2](https://github.com/yuriy-vasilyev/structura-core/compare/v1.26.1...v1.26.2) (2026-04-30)


### Bug Fixes

* **plugin:** campaign ID in post meta ([aa744a3](https://github.com/yuriy-vasilyev/structura-core/commit/aa744a3d57d68e4d5246e4f26573602a9271af9c))

## [1.26.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.26.0...v1.26.1) (2026-04-30)


### Bug Fixes

* **plugin:** task runner ([4c3769b](https://github.com/yuriy-vasilyev/structura-core/commit/4c3769b0988efa77aa8ed283fbc74e1352aeb9c6))

## [1.26.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.25.0...v1.26.0) (2026-04-30)


### Features

* **suggestion:** add tracing logs for request, brand content, and blueprint composition ([4a4e8c9](https://github.com/yuriy-vasilyev/structura-core/commit/4a4e8c970a19de05c9f557318eefc1d16d2557b0))


### Bug Fixes

* **plugin:** schema for stock posts ([7c63267](https://github.com/yuriy-vasilyev/structura-core/commit/7c6326791d434466e7f3306b514908bbb70c2dc7))
* **plugin:** task runner ([a7b931d](https://github.com/yuriy-vasilyev/structura-core/commit/a7b931d74b051bcc6d24d59439d37398a22e60d5))

## [1.25.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.24.0...v1.25.0) (2026-04-30)


### Features

* **plugin:** link new headless-mode + IndexNow surfaces to docs.structurawp.com ([9484acf](https://github.com/yuriy-vasilyev/structura-core/commit/9484acf3ae67abee86783ff36d0b2c65038f6aa3))
* ship IndexNow keyfile verify + headless onboarding ([8cec3d1](https://github.com/yuriy-vasilyev/structura-core/commit/8cec3d1b54cd04cb188fa97862b609ac84168f53))


### Bug Fixes

* **channels:** generate PKCE pair on OAuth init (X login was sending empty code_challenge) ([f276e39](https://github.com/yuriy-vasilyev/structura-core/commit/f276e3909cec4808579d22da183e9b1e9bfa7cee))

## [1.24.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.23.2...v1.24.0) (2026-04-30)


### Features

* **plugin:** add side identity to settings, allow headless mode ([17c471a](https://github.com/yuriy-vasilyev/structura-core/commit/17c471a6978ad6c88f33271863274763c9253a35))


### Bug Fixes

* **plugin:** post generation ([6d11989](https://github.com/yuriy-vasilyev/structura-core/commit/6d11989246502040bc88c717c2453263244ebf68))

## [1.23.2](https://github.com/yuriy-vasilyev/structura-core/compare/v1.23.1...v1.23.2) (2026-04-29)


### Bug Fixes

* **plugins:** campaign auto-cancellation ([088f040](https://github.com/yuriy-vasilyev/structura-core/commit/088f04070570ccbbb64c063ac0bf6d106336747c))
* **www:** sitemap link ([6b97a43](https://github.com/yuriy-vasilyev/structura-core/commit/6b97a438fc25d14f867ec478e3a68693e4a1a408))
* **www:** sitemap link ([c11d424](https://github.com/yuriy-vasilyev/structura-core/commit/c11d424c6d9ccb7a23be15a7c42fa32440cee03f))

## [1.23.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.23.0...v1.23.1) (2026-04-29)


### Bug Fixes

* build scripts ([4363f61](https://github.com/yuriy-vasilyev/structura-core/commit/4363f61db6399eaea6e639e7ad2ea0478bbf0016))

## [1.23.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.22.0...v1.23.0) (2026-04-29)


### Features

* add resend for sending emails ([78d81b0](https://github.com/yuriy-vasilyev/structura-core/commit/78d81b0ceb66efbafc0a7b3e850ab12a77962667))
* cloud pre-generation pipeline ([87e7caa](https://github.com/yuriy-vasilyev/structura-core/commit/87e7caafc0dd29ef677992f79da56d0d305bf4f6))
* cloud pre-generation pipeline, part 2 ([31ff5c7](https://github.com/yuriy-vasilyev/structura-core/commit/31ff5c76e30859ac2e3550ac432840d574b790f5))
* **docs:** add missing languages support ([da4d48b](https://github.com/yuriy-vasilyev/structura-core/commit/da4d48b46ae435c5aa016872ed431c4048b4ac54))
* **docs:** add sitemap.xml and robots.txt for indexability ([0205708](https://github.com/yuriy-vasilyev/structura-core/commit/020570800083122b80c06032ed8256e11a8499f7))
* **plugin:** add stock logic ([ab97fd9](https://github.com/yuriy-vasilyev/structura-core/commit/ab97fd955cf8312c4a28ca9aec3fc1de1682f29d))
* **plugin:** move image generation to cloud + buckets ([81057e3](https://github.com/yuriy-vasilyev/structura-core/commit/81057e39b9edd909e82428a2ede448ee718baf59))

## [1.22.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.21.5...v1.22.0) (2026-04-26)


### Features

* move campaigns, personas and visuals to the cloud ([08aeb7c](https://github.com/yuriy-vasilyev/structura-core/commit/08aeb7c8472b992a0f6fa8d4cb38a2e51b380f44))
* **plugin:** migrate most of entities to cloud ([cb337bf](https://github.com/yuriy-vasilyev/structura-core/commit/cb337bf82acf1461bda8b98d3e842c4fadfed66d))
* **www:** add more json+ld schemas, add search tool ([bea0068](https://github.com/yuriy-vasilyev/structura-core/commit/bea00684901674194b1b1d4ff25d7207b4b96abf))
* **www:** update features page ([2fbc959](https://github.com/yuriy-vasilyev/structura-core/commit/2fbc959f4c3c58932ed75bdc14ac27bbe83258bf))


### Bug Fixes

* **docs:** broken links ([c995999](https://github.com/yuriy-vasilyev/structura-core/commit/c995999bd3b9682485b36661a92e055d9e95acdc))
* **www:** add redirect, improve 404 template ([0f7a8a1](https://github.com/yuriy-vasilyev/structura-core/commit/0f7a8a190e28a2eb8ef97d8812454dae6a42bf8f))
* **www:** add visuals ([2cd7570](https://github.com/yuriy-vasilyev/structura-core/commit/2cd7570857da4f1305238c018c99437827a8dae6))
* **www:** internal links in blog posts ([3f10fe1](https://github.com/yuriy-vasilyev/structura-core/commit/3f10fe10f75ea984943e376604fef8661b178a83))
* **www:** translations, homepage visuals ([1a14bef](https://github.com/yuriy-vasilyev/structura-core/commit/1a14bef93e13536a502fdd6ef205fdeacc2df742))

## [1.21.5](https://github.com/yuriy-vasilyev/structura-core/compare/v1.21.4...v1.21.5) (2026-04-23)


### Bug Fixes

* strip content bug ([244dde9](https://github.com/yuriy-vasilyev/structura-core/commit/244dde99769f2798928cdc34b937eb484c848cf9))

## [1.21.4](https://github.com/yuriy-vasilyev/structura-core/compare/v1.21.3...v1.21.4) (2026-04-23)


### Bug Fixes

* add debug lines ([7ed59f2](https://github.com/yuriy-vasilyev/structura-core/commit/7ed59f28da25d97b4ff8f5dd6b1870348409fd76))

## [1.21.3](https://github.com/yuriy-vasilyev/structura-core/compare/v1.21.2...v1.21.3) (2026-04-23)


### Bug Fixes

* add debug lines ([1e6dbef](https://github.com/yuriy-vasilyev/structura-core/commit/1e6dbef2b54a80dbaf83b9ea01e016451d1e9178))

## [1.21.2](https://github.com/yuriy-vasilyev/structura-core/compare/v1.21.1...v1.21.2) (2026-04-23)


### Bug Fixes

* anthropic models for managed tiers ([cb9865b](https://github.com/yuriy-vasilyev/structura-core/commit/cb9865b348e6c185a94f72b37074d48e6bbc834f))

## [1.21.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.21.0...v1.21.1) (2026-04-23)


### Bug Fixes

* **plugin:** split content insertion into 2 phases ([e49de7c](https://github.com/yuriy-vasilyev/structura-core/commit/e49de7cf92f43c5460643d597ebacb603ed09927))

## [1.21.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.20.0...v1.21.0) (2026-04-23)


### Features

* **plugin:** add page builders support ([ffdbfcd](https://github.com/yuriy-vasilyev/structura-core/commit/ffdbfcd86ffc55076ca38667178e390978410da8))

## [1.20.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.19.0...v1.20.0) (2026-04-23)


### Features

* **functions,plugin,client:** progress-stream — CampaignRun writer, status API, drawer UI ([82d95f9](https://github.com/yuriy-vasilyev/structura-core/commit/82d95f9b6035b1acfc2f4ae9d1d5f068cb32d47f))
* **functions,web:** admin-log-triage — incidents store, listIncidents endpoint, /admin/incidents dashboard ([9c7f25a](https://github.com/yuriy-vasilyev/structura-core/commit/9c7f25a97131f193fa62d5a63bd0cf1e32fe51bb))
* **plugin,client:** plugin-quiet-mode — Debug_Mode gate, Dashboard widget, legacy Logs surfaces retired ([3738e9d](https://github.com/yuriy-vasilyev/structura-core/commit/3738e9d594dfdaeda966246ead0aae7049be8096))
* **plugin:** add campaign runs ([d9594bc](https://github.com/yuriy-vasilyev/structura-core/commit/d9594bc9874326a2b5b3d2f48b1d689d74bafecf))
* **www:** add favicon from LogoIcon mark ([1bff0ec](https://github.com/yuriy-vasilyev/structura-core/commit/1bff0ec94f0f9fcecc9ad98297de490cf7887ede))
* **www:** add support page ([06943dd](https://github.com/yuriy-vasilyev/structura-core/commit/06943dd337bea80b524931aa03ff28c8c0bf2b9f))
* **www:** sharded sitemap, blog taxonomy, and post-page polish ([6d90afb](https://github.com/yuriy-vasilyev/structura-core/commit/6d90afb3a0b527ae0bc5b2c0847e4faf51b1dbe6))
* **www:** support form with mail + rate limiting ([16f0746](https://github.com/yuriy-vasilyev/structura-core/commit/16f074626e781e881073a6618c0d6db76c5ac7a7))


### Bug Fixes

* **www:** open per-page locale gates so /de /es /fr render ([eb6be46](https://github.com/yuriy-vasilyev/structura-core/commit/eb6be46747b0c99e79103d6e04a4dc6d8674ff2b))

## [1.19.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.18.0...v1.19.0) (2026-04-22)


### Features

* **docs:** refactor docs ([bf76a8c](https://github.com/yuriy-vasilyev/structura-core/commit/bf76a8cd7d03d434b9fde441f14f002952c5144b))
* **plugin:** add Site Health probes for background-task blockers ([d68580d](https://github.com/yuriy-vasilyev/structura-core/commit/d68580d403af64b7be2af78cf5a0c659f5657051))
* **www:** add missing translations ([0578630](https://github.com/yuriy-vasilyev/structura-core/commit/057863009c153d88e0d16cfbc079080c66b2276a))


### Bug Fixes

* **plugin:** stop serializing $campaign through Action Scheduler args ([68d2897](https://github.com/yuriy-vasilyev/structura-core/commit/68d289790d7bc7a163db39cac0f5af77f33ac5f0))

## [1.18.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.17.0...v1.18.0) (2026-04-21)


### Features

* **plugin,client:** diagnose image tasks; hide debug logs by default ([d43e697](https://github.com/yuriy-vasilyev/structura-core/commit/d43e69732af38e162c01372141729a6dbb3f1899))


### Bug Fixes

* **functions:** preserve serverTimestamp sentinel in generations writer ([e69423b](https://github.com/yuriy-vasilyev/structura-core/commit/e69423ba89141cbc5928626cfc242b8f7867008b))

## [1.17.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.16.0...v1.17.0) (2026-04-21)


### Features

* **client:** localize enum labels and default disclosure text ([10b1c43](https://github.com/yuriy-vasilyev/structura-core/commit/10b1c43aed1099b2075761e04cd52352fd49fb5d))


### Bug Fixes

* **functions:** harden generations store writes ([982c652](https://github.com/yuriy-vasilyev/structura-core/commit/982c6522cbd3a540ed10569ecd905ea6432151cd))
* **plugin:** substitute plan-default image provider when configured one is text-only ([01623a1](https://github.com/yuriy-vasilyev/structura-core/commit/01623a168f8f9fe06e6b8d2b117088f57816a173))

## [1.16.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.15.0...v1.16.0) (2026-04-21)


### Features

* **channels:** surface activation-domain mismatch as a global advisory ([18c86ce](https://github.com/yuriy-vasilyev/structura-core/commit/18c86ced82374c82f4fe7d1db836339caae7cbda))


### Bug Fixes

* channels and agency tier appearance ([617d14f](https://github.com/yuriy-vasilyev/structura-core/commit/617d14f774e2f27996e4e1e60d6b12dd550df4bd))
* **plugin:** remove citation prop ([7adf5ba](https://github.com/yuriy-vasilyev/structura-core/commit/7adf5ba2e655011e280f0558592e52cfc70d43f7))

## [1.15.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.14.0...v1.15.0) (2026-04-21)


### Features

* **ai:** extract brand palette and route logo images through multimodal Gemini ([4bcbc8a](https://github.com/yuriy-vasilyev/structura-core/commit/4bcbc8ab7dbe687c40845614df503529332d0fe7))


### Bug Fixes

* docs links ([70f1850](https://github.com/yuriy-vasilyev/structura-core/commit/70f1850b5f1ab7999d2b1c3eb9a30a64ec8bcc5f))
* image visual style ([f2060ba](https://github.com/yuriy-vasilyev/structura-core/commit/f2060ba41790b20ea95d8f27c3e0fad06bb37df0))
* **plugin:** drop data-howto-name from action-step &lt;ol&gt; to satisfy Gutenberg ([1c0a3a6](https://github.com/yuriy-vasilyev/structura-core/commit/1c0a3a62b9ac370c81e95dd0ffffe205a1c12013))
* render naked URLs as clickable anchor tags in post body ([451afed](https://github.com/yuriy-vasilyev/structura-core/commit/451afed54367c3ae38d1c5eddde0adb07867505b))
* **www:** pin @exodus/bytes &lt;1.15 to unbreak blog route on Vercel ([5f41b0f](https://github.com/yuriy-vasilyev/structura-core/commit/5f41b0f0186bb6117e9db8f88d4fa718c95516db))
* **www:** swap isomorphic-dompurify for sanitize-html to fix Vercel ERR_REQUIRE_ESM ([8c1b1ee](https://github.com/yuriy-vasilyev/structura-core/commit/8c1b1eed4cad9cb02b1d2e2180d2ca1e4706ce0f))

## [1.14.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.13.0...v1.14.0) (2026-04-20)


### Features

* **www,ui:** add blog pagination with shared Pagination component ([dd1071f](https://github.com/yuriy-vasilyev/structura-core/commit/dd1071f97b7dd61edea5e3c8d3e09f20bf511bbe))
* **www:** restructure header/footer nav + persistent language switcher ([3d87cbd](https://github.com/yuriy-vasilyev/structura-core/commit/3d87cbdaaa4d77b9fc3ae8beeb20f78361d0e932))
* **www:** theme + language switchers in footer ([5f3f6af](https://github.com/yuriy-vasilyev/structura-core/commit/5f3f6af275ec50ae2d22be9d106f5cb896bd6b26))


### Bug Fixes

* openai blocks schema ([833029d](https://github.com/yuriy-vasilyev/structura-core/commit/833029daec2a4fde03df92eaad3b7b17d6b86067))
* openai blocks schema ([657caa6](https://github.com/yuriy-vasilyev/structura-core/commit/657caa69b37d060fcf453c204e62d97ca68edb18))
* **plugin,functions:** require explicit text/image provider + fix OpenAI image 400 ([3e00670](https://github.com/yuriy-vasilyev/structura-core/commit/3e006709b89f6db7ba458c9e78a8d206ae293c84))
* **www,ui:** pricing page light-mode polish + live currency in matrix ([e6c831c](https://github.com/yuriy-vasilyev/structura-core/commit/e6c831c6c0674dcc98b4aaceb47f79944639faf9))
* **www:** await params in every App Router route (Next.js 15) ([44c874c](https://github.com/yuriy-vasilyev/structura-core/commit/44c874c9d5811ac9ee41e3339678bf5eec287d29))
* **www:** premium cta button color on hover ([65c2bf7](https://github.com/yuriy-vasilyev/structura-core/commit/65c2bf77c9289585cd3fd9352fd532236e1c43c6))

## [1.13.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.12.3...v1.13.0) (2026-04-20)


### Features

* add comparison pages ([8916ac0](https://github.com/yuriy-vasilyev/structura-core/commit/8916ac0f42011b8c552ad58e553dbc5b0bdeb1d1))
* **plugin,www:** mark FAQ + HowTo sections for headless extraction ([00159e6](https://github.com/yuriy-vasilyev/structura-core/commit/00159e6d51aa2ec61ab6e71337b5f7b04b774a9c))
* **www:** add /vs/koala-ai comparison page (EN) ([3d5c3ac](https://github.com/yuriy-vasilyev/structura-core/commit/3d5c3ac7f77ba4d2f092e099d72462c70b33bca1))
* **www:** add auto-generated /changelog page from release-please CHANGELOG.md ([6964ddf](https://github.com/yuriy-vasilyev/structura-core/commit/6964ddf2fbe3611b5979c44d44e410c88dec7eb6))
* **www:** add reusable FaqSection + HowTo JSON-LD schema ([8a4127e](https://github.com/yuriy-vasilyev/structura-core/commit/8a4127eb1c3dba392d9f144608784f297763410c))
* **www:** port persona switcher demo to /features ([10ff6d1](https://github.com/yuriy-vasilyev/structura-core/commit/10ff6d1638fa712d52ff433399851762f7c0ddef))
* **www:** restore SEO protocol and approach comparison composites on /features ([191b89f](https://github.com/yuriy-vasilyev/structura-core/commit/191b89ffeba029a022bb240a824b21fb628ebcb0))


### Bug Fixes

* price IDs ([3103ede](https://github.com/yuriy-vasilyev/structura-core/commit/3103ede41ad85d9b30aae70522964975bff4ec64))
* **www:** tighten homepage hero scale and drop broken footer links ([f40badc](https://github.com/yuriy-vasilyev/structura-core/commit/f40badcbe0190612f55d9a2cc60a18382b4b0265))

## [1.12.3](https://github.com/yuriy-vasilyev/structura-core/compare/v1.12.2...v1.12.3) (2026-04-20)


### Bug Fixes

* post model and openai schema ([cd4c59a](https://github.com/yuriy-vasilyev/structura-core/commit/cd4c59aab3bc9ba8790c8c108947759cf3c7b872))

## [1.12.2](https://github.com/yuriy-vasilyev/structura-core/compare/v1.12.1...v1.12.2) (2026-04-20)


### Bug Fixes

* **ci:** drop PHP 8.0 match so Patchwork can tokenize on 7.4 ([184d7a4](https://github.com/yuriy-vasilyev/structura-core/commit/184d7a48676ac9d8699f22d01dc152dd0c9ff7ff))
* **plugin:** re-stub get_post_meta with when() so forwarder tests see the override ([da9ff53](https://github.com/yuriy-vasilyev/structura-core/commit/da9ff53089fbe384926acc902cde80cd596501ec))

## [1.12.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.12.0...v1.12.1) (2026-04-20)


### Bug Fixes

* **ci:** unblock release pipeline on release-please merges ([6ff9b6b](https://github.com/yuriy-vasilyev/structura-core/commit/6ff9b6b4466caf8d2e53d5916ea047271c42fd12))

## [1.12.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.11.0...v1.12.0) (2026-04-20)


### Features

* **ai,plugin,client:** restructure SEO rules into always-on tier map + HARD REQUIREMENTS band ([e54ee79](https://github.com/yuriy-vasilyev/structura-core/commit/e54ee7993e1eaba149cb051bdbb35bb05d69f494))
* **docs,www:** add branded error boundaries ([8e93ed6](https://github.com/yuriy-vasilyev/structura-core/commit/8e93ed6787102355b6069a1377c57811ecbe6249))


### Bug Fixes

* **client:** unblock managed-tier dashboard + restore PHP-first license flow ([36242fe](https://github.com/yuriy-vasilyev/structura-core/commit/36242fe7b852690d7c855484850e5c80308369ad))
* **docs:** remove Nextra i18n array to unblock runtime ([9b64690](https://github.com/yuriy-vasilyev/structura-core/commit/9b64690fd7fe1b268e4c048e9fb42ecc7d88334f))
* **plugin,client:** pricing-v2 gaps — Agency badge + entitlement-aware Channels visibility ([299dc31](https://github.com/yuriy-vasilyev/structura-core/commit/299dc3178379f2e63892c113edd81ba486d721c9))

## [1.11.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.10.0...v1.11.0) (2026-04-20)


### Features

* add agency tier; introduce www project ([4a60f72](https://github.com/yuriy-vasilyev/structura-core/commit/4a60f72049b7e64f0a358a1455e6bd3da0028cca))
* **ai:** per-plan default models for managed tiers ([3a45ea4](https://github.com/yuriy-vasilyev/structura-core/commit/3a45ea4be3cc8c169336d36c4d5fa8407ab61024))
* **billing:** declarative Stripe catalog sync tool ([93b7488](https://github.com/yuriy-vasilyev/structura-core/commit/93b74884324b0d682469db2e1456361a36abdcea))
* **billing:** synthesize bundled add-on entitlements from plan metadata ([77dd8c2](https://github.com/yuriy-vasilyev/structura-core/commit/77dd8c2d19533dc2c9268d199365edd9f880d502))
* **client:** Agency tier feature gates and per-post model picker ([34f1d3a](https://github.com/yuriy-vasilyev/structura-core/commit/34f1d3aa993b73f3420f19115e2958fb2fd7e5cf))
* **ui:** lift pricing composites to @structura/ui/pricing ([d8906e9](https://github.com/yuriy-vasilyev/structura-core/commit/d8906e96ec20e01e9023607ccd11d911c6bf79c5))
* **web:** 4-tier pricing UI with currency toggle and Agency volume strip ([3d00c69](https://github.com/yuriy-vasilyev/structura-core/commit/3d00c69e9f82606b6a10c9b8263348ca2ae63a10))
* **www:** build real homepage + pricing pages for /en ([6e43949](https://github.com/yuriy-vasilyev/structura-core/commit/6e439494bf8870f50b732b2e7b6b0f712871ef58))
* **www:** scaffold Next.js marketing site workspace ([22250f4](https://github.com/yuriy-vasilyev/structura-core/commit/22250f4fc8306602f8a5d70d469f436dbfd9231a))


### Bug Fixes

* build process ([de6b026](https://github.com/yuriy-vasilyev/structura-core/commit/de6b026e72e8792a950915c401dd04bab2ac4e84))
* **docs:** align deps with workspace overrides so frozen install works ([9f42b9f](https://github.com/yuriy-vasilyev/structura-core/commit/9f42b9fa0718f10c356787f6c4158e99c5a84ec3))

## [1.10.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.9.0...v1.10.0) (2026-04-17)


### Features

* **channels:** add X (Twitter) integration ([1bb71b6](https://github.com/yuriy-vasilyev/structura-core/commit/1bb71b6087701bbd5f297b669f94ddeda21bf092))


### Bug Fixes

* **channels:** wire OAuth client secrets into integration registry ([6704fb4](https://github.com/yuriy-vasilyev/structura-core/commit/6704fb4ef4012c1153b9748fb3d0be455ba13923))

## [1.9.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.8.0...v1.9.0) (2026-04-17)


### Features

* **channels:** add LinkedIn integration — OAuth, AI adaptation, publishing (Phase 3+4) ([dfce360](https://github.com/yuriy-vasilyev/structura-core/commit/dfce360f6d4486af8f64f596e41ee03cf264d826))
* **channels:** add per-campaign bindings and company page posting ([a26604e](https://github.com/yuriy-vasilyev/structura-core/commit/a26604e7966edefd103c0ae574e41bc22654c76d))
* **channels:** add publishable dispatch, frequency control, and LinkedIn image posting ([21fe37b](https://github.com/yuriy-vasilyev/structura-core/commit/21fe37bd1a1fb9803c28596c3eba5fd0c75524f6))
* only post published posts on linkedin ([f5fca30](https://github.com/yuriy-vasilyev/structura-core/commit/f5fca30be8a69f36013774fad264b44b87c2603a))

## [1.8.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.7.1...v1.8.0) (2026-04-16)


### Features

* **admin:** add Entitlement health dashboard panel (spec §11.7) ([cd6793a](https://github.com/yuriy-vasilyev/structura-core/commit/cd6793aeccf801d6b479636afab71c3be405169a))
* **channels:** add Email, Telegram, WhatsApp integrations (Phase 7) ([8c9cd3a](https://github.com/yuriy-vasilyev/structura-core/commit/8c9cd3a3849dd9d68f5c55f157b035ad4f290814))
* **channels:** add expired-connections admin banner (Phase 7) ([7e5d171](https://github.com/yuriy-vasilyev/structura-core/commit/7e5d171b97d93bfb51482bfda4238ed67f3d4904))
* integrations store + per-add-on entitlements (Phases 1-6) ([647495c](https://github.com/yuriy-vasilyev/structura-core/commit/647495c5632fea51c17168a890434eba178eefa9))


### Bug Fixes

* **licenses:** repair checkActivationLimits cron (spec §11.5.4) ([ea0d0a0](https://github.com/yuriy-vasilyev/structura-core/commit/ea0d0a03fa1c5146f242babffd54f76c7ae3f1ec))

## [1.7.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.7.0...v1.7.1) (2026-04-15)


### Bug Fixes

* magic link login ([8502269](https://github.com/yuriy-vasilyev/structura-core/commit/8502269bd65dbe7ef40bfbda8186e396efa3a91a))

## [1.7.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.6.0...v1.7.0) (2026-04-15)


### Features

* add integrations ([1b85ced](https://github.com/yuriy-vasilyev/structura-core/commit/1b85ceddbbc1974b0205e342ef0c2db336ef6f8d))
* **channels:** scaffold Integrations Store foundation (Phase 0) ([4be4ee9](https://github.com/yuriy-vasilyev/structura-core/commit/4be4ee9514d494fba066876de2d7262d30104a08))
* make email templates multilingual ([dcd6274](https://github.com/yuriy-vasilyev/structura-core/commit/dcd62741354c19328333d2e32371ef22d63a63f0))


### Bug Fixes

* integrations ([0bd403d](https://github.com/yuriy-vasilyev/structura-core/commit/0bd403dd6427699676258f9d11a1fe2e848ea2b5))
* integrations ([78d783a](https://github.com/yuriy-vasilyev/structura-core/commit/78d783ace31d3d9a5105af75516d6e39aa6daf80))
* **types:** unblock tsc -b after Phase 1 channels work ([2356a4d](https://github.com/yuriy-vasilyev/structura-core/commit/2356a4d0b63a1cafed27a5e86502f00b205574fc))
* web app translations ([cfa70ef](https://github.com/yuriy-vasilyev/structura-core/commit/cfa70efa12afbf1953cbabff740339de9f5c493a))

## [1.6.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.5.0...v1.6.0) (2026-04-13)


### Features

* add claude support ([5bcd4fd](https://github.com/yuriy-vasilyev/structura-core/commit/5bcd4fd055ae27850783f86af8d65fdb9ae39b9a))


### Bug Fixes

* improve prompts ([8ded86e](https://github.com/yuriy-vasilyev/structura-core/commit/8ded86eec19684bb5c470209a93ee24282a4ec43))

## [1.5.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.4.0...v1.5.0) (2026-04-13)


### Features

* adjust translations ([3fda50c](https://github.com/yuriy-vasilyev/structura-core/commit/3fda50c3ebe71c93ce620a4ad7688c3b56bf74c6))

## [1.4.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.3.0...v1.4.0) (2026-04-12)


### Features

* make disable empjis option enabled by default ([73a5048](https://github.com/yuriy-vasilyev/structura-core/commit/73a5048df20b8a0c41aeb64e248044e559a640b6))
* refresh campaigns index  page ([fef58a5](https://github.com/yuriy-vasilyev/structura-core/commit/fef58a5d79114247c79e61f104f9ea4216dcd220))
* refresh single post creation page ([7b4323e](https://github.com/yuriy-vasilyev/structura-core/commit/7b4323e9c4c8bbf43f0dfc1d199e2caa0b2fbf71))
* split providers ([6d774ba](https://github.com/yuriy-vasilyev/structura-core/commit/6d774ba7d69d289be3aaafe58587b61703cb88d9))

## [1.3.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.2.2...v1.3.0) (2026-04-10)


### Features

* change create campaign flow ([66629cf](https://github.com/yuriy-vasilyev/structura-core/commit/66629cfcbf79916be09eb03d08fbb2d8ee832170))

## [1.2.2](https://github.com/yuriy-vasilyev/structura-core/compare/v1.2.1...v1.2.2) (2026-04-10)


### Bug Fixes

* keywords and domains discovery ([eb4b980](https://github.com/yuriy-vasilyev/structura-core/commit/eb4b980ea3de151076434349f594e35ce334d75c))

## [1.2.1](https://github.com/yuriy-vasilyev/structura-core/compare/v1.2.0...v1.2.1) (2026-04-09)


### Bug Fixes

* keywords/sources exploration language ([1c9d147](https://github.com/yuriy-vasilyev/structura-core/commit/1c9d147b0c48300201f60149bc57ad4130aec7c9))

## [1.2.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.1.0...v1.2.0) (2026-04-09)


### Features

* add more langs, translate customer portal ([cbe975d](https://github.com/yuriy-vasilyev/structura-core/commit/cbe975dc4a24acd7df18e389d4a0414e5e5560ef))

## [1.1.0](https://github.com/yuriy-vasilyev/structura-core/compare/v1.0.13...v1.1.0) (2026-04-09)


### Features

* add German (de_DE + de_AT) translations for plugin ([c1cdd74](https://github.com/yuriy-vasilyev/structura-core/commit/c1cdd74fab7d878fc6ff9bb0e354ff3af14b1ddb))

## [1.0.13](https://github.com/yuriy-vasilyev/structura-core/compare/v1.0.12...v1.0.13) (2026-04-09)


### Bug Fixes

* release workflows ([9acdaab](https://github.com/yuriy-vasilyev/structura-core/commit/9acdaabfa1cb3a7172e11aab30e693166e545049))

## [1.0.12](https://github.com/yuriy-vasilyev/structura-core/compare/v1.0.11...v1.0.12) (2026-04-09)


### Bug Fixes

* merge release workflows to fix GITHUB_TOKEN trigger limitation ([eff7711](https://github.com/yuriy-vasilyev/structura-core/commit/eff7711a7e6c0cd8b3d7766992237898e66ba310))

## [1.0.11](https://github.com/yuriy-vasilyev/structura-core/compare/v1.0.10...v1.0.11) (2026-04-09)


### Bug Fixes

* update lockfile after firecrawl-js removal ([d30b02e](https://github.com/yuriy-vasilyev/structura-core/commit/d30b02e0851687e50fa5c665eae97cb13eca3050))

## [1.0.10](https://github.com/yuriy-vasilyev/structura-core/compare/v1.0.9...v1.0.10) (2026-04-09)


### Bug Fixes

* checkout redirect for existing users ([c05f01d](https://github.com/yuriy-vasilyev/structura-core/commit/c05f01d863bfdcc91af377abb3165e8238d0ffb9))
* self-updater error ([8daf343](https://github.com/yuriy-vasilyev/structura-core/commit/8daf343bf2bb7979d6f2dea9086ca96554bf25ed))
