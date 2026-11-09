"use client";

import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { Switch } from "@/components/ui/Switch";
import type { DashboardTranslator, ResolvedWidget, WidgetSpan } from "@/lib/dashboard-layout/types";
import { cn } from "@/lib/ui/cn";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUpIcon } from "@phosphor-icons/react/dist/csr/CaretUp";
import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import type { ButtonHTMLAttributes, Ref } from "react";
import { useId } from "react";
import { DashboardViewHelp } from "./DashboardViewHelp";

type Props = {
  widget: ResolvedWidget;
  index: number;
  count: number;
  saving: boolean;
  dragging: boolean;
  dropEdge: "before" | "after" | null;
  hintId: string;
  translate: DashboardTranslator;
  handleProps: ButtonHTMLAttributes<HTMLButtonElement>;
  controlRef: (control: "handle" | "up" | "down") => Ref<HTMLButtonElement>;
  onMove: (target: number, control: "handle" | "up" | "down") => void;
  onVisible: (visible: boolean) => void;
  onSpan: (span: WidgetSpan) => void;
};

export function DashboardWidgetRow({
  widget: { selection, definition, reason },
  index,
  count,
  saving,
  dragging,
  dropEdge,
  hintId,
  translate: t,
  handleProps,
  controlRef,
  onMove,
  onVisible,
  onSpan,
}: Props) {
  const id = useId();
  const title = t(definition.labelKey);
  return (
    <li
      data-widget-id={selection.id}
      data-reason={reason ?? undefined}
      className={cn(
        "relative grid grid-cols-[2.25rem_minmax(0,1fr)_2.75rem] items-start gap-x-2 rounded-control border border-border p-1.5 sm:gap-x-3 sm:p-2 xl:grid-cols-[34px_1.5rem_minmax(0,1fr)_auto_34px] xl:items-center xl:py-0.75",
        selection.visible ? "bg-bg-elev" : "bg-bg-inset",
        dragging && "border-accent bg-accent-soft",
        dropEdge === "before" &&
          "before:absolute before:inset-x-0 before:-top-0.75 before:h-0.5 before:bg-accent-solid",
        dropEdge === "after" &&
          "after:absolute after:inset-x-0 after:-bottom-0.75 after:h-0.5 after:bg-accent-solid",
      )}
    >
      <Button
        variant="ghost"
        className="h-9 min-h-9 w-9 min-w-9 cursor-grab p-0 active:cursor-grabbing xl:h-[34px] xl:min-h-[34px] xl:w-[34px] xl:min-w-[34px]"
        {...handleProps}
        disabled={saving}
        aria-label={t("reorder", { title })}
        aria-describedby={hintId}
        ref={controlRef("handle")}
        onKeyDown={(event) => {
          const target =
            event.key === "ArrowUp"
              ? index - 1
              : event.key === "ArrowDown"
                ? index + 1
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? count - 1
                    : null;
          if (target === null) return;
          event.preventDefault();
          if (target >= 0 && target < count) onMove(target, "handle");
        }}
      >
        <DotsSixVerticalIcon weight="regular" aria-hidden size={18} />
      </Button>
      <span
        aria-hidden
        className="hidden text-right text-[13px] leading-5 tabular-nums text-fg-muted xl:block"
      >
        {index + 1}
      </span>
      <div className="min-w-0 xl:py-0">
        <div className="flex min-h-9 items-center gap-1.5 xl:min-h-[34px]">
          <h3
            id={`${id}-title`}
            className={cn(
              "m-0 min-w-0 break-words text-sm font-medium leading-5",
              !selection.visible && "text-fg-muted",
            )}
          >
            {title}
          </h3>

          <DashboardViewHelp
            warning={Boolean(reason)}
            label={t("widgetHelp", { title })}
            description={
              reason
                ? `${t(definition.descriptionKey)} ${t(`reasons.${reason}`)}`
                : t(definition.descriptionKey)
            }
          />
        </div>
      </div>
      <div className="col-start-1 col-end-4 flex items-center justify-between min-[360px]:col-start-2 gap-1 xl:col-start-4 xl:col-end-5 xl:row-start-1 xl:mt-0">
        {definition.spans.length > 1 ? (
          <MenuSelect
            ariaLabel={t("span", { title })}
            compact
            disabled={saving}
            value={selection.span}
            triggerClassName="min-h-9 w-auto min-w-24 px-2 xl:min-h-7"
            options={definition.spans.map((span) => ({ value: span, label: t(`spans.${span}`) }))}
            onChange={(span) => {
              if (span === "standard" || span === "wide") onSpan(span);
            }}
          />
        ) : (
          <span className="min-w-20 px-2 text-xs text-fg-muted">
            {t(`spans.${selection.span}`)}
          </span>
        )}
        <div className="ml-auto flex items-center">
          {(["up", "down"] as const).map((direction) => (
            <Button
              key={direction}
              variant="ghost"
              className="h-9 min-h-9 w-11 min-w-11 p-0 xl:h-[34px] xl:min-h-[34px] xl:w-[34px] xl:min-w-[34px]"
              disabled={saving || (direction === "up" ? index === 0 : index === count - 1)}
              aria-label={t(direction === "up" ? "moveUp" : "moveDown", { title })}
              ref={controlRef(direction)}
              onClick={() => onMove(index + (direction === "up" ? -1 : 1), direction)}
            >
              {direction === "up" ? (
                <CaretUpIcon weight="regular" aria-hidden size={16} />
              ) : (
                <CaretDownIcon weight="regular" aria-hidden size={16} />
              )}
            </Button>
          ))}
        </div>
      </div>
      <Switch
        className="col-start-3 row-start-1 min-h-9 w-11 justify-center border-0 bg-transparent p-0 xl:col-start-5 xl:min-h-[34px] xl:w-[34px]"
        checked={selection.visible}
        disabled={saving}
        aria-labelledby={`${id}-title`}
        onChange={(event) => onVisible(event.currentTarget.checked)}
      />
    </li>
  );
}
