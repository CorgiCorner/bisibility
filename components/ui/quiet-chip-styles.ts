import { cva } from "class-variance-authority";

/**
 * Quiet rounded chips that sit in dense metadata rows. `lg` is the keyword-header
 * size (Topic / market / device). `sm` and `md` are the compact market-chip sizes.
 */
export const quietChipVariants = cva(
  "inline-flex max-w-full items-center overflow-hidden whitespace-nowrap rounded-full border border-border bg-bg-sunken",
  {
    defaultVariants: {
      size: "sm",
    },
    variants: {
      size: {
        lg: "h-[27px] min-h-[27px] gap-1.5 px-2.5 text-[11px] font-medium leading-none",
        md: "h-6 gap-1.5 px-2.5 text-xs",
        sm: "h-[22px] gap-1 px-[9px] text-xs",
      },
    },
  },
);
