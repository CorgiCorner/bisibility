"use client";

import { Button } from "@/components/ui";
import { appRootPath } from "@/lib/routing/app-path";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react";

export function AdminRefresh() {
  return (
    <Button
      component="a"
      href={appRootPath("admin")}
      size="sm"
      startIcon={<ArrowsClockwise aria-hidden size={15} />}
      variant="secondary"
    >
      Refresh
    </Button>
  );
}
