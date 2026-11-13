import { __ } from "@wordpress/i18n";
import { ConfirmDialog } from "@structura/ui";

/**
 * Asks before a positioning AI draft replaces the operator's text
 * (specs/site-reading.md §11). Shared by the Site → Info positioning card and
 * the setup wizard's positioning step; when it opens is
 * `utils/positioningRedraft`'s rule.
 */
export const RedraftConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) => (
  <ConfirmDialog
    isOpen={isOpen}
    onClose={onClose}
    onConfirm={onConfirm}
    title={__("Replace your edits?", "structura")}
    description={__(
      "We'll read your site's pages again and rewrite your positioning. Your edits will be replaced.",
      "structura",
    )}
    confirmButtonProps={{ label: __("Replace", "structura") }}
    cancelButtonProps={{ label: __("Keep mine", "structura") }}
  />
);
