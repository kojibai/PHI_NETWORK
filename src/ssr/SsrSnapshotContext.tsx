import React from "react";
import type { SsrSnapshot } from "./snapshotTypes";

type SnapshotContextValue = SsrSnapshot | null;

const SsrSnapshotContext = React.createContext<SnapshotContextValue>(null);

export function SsrSnapshotProvider({
  snapshot,
  children,
}: {
  snapshot: SnapshotContextValue;
  children: React.ReactNode;
}): React.JSX.Element {
  return <SsrSnapshotContext.Provider value={snapshot}>{children}</SsrSnapshotContext.Provider>;
}

export function useSsrSnapshot(): SnapshotContextValue {
  return React.useContext(SsrSnapshotContext);
}
