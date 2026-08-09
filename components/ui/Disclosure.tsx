import { cn } from "@/lib/ui/cn";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

export type DisclosureHeadingLevel = "h2" | "h3" | "h4" | "h5" | "h6";

export type DisclosureProps = {
  /**
   * Id for the answer, not the wrapper. A fragment navigation to a node inside a `details`
   * makes the browser reveal it, so a deep link lands on an already open item.
   */
  anchorId?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Rendered open in the server HTML. Items never close each other; each one toggles alone. */
  defaultOpen?: boolean;
  headingLevel?: DisclosureHeadingLevel;
  summaryClassName?: string;
  title: ReactNode;
};

/**
 * Native `details`/`summary` disclosure: the content stays in the server-rendered DOM while
 * collapsed, so crawlers read it without running the toggle.
 */
export function Disclosure({
  anchorId,
  children,
  className,
  contentClassName,
  defaultOpen = false,
  headingLevel: Heading = "h3",
  summaryClassName,
  title,
}: Readonly<DisclosureProps>) {
  return (
    <details
      className={cn("group min-w-0 rounded-[14px] border border-border bg-bg-elev", className)}
      open={defaultOpen}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-start gap-3 rounded-[14px] px-[22px] py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid sm:px-7 [&::-webkit-details-marker]:hidden",
          summaryClassName,
        )}
      >
        <Heading className="m-0 min-w-0 flex-1 wrap-break-word text-[17px] font-semibold leading-[1.3]">
          {title}
        </Heading>
        <CaretRight
          aria-hidden="true"
          className="mt-[3px] shrink-0 text-fg-muted transition-transform duration-150 group-open:rotate-90"
          size={16}
          weight="bold"
        />
      </summary>
      <div className={cn("scroll-mt-32 px-[22px] pb-5 sm:px-7", contentClassName)} id={anchorId}>
        {children}
      </div>
    </details>
  );
}
