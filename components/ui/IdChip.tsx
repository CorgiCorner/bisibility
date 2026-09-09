import { cn } from "@/lib/ui/cn";
import { cva } from "class-variance-authority";
import { CopyButton } from "./CopyButton";

export type IdChipProps = {
  copyLabel?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  copyClassName?: string;
  value: string;
};

const idChipVariants = cva("inline-flex items-center", {
  variants: {
    size: {
      xs: "h-[22px] gap-[5px] rounded-control px-2 py-[3px]",
      sm: "h-7 gap-1 rounded-control px-1.5",
      md: "h-8 gap-1 rounded-control px-2",
      lg: "h-9 gap-1.5 rounded-control px-2.5",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

type IdChipSize = NonNullable<IdChipProps["size"]>;
const idTextSizeByIdChipSize = {
  xs: "text-[11px]",
  sm: "text-[9px]",
  md: "text-[10px]",
  lg: "text-[11px]",
} satisfies Record<IdChipSize, string>;

export function shortId(value: string) {
  return value.slice(0, 10);
}

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
      title={value}
    >
      <span className={cn("font-mono leading-[1.45]", idTextSizeByIdChipSize[size])}>
        {shortId(value)}
      </span>
      <CopyButton
        className={cn("shrink-0", copyClassName)}
        label={copyLabel}
        size={size}
        text={value}
      />
    </span>
  );
}
