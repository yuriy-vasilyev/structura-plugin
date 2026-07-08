/**
 * `@structura/ui/forms` — the workspace-wide form-validation layer.
 *
 * One stack for every surface (decided 2026-06-12): **zod** schemas +
 * this thin hook, paired with the `error` props the UI primitives
 * (`InputField`, `TextArea`, …) already render as red borders +
 * inline messages. Required fields get highlighted IN the form on a
 * failed submit — never a passive helper sentence next to a disabled
 * button.
 *
 * Why not Formik/RHF: those libraries OWN the form state, but our
 * forms increasingly keep state in stores (the setup wizard mirrors
 * every field into a persisted zustand draft; campaign drafts live in
 * localStorage). This hook validates whatever state shape you already
 * have and stays out of ownership entirely. The three legacy Formik+
 * Yup forms in `web/` migrate here over time — don't add new ones.
 *
 * Pattern:
 * ```tsx
 * const schema = useMemo(() => z.object({
 *   name: z.string().trim().min(1, t("errors.nameRequired")),
 *   keywords: z.array(z.string()).min(1, t("errors.keywordsRequired")),
 * }), [t]);
 * const form = useZodForm(schema, { name, keywords });
 *
 * const submit = () => {
 *   if (!form.validate()) return; // errors render from here on
 *   mutate(...);
 * };
 *
 * <InputField error={form.errors.name} ... />
 * ```
 */
import { useCallback, useState } from "react";
import type { z } from "zod";

export interface ZodFormState<TShape> {
  /**
   * First message per failed field, keyed by the issue's top-level
   * path. Empty until {@link ZodFormState.validate} has been called
   * once (submit-first display: pristine forms never show red), then
   * live — fixing a field clears its message on the next render.
   */
  errors: Partial<Record<keyof TShape & string, string>>;
  /** Current validity, regardless of whether errors are displayed. */
  isValid: boolean;
  /** True once a submit was attempted — errors render from then on. */
  submitted: boolean;
  /** Mark the form submitted and report validity. Call in the submit handler. */
  validate: () => boolean;
  /** Back to pristine (e.g. after a successful save that keeps the form mounted). */
  reset: () => void;
}

/**
 * Validate already-owned form state against a zod schema.
 *
 * Deliberately does NOT manage field values — pass whatever your
 * component/store holds. Re-renders triggered by those values keep
 * `errors` current automatically.
 */
export function useZodForm<TShape extends Record<string, unknown>>(
  schema: z.ZodType<TShape>,
  values: TShape
): ZodFormState<TShape> {
  const [submitted, setSubmitted] = useState(false);

  const result = schema.safeParse(values);
  const errors: Partial<Record<keyof TShape & string, string>> = {};
  if (submitted && !result.success) {
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "") as keyof TShape & string;
      if (key && !(key in errors)) errors[key] = issue.message;
    }
  }

  const validate = useCallback(() => {
    setSubmitted(true);
    return schema.safeParse(values).success;
  }, [schema, values]);

  return {
    errors,
    isValid: result.success,
    submitted,
    validate,
    reset: useCallback(() => setSubmitted(false), []),
  };
}
