// SigilMarkets/ui/atoms/Card.tsx
"use client";

import React, { forwardRef, useMemo } from "react";

type Variant = "glass" | "glass2" | "plain";

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: Variant;
  breathe?: boolean;
};

export type CardSectionProps = React.HTMLAttributes<HTMLDivElement> & {
  compact?: boolean;
};

const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(" ");

const variantClass = (v: Variant): string => {
  switch (v) {
    case "glass2":
      return "sm-card2";
    case "plain":
      return "sm-card-plain";
    case "glass":
    default:
      return "sm-card";
  }
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "glass", breathe = false, className, children, ...rest },
  ref,
) {
  const cls = useMemo(() => cx("sm-card-core", variantClass(variant), breathe && "sm-breathe-soft", className), [variant, breathe, className]);

  return (
    <div ref={ref} className={cls} {...rest}>
      {children}
    </div>
  );
});

export const CardHeader = forwardRef<HTMLDivElement, CardSectionProps>(function CardHeader(
  { compact = false, className, children, ...rest },
  ref,
) {
  const cls = useMemo(() => cx("sm-card-header", compact && "is-compact", className), [compact, className]);
  return (
    <div ref={ref} className={cls} {...rest}>
      {children}
    </div>
  );
});

export const CardContent = forwardRef<HTMLDivElement, CardSectionProps>(function CardContent(
  { compact = false, className, children, ...rest },
  ref,
) {
  const cls = useMemo(() => cx("sm-card-content", compact && "is-compact", className), [compact, className]);
  return (
    <div ref={ref} className={cls} {...rest}>
      {children}
    </div>
  );
});

export const CardFooter = forwardRef<HTMLDivElement, CardSectionProps>(function CardFooter(
  { compact = false, className, children, ...rest },
  ref,
) {
  const cls = useMemo(() => cx("sm-card-footer", compact && "is-compact", className), [compact, className]);
  return (
    <div ref={ref} className={cls} {...rest}>
      {children}
    </div>
  );
});
