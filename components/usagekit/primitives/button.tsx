"use client";
import { Button as HostButton, type ButtonProps as HostButtonProps } from "@/components/ui/Button";

type Props = Omit<HostButtonProps, "variant" | "size"> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg";
};
export function Button({ variant = "default", size = "default", ...props }: Props) {
  const hostVariant =
    variant === "default" ? "primary" : variant === "outline" ? "secondary" : variant;
  return <HostButton {...props} variant={hostVariant} size={size === "default" ? "md" : size} />;
}
