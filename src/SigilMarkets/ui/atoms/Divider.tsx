// SigilMarkets/ui/atoms/Divider.tsx
"use client";

import React, { useMemo } from "react";

export type DividerProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Default: "soft" */
  tone?: "soft" | "strong";
  /** Default: false */
  vertical?: boolean;
};

const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(" ");

export const Divider = (props: DividerProps) => {
  const { tone = "soft", vertical = false, className, ...rest } = props;

  const cls = useMemo(
    () => cx("sm-divider", tone === "strong" ? "is-strong" : "is-soft", vertical && "is-vertical", className),
    [tone, vertical, className],
  );

  return <div className={cls} aria-hidden="true" {...rest} />;
};
