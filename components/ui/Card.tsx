import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { sxArray } from "@/lib/ui/mui-sx";
import MuiCard, { type CardProps as MuiCardProps } from "@mui/material/Card";
import { cva } from "class-variance-authority";

export type CardProps = MuiCardProps & {
  radius?: "card" | "card-lg";
  size?: "sm" | "md" | "lg";
};

const baseSx = {
  backgroundColor: "var(--bg-elev)",
  borderColor: "var(--border)",
  boxShadow: "none",
};

const cardVariants = cva("", {
  variants: {
    radius: {
      card: "rounded-card",
      "card-lg": "rounded-card-lg",
    },
    size: {
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export function Card({
  className,
  radius,
  size = "md",
  sx,
  variant = "outlined",
  ...props
}: CardProps) {
  const additionalSx = sxArray(sx);
  const resolvedRadius = radius ?? (size === "lg" ? "card-lg" : "card");
  const radiusClassName = `rounded-${resolvedRadius}`;
  const mergedClassName = cn(cardVariants({ radius: resolvedRadius, size }), className);
  const radiusSx = mergedClassName.split(/\s+/).includes(radiusClassName)
    ? { borderRadius: UI_RADIUS_ROLES[resolvedRadius] }
    : {};

  return (
    <MuiCard
      className={mergedClassName}
      elevation={0}
      variant={variant}
      sx={[baseSx, radiusSx, ...additionalSx]}
      {...props}
    />
  );
}
