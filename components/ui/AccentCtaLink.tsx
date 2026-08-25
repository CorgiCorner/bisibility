import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

export const accentCtaLinkClassName =
  "inline-flex items-center gap-[7px] rounded-[10px] bg-accent-solid px-4 py-2.5 text-[13px] font-semibold text-accent-on-solid hover:bg-accent-solid-hover";

export type AccentCtaLinkProps = {
  children: ReactNode;
  href: string;
};

export function AccentCtaLink({ children, href }: Readonly<AccentCtaLinkProps>) {
  return (
    <Link className={accentCtaLinkClassName} href={href}>
      {children}
      <CaretRight aria-hidden size={14} weight="bold" />
    </Link>
  );
}
