import { cn } from "@/lib/ui/cn";
import { sxArray } from "@/lib/ui/mui-sx";
import Typography, { type TypographyProps } from "@mui/material/Typography";
import { cva } from "class-variance-authority";

export type MonoTextProps = TypographyProps & {
  muted?: boolean;
  size?: "sm" | "md" | "lg";
};

const monoTextVariants = cva("font-mono", {
  variants: {
    // Mono runs optically larger than sans at the same nominal size - its x-height is closer to
    // a sans face one or two steps up - so the whole scale sits a pixel below where a sans scale
    // would. Shifted together rather than per call site, so the three steps stay one system.
    size: {
      sm: "text-[9px] leading-[1.45]",
      md: "text-[10px] leading-[1.45]",
      lg: "text-[11px] leading-normal",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const monoTextSizeSx = {
  sm: { fontSize: "9px", lineHeight: 1.45 },
  md: { fontSize: "10px", lineHeight: 1.45 },
  lg: { fontSize: "11px", lineHeight: "normal" },
} as const;

export function MonoText({ className, muted = false, size = "md", sx, ...props }: MonoTextProps) {
  const additionalSx = sxArray(sx);

  return (
    <Typography
      className={cn(monoTextVariants({ size }), className)}
      sx={[
        {
          color: muted ? "var(--fg-muted)" : "var(--fg)",
          fontFamily: "var(--font-mono), monospace",
          ...monoTextSizeSx[size],
          // MUI's Typography root sets `margin: 0`, and emotion injects its rules OUTSIDE any
          // cascade layer, so an unlayered declaration always beats Tailwind's `@layer
          // utilities`. Every `className="mt-*"` a caller passed was therefore dead - 19 call
          // sites at last count. `revert-layer` rolls the property back to the previous layer,
          // which is the utility when one is present and Preflight's `margin: 0` when it is not.
          margin: "revert-layer",
        },
        ...additionalSx,
      ]}
      {...props}
    />
  );
}
