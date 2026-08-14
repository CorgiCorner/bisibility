import { InfoIcon as Info } from "@phosphor-icons/react";

export function FirstCheckQueueMessage({ message }: Readonly<{ message: string }>) {
  return (
    <div className="mt-3 flex items-start gap-2 text-[12.5px] text-fg-muted">
      <Info aria-hidden className="mt-0.5 shrink-0 text-fg-muted" size={15} />
      <span>{message}</span>
    </div>
  );
}
