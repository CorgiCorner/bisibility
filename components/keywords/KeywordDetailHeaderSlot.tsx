import type { ReactNode } from "react";

type KeywordDetailHeaderSlotState = "numeric" | "textual";

type KeywordDetailHeaderSlotProps = {
  children: ReactNode;
  detail?: ReactNode;
  label: string;
  state: KeywordDetailHeaderSlotState;
  prominent?: boolean;
  inline?: boolean;
};

const valueClassName = {
  numeric:
    "font-sans tabular-nums text-[17px] font-semibold leading-[1.1] tracking-[-0.3px] text-fg",
  textual: "font-sans text-[13px] leading-[18px] text-fg-muted",
} satisfies Record<KeywordDetailHeaderSlotState, string>;

export function KeywordDetailHeaderSlot({
  children,
  detail,
  label,
  state,
  prominent = false,
  inline = false,
}: Readonly<KeywordDetailHeaderSlotProps>) {
  const valueId = label.toLocaleLowerCase().replaceAll(" ", "-");

  return (
    <div
      className={inline ? "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1" : "min-w-0"}
      data-testid="keyword-detail-slot"
    >
      <span className="block font-sans tabular-nums text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-muted">
        {label}
      </span>
      <div
        className={`${inline ? "" : "mt-1"} flex min-h-[18px] min-w-0 items-baseline gap-1.5 ${prominent ? "font-sans tabular-nums text-[24px] font-semibold leading-tight tracking-[-0.5px] text-fg" : valueClassName[state]}`}
        data-state={state}
        data-testid={`keyword-detail-slot-value-${valueId}`}
      >
        {children}
      </div>
      {detail ? (
        <div
          className={`${inline ? "" : "mt-1"} font-sans tabular-nums text-[11px] leading-5 text-fg-muted`}
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}
