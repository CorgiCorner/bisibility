import { docsLinkProps } from "@/lib/site/site";
import { cn } from "@/lib/ui/cn";
import { ArrowUpRightIcon as ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import type { ComponentProps } from "react";

export type ExternalLinkProps = Omit<ComponentProps<"a">, "href" | "rel" | "target"> & {
  href: string;
};

export function ExternalLink({ children, className, href, ...props }: Readonly<ExternalLinkProps>) {
  const linkProps = docsLinkProps(href, { external: true });

  return (
    <a {...props} {...linkProps} className={cn("inline-flex items-center gap-0.5", className)}>
      {children}
      <ArrowUpRight aria-hidden size={13} weight="bold" />
    </a>
  );
}
