import { compactInputClassName, inputClassName } from "@/components/ui/input-styles";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";

export const locationFieldClassByVariant = {
  form: `${inputClassName} min-h-10 w-full rounded-control px-9 text-[13px] font-medium`,
  toolbar: `${inputClassName} ${compactInputClassName} w-full rounded-control px-9 font-medium`,
  research: `${inputClassName} min-h-[34px] w-full rounded-control bg-bg-elev px-9 py-1 compact-text-13 text-[13px] font-normal`,
} as const;

export const locationFieldLabelClass =
  "m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0 font-sans tabular-nums text-[10px] uppercase tracking-[0.4px] text-fg-muted";

export function LocationClearButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <button
      aria-label="Clear location search"
      className="absolute right-[6px] grid h-6 w-6 place-items-center rounded-full text-fg-muted hover:text-fg"
      onClick={onClick}
      type="button"
    >
      <X aria-hidden size={12} weight="regular" />
    </button>
  );
}
