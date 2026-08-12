import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";

export function FirstCheckQueueMessage({ message }: Readonly<{ message: string }>) {
  return (
    <div className="mt-3 flex items-start gap-2 text-[12.5px] text-fg-muted">
      <CheckCircle
        aria-hidden
        className="mt-0.5 shrink-0 text-green-text"
        size={16}
        weight="fill"
      />
      <span>{message}</span>
    </div>
  );
}
