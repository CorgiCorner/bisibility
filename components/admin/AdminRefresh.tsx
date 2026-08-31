"use client";

import { Button } from "@/components/ui";
import { appRootPath } from "@/lib/routing/app-path";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react";

export function AdminRefresh() {
  return (
    <Button
      component="a"
      href={appRootPath("admin")}
      size="sm"
      startIcon={<ArrowClockwise aria-hidden size={15} weight="regular" />}
      variant="secondary"
    >
      Refresh
    </Button>
  );
}
