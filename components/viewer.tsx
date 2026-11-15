import AsyncStorage from "@react-native-async-storage/async-storage";
import { useGlobalSearchParams } from "expo-router";
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";

import { acceptLink, restoreViewer, ViewerState } from "./viewer-state";

const KEY = "ravo.viewerToken";
const ViewerContext = createContext<{ token: string | null; ready: boolean }>({ token: null, ready: false });

export function ViewerProvider({ children }: { children: ReactNode }) {
  const { t } = useGlobalSearchParams<{ t?: string | string[] }>();
  const link = Array.isArray(t) ? "" : t;
  const [state, setState] = useState<ViewerState>({ token: null, ready: false, link: undefined });
  const writes = useRef(Promise.resolve());
  const current = acceptLink(state, link);
  if (current !== state) setState(current);

  useEffect(() => {
    if (state.link === undefined) return;
    writes.current = writes.current.catch(() => {}).then(() => state.token ? AsyncStorage.setItem(KEY, state.token) : AsyncStorage.removeItem(KEY)).catch(() => {});
  }, [state.link, state.token]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(KEY).catch(() => null).then((value) => {
      if (active) setState(previous => restoreViewer(previous, value));
    });
    return () => { active = false; };
  }, []);

  return <ViewerContext.Provider value={{ token: current.token, ready: current.ready }}>{children}</ViewerContext.Provider>;
}

export function useViewerToken() {
  return useContext(ViewerContext);
}
