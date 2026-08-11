import { cn } from "@/lib/ui/cn";
import { cva } from "class-variance-authority";
import { CopyButton } from "./CopyButton";
import { MonoText, type MonoTextProps } from "./MonoText";

export type IdChipProps = {
  value: string;
  copyLabel?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  copyClassName?: string;
};

const idChipVariants = cva("inline-flex items-center", {
  variants: {
    size: {
      xs: "h-[22px] gap-[5px] rounded-[7px] px-2 py-[3px]",
      sm: "h-7 gap-1 rounded-md px-1.5",
      md: "h-8 gap-1 rounded-[7px] px-2",
      lg: "h-9 gap-1.5 rounded-lg px-2.5",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

type IdChipSize = NonNullable<IdChipProps["size"]>;
type MonoTextSize = NonNullable<MonoTextProps["size"]>;

const monoTextSizeByIdChipSize = {
  xs: "lg",
  sm: "sm",
  md: "md",
  lg: "lg",
} satisfies Record<IdChipSize, MonoTextSize>;

export function IdChip({
  value,
  copyLabel = "Copy ID",
  size = "sm",
  className,
  copyClassName,
}: Readonly<IdChipProps>) {
  return (
    <span
      className={cn(
        "border border-border bg-bg-elev text-fg-muted",
        idChipVariants({ size }),
        className,
      )}
    >
      <MonoText component="span" size={monoTextSizeByIdChipSize[size]} sx={{ color: "inherit" }}>
        {value}
      </MonoText>
      <CopyButton
        aria-label={copyLabel}
        className={cn("shrink-0", copyClassName)}
        label={copyLabel}
        size={size}
        text={value}
      />
    </span>
  );
}
