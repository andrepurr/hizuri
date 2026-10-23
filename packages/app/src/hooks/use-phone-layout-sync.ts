import { useEffect } from "react";
import { useAppSettings } from "@/hooks/use-settings";
import { usePhoneLayoutStore } from "@/stores/phone-layout-store";

/** Mirrors settings.phoneLayout into the store useIsCompactFormFactor reads. */
export function usePhoneLayoutSync(): void {
  const { settings, isLoading } = useAppSettings();
  const phoneLayout = settings.phoneLayout;
  useEffect(() => {
    if (isLoading) return;
    usePhoneLayoutStore.getState().setPhoneLayout(phoneLayout);
  }, [isLoading, phoneLayout]);
}
