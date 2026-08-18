import { cn } from "@/lib/ui/cn";
import { UI_TYPE_ROLES } from "@/lib/ui/design-role-tokens";
import { sxArray } from "@/lib/ui/mui-sx";
import Typography, { type TypographyProps } from "@mui/material/Typography";
import { cva } from "class-variance-authority";

export type SectionTitleProps = TypographyProps & {
  size?: "sm" | "md" | "lg";
};

const sectionRole = UI_TYPE_ROLES["ui-section"];

const baseSx = {
  color: "var(--fg)",
};

const sectionRoleSx = {
  fontSize: sectionRole[0],
  fontWeight: sectionRole[1].fontWeight,
  lineHeight: sectionRole[1].lineHeight,
};

const sectionTitleVariants = cva("font-semibold", {
  variants: {
    size: {
      sm: "text-[13px] leading-snug",
      md: "text-ui-section",
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
  const variantClassName = sectionTitleVariants({ size });
  const mergedClassName =
    size === "md" ? cn(className, variantClassName) : cn(variantClassName, className);

  return (
    <Typography
      className={mergedClassName}
      component={component}
      sx={[baseSx, ...(size === "md" ? [sectionRoleSx] : []), ...additionalSx]}
      {...props}
    />
  );
}
