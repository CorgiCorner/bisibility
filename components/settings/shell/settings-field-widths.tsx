import { cn } from "@/lib/ui/cn";
import type { ComponentPropsWithoutRef } from "react";

export const settingsFieldWidths = {
  full: 640,
  md: 400,
  sm: 260,
} as const;

export type SettingsFieldWidth = keyof typeof settingsFieldWidths;

const widthClassNames = {
  full: "w-full max-w-[640px]",
  md: "w-full max-w-[400px]",
  sm: "w-full max-w-[260px]",
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
