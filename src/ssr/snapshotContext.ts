import React from "react";
import type { SsrSnapshot } from "./snapshotTypes";

export type SnapshotContextValue = SsrSnapshot | null;

export const SsrSnapshotContext = React.createContext<SnapshotContextValue>(null);
