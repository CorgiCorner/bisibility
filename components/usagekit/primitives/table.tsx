import { cn } from "@/lib/ui/cn";
import type { ComponentProps } from "react";

// Usagekit registry tables render semantic HTML tables through this adapter. Product data grids
// keep using the shared DataTable.
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table {...props} className={cn("w-full caption-bottom text-sm text-fg", className)} />
    </div>
  );
}
export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead {...props} className={cn("[&_tr]:border-b [&_tr]:border-border", className)} />;
}
export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody {...props} className={cn("[&_tr:last-child]:border-0", className)} />;
}
export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      {...props}
      className={cn(
        "border-b border-border-soft transition-colors hover:bg-bg-sunken motion-reduce:transition-none",
        className,
      )}
    />
  );
}
export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      {...props}
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-fg",
        className,
      )}
    />
  );
}
export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td {...props} className={cn("p-2 align-middle whitespace-nowrap", className)} />;
}
