/**
 * Structura — Gutenberg block-editor extension.
 *
 * Adds a branded "Regenerate with Structura" toolbar button to every
 * `core/image` block whose attachment we generated. Clicking the
 * button is a SHORTCUT — it doesn't render its own preview / progress
 * UI; instead it opens the post-meta-box modal (the canonical regen
 * surface) with the right slot + attachment pre-selected.
 *
 * Why "shortcut and reuse" rather than a self-contained block-level
 * regen panel: the modal already has progress bar, preview, prompt
 * editing, apply/retry, and cleanup-on-discard. Duplicating any of
 * those on the toolbar surface would mean two places to maintain the
 * same UX (and they'd silently drift). The shortcut just calls
 * `.click()` on the matching meta-box button — the existing modal
 * handler picks up the slot + attachment id from data-* attributes
 * and continues identically to the sidebar flow.
 *
 * Visibility rules: the button only renders when the attachment has
 * `_structura_image_slot` meta (gates out hand-uploaded images) AND
 * the slot isn't `featured` (featured-image regen lives in the
 * meta-box sidebar — not in `post_content`).
 */
( function ( wp ) {
	'use strict';

	const { addFilter } = wp.hooks;
	const { createElement: el, Fragment } = wp.element;
	const { ToolbarButton, ToolbarGroup } = wp.components;
	const { BlockControls } = wp.blockEditor;
	const { useSelect } = wp.data;
	const { __ } = wp.i18n;
	const { createHigherOrderComponent } = wp.compose;

	/** Read the attachment's Structura slot meta from `core` data. */
	function useStructuraBodySlot( attachmentId ) {
		return useSelect(
			function ( select ) {
				if ( ! attachmentId ) return null;
				const media = select( 'core' ).getMedia( attachmentId );
				if ( ! media ) return null;
				const meta = media.meta || {};
				const slot = meta._structura_image_slot;
				if ( typeof slot !== 'string' || slot === '' || slot === 'featured' ) {
					return null;
				}
				return slot;
			},
			[ attachmentId ]
		);
	}

	/**
	 * Trigger the matching meta-box body-image button. The button
	 * carries `data-attachment-id="N"`; clicking it fires the same
	 * delegated handler that opens the modal with slot + attachment
	 * already wired up.
	 *
	 * If the meta-box isn't on the page (shouldn't happen — the
	 * enqueue is gated on the same Structura provenance check), we
	 * silently no-op rather than crash.
	 */
	function openStructuraRegenModal( attachmentId ) {
		const selector = '.structura-mb__btn--body[data-attachment-id="' + attachmentId + '"]';
		const trigger = document.querySelector( selector );
		if ( trigger ) {
			trigger.click();
		}
	}

	/**
	 * Branded Structura mark — small "S" inside an indigo rounded
	 * square. Inlined as a React element rather than an SVG asset
	 * so we don't have to manage a separate URL across the
	 * plugin's build/deploy.
	 */
	function StructuraIcon() {
		return el(
			'svg',
			{
				width: 20,
				height: 20,
				viewBox: '0 0 24 24',
				xmlns: 'http://www.w3.org/2000/svg',
				'aria-hidden': true,
			},
			el( 'rect', {
				x: 2,
				y: 2,
				width: 20,
				height: 20,
				rx: 5,
				fill: '#4F46E5',
			} ),
			el( 'path', {
				d: 'M14.5 8.5c-.4-.7-1.3-1.1-2.4-1.1-1.5 0-2.6.7-2.6 2 0 1 .7 1.6 2 1.9l1.4.3c1.7.4 2.7 1.2 2.7 2.6 0 1.7-1.4 2.8-3.6 2.8-1.6 0-2.9-.6-3.4-1.6',
				stroke: '#fff',
				strokeWidth: 1.6,
				strokeLinecap: 'round',
				fill: 'none',
			} ),
		);
	}

	const withStructuraImageRegen = createHigherOrderComponent( function ( BlockEdit ) {
		return function StructuraEnhancedImage( props ) {
			if ( props.name !== 'core/image' ) {
				return el( BlockEdit, props );
			}

			const slot = useStructuraBodySlot( props.attributes.id );

			// Render the stock Edit unchanged for non-Structura images
			// or when the attachment is the featured image (handled by
			// the sidebar, not in `post_content`).
			if ( ! slot || ! props.isSelected ) {
				return el( BlockEdit, props );
			}

			return el(
				Fragment,
				null,
				el( BlockEdit, props ),
				el( BlockControls, null,
					el( ToolbarGroup, null,
						el( ToolbarButton, {
							icon: el( StructuraIcon ),
							label: __( 'Regenerate with Structura', 'structura' ),
							onClick: function () {
								openStructuraRegenModal( props.attributes.id );
							},
						} )
					)
				)
			);
		};
	}, 'withStructuraImageRegen' );

	addFilter(
		'editor.BlockEdit',
		'structura/image-regen',
		withStructuraImageRegen
	);
}( window.wp ) );
