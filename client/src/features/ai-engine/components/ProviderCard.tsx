import { useState } from "react";
import { __ } from "@wordpress/i18n";
import { Key, RefreshCw, Trash2 } from "lucide-react";
import { Badge, Button, ConfirmDialog, InputField } from "@structura/ui";

// Mutations
import { useSaveKey } from "../api/useSaveKey";
import { useProviderPulse } from "../api/useProviderPulse";
import { useDisconnectProvider } from "../api/useDisconnectProvider";

interface ProviderCardProps {
  id: string;
  name: string;
  iconBg: string;
  statusData: { connected: boolean; masked?: string };
  placeholder: string;
  extraInfo?: string;
}

export const ProviderCard = ({
  id,
  name,
  iconBg,
  statusData,
  placeholder,
  extraInfo,
}: ProviderCardProps) => {
  const [keyInput, setKeyInput] = useState("");
  const { mutate: saveKey, isPending: isSavingKey } = useSaveKey();

  const isConnected = statusData.connected;

  const { mutateAsync: disconnect, isPending: isDisconnecting } = useDisconnectProvider();
  const { latency, isChecking, checkPulse } = useProviderPulse(id, isConnected);

  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div
        className={`glass-card rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm transition-all duration-300 ${isConnected ? "opacity-100" : "opacity-80"}`}
      >
        <div className="mb-8 flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg ${iconBg} text-white`}
            >
              <Key size={28} />
            </div>
            <div>
              <h3 className="m-0! text-xl leading-none font-black tracking-tight text-neutral-900 uppercase">
                {name}
              </h3>
              <div className="flex items-center gap-2">
                <div
                  className={`h-1.5 w-1.5 rounded-full ${isConnected ? "animate-pulse bg-emerald-500" : "bg-neutral-300"}`}
                />
                <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase">
                  {isConnected ? __("Authorized", "structura") : __("Key Required", "structura")}
                </span>
                {latency !== null && (
                  <Badge
                    variant="outline"
                    intent="secondary"
                    className="animate-in zoom-in-95 ml-2 py-0 font-mono text-[9px]"
                  >
                    {latency}ms
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isConnected && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => checkPulse()}
                  loading={isChecking}
                >
                  <RefreshCw size={14} className={isChecking ? "animate-spin" : ""} />
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  title={__("Disconnect Provider", "structura")}
                >
                  <Trash2 className="size-3.5 text-red-500" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <InputField
            label={__("Secure API Access Key", "structura")}
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={isConnected ? statusData.masked : placeholder}
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
                {isConnected ? __("Update Key", "structura") : __("Connect", "structura")}
              </Button>
            }
          />
          {extraInfo && (
            <p className="text-[11px] leading-relaxed text-neutral-400 italic">{extraInfo}</p>
          )}
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
        title={__("Confirm Disconnect", "structura")}
        description={__(
          "Are you sure you want to disconnect this provider? This will remove your API key.",
          "structura"
        )}
        confirmButtonProps={{
          label: __("Disconnect", "structura"),
        }}
      />
    </>
  );
};
