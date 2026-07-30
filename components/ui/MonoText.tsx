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
    size: {
      sm: "text-[10px] leading-[1.45]",
      md: "text-[11px] leading-[1.45]",
      lg: "text-xs leading-normal",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export function MonoText({ className, muted = false, size = "md", sx, ...props }: MonoTextProps) {
  const additionalSx = sxArray(sx);

  return (
    <Typography
      className={cn(monoTextVariants({ size }), className)}
      sx={[
        {
          color: muted ? "var(--fg-faint)" : "var(--fg-muted)",
          fontFamily: "var(--font-mono), monospace",
        },
        ...additionalSx,
      ]}
      {...props}
    />
  );
}
