import { create } from "zustand";

// hizuri: the "Phone layout on wide screens" setting (settings.phoneLayout), mirrored here so
// useIsCompactFormFactor can read it without a query client: it runs in 180 places, some inside
// plugin trees that have their own. PhoneLayoutSync (hooks/use-phone-layout-sync.ts) keeps it in
// step with the stored setting; until settings load it holds the default, so a cold start paints
// the phone layout at once instead of switching after the first frame.

interface PhoneLayoutState {
  phoneLayout: boolean;
  setPhoneLayout: (phoneLayout: boolean) => void;
}

export const usePhoneLayoutStore = create<PhoneLayoutState>((set) => ({
  phoneLayout: true,
  setPhoneLayout: (phoneLayout) =>
    set((state) => (state.phoneLayout === phoneLayout ? state : { phoneLayout })),
}));
