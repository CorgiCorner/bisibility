import { inputClassName } from "@/components/ui";

// Shared Tailwind class strings for account-level forms and rows.

export const fieldLabelClass =
  "flex flex-col gap-1.5 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export const fieldValueClass =
  "flex min-h-10 items-center rounded-control border border-border-control bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal text-fg";

export const fieldInputClass = `${inputClassName} min-h-10 rounded-control px-3 text-[13px] font-medium normal-case tracking-normal`;

export const feedbackClass = "text-[11.5px] font-medium normal-case tracking-normal";

export const ghostButtonClass =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-control border border-border-control bg-bg-elev px-3.5 text-[12.5px] font-semibold text-fg hover:border-accent hover:text-accent-text disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted";

export const accentButtonClass =
  "inline-flex min-h-8 items-center rounded-control bg-accent-solid px-3.5 text-[12.5px] font-semibold text-accent-on-solid disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted";

export const rowListClass = "divide-y divide-border-soft";
