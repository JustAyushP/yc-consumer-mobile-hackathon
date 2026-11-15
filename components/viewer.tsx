import AsyncStorage from "@react-native-async-storage/async-storage";
import { useGlobalSearchParams } from "expo-router";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";

const KEY = "ravo.viewerToken";
const ViewerContext = createContext<{ token: string | null; ready: boolean }>({ token: null, ready: false });

/** Holds the viewer token from the player's texted link (deep link or ?t= on web) and remembers it on the device. */
export function ViewerProvider({ children }: { children: ReactNode }) {
  const { t } = useGlobalSearchParams<{ t?: string }>();
  const [stored, setStored] = useState<{ value: string | null } | null>(null);

  useEffect(() => {
    if (t) AsyncStorage.setItem(KEY, t);
  }, [t]);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((value) => setStored({ value }));
  }, []);

  return <ViewerContext.Provider value={{ token: t ?? stored?.value ?? null, ready: !!t || stored !== null }}>{children}</ViewerContext.Provider>;
}

export function useViewerToken() {
  return useContext(ViewerContext);
}
