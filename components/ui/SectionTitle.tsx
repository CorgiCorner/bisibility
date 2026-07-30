import { cn } from "@/lib/ui/cn";
import { sxArray } from "@/lib/ui/mui-sx";
import Typography, { type TypographyProps } from "@mui/material/Typography";
import { cva } from "class-variance-authority";

export type SectionTitleProps = TypographyProps & {
  size?: "sm" | "md" | "lg";
};

const baseSx = {
  color: "var(--fg)",
};

const sectionTitleVariants = cva("font-semibold", {
  variants: {
    size: {
      sm: "text-[13px] leading-snug",
      md: "text-[15px] leading-[1.35]",
      lg: "text-lg leading-snug",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export function SectionTitle({
  className,
  component = "h2",
  size = "md",
  sx,
  ...props
}: SectionTitleProps) {
  const additionalSx = sxArray(sx);

  return (
    <Typography
      className={cn(sectionTitleVariants({ size }), className)}
      component={component}
      sx={[baseSx, ...additionalSx]}
      {...props}
    />
  );
}
