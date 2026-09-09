import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

type CheckRunDetailsRowProps = {
  children: ReactNode;
  className?: string;
};

export function CheckRunDetailsRow({ children, className }: Readonly<CheckRunDetailsRowProps>) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 whitespace-nowrap font-sans tabular-nums text-[10.5px] text-fg-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function splitCheckRunDetailLine(value: string, maximumLength = 108): string[] {
  const lines: string[] = [];
  for (const sourceLine of value.split(/\r?\n/)) {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      if (word.length > maximumLength) {
        if (current) lines.push(current);
        current = "";
        for (let start = 0; start < word.length; start += maximumLength) {
          lines.push(word.slice(start, start + maximumLength));
        }
        continue;
      }
      const next = current ? `${current} ${word}` : word;
      if (next.length > maximumLength) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
