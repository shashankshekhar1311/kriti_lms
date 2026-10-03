"use client";

import { LayoutPreferenceProvider } from "@/components/drona/LayoutPreferenceProvider";
import { LayoutChooserModal } from "@/components/drona/LayoutChooserModal";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LayoutPreferenceProvider>
      {children}
      <LayoutChooserModal />
    </LayoutPreferenceProvider>
  );
}
