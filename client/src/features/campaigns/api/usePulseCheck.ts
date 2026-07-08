import { useMutation } from "@tanstack/react-query";
import { __ } from "@wordpress/i18n";
import { toast } from "@structura/ui";
import apiFetch from "@wordpress/api-fetch";

interface PulseCheckResponse {
  success: boolean;
  message: string;
}

export const usePulseCheck = () => {
  return useMutation({
    mutationFn: (): Promise<PulseCheckResponse> =>
      apiFetch({
        path: "/structura/v1/pulse/initiate",
        method: "POST",
      }),
    onSuccess: (response) => {
      if (response.success) {
        toast.success(
          response.message || __("Pulse Verified: Cloud handshake successful!", "structura")
        );
      } else {
        // Handle logic-level failures (e.g. handshake mismatch)
        toast.error(response.message || __("Pulse Failed: Cloud unreachable.", "structura"));
      }
    },
    // Global error handler takes care of network/500 errors
  });
};
