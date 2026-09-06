import type { ReactNode } from "react";

type KeywordDetailHeaderSlotState = "numeric" | "textual";

type KeywordDetailHeaderSlotProps = {
  children: ReactNode;
  detail?: ReactNode;
  label: string;
  state: KeywordDetailHeaderSlotState;
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
}: Readonly<KeywordDetailHeaderSlotProps>) {
  const valueId = label.toLocaleLowerCase().replaceAll(" ", "-");

  return (
    <div className="min-w-0" data-testid="keyword-detail-slot">
      <span className="block font-sans tabular-nums text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-muted">
        {label}
      </span>
      <div
        className={`mt-1 flex min-h-[18px] min-w-0 items-baseline gap-1.5 ${valueClassName[state]}`}
        data-state={state}
        data-testid={`keyword-detail-slot-value-${valueId}`}
      >
        {children}
      </div>
      <div className="mt-[3px] min-h-4 font-sans tabular-nums text-[11px] text-fg-muted">
        {detail}
      </div>
    </div>
  );
}
