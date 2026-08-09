import { inputClassName } from "@/components/ui";

// Shared Tailwind class strings for account-level forms and rows.

export const fieldLabelClass =
  "flex flex-col gap-1.5 font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted";

export const fieldValueClass =
  "flex min-h-10 items-center rounded-lg border border-border-strong bg-transparent px-3 text-[13px] font-medium normal-case tracking-normal text-fg";

export const fieldInputClass = `${inputClassName} min-h-10 rounded-lg px-3 text-[13px] font-medium normal-case tracking-normal`;

export const feedbackClass = "text-[11.5px] font-medium normal-case tracking-normal";

export const ghostButtonClass =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-[9px] border border-border-strong bg-bg-elev px-3.5 text-[12.5px] font-semibold text-fg hover:border-accent hover:text-accent-text disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted";

export const accentButtonClass =
  "inline-flex min-h-8 items-center rounded-[9px] bg-accent-solid px-3.5 text-[12.5px] font-semibold text-primary-contrast disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-fg-muted";

export const rowListClass = "divide-y divide-border-soft";
