import { cn } from "@/lib/ui/cn";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
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
  variant?: "panel" | "inline";
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
  variant = "panel",
}: Readonly<DisclosureProps>) {
  return (
    <details
      className={cn(
        "group min-w-0",
        variant === "panel" && "rounded-card border border-border bg-bg-elev",
        className,
      )}
      open={defaultOpen}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none items-start gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid [&::-webkit-details-marker]:hidden",
          variant === "panel"
            ? "rounded-card px-5.5 py-5 sm:px-7"
            : "min-h-10 items-center sm:min-h-6",
          summaryClassName,
        )}
      >
        <Heading
          className={cn(
            "m-0 min-w-0 flex-1 wrap-break-word",
            variant === "panel"
              ? "text-[17px] font-semibold leading-[1.3]"
              : "text-xs font-normal leading-snug",
          )}
        >
          {title}
        </Heading>
        <CaretDown
          aria-hidden="true"
          className="mt-[3px] shrink-0 text-fg-muted transition-transform duration-[var(--motion-tooltip)] ease-[var(--ease-in-out)] group-open:rotate-180 motion-reduce:transition-none"
          size={16}
          weight="regular"
        />
      </summary>
      <div
        className={cn(
          "scroll-mt-32",
          variant === "panel" ? "px-5.5 pb-5 sm:px-7" : "pb-1",
          contentClassName,
        )}
        id={anchorId}
      >
        {children}
      </div>
    </details>
  );
}
