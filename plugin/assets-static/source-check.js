/**
 * Structura — Source check notes in the post editor.
 *
 * The notes are rendered server-side inside the Structura meta box
 * (`Post_Meta_Box::render_source_check`). This script adds what needs the
 * editor: expanding a note, "Show in text" (a highlight on the note's
 * sentence through WordPress's `core/annotations` store, the mechanism
 * behind Yoast's eye icon; never saved into the post), marking a note
 * whose text is gone as outdated, and recording Dismiss / Undo.
 *
 * In the classic editor `wp.data` is absent: notes expand and can be
 * dismissed, nothing else. Spec: specs/source-check.md §9.4.
 */
( function ( window, document ) {
	'use strict';

	var config = window.structuraSourceCheck;
	var root = document.getElementById( 'structura-source-check' );
	if ( ! config || ! root ) {
		return;
	}

	var wp = window.wp;
	var SOURCE = 'structura-source-check';
	var blockEditor = !! ( config.blockEditor && wp && wp.data && wp.data.select( 'core/block-editor' ) && wp.annotations );
	var i18n = config.i18n || {};
	var notesById = {};
	( config.notes || [] ).forEach( function ( n ) {
		notesById[ n.id ] = n;
	} );
	var highlightedId = null;

	/* ── DOM helpers ───────────────────────────────────────────────────────── */

	function card( id ) {
		return root.querySelector( '.structura-sc__note[data-note-id="' + id + '"]' );
	}

	function fmt( template, n ) {
		return String( template || '%d' ).replace( '%d', String( n ) );
	}

	function plural( n, one, other ) {
		return fmt( n === 1 ? one : other, n );
	}

	/** Re-derive the counter, the empty line and the resolved summary from the DOM. */
	function refreshCounts() {
		var openList = root.querySelector( '[data-sc-open]' );
		var resolvedBox = root.querySelector( '[data-sc-resolved]' );
		var resolvedList = root.querySelector( '[data-sc-resolved-list]' );
		var openCount = root.querySelectorAll( '[data-sc-open] .structura-sc__note[data-status="open"]' ).length;
		var pendingCount = openList ? openList.querySelectorAll( '.structura-sc__note' ).length : 0;
		var resolvedCount = resolvedList ? resolvedList.querySelectorAll( '.structura-sc__note' ).length : 0;
		var counter = root.querySelector( '[data-sc-count]' );
		var empty = root.querySelector( '[data-sc-empty]' );

		root.setAttribute( 'data-open-count', String( openCount ) );
		if ( counter ) {
			counter.textContent = openCount > 0 ? plural( openCount, i18n.toReviewOne, i18n.toReviewOther ) : ( i18n.allResolved || '' );
			counter.classList.toggle( 'structura-sc__count--open', openCount > 0 );
		}
		if ( openList ) {
			openList.hidden = pendingCount === 0;
		}
		if ( empty ) {
			empty.hidden = pendingCount > 0;
		}
		if ( resolvedBox ) {
			resolvedBox.hidden = resolvedCount === 0;
			var summary = resolvedBox.querySelector( '[data-sc-resolved-summary]' );
			if ( summary ) {
				summary.textContent = plural( resolvedCount, i18n.resolvedOne, i18n.resolvedOther );
			}
		}
	}

	/** Move a card between the open and resolved lists and flip its buttons. */
	function setStatus( id, status ) {
		var el = card( id );
		if ( ! el ) {
			return;
		}
		var resolvable = status === 'open' || status === 'outdated';
		el.setAttribute( 'data-status', status );
		if ( notesById[ id ] ) {
			notesById[ id ].status = status;
		}
		var label = el.querySelector( '[data-sc-status-label]' );
		if ( label ) {
			label.hidden = status !== 'outdated';
		}
		var dismiss = el.querySelector( '[data-sc-action="dismiss"]' );
		var undo = el.querySelector( '[data-sc-action="undo"]' );
		var accept = el.querySelector( '[data-sc-action="accept"]' );
		if ( dismiss ) {
			dismiss.hidden = ! resolvable;
		}
		if ( accept ) {
			accept.hidden = ! ( blockEditor && status === 'open' );
		}
		if ( undo ) {
			undo.hidden = resolvable;
		}
		var target = root.querySelector( resolvable ? '[data-sc-open]' : '[data-sc-resolved-list]' );
		if ( target && el.parentNode !== target ) {
			target.appendChild( el );
		}
		if ( ! resolvable && highlightedId === id ) {
			clearHighlight();
		}
		refreshCounts();
	}

	/* ── Persistence ───────────────────────────────────────────────────────── */

	function persist( patch, onError ) {
		var body = new window.URLSearchParams();
		body.append( 'action', 'structura_source_check_status' );
		body.append( 'nonce', config.nonce );
		body.append( 'post_id', String( config.postId ) );
		body.append( 'notes', JSON.stringify( patch ) );
		return window
			.fetch( config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: body } )
			.then( function ( res ) {
				return res.json();
			} )
			.then( function ( json ) {
				if ( ! json || ! json.success ) {
					throw new Error( 'save failed' );
				}
				return json.data;
			} )
			.catch( function () {
				if ( onError ) {
					onError();
				}
			} );
	}

	function notice( text ) {
		var el = root.querySelector( '[data-sc-notice]' );
		if ( ! el ) {
			el = document.createElement( 'p' );
			el.className = 'structura-sc__notice';
			el.setAttribute( 'data-sc-notice', '' );
			el.setAttribute( 'role', 'status' );
			root.appendChild( el );
		}
		el.textContent = text;
		el.hidden = ! text;
	}

	/* ── Locating a note in the block editor ───────────────────────────────── */

	/** Plain text of a rich-text attribute (string or RichTextData). */
	function plainText( value ) {
		if ( value === null || typeof value === 'undefined' ) {
			return '';
		}
		var html = typeof value === 'string' ? value : ( typeof value.toHTMLString === 'function' ? value.toHTMLString() : String( value ) );
		try {
			return wp.richText.create( { html: html } ).text;
		} catch ( e ) {
			return html.replace( /<[^>]+>/g, '' );
		}
	}

	/** Every searchable text field of the document, in reading order. */
	function textUnits() {
		var units = [];
		function walk( blocks ) {
			blocks.forEach( function ( block ) {
				var attrs = block.attributes || {};
				if ( block.name === 'core/table' ) {
					[ 'head', 'body', 'foot' ].forEach( function ( section ) {
						( attrs[ section ] || [] ).forEach( function ( row, r ) {
							( row.cells || [] ).forEach( function ( cell, c ) {
								units.push( { clientId: block.clientId, identifier: section + '-' + r + '-' + c, text: plainText( cell.content ), highlight: false } );
							} );
						} );
					} );
				} else {
					if ( typeof attrs.content !== 'undefined' ) {
						units.push( { clientId: block.clientId, identifier: 'content', text: plainText( attrs.content ), highlight: true } );
					}
					if ( block.name === 'core/details' && typeof attrs.summary !== 'undefined' ) {
						units.push( { clientId: block.clientId, identifier: 'summary', text: plainText( attrs.summary ), highlight: true } );
					}
					if ( typeof attrs.citation !== 'undefined' ) {
						units.push( { clientId: block.clientId, identifier: 'citation', text: plainText( attrs.citation ), highlight: true } );
					}
				}
				if ( block.innerBlocks && block.innerBlocks.length ) {
					walk( block.innerBlocks );
				}
			} );
		}
		walk( wp.data.select( 'core/block-editor' ).getBlocks() );
		return units;
	}

	/**
	 * Where a note's quote sits now: a block unit and a range in its plain
	 * text, or null when the text is gone. Excerpt notes resolve against the
	 * excerpt field (no highlight); meta description notes are never checked
	 * here (an SEO plugin owns that field).
	 */
	function locate( note ) {
		var quote = plainText( note.quote );
		if ( ! quote ) {
			return null;
		}
		if ( note.where === 'excerpt' ) {
			var excerpt = wp.data.select( 'core/editor' ).getEditedPostAttribute( 'excerpt' ) || '';
			return plainText( excerpt ).indexOf( quote ) >= 0 ? { excerpt: true } : null;
		}
		if ( note.where !== 'body' ) {
			return { unchecked: true };
		}
		var units = textUnits();
		for ( var i = 0; i < units.length; i++ ) {
			var at = units[ i ].text.indexOf( quote );
			if ( at >= 0 ) {
				return { clientId: units[ i ].clientId, identifier: units[ i ].identifier, start: at, end: at + quote.length, highlight: units[ i ].highlight };
			}
		}
		return null;
	}

	/* ── Highlight ─────────────────────────────────────────────────────────── */

	function clearHighlight() {
		if ( blockEditor ) {
			wp.data.dispatch( 'core/annotations' ).__experimentalRemoveAnnotationsBySource( SOURCE );
		}
		if ( highlightedId ) {
			var btn = card( highlightedId ) && card( highlightedId ).querySelector( '[data-sc-action="show"]' );
			if ( btn ) {
				btn.setAttribute( 'aria-pressed', 'false' );
				btn.textContent = i18n.showInText || 'Show in text';
			}
		}
		highlightedId = null;
	}

	function scrollToBlock( clientId ) {
		var selector = '[data-block="' + clientId + '"]';
		var el = document.querySelector( selector );
		if ( ! el ) {
			var iframe = document.querySelector( 'iframe[name="editor-canvas"]' );
			if ( iframe && iframe.contentDocument ) {
				el = iframe.contentDocument.querySelector( selector );
			}
		}
		if ( el && typeof el.scrollIntoView === 'function' ) {
			el.scrollIntoView( { block: 'center', behavior: 'smooth' } );
		}
	}

	function toggleHighlight( id ) {
		if ( highlightedId === id ) {
			clearHighlight();
			return;
		}
		clearHighlight();
		var note = notesById[ id ];
		var loc = note ? locate( note ) : null;
		if ( ! loc || ! loc.clientId ) {
			notice( i18n.notFound || '' );
			return;
		}
		notice( '' );
		if ( loc.highlight ) {
			wp.data.dispatch( 'core/annotations' ).__experimentalAddAnnotation( {
				source: SOURCE,
				blockClientId: loc.clientId,
				richTextIdentifier: loc.identifier,
				range: { start: loc.start, end: loc.end },
			} );
		}
		scrollToBlock( loc.clientId );
		highlightedId = id;
		var btn = card( id ) && card( id ).querySelector( '[data-sc-action="show"]' );
		if ( btn ) {
			btn.setAttribute( 'aria-pressed', 'true' );
			btn.textContent = i18n.hideInText || 'Hide highlight';
		}
	}

	/* ── Accept a suggestion ───────────────────────────────────────────────── */

	/**
	 * Accepted notes are persisted only once the post is saved: the text
	 * change lives in editor state until then, and a reload without saving
	 * must bring the note back as open.
	 */
	var pendingAccepted = [];

	/** Replace `[start, end)` of a rich-text attribute, keeping inline formats around it. */
	function spliceRichText( html, start, end, replacement ) {
		var value = wp.richText.create( { html: typeof html === 'string' ? html : ( html && typeof html.toHTMLString === 'function' ? html.toHTMLString() : String( html ) ) } );
		var text = value.text;
		// Removing a sentence also removes the space that separated it.
		if ( replacement === '' ) {
			if ( end < text.length && text.charAt( end ) === ' ' ) {
				end += 1;
			} else if ( start > 0 && text.charAt( start - 1 ) === ' ' ) {
				start -= 1;
			}
		}
		var next = wp.richText.remove( value, start, end );
		if ( replacement !== '' ) {
			next = wp.richText.insert( next, replacement, start );
		}
		return wp.richText.toHTMLString( { value: next } );
	}

	function acceptSuggestion( id ) {
		var note = notesById[ id ];
		if ( ! note || typeof note.suggestion !== 'string' ) {
			return;
		}
		var replacement = plainText( note.suggestion );
		if ( note.where === 'excerpt' ) {
			var excerpt = wp.data.select( 'core/editor' ).getEditedPostAttribute( 'excerpt' ) || '';
			var at = excerpt.indexOf( plainText( note.quote ) );
			if ( at < 0 ) {
				notice( i18n.acceptFailed || '' );
				return;
			}
			wp.data.dispatch( 'core/editor' ).editPost( { excerpt: excerpt.slice( 0, at ) + replacement + excerpt.slice( at + plainText( note.quote ).length ) } );
		} else {
			var loc = locate( note );
			if ( ! loc || ! loc.clientId || ! loc.highlight ) {
				notice( i18n.acceptFailed || '' );
				return;
			}
			var attrs = wp.data.select( 'core/block-editor' ).getBlockAttributes( loc.clientId ) || {};
			var update = {};
			update[ loc.identifier ] = spliceRichText( attrs[ loc.identifier ], loc.start, loc.end, replacement );
			wp.data.dispatch( 'core/block-editor' ).updateBlockAttributes( loc.clientId, update );
			scrollToBlock( loc.clientId );
		}
		clearHighlight();
		setStatus( id, 'accepted' );
		if ( pendingAccepted.indexOf( id ) < 0 ) {
			pendingAccepted.push( id );
		}
		notice( i18n.accepted || '' );
	}

	/** After a real save: record the accepted notes whose text is now in the post. */
	function flushAccepted() {
		if ( ! pendingAccepted.length ) {
			return;
		}
		var patch = pendingAccepted.map( function ( id ) {
			return { id: id, status: 'accepted' };
		} );
		pendingAccepted = [];
		notice( '' );
		persist( patch, function () {
			notice( i18n.saveFailed || '' );
		} );
	}

	/* ── Outdated detection ────────────────────────────────────────────────── */

	/**
	 * An open note whose text is gone becomes outdated; an outdated note
	 * whose text is back becomes open. Persisted at once, so a note never
	 * stays open after its sentence was removed.
	 */
	function checkOutdated() {
		var patch = [];
		Object.keys( notesById ).forEach( function ( id ) {
			var note = notesById[ id ];
			if ( note.status !== 'open' && note.status !== 'outdated' ) {
				return;
			}
			var loc = locate( note );
			if ( loc && loc.unchecked ) {
				return;
			}
			var next = loc ? 'open' : 'outdated';
			if ( next !== note.status ) {
				setStatus( id, next );
				patch.push( { id: id, status: next } );
			}
		} );
		if ( patch.length ) {
			persist( patch );
		}
	}

	function watchEditor() {
		var checked = false;
		var wasSaving = false;
		var unsubscribe = wp.data.subscribe( function () {
			var editor = wp.data.select( 'core/editor' );
			if ( ! checked && wp.data.select( 'core/block-editor' ).getBlocks().length > 0 ) {
				checked = true;
				checkOutdated();
			}
			var saving = editor.isSavingPost() && ! editor.isAutosavingPost();
			if ( wasSaving && ! saving ) {
				flushAccepted();
				checkOutdated();
			}
			wasSaving = saving;
		} );
		// A post with no blocks at all never fires the first check above.
		window.setTimeout( function () {
			if ( ! checked ) {
				checked = true;
				checkOutdated();
			}
		}, 4000 );
		return unsubscribe;
	}

	/* ── Wiring ────────────────────────────────────────────────────────────── */

	root.addEventListener( 'click', function ( event ) {
		var btn = event.target.closest( '[data-sc-action]' );
		if ( ! btn || ! root.contains( btn ) ) {
			return;
		}
		var el = btn.closest( '.structura-sc__note' );
		var id = el ? el.getAttribute( 'data-note-id' ) : null;
		var action = btn.getAttribute( 'data-sc-action' );
		if ( action === 'toggle' && el ) {
			var body = el.querySelector( '.structura-sc__body' );
			var open = btn.getAttribute( 'aria-expanded' ) === 'true';
			btn.setAttribute( 'aria-expanded', open ? 'false' : 'true' );
			if ( body ) {
				body.hidden = open;
			}
			return;
		}
		if ( action === 'show' && id ) {
			toggleHighlight( id );
			return;
		}
		if ( action === 'accept' && id ) {
			acceptSuggestion( id );
			return;
		}
		if ( ( action === 'dismiss' || action === 'undo' ) && id ) {
			var previous = notesById[ id ] ? notesById[ id ].status : 'open';
			var next = action === 'dismiss' ? 'dismissed' : 'open';
			var pendingAt = pendingAccepted.indexOf( id );
			if ( pendingAt >= 0 ) {
				// Accepted but not saved yet: nothing was persisted, so only the card moves back.
				pendingAccepted.splice( pendingAt, 1 );
				setStatus( id, 'open' );
				return;
			}
			btn.disabled = true;
			setStatus( id, next );
			persist( [ { id: id, status: next } ], function () {
				setStatus( id, previous );
				notice( i18n.saveFailed || '' );
			} ).then( function () {
				btn.disabled = false;
			} );
		}
	} );

	if ( blockEditor ) {
		root.querySelectorAll( '[data-sc-action="show"]' ).forEach( function ( btn ) {
			btn.hidden = false;
		} );
		root.querySelectorAll( '.structura-sc__note[data-status="open"] [data-sc-action="accept"]' ).forEach( function ( btn ) {
			btn.hidden = false;
		} );
		if ( wp.domReady ) {
			wp.domReady( watchEditor );
		} else {
			watchEditor();
		}
	}
}( window, document ) );
