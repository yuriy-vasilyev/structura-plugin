/**
 * Structura — Post Editor Meta Box
 *
 * Modal-based image regeneration with preview, apply/retry flow.
 */
(function ($) {
    'use strict';

    /* ── DOM refs ──────────────────────────────────────────────────────────── */

    // 2026-05-02 — every regen trigger button (featured + N body
    // images) carries `data-slot` and `data-attachment-id`. We bind
    // delegated to capture all of them with one handler regardless
    // of how many body images render.
    var $openBtn    = $('#structura-regen-image, .structura-mb__btn--body');
    var $backdrop   = $('#structura-modal-backdrop');

    // The slot + attachment id of the regen the user just opened.
    // `featured` triggers the legacy apply (set_post_thumbnail);
    // `body` / `body-N` triggers the post_content swap path. State
    // is reset every modal open.
    var activeSlot = null;
    var activeAttachmentId = 0;

    // Move the modal to <body> so `position: fixed` escapes the
    // Gutenberg sidebar's stacking context. The modal's HTML is
    // emitted INSIDE the meta box (server-side render), and Gutenberg's
    // `.interface-interface-skeleton__sidebar` creates its own stacking
    // context (transform / isolation depending on WP version), which
    // traps `position: fixed` inside the sidebar's bounding box. Symptom
    // in Chrome: the Post/Block tab strip renders ON TOP of the modal
    // backdrop. Symptom in Safari: stricter stacking-context behavior
    // hides the modal entirely. Reparenting to body restores true
    // viewport-anchored fixed positioning. 2026-04-30 cms.xerx.io.
    if ($backdrop.length && $backdrop.parent().is(':not(body)')) {
        $backdrop.appendTo('body');
    }

    var $closeBtn   = $('#structura-modal-close');
    var $prompt     = $('#structura-modal-prompt');
    var $generateBtn = $('#structura-modal-generate');
    var $applyBtn   = $('#structura-modal-apply');
    var $progressFill = $('#structura-progress-fill');
    var $modelSection = $('#structura-modal-model-section');
    var $modelSelect  = $('#structura-modal-model');
    var $modelHint    = $('#structura-modal-model-hint');

    // Preview state panels
    var $idle    = $('#structura-preview-idle');
    var $loading = $('#structura-preview-loading');
    var $result  = $('#structura-preview-result');
    var $error   = $('#structura-preview-error');
    var $errorMsg = $('#structura-preview-error-msg');
    var $previewImg = $('#structura-preview-img');

    var pendingAttachmentId = null;
    var progressTimer = null;

    /* ── Modal open / close ────────────────────────────────────────────────── */

    function openModal(slot, attachmentId) {
        resetModal();
        activeSlot = slot || 'featured';
        activeAttachmentId = parseInt(attachmentId, 10) || 0;

        // Header copy reflects which slot we're regenerating —
        // "Generate Featured Image" vs "Generate Body Image". Same
        // modal frame either way.
        var titleEl = document.querySelector('.structura-modal__header h3');
        if (titleEl) {
            titleEl.textContent = activeSlot === 'featured'
                ? 'Generate Featured Image'
                : 'Generate Body Image';
        }

        // 2026-05-07 — leave the textarea blank on open. Empty submit
        // means "reuse the previous topic" — the server's
        // `resolve_attachment_image_topic` reads `_structura_image_topic`
        // off the current attachment and uses it as the topic, so
        // pre-filling adds no information AND introduced a confusing
        // failure mode where users assumed the prefilled string was
        // being respected verbatim while the cloud was doing its
        // standard prompt-wrapping (`Topic: … Visual style: …`).
        // Placeholder is set in the PHP template; nothing to do here.
        $prompt.val('');

        // 2026-05-02 — populate the image-model picker per tier.
        // Catalog comes from `structuraMetaBox.imageModels` (pre-
        // resolved server-side via Provider_Registry). Tier rules:
        //   - free: hide entirely (the local BYOK adapter ignores
        //     per-post model overrides; users pick on the settings
        //     page).
        //   - pro / agency: every non-fast model selectable.
        //   - cloud: mid models (`default: true`) selectable, top
        //     models (`recommended: true`) DISABLED with an
        //     "Agency only" hint so users see what they're missing
        //     without us routing the request server-side and
        //     getting it rejected.
        renderModelPicker();

        $backdrop.fadeIn(200);
        // Lock body scroll
        $('body').css('overflow', 'hidden');
        setTimeout(function () { $prompt.focus(); }, 250);
    }

    function closeModal() {
        $backdrop.fadeOut(200);
        $('body').css('overflow', '');
        stopProgress();

        // If user generated an image but didn't apply it, clean it up
        if (pendingAttachmentId) {
            // Fire-and-forget cleanup
            $.post(structuraMetaBox.ajaxUrl, {
                action: 'structura_cleanup_unused_attachment',
                nonce: structuraMetaBox.nonce,
                attachment_id: pendingAttachmentId
            });
            pendingAttachmentId = null;
        }
    }

    function resetModal() {
        pendingAttachmentId = null;
        $prompt.val('');
        showPanel('idle');
        $generateBtn.show().prop('disabled', false).removeClass('is-loading');
        $generateBtn.find('span').text('Generate');
        // Reset apply button label + disabled in addition to hiding it.
        // The apply handler's success branch leaves the button in
        // "Applying…" / disabled state and relies on closeModal() to
        // tear the modal down — but closeModal() doesn't restore the
        // button. The next time the user opens the modal in the same
        // page session and Generate succeeds, $applyBtn.show() reveals
        // a button stuck in the prior "Applying…" disabled state, with
        // no path forward for the user. 2026-05-09 yuriy report.
        $applyBtn.hide().prop('disabled', false);
        $applyBtn.find('span').text('Use this image');
        stopProgress();
    }

    // Delegated click handler — covers the static `#structura-regen-image`
    // featured button AND every `.structura-mb__btn--body` row that
    // renders below it. Reads the slot + attachment id off the
    // button's data-* attributes so the handler doesn't need to
    // know how many body rows there are.
    $(document).on('click', '#structura-regen-image, .structura-mb__btn--body', function () {
        openModal(this.getAttribute('data-slot') || 'featured', this.getAttribute('data-attachment-id'));
    });
    $closeBtn.on('click', closeModal);

    // Close on backdrop click (not modal body)
    $backdrop.on('click', function (e) {
        if (e.target === this) closeModal();
    });

    // Close on Escape
    $(document).on('keydown', function (e) {
        if (e.key === 'Escape' && $backdrop.is(':visible')) closeModal();
    });

    /* ── Model picker rendering ─────────────────────────────────────────────── */

    function renderModelPicker() {
        var tier   = (structuraMetaBox.tier || 'free').toLowerCase();
        var models = Array.isArray(structuraMetaBox.imageModels) ? structuraMetaBox.imageModels : [];
        var preferredProvider = structuraMetaBox.preferredProvider || structuraMetaBox.imageProvider || '';

        // Free tier: hide the picker entirely. Local BYOK adapter
        // doesn't accept per-call model overrides — users pick on
        // the settings page and that choice applies globally.
        if (tier === 'free' || tier === 'none' || models.length === 0) {
            $modelSection.hide();
            $modelSelect.empty();
            return;
        }

        var isCloud = tier === 'cloud';

        // 2026-05-07 — group models by provider so multi-provider
        // users see all their choices organized by provider name
        // (OpenAI / Google Gemini / …). The "Use default model"
        // first option still emits an empty value, which the AJAX
        // handler reads as "no override" — server falls back to
        // the post's stamped provider + tier-managed model.
        // Each <option>'s `value` is the model id; we tag the
        // owning provider via `data-provider` so the generate
        // handler can forward it as `image_provider`.
        var byProvider = {};
        var providerOrder = [];
        for (var i = 0; i < models.length; i += 1) {
            var m = models[i];
            // Drop fast models from every tier — fast underperforms
            // on the visual-style prompt and we don't want users
            // accidentally dropping image quality.
            if (m.fast) continue;
            var pid = m.provider || '';
            var pname = m.providerName || pid || 'Provider';
            if (!byProvider[pid]) {
                byProvider[pid] = { name: pname, models: [] };
                providerOrder.push(pid);
            }
            byProvider[pid].models.push(m);
        }

        // Pin the preferred provider first so its mid-tier model
        // sits closest to "Use default model" — keeps the no-click
        // path identical to pre-multi-provider behavior.
        providerOrder.sort(function (a, b) {
            if (a === preferredProvider) return -1;
            if (b === preferredProvider) return 1;
            return 0;
        });

        // Sort within each provider: mid first (default), then top
        // (recommended), then anything else.
        for (var p = 0; p < providerOrder.length; p += 1) {
            byProvider[providerOrder[p]].models.sort(function (a, b) {
                var ra = a.default ? 0 : (a.recommended ? 1 : 2);
                var rb = b.default ? 0 : (b.recommended ? 1 : 2);
                return ra - rb;
            });
        }

        var optionsHtml = '<option value="" data-provider="">' +
            'Use default model' +
            '</option>';
        var visibleCount = 0;
        var multiProvider = providerOrder.length > 1;
        for (var pi = 0; pi < providerOrder.length; pi += 1) {
            var providerId = providerOrder[pi];
            var providerEntry = byProvider[providerId];
            var providerOptions = '';
            var providerVisible = 0;
            for (var j = 0; j < providerEntry.models.length; j += 1) {
                var mm = providerEntry.models[j];
                var label = mm.name;
                var badges = [];
                if (mm.default)     badges.push('mid');
                if (mm.recommended) badges.push('top');
                if (badges.length) label += '  •  ' + badges.join(' / ');

                // Cloud tier: top models render but DISABLED with a
                // hint, so the user sees the catalog and learns about
                // the upgrade path without a confusing failure.
                var disabled = isCloud && mm.recommended;
                if (disabled) {
                    label += '  (Agency only)';
                }

                providerOptions += '<option value="' + escapeHtml(mm.id) + '"' +
                    ' data-provider="' + escapeHtml(providerId) + '"' +
                    (disabled ? ' disabled' : '') + '>' +
                    escapeHtml(label) + '</option>';
                providerVisible += 1;
            }
            if (providerVisible === 0) continue;
            visibleCount += providerVisible;

            // Use <optgroup> only when more than one provider is
            // present; for a single-provider install the flat list
            // matches the pre-multi-provider UI exactly.
            if (multiProvider) {
                optionsHtml += '<optgroup label="' + escapeHtml(providerEntry.name) + '">'
                    + providerOptions
                    + '</optgroup>';
            } else {
                optionsHtml += providerOptions;
            }
        }

        if (visibleCount === 0) {
            $modelSection.hide();
            $modelSelect.empty();
            return;
        }

        $modelSelect.html(optionsHtml);
        // Reset to default — empty value means "let the cloud pick".
        $modelSelect.val('');
        $modelHint.text(
            isCloud ? 'Top models require Agency.' : 'Mid is faster + cheaper. Top is highest quality.'
        );
        $modelSection.show();
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /* ── Panel switching ───────────────────────────────────────────────────── */

    function showPanel(which) {
        $idle.hide();
        $loading.hide();
        $result.hide();
        $error.hide();

        switch (which) {
            case 'idle':    $idle.show(); break;
            case 'loading': $loading.show(); break;
            case 'result':  $result.show(); break;
            case 'error':   $error.show(); break;
        }
    }

    /* ── Progress bar animation ────────────────────────────────────────────── */

    function startProgress() {
        var pct = 0;
        $progressFill.css('width', '0%');
        progressTimer = setInterval(function () {
            // Ease toward 90% over ~30 seconds, never reaches 100
            pct += (90 - pct) * 0.04;
            $progressFill.css('width', Math.min(pct, 90) + '%');
        }, 300);
    }

    function completeProgress() {
        stopProgress();
        $progressFill.css({ width: '100%', transition: 'width 0.3s ease' });
    }

    function stopProgress() {
        if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
        }
    }

    /* ── Generate image ────────────────────────────────────────────────────── */

    $generateBtn.on('click', function () {
        // If we already have a pending image from a previous generation, clean it up
        if (pendingAttachmentId) {
            $.post(structuraMetaBox.ajaxUrl, {
                action: 'structura_cleanup_unused_attachment',
                nonce: structuraMetaBox.nonce,
                attachment_id: pendingAttachmentId
            });
            pendingAttachmentId = null;
        }

        $generateBtn.prop('disabled', true).addClass('is-loading');
        $generateBtn.find('span').text('Generating\u2026');
        $applyBtn.hide();
        showPanel('loading');
        startProgress();

        // Route to the body or featured handler based on which
        // trigger button opened the modal. Body needs the
        // attachment id of the image being replaced — the featured
        // path resolves that internally via post thumbnail.
        var generateData = {
            nonce:         structuraMetaBox.nonce,
            post_id:       structuraMetaBox.postId,
            custom_prompt: $.trim($prompt.val())
        };
        // 2026-05-02 — per-regen image model override. Empty value
        // means "use the campaign / tier default"; the plugin
        // handler treats empty the same as missing.
        // 2026-05-07 — also forward `image_provider` from the
        // selected option's `data-provider` so the user can pick a
        // model from a provider OTHER than the post's stamped one
        // (multi-provider picker). The AJAX handler validates the
        // provider against the user's connected providers before
        // forwarding it to the cloud.
        var selectedModel = $modelSelect.val ? $modelSelect.val() : '';
        if (selectedModel) {
            generateData.image_model = selectedModel;
            var selectedOption = $modelSelect.find('option:selected');
            var selectedProvider = selectedOption.length ? selectedOption.attr('data-provider') : '';
            if (selectedProvider) {
                generateData.image_provider = selectedProvider;
            }
        }
        if (activeSlot === 'featured') {
            generateData.action = 'structura_regenerate_image';
        } else {
            generateData.action = 'structura_regenerate_body_image';
            generateData.attachment_id = activeAttachmentId;
        }

        $.post(structuraMetaBox.ajaxUrl, generateData)
        .done(function (res) {
            completeProgress();

            if (res.success) {
                pendingAttachmentId = res.data.attachment_id;
                $previewImg.attr('src', res.data.preview_url + '?t=' + Date.now());
                showPanel('result');

                // Show action buttons: "Use this image" + "Try again"
                $applyBtn.show();
                $generateBtn.find('span').text('Try again');
                $generateBtn.prop('disabled', false).removeClass('is-loading');
            } else {
                $errorMsg.text(res.data.message || 'An error occurred.');
                showPanel('error');
                $generateBtn.find('span').text('Try again');
                $generateBtn.prop('disabled', false).removeClass('is-loading');
            }
        })
        .fail(function () {
            completeProgress();
            $errorMsg.text('Request failed. Please try again.');
            showPanel('error');
            $generateBtn.find('span').text('Try again');
            $generateBtn.prop('disabled', false).removeClass('is-loading');
        });
    });

    /* ── Apply image ───────────────────────────────────────────────────────── */

    $applyBtn.on('click', function () {
        if (!pendingAttachmentId) return;

        $applyBtn.prop('disabled', true);
        $applyBtn.find('span').text('Applying\u2026');

        // Two apply paths \u2014 featured uses set_post_thumbnail; body
        // uses a server-side str_replace inside post_content. The
        // server validates that the old attachment id appears in
        // the content; if not, the apply errors out cleanly so the
        // user can re-trigger.
        var applyData = {
            nonce:   structuraMetaBox.nonce,
            post_id: structuraMetaBox.postId
        };
        if (activeSlot === 'featured') {
            applyData.action = 'structura_apply_generated_image';
            applyData.attachment_id = pendingAttachmentId;
        } else {
            applyData.action = 'structura_apply_body_image';
            applyData.old_attachment_id = activeAttachmentId;
            applyData.new_attachment_id = pendingAttachmentId;
        }

        $.post(structuraMetaBox.ajaxUrl, applyData)
        .done(function (res) {
            if (res.success) {
                if (activeSlot === 'featured') {
                    // Update the meta box thumbnail
                    var newSrc = res.data.thumb_url + '?t=' + Date.now();
                    var $wrap = $('#structura-thumb-wrap');

                    if ($wrap.length) {
                        $wrap.find('img').attr('src', newSrc);
                    } else {
                        var html = '<div class="structura-mb__thumb" id="structura-thumb-wrap">'
                            + '<img src="' + newSrc + '" alt="" />'
                            + '<div class="structura-mb__thumb-overlay">'
                            + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
                            + '</div></div>';
                        $('.structura-mb__image-section').prepend(html);
                    }

                    // Invalidate Gutenberg featured image panel
                    if (typeof wp !== 'undefined' && wp.data && wp.data.dispatch) {
                        try {
                            wp.data.dispatch('core/editor').editPost({ featured_media: pendingAttachmentId });
                            wp.data.dispatch('core').invalidateResolution('getEntityRecord', ['postType', 'post', structuraMetaBox.postId]);
                        } catch (e) { /* Classic Editor */ }
                    }
                } else {
                    // Body image — server has already mutated
                    // post_content. Force the editor's post entity
                    // to re-fetch so the image swap appears live in
                    // Gutenberg without a full page reload.
                    if (typeof wp !== 'undefined' && wp.data && wp.data.dispatch) {
                        try {
                            wp.data.dispatch('core').invalidateResolution('getEntityRecord', ['postType', 'post', structuraMetaBox.postId]);
                            // editPost({}) is a no-op that flushes
                            // the editor's dirty-tracking so the
                            // post-entity refetch lands cleanly.
                            wp.data.dispatch('core/editor').editPost({});
                        } catch (e) {
                            // Classic Editor — fall back to a full
                            // reload so the new src lands in DOM.
                            window.location.reload();
                        }
                    } else {
                        window.location.reload();
                    }

                    // Update the meta box body row's thumb so the
                    // user sees the swap reflected without a reload.
                    var $row = $('.structura-mb__btn--body[data-attachment-id="' + activeAttachmentId + '"]')
                        .closest('.structura-mb__body-row');
                    if ($row.length && res.data.new_url) {
                        $row.find('.structura-mb__body-thumb img').attr('src', res.data.new_url + '?t=' + Date.now());
                        // Update the data-attachment-id so the next
                        // regen click on this row chains off the
                        // new attachment's topic.
                        $row.find('.structura-mb__btn--body').attr('data-attachment-id', String(res.data.new_attachment_id));
                    }
                }

                pendingAttachmentId = null;
                closeModal();
            } else {
                $applyBtn.prop('disabled', false);
                $applyBtn.find('span').text('Use this image');
            }
        })
        .fail(function () {
            $applyBtn.prop('disabled', false);
            $applyBtn.find('span').text('Use this image');
        });
    });

})(jQuery);
