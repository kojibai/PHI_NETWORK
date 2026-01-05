// SigilMarkets/ui/atoms/Sheet.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";

export type SheetProps = Readonly<{
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Default: "md" */
  size?: "sm" | "md" | "lg";
  /** Default: true */
  closeOnBackdrop?: boolean;
  className?: string;
}>;

const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(" ");

export const Sheet = (props: SheetProps) => {
  const { open, onClose, title, subtitle, children, footer, size = "md", closeOnBackdrop = true, className } = props;
  const mountedRef = useRef<boolean>(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const cls = useMemo(
    () => cx("sm-sheet", open && "is-open", size === "sm" ? "is-sm" : size === "lg" ? "is-lg" : "is-md", className),
    [open, size, className],
  );

  return (
    <div className={cls} aria-hidden={!open}>
      <div
        className="sm-sheet-backdrop"
        role="button"
        tabIndex={-1}
        aria-label="Close"
        onClick={() => (closeOnBackdrop ? onClose() : null)}
      />
      <div className="sm-sheet-panel" role="dialog" aria-modal="true" aria-label={title ?? "Sheet"}>
        <div className="sm-sheet-grab" aria-hidden="true">
          <span />
        </div>

        {(title || subtitle) ? (
          <div className="sm-sheet-head">
            {title ? <div className="sm-sheet-title">{title}</div> : null}
            {subtitle ? <div className="sm-sheet-subtitle">{subtitle}</div> : null}
          </div>
        ) : null}

        <div className="sm-sheet-body">{children}</div>

        {footer ? <div className="sm-sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );
};
