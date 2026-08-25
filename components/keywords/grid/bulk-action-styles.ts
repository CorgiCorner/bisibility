import { buttonXsSx } from "@/components/ui";

export const outlinedSplitChromeSx = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border-strong)",
  color: "var(--fg)",
  fontWeight: 600,
  textTransform: "none",
  "&:hover": {
    backgroundColor: "var(--bg-sunken)",
    border: "1px solid var(--border-strong)",
  },
} as const;

export const bulkBarButtonSx = {
  ...buttonXsSx,
  ...outlinedSplitChromeSx,
} as const;
