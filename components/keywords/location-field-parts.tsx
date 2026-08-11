import { inputClassName } from "@/components/ui";
import { XIcon as X } from "@phosphor-icons/react";

export const locationFieldClassByVariant = {
  form: `${inputClassName} min-h-10 w-full rounded-[9px] px-9 text-[13px] font-medium`,
  toolbar: `${inputClassName} min-h-[34px] w-full rounded-[9px] px-9 text-[12.5px] font-medium`,
} as const;

export const locationFieldLabelClass =
  "m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0 font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted";

export function LocationClearButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <button
      aria-label="Clear location search"
      className="absolute right-[6px] grid h-6 w-6 place-items-center rounded-full text-fg-muted hover:text-fg"
      onClick={onClick}
      type="button"
    >
      <X aria-hidden size={12} weight="bold" />
    </button>
  );
}
