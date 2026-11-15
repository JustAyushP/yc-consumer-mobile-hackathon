import { ConvexProvider, ConvexReactClient } from "convex/react";
import { createContext, ReactNode, useContext } from "react";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
const client = url ? new ConvexReactClient(url, { unsavedChangesWarning: false }) : null;
const BackendContext = createContext(false);

export function BackendProvider({ children }: { children: ReactNode }) {
  if (!client) return children;
  return <BackendContext.Provider value={true}><ConvexProvider client={client}>{children}</ConvexProvider></BackendContext.Provider>;
}

export function useBackendReady() {
  return useContext(BackendContext);
}
