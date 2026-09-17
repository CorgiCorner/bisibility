"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "./CopyButton";

type IdChipCopyButtonProps = {
  className?: string;
  copyLabel?: string;
  size: "xs" | "sm" | "md" | "lg";
  text: string;
};

/** Keeps IdChip server-callable while its localized copy action stays a client leaf. */
export function IdChipCopyButton({
  className,
  copyLabel,
  size,
  text,
}: Readonly<IdChipCopyButtonProps>) {
  const t = useTranslations("shared.controls.copy");
  return <CopyButton className={className} label={copyLabel ?? t("id")} size={size} text={text} />;
}
