import { LocationActionWarning } from "@/components/keywords/LocationActionWarning";
import { XIcon as X } from "@phosphor-icons/react";

export function AddKeywordDrawerFeedback({
  error,
  warning,
}: Readonly<{ error: string | null; warning: string | null }>) {
  return (
    <>
      {error ? (
        <p className="flex items-center gap-1.5 font-mono text-[11.5px] text-red-text">
          <X size={12} weight="bold" />
          {error}
        </p>
      ) : null}
      <LocationActionWarning message={warning} />
    </>
  );
}
