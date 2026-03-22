import React from "react";
import type { SnapshotContextValue } from "./snapshotContext";
import { SsrSnapshotContext } from "./snapshotContext";

export function SsrSnapshotProvider({
  snapshot,
  children,
}: {
  snapshot: SnapshotContextValue;
  children: React.ReactNode;
}): React.JSX.Element {
  return <SsrSnapshotContext.Provider value={snapshot}>{children}</SsrSnapshotContext.Provider>;
}
