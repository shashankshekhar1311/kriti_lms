"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LAYOUT_OPTIONS,
  applyLayoutVars,
  isLayoutId,
  loadLayoutPreference,
  saveLayoutPreference,
  type LayoutId,
} from "@/lib/layout-preference";

type LayoutPreferenceContextValue = {
  layoutId: LayoutId;
  layout: (typeof LAYOUT_OPTIONS)[LayoutId];
  hydrated: boolean;
  setLayoutId: (id: LayoutId) => void;
  chooserOpen: boolean;
  openChooser: () => void;
  closeChooser: () => void;
};

const LayoutPreferenceContext =
  createContext<LayoutPreferenceContextValue | null>(null);

export function LayoutPreferenceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [layoutId, setLayoutIdState] = useState<LayoutId>("soft");
  const [hydrated, setHydrated] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    let next = loadLayoutPreference();
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get("layout");
      if (isLayoutId(fromQuery)) {
        next = fromQuery;
        saveLayoutPreference(fromQuery);
        params.delete("layout");
        const qs = params.toString();
        const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
        window.history.replaceState({}, "", url);
      }
    } catch {
      /* ignore */
    }
    setLayoutIdState(next);
    applyLayoutVars(next);
    setHydrated(true);
  }, []);

  const setLayoutId = useCallback((id: LayoutId) => {
    setLayoutIdState(id);
    saveLayoutPreference(id);
    applyLayoutVars(id);
  }, []);

  const value = useMemo(
    () => ({
      layoutId,
      layout: LAYOUT_OPTIONS[layoutId],
      hydrated,
      setLayoutId,
      chooserOpen,
      openChooser: () => setChooserOpen(true),
      closeChooser: () => setChooserOpen(false),
    }),
    [layoutId, hydrated, setLayoutId, chooserOpen]
  );

  return (
    <LayoutPreferenceContext.Provider value={value}>
      {children}
    </LayoutPreferenceContext.Provider>
  );
}

export function useLayoutPreference(): LayoutPreferenceContextValue {
  const ctx = useContext(LayoutPreferenceContext);
  if (!ctx) {
    throw new Error(
      "useLayoutPreference must be used within LayoutPreferenceProvider"
    );
  }
  return ctx;
}
