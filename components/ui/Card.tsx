import { cn } from "@/lib/ui/cn";
import { sxArray } from "@/lib/ui/mui-sx";
import MuiCard, { type CardProps as MuiCardProps } from "@mui/material/Card";
import { cva } from "class-variance-authority";

export type CardProps = MuiCardProps & {
  size?: "sm" | "md" | "lg";
};

const baseSx = {
  backgroundColor: "var(--bg-elev)",
  borderColor: "var(--border)",
  boxShadow: "none",
};

const cardVariants = cva("", {
  variants: {
    size: {
      sm: "rounded-xl p-3",
      md: "rounded-[14px] p-4",
      lg: "rounded-2xl p-5",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export function Card({ className, size = "md", sx, variant = "outlined", ...props }: CardProps) {
  const additionalSx = sxArray(sx);

  return (
    <MuiCard
      className={cn(cardVariants({ size }), className)}
      elevation={0}
      variant={variant}
      sx={[baseSx, ...additionalSx]}
      {...props}
    />
  );
}
