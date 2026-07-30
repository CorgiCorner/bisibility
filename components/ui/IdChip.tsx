import { cn } from "@/lib/ui/cn";
import { cva } from "class-variance-authority";
import { CopyButton } from "./CopyButton";
import { MonoText } from "./MonoText";

export type IdChipProps = {
  value: string;
  copyLabel?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  copyClassName?: string;
};

const idChipVariants = cva("inline-flex items-center", {
  variants: {
    size: {
      sm: "h-7 gap-1 rounded-md px-1.5",
      md: "h-8 gap-1 rounded-[7px] px-2",
      lg: "h-9 gap-1.5 rounded-lg px-2.5",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

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
      <MonoText component="span" size={size} sx={{ color: "inherit" }}>
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
