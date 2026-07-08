import { useState } from "react";
import { __ } from "@wordpress/i18n";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Settings2,
  Trash2,
  Type,
  Image,
  ShieldCheck,
  Star,
} from "lucide-react";
import { Badge, Button, ConfirmDialog, Tooltip, cn } from "@structura/ui";
import { getProviderMeta } from "@/utils/providerMeta";
import { getProviderVisual } from "@/features/campaigns/constants";
import { useProviderPulse } from "../api/useProviderPulse";
import { useDisconnectProvider } from "../api/useDisconnectProvider";

interface InstalledProviderCardProps {
  id: string;
  name: string;
  description: string;
  capabilities: Array<"text" | "image">;
  maskedKey: string;
  isCloud: boolean;
  /** Whether this is the default text provider. */
  isDefaultText: boolean;
  /** Whether this is the default image provider. */
  isDefaultImage: boolean;
  /**
   * Phase 1.8 §1.8.4 — single-provider tiers (anonymous `none`)
   * suppress the "Default Text" / "Default Image" badges. With
   * exactly one provider configurable, the badges are noise: the
   * single provider is always the default for whatever it can do.
   * Defaults to false so existing callers (paid tiers) keep
   * showing the badges.
   */
  hideDefaultBadges?: boolean;
  /** Whether onboarding is incomplete (connected but models not selected). */
  incomplete?: boolean;
  onManage: () => void;
}

const CAPABILITY_CONFIG = {
  text: {
    label: "Text",
    icon: Type,
    classes:
      "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  },
  image: {
    label: "Image",
    icon: Image,
    classes:
      "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800",
  },
} as const;

export const InstalledProviderCard = ({
  id,
  name,
  description,
  capabilities,
  maskedKey,
  isCloud,
  isDefaultText,
  isDefaultImage,
  hideDefaultBadges = false,
  incomplete = false,
  onManage,
}: InstalledProviderCardProps) => {
  const { latency, isChecking, checkPulse } = useProviderPulse(id, true);
  const { mutateAsync: disconnect, isPending: isDisconnecting } = useDisconnectProvider();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const meta = getProviderMeta(id);
  const providerVis = getProviderVisual(id);

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col rounded-2xl border bg-white shadow-sm transition-all dark:bg-neutral-900",
          incomplete
            ? "border-amber-300/60 dark:border-amber-700/40"
            : cn(providerVis.border, providerVis.glow)
        )}
      >
        {/* ── Card body ─────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-4 p-5">
          {/* Top: icon + info */}
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
              )}
            >
              {(() => { const Icon = providerVis.icon; return <Icon size={22} />; })()}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="m-0! truncate text-sm leading-tight font-bold text-neutral-900 dark:text-neutral-100">
                  {name}
                </h3>
                {incomplete ? (
                  <Tooltip title={__("Setup incomplete — select models in the provider settings", "structura")} position="top">
                    <span className="inline-flex shrink-0">
                      <AlertTriangle size={14} className="text-amber-500" />
                    </span>
                  </Tooltip>
                ) : (
                  <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
                )}
              </div>
              <p className="m-0! mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
                {description}
              </p>
            </div>
          </div>

          {/* Middle: capability badges + default badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            {capabilities.map((cap) => {
              const cfg = CAPABILITY_CONFIG[cap];
              if (!cfg) return null;
              const Icon = cfg.icon;
              return (
                <span
                  key={cap}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase",
                    cfg.classes
                  )}
                >
                  <Icon size={10} />
                  {cfg.label}
                </span>
              );
            })}

            {incomplete && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-700 uppercase dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                <AlertTriangle size={9} />
                {__("Incomplete Setup", "structura")}
              </span>
            )}

            {isDefaultText && !hideDefaultBadges && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-600 uppercase dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                <Star size={9} />
                {__("Default Text", "structura")}
              </span>
            )}
            {isDefaultImage && !hideDefaultBadges && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-600 uppercase dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                <Star size={9} />
                {__("Default Image", "structura")}
              </span>
            )}
          </div>

          {/* Bottom: key / managed + actions */}
          <div className="flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
            {isCloud ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <ShieldCheck size={12} />
                {__("Managed by Structura Cloud", "structura")}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-neutral-300 dark:text-neutral-600">
                {maskedKey}
              </span>
            )}

            <div className="flex items-center gap-1">
              {latency !== null && (
                <Badge variant="outline" intent="secondary" className="py-0 font-mono text-[9px]">
                  {latency}ms
                </Badge>
              )}
              {!isCloud && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => checkPulse()}
                    loading={isChecking}
                    title={__("Check connection", "structura")}
                  >
                    <RefreshCw size={12} className={isChecking ? "animate-spin" : ""} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onManage}
                    title={__("Manage", "structura")}
                  >
                    <Settings2 size={12} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmOpen(true)}
                    title={__("Disconnect", "structura")}
                  >
                    <Trash2 className="size-3 text-red-500" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
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
