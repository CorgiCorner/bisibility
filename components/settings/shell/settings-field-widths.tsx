import { cn } from "@/lib/ui/cn";
import type { ComponentPropsWithoutRef } from "react";

// Settings has exactly two field widths, and "field" is the only one an input may use.
// Before this, inputs were split across 400px (md) and 260px (sm) with a raw 240px on URL
// inspection, so a single column of controls stepped in and out three times down the page.
// One width per input; "full" is for controls that own the card row (a switch, a table).
export const settingsFieldWidths = {
  field: 340,
  full: 640,
} as const;

export type SettingsFieldWidth = keyof typeof settingsFieldWidths;

const widthClassNames = {
  field: "w-full max-w-[340px]",
  full: "w-full max-w-[640px]",
} as const satisfies Record<SettingsFieldWidth, string>;

export function settingsFieldWidthClassName(width: SettingsFieldWidth) {
  return widthClassNames[width];
}

type SettingsFieldProps = ComponentPropsWithoutRef<"div"> & {
  width?: SettingsFieldWidth;
};

export function SettingsField({
  className,
  width = "full",
  ...props
}: Readonly<SettingsFieldProps>) {
  return (
    <div
      className={cn(settingsFieldWidthClassName(width), className)}
      data-settings-field-width={width}
      {...props}
    />
  );
}
