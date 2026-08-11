"use client";

import { Button } from "@/components/ui";
import type { ReactNode } from "react";

export type KeywordDetailFreeActionButtonProps = {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

export function KeywordDetailFreeActionButton({
  children,
  disabled = false,
  onClick,
}: Readonly<KeywordDetailFreeActionButtonProps>) {
  return (
    <Button disabled={disabled} onClick={onClick} size="md" variant="secondary">
      {children}
    </Button>
  );
}
