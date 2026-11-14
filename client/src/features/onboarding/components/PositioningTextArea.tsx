/**
 * One positioning answer: a text area held to the shared bound
 * (`POSITIONING_FIELD_MAX_LENGTH`) with its live count, as in the customer
 * portal. Shared by the Site → Info positioning card and the setup wizard's
 * positioning step. Until 2026-11-13 it stopped at 280 characters with no
 * count, and the cloud cut longer text from the portal without saying so.
 */
import { __, sprintf } from "@wordpress/i18n";
import { TextArea, type TextAreaProps } from "@structura/ui";
import { POSITIONING_FIELD_MAX_LENGTH } from "@structura/types";

export const PositioningTextArea = ({
  value,
  ...rest
}: Omit<TextAreaProps, "maxLength" | "counter"> & { value: string }) => (
  <TextArea
    {...rest}
    value={value}
    maxLength={POSITIONING_FIELD_MAX_LENGTH}
    counter={{
      text: sprintf(
        /* translators: 1: characters in the answer, 2: the most it may hold. */
        __("%1$d of %2$d", "structura"),
        value.length,
        POSITIONING_FIELD_MAX_LENGTH,
      ),
    }}
  />
);
