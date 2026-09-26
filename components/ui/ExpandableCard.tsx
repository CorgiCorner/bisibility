"use client";

import { Card } from "@/components/ui/Card";
import { headerIconButtonClassName } from "@/components/ui/header-icon-button-styles";
import { Modal } from "@/components/ui/Modal";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/ui/cn";
import { ArrowsOutSimpleIcon as ArrowsOutSimple } from "@phosphor-icons/react/dist/csr/ArrowsOutSimple";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";

/** Where a card's content is drawn: in the page, or in the full-screen modal. */
export type ExpandableCardView = "inline" | "expanded";

export type ExpandableCardContent = ReactNode | ((view: ExpandableCardView) => ReactNode);

export type ExpandableCardProps = {
  /** The card heading, the modal title, and the subject of the expand button's name. */
  title: string;
  caption?: ReactNode;
  /**
   * The card body. The inline copy stays mounted while the modal is open, so the body exists
   * twice. Content with an `id`, a radio `name`, or any other document-unique attribute must use
   * the function form and suffix those attributes when `view` is `"expanded"`. Plain nodes are
   * drawn as-is in both places and must not hold such attributes.
   */
  children: ExpandableCardContent;
  className?: string;
  /** `false` hides the expand button, for example while the card has nothing to show. */
  expandable?: boolean;
  /** Overrides the button's accessible name, which defaults to "Expand {title}". */
  expandLabel?: string;
  /** Controls drawn beside the heading, before the expand button. */
  headerEnd?: ReactNode;
};

export function renderExpandableCardContent(
  content: ExpandableCardContent,
  view: ExpandableCardView,
): ReactNode {
  return typeof content === "function" ? content(view) : content;
}

/**
 * A card with an expand button in its top-right corner that opens the same content in a
 * viewport-sized modal. Keep the content's state in the parent: both views then read and write
 * the same state and stay in step.
 */
export function ExpandableCard({
  caption,
  children,
  className,
  expandable = true,
  expandLabel,
  headerEnd,
  title,
}: Readonly<ExpandableCardProps>) {
  const t = useTranslations("shared.controls.expandableCard");
  const [expanded, setExpanded] = useState(false);
  const open = expandable && expanded;
  const inlineContent = renderExpandableCardContent(children, "inline");
  const expandedContent = renderExpandableCardContent(children, "expanded");

  return (
    <Card
      className={cn("flex min-w-0 flex-col overflow-hidden p-0", className)}
      component="section"
    >
      <div className="flex min-w-0 items-start gap-2 px-4 pb-3 pt-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="m-0 min-w-0 text-ui-body-relaxed font-semibold">{title}</h2>
          {caption ? <div className="min-w-0 text-ui-caption text-fg-muted">{caption}</div> : null}
        </div>
        {headerEnd}
        {expandable ? (
          <Tooltip content={t("expand")} semantics="label">
            <button
              aria-haspopup="dialog"
              aria-label={expandLabel ?? t("expandNamed", { title })}
              className={cn(headerIconButtonClassName, "-me-1.5 -mt-1")}
              onClick={() => setExpanded(true)}
              type="button"
            >
              <ArrowsOutSimple aria-hidden size={17} weight="regular" />
            </button>
          </Tooltip>
        ) : null}
      </div>
      {/* The modal owns focus and the reading order while it is open. */}
      <div aria-hidden={open || undefined} className="flex min-w-0 flex-col" inert={open}>
        {inlineContent}
      </div>
      {expandable ? (
        <Modal
          contentClassName="flex flex-col p-0 pt-3.5"
          description={caption}
          onClose={() => setExpanded(false)}
          open={open}
          size="full"
          title={title}
        >
          {expandedContent}
        </Modal>
      ) : null}
    </Card>
  );
}
