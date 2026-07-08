import { useState } from "react";
import { __ } from "@wordpress/i18n";
import {
  Key,
  RefreshCw,
  Trash2,
  Type,
  Image,
  Lock,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { Badge, Button, ConfirmDialog, InputField, cn } from "@structura/ui";

import { useSaveKey } from "../api/useSaveKey";
import { useProviderPulse } from "../api/useProviderPulse";
import { useDisconnectProvider } from "../api/useDisconnectProvider";

interface ProviderCatalogCardProps {
  /** Provider ID from the catalog (e.g., "openai", "gemini"). */
  id: string;
  /** Human-readable provider name. */
  name: string;
  /** Short description of what the provider offers. */
  description: string;
  /** Capabilities this provider supports. */
  capabilities: Array<"text" | "image">;
  /** Whether the user has connected this provider with an API key. */
  connected: boolean;
  /** Masked API key for display (e.g., "sk-...abc"). */
  maskedKey?: string;
  /** URL where the user can get an API key. */
  keyUrl: string;
  /** Placeholder for the key input (e.g., "sk-..."). */
  keyPrefix?: string;
  /** Whether this provider is available at the user's tier. */
  available: boolean;
  /** Minimum tier required (for teaser display). */
  minTier: string;
  /** Whether the user is on Cloud tier (hides key management). */
  isCloud: boolean;
  /** Current latency in ms, if known. */
  latency?: number | null;
}

// Labels resolve at render-time (not module-init) so @wordpress/i18n's
// locale data is guaranteed to be loaded — see AvailableProviderCard for
// the same rationale.
const CAPABILITY_META: Record<
  string,
  { labelKey: "text" | "image"; icon: React.ElementType; color: string }
> = {
  text: {
    labelKey: "text",
    icon: Type,
    color: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  },
  image: {
    labelKey: "image",
    icon: Image,
    color:
      "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800",
  },
};

const capabilityLabel = (key: "text" | "image"): string =>
  key === "text" ? __("Text", "structura") : __("Image", "structura");

const tierLabel = (tier: string): string => {
  switch (tier) {
    case "none":
      return __("Starter", "structura");
    case "free":
      return __("Free", "structura");
    case "byok":
      return __("Pro", "structura");
    case "cloud":
      return __("Cloud", "structura");
    case "cloud_pro":
      return __("Agency", "structura");
    default:
      return tier;
  }
};

export const ProviderCatalogCard = ({
  id,
  name,
  description,
  capabilities,
  connected,
  maskedKey,
  keyUrl,
  keyPrefix,
  available,
  minTier,
  isCloud,
  latency: externalLatency,
}: ProviderCatalogCardProps) => {
  const [keyInput, setKeyInput] = useState("");
  const { mutate: saveKey, isPending: isSavingKey } = useSaveKey();
  const { mutateAsync: disconnect, isPending: isDisconnecting } = useDisconnectProvider();
  const { latency: pulseLatency, isChecking, checkPulse } = useProviderPulse(id, connected);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const latency = pulseLatency ?? externalLatency ?? null;
  const isLocked = !available;

  return (
    <>
      <div
        className={cn(
          "group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-300",
          "dark:bg-neutral-900",
          isLocked
            ? "border-neutral-200/60 opacity-70 dark:border-neutral-700/60"
            : connected
              ? "border-emerald-200/60 dark:border-emerald-800/40"
              : "border-neutral-200 dark:border-neutral-700"
        )}
      >
        {/* ── Locked overlay ─────────────────────────────────────────── */}
        {isLocked && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-xs dark:bg-neutral-900/80">
            <div className="flex items-center gap-2 rounded-full bg-neutral-100 px-4 py-2 dark:bg-neutral-800">
              <Lock size={14} className="text-neutral-500" />
              <span className="text-[10px] font-black tracking-widest text-neutral-500 uppercase">
                {__("Requires", "structura")} {tierLabel(minTier)}{" "}
                {__("Plan", "structura")}
              </span>
            </div>
          </div>
        )}

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="p-6 pb-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex size-12 items-center justify-center rounded-xl shadow-sm",
                  connected
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                    : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                )}
              >
                <Key size={22} />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="m-0! text-lg leading-none font-black tracking-tight text-neutral-900 uppercase dark:text-neutral-100">
                    {name}
                  </h3>
                  {connected && (
                    <CheckCircle2 size={14} className="text-emerald-500" />
                  )}
                </div>
                <p className="m-0! mt-1 text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
                  {description}
                </p>
              </div>
            </div>

            {/* Latency + actions */}
            <div className="flex items-center gap-2">
              {latency !== null && (
                <Badge
                  variant="outline"
                  intent="secondary"
                  className="py-0 font-mono text-[9px]"
                >
                  {latency}ms
                </Badge>
              )}

              {connected && !isCloud && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => checkPulse()}
                    loading={isChecking}
                    title={__("Check connection", "structura")}
                  >
                    <RefreshCw size={13} className={isChecking ? "animate-spin" : ""} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmOpen(true)}
                    title={__("Disconnect", "structura")}
                  >
                    <Trash2 className="size-3.5 text-red-500" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* ── Capability badges ─────────────────────────────────────── */}
          <div className="mt-3 flex items-center gap-1.5">
            {capabilities.map((cap) => {
              const meta = CAPABILITY_META[cap];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <span
                  key={cap}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase",
                    meta.color
                  )}
                >
                  <Icon size={10} />
                  {capabilityLabel(meta.labelKey)}
                </span>
              );
            })}
          </div>
        </div>

        {/* ── Key input (hidden for Cloud users) ─────────────────────── */}
        {!isCloud && !isLocked && (
          <div className="space-y-2 p-6 pt-4">
            <InputField
              label={__("API Key", "structura")}
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={connected ? maskedKey : (keyPrefix ?? __("Enter API key...", "structura"))}
              autoComplete="off"
              rightAdornment={
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => {
                    saveKey({ provider: id, key: keyInput });
                    setKeyInput("");
                  }}
                  disabled={!keyInput}
                  loading={isSavingKey}
                  className="-mr-3"
                >
                  {connected ? __("Update", "structura") : __("Connect", "structura")}
                </Button>
              }
            />
            <a
              href={keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] font-medium text-neutral-400 no-underline transition-colors hover:text-brand-600 dark:text-neutral-500"
            >
              <ExternalLink size={10} />
              {__("Get API Key", "structura")}
            </a>
          </div>
        )}

        {/* Cloud users see a compact "managed" indicator */}
        {isCloud && connected && (
          <div className="px-6 pb-5 pt-4">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50/60 px-3 py-2 dark:bg-emerald-950/20">
              <CheckCircle2 size={13} className="text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                {__("Managed by Structura Cloud", "structura")}
              </span>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        variant="danger"
        loading={isDisconnecting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await disconnect(id);
          setConfirmOpen(false);
        }}
        title={__("Disconnect Provider", "structura")}
        description={__(
          "This will remove your API key. Campaigns using this provider will not be able to generate content until a new key is connected.",
          "structura"
        )}
        confirmButtonProps={{ label: __("Disconnect", "structura") }}
      />
    </>
  );
};
