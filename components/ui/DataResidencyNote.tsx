import { cn } from "@/lib/ui/cn";
import { ShieldCheckIcon as ShieldCheck } from "@phosphor-icons/react/dist/ssr";

type DataResidencyNoteProps = {
  className?: string;
  message: string;
};

export function DataResidencyNote({ className, message }: Readonly<DataResidencyNoteProps>) {
  if (!message) {
    return null;
  }
  return (
    <p
      className={cn(
        "m-0 flex items-start gap-2 rounded-[10px] border border-border bg-bg-sunken px-3 py-2.5 text-[12.5px] leading-[1.5] text-fg-muted",
        className,
      )}
    >
      <ShieldCheck
        aria-hidden
        className="mt-0.5 shrink-0 text-green-text"
        size={15}
        weight="fill"
      />
      <span>{message}</span>
    </p>
  );
}
