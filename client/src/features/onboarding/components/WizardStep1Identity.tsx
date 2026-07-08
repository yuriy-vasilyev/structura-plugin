/**
 * Step 1 — Site info confirmation with inline editing.
 *
 * The step lets the user edit `publicUrl`, `isHeadless`, and the logo
 * inline, reusing the settings feature's `usePublicSiteProfile` — the
 * wizard owns presentation, not a parallel persistence path.
 *
 * Save flow: the wizard footer's Continue button (in `OnboardingPage`)
 * triggers the step's `onContinue` handler. Edits live in the Zustand
 * store and persist at "Finish setup".
 *
 * No "what does your site do?" field here (removed 2026-06-23 for parity
 * with the portal's `IdentityStep`): "what the business does" is the
 * positioning on the SEO step, which auto-drafts from the homepage on its
 * own. Asking it twice — once here as a free-text sentence, once there as
 * structured positioning — duplicated the question and AI-filled a
 * throwaway line. Step 1 stays a fast confirm-only screen with no blocking
 * AI loader.
 */

import { useEffect, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import apiFetch from "@wordpress/api-fetch";
import { Card, Badge, FileUpload, InputField, Switch } from "@structura/ui";
import { Globe, Languages, Sparkles } from "lucide-react";

import { usePublicSiteProfile, useLicense } from "@/features/settings";

import { useWizardStore } from "../state/wizardStore";

/**
 * Upload a file to the WordPress media library and return its public
 * URL. apiFetch attaches the REST nonce; sending a FormData body lets
 * the browser set the multipart boundary — don't set Content-Type by
 * hand or core's upload handler 400s. This is the wp-admin surface's
 * wiring for `<FileUpload onUpload>`; the web portal supplies its own.
 */
async function uploadLogoToMediaLibrary(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name);
  const media = await apiFetch<{ source_url?: string }>({
    path: "/wp/v2/media",
    method: "POST",
    body: form,
  });
  if (!media?.source_url) {
    throw new Error(
      __("Upload finished but no URL came back. Please try again.", "structura"),
    );
  }
  return media.source_url;
}

interface EditableDraft {
  publicUrl: string;
  isHeadless: boolean;
  description: string;
  logoUrl: string;
}

/**
 * Step 1 — site identity confirmation.
 *
 * Deferred-save model: edits live in the Zustand store (step1 draft)
 * and persist only at "Finish setup". No per-step server write.
 * Step 1 is always VALID — site info is confirm-only and every field
 * has an acceptable default, so it never blocks Continue.
 */
export const WizardStep1Identity = () => {
  const { data: profile, isLoading } = usePublicSiteProfile();
  const { isPaidLicense } = useLicense();
  const step1Draft = useWizardStore((s) => s.drafts.step1);
  const setStep1Draft = useWizardStore((s) => s.setStep1Draft);
  const setStepValid = useWizardStore((s) => s.setStepValid);

  // Local mirror so typing is snappy; commits to the store on change.
  const [draft, setDraft] = useState<EditableDraft | null>(
    step1Draft ?? null,
  );

  // Hydrate from the store draft (if returning) or the server profile
  // (first visit). Store draft wins — it's the user's in-flight work.
  useEffect(() => {
    if (draft) return;
    if (step1Draft) {
      setDraft(step1Draft);
      return;
    }
    if (profile) {
      setDraft({
        publicUrl: profile.publicUrl,
        isHeadless: profile.isHeadless,
        description: profile.description,
        logoUrl: profile.logoUrl ?? "",
      });
    }
  }, [profile, step1Draft, draft]);

  // Backfill the logo from WordPress's custom logo whenever the field is
  // empty. The plugin resolves `profile.logoUrl` from
  // get_theme_mod('custom_logo') (with a site-icon fallback) — but a
  // persisted draft restored from a prior session (or one that predates the
  // logo field) can land here with an empty logoUrl even though a custom
  // logo IS set. Runs AFTER hydration and only fills a blank, so it never
  // clobbers a logo the user uploaded/pasted.
  useEffect(() => {
    if (!draft) return;
    if (draft.logoUrl) return;
    if (!profile?.logoUrl) return;
    update({ logoUrl: profile.logoUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.logoUrl, draft]);

  // Mirror every edit into the store + mark the step valid.
  useEffect(() => {
    if (!draft) return;
    setStep1Draft(draft);
    setStepValid(1, true);
  }, [draft, setStep1Draft, setStepValid]);

  const update = (patch: Partial<EditableDraft>) =>
    setDraft((d) => ({
      ...(d ?? {
        publicUrl: "",
        isHeadless: false,
        description: "",
        logoUrl: "",
      }),
      ...patch,
    }));

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 text-center">
        <h1 className="m-0! text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {__("Quick site check", "structura")}
        </h1>
        <p className="m-0! text-base text-neutral-600 dark:text-neutral-400">
          {__(
            "We pulled these details from WordPress. Confirm them — edit anything that isn't right.",
            "structura",
          )}
        </p>
      </header>

      <Card className="flex flex-col gap-6 p-8">
        {isLoading || !profile || !draft ? (
          <div className="flex h-24 items-center justify-center">
            <span className="text-sm text-neutral-500">
              {__("Reading site identity…", "structura")}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Read-only signals — derived from WordPress install. */}
            <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field
                icon={<Globe size={14} className="text-brand-500" />}
                label={__("Site name", "structura")}
                value={profile.name || __("Not provided", "structura")}
              />
              <Field
                icon={<Sparkles size={14} className="text-brand-500" />}
                label={__("Tagline", "structura")}
                value={profile.tagline || __("Not provided", "structura")}
              />
              <Field
                icon={<Languages size={14} className="text-brand-500" />}
                label={__("Language", "structura")}
                value={
                  profile.language || __("Site default", "structura")
                }
              />
              <Field
                icon={<Globe size={14} className="text-brand-500" />}
                label={__("WordPress home URL", "structura")}
                value={profile.homeUrl || __("Not provided", "structura")}
              />
            </dl>

            {/* Logo — sits with the identity signals above (it IS brand
                identity) and feeds Step 4's "AI suggest style". Prefilled
                from WordPress's native custom-logo; drag-and-drop upload to
                the WP media library with a paste-a-URL escape hatch. Shown
                only on paid tiers, since the suggest it feeds is paid (and a
                headless install often has no WP logo to inherit). */}
            {isPaidLicense ? (
              <FileUpload
                label={__("Logo", "structura")}
                accept="image/*"
                maxSize={5 * 1024 * 1024}
                allowUrl
                value={draft.logoUrl}
                onChange={(url) => update({ logoUrl: url })}
                onUpload={uploadLogoToMediaLibrary}
                hint={__(
                  "Upload your logo (or paste a URL). We use it to match the suggested image style to your brand on the Visuals step.",
                  "structura",
                )}
              />
            ) : null}

            {/* Editable fields — public site identity. */}
            <div className="flex flex-col gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {__("Headless mode", "structura")}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {__(
                      "Enable when WordPress isn't the public website (e.g. Next.js front-end pulling content via REST/GraphQL).",
                      "structura",
                    )}
                  </span>
                </div>
                <Switch
                  label={__("Headless mode", "structura")}
                  hiddenLabel
                  checked={draft.isHeadless}
                  onChange={(checked) => update({ isHeadless: checked })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <InputField
                  label={__("Public website URL", "structura")}
                  value={draft.publicUrl}
                  onChange={(e) => update({ publicUrl: e.target.value })}
                  placeholder={
                    draft.isHeadless
                      ? "https://www.example.com"
                      : profile.homeUrl
                  }
                />
                <p className="m-0! text-xs text-neutral-500 dark:text-neutral-400">
                  {draft.isHeadless
                    ? __(
                        "Where readers actually visit — used for SEO calls and image references.",
                        "structura",
                      )
                    : __(
                        "Defaults to your WordPress home URL. Leave blank to use it.",
                        "structura",
                      )}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="m-0! flex! items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <Badge intent="info">{__("Tip", "structura")}</Badge>
            <span>
              {__(
                "Everything saves at the end of setup. Need to change something later? Edit it under Site → Info.",
                "structura",
              )}
            </span>
          </p>
        </div>
      </Card>
    </div>
  );
};

const Field = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) => (
  <div className="flex flex-col gap-1">
    <dt className="m-0! flex! items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {icon}
      {label}
    </dt>
    <dd className="m-0! text-sm font-medium text-neutral-900 dark:text-neutral-100">
      {value}
    </dd>
  </div>
);
