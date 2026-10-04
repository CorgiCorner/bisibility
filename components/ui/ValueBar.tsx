import { cn } from "@/lib/ui/cn";

export function ValueBar({
  className,
  max,
  tone,
  value,
}: Readonly<{
  className?: string;
  max: number;
  tone: "positive" | "negative";
  value: number;
}>) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      aria-hidden
      className={cn("h-2 w-full overflow-hidden rounded-full bg-bg-inset", className)}
    >
      <span
        className={cn("block h-full rounded-full", tone === "positive" ? "bg-green" : "bg-red")}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
