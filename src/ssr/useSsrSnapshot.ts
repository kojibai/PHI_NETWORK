import React from "react";
import { SsrSnapshotContext, type SnapshotContextValue } from "./snapshotContext";

export function useSsrSnapshot(): SnapshotContextValue {
  return React.useContext(SsrSnapshotContext);
}
