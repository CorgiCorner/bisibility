import { cn } from "@/lib/ui/cn";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

export type BackLinkProps = {
  children: ReactNode;
  className?: string;
  href: string;
};

export function BackLink({ children, className, href }: Readonly<BackLinkProps>) {
  return (
    <Link
      className={cn(
        "inline-flex w-fit items-center gap-1.5 font-sans tabular-nums text-[12.5px] text-fg-muted no-underline hover:text-accent-text",
        className,
      )}
      href={href}
    >
      <CaretLeft aria-hidden size={12} weight="regular" />
      {children}
    </Link>
  );
}
