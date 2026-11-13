"use client";

import { Button } from "@/components/ui/Button";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import type { ReactNode } from "react";

export function DashboardWidgetLink({
  children,
  href,
}: Readonly<{ children: ReactNode; href: string }>) {
  return (
    <div className="mt-3 flex justify-end border-t border-border pt-3">
      <Button
        endIcon={<CaretRight aria-hidden size={14} weight="regular" />}
        href={href}
        size="xs"
        variant="ghost"
      >
        {children}
      </Button>
    </div>
  );
}
