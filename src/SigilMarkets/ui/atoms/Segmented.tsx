// SigilMarkets/ui/atoms/Segmented.tsx
"use client";

import React, { useMemo } from "react";

export type SegmentedOption<T extends string> = Readonly<{
  value: T;
  label: string;
  tone?: "default" | "cyan" | "violet" | "gold" | "danger" | "success";
}>;

export type SegmentedProps<T extends string> = Readonly<{
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (next: T) => void;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}>;

const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(" ");

const toneClass = (tone: NonNullable<SegmentedOption<string>["tone"]>): string => {
  switch (tone) {
    case "cyan":
      return "is-cyan";
    case "violet":
      return "is-violet";
    case "gold":
      return "is-gold";
    case "danger":
      return "is-danger";
    case "success":
      return "is-success";
    default:
      return "is-default";
  }
};

export const Segmented = <T extends string>(props: SegmentedProps<T>) => {
  const { value, options, onChange, size = "md", className, disabled = false } = props;

  const cls = useMemo(() => cx("sm-seg", size === "sm" ? "is-sm" : "is-md", disabled && "is-disabled", className), [size, disabled, className]);

  return (
    <div className={cls} role="tablist" aria-label="Segmented control">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={cx("sm-seg-btn", active && "is-active", toneClass(opt.tone ?? "default"))}
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
