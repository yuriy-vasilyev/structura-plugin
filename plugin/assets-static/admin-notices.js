/**
 * Shared dismiss handler for Structura's wp-admin notices.
 *
 * Every Structura notice that persists a dismissal server-side marks its
 * root element with three data attributes:
 *
 *   data-structura-dismiss-action  admin-ajax action name
 *   data-structura-dismiss-nonce   nonce for that action
 *   data-structura-dismiss-url     admin-ajax.php URL
 *
 * and optionally `data-run-ids` (JSON array) for the attention card, which
 * snoozes a list of run ids instead of a single flag.
 *
 * The click is captured via delegation so it works both for WordPress's own
 * injected `.notice-dismiss` × on `.is-dismissible` notices (common.js adds
 * that button on DOM ready) and for our bespoke buttons, which carry
 * `data-structura-dismiss-trigger`. Bespoke triggers also remove the notice
 * optimistically — a flaky network shouldn't strand the admin staring at a
 * button that doesn't respond; worst case the notice reappears next load.
 *
 * Enqueued (never inlined) so it satisfies the wp.org "use wp_enqueue"
 * guideline; the notices themselves only ship markup + data attributes.
 */
(function () {
    'use strict';

    function postDismissal(host) {
        var url = host.getAttribute('data-structura-dismiss-url') || window.ajaxurl;
        if (!url || typeof window.fetch !== 'function') {
            return;
        }
        var body = new FormData();
        body.append('action', host.getAttribute('data-structura-dismiss-action') || '');
        body.append('_wpnonce', host.getAttribute('data-structura-dismiss-nonce') || '');

        var runIds = host.getAttribute('data-run-ids');
        if (runIds) {
            try {
                // PHP expects `run_ids[]`; appending each id with the bracket
                // suffix lands in `$_POST['run_ids']` as an indexed array.
                JSON.parse(runIds).forEach(function (id) {
                    body.append('run_ids[]', String(id));
                });
            } catch (e) {
                // Malformed attribute — fall through and dismiss without ids.
            }
        }

        window.fetch(url, { method: 'POST', credentials: 'same-origin', body: body });
    }

    document.addEventListener('click', function (event) {
        var target = event.target instanceof Element ? event.target : null;
        if (!target || typeof target.closest !== 'function') {
            return;
        }
        var trigger = target.closest('[data-structura-dismiss-trigger], .notice-dismiss');
        if (!trigger) {
            return;
        }
        var host = trigger.closest('[data-structura-dismiss-action]');
        if (!host) {
            return;
        }
        if (trigger.hasAttribute('data-structura-dismiss-trigger')) {
            event.preventDefault();
            if (host.parentNode) {
                host.parentNode.removeChild(host);
            }
        }
        postDismissal(host);
    });
})();
