import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";

type LocationActionWarningProps = {
  message: string | null;
};

export function LocationActionWarning({ message }: Readonly<LocationActionWarningProps>) {
  if (!message) {
    return null;
  }

  return (
    <p className="m-0 flex items-center gap-1.5 font-mono text-[11.5px] text-yellow-text">
      <WarningCircle size={12} weight="bold" />
      {message}
    </p>
  );
}
