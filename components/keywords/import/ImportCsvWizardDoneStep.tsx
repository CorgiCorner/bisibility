import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react";

export function DoneStep() {
  return (
    <div className="flex flex-col items-center px-4 py-[30px] text-center">
      <span className="grid h-14 w-14 place-items-center rounded-card text-green-text [background:color-mix(in_srgb,var(--green)_12%,transparent)]">
        <CheckCircle size={30} weight="regular" />
      </span>
      <h3 className="m-0 mt-4.5 text-[18px] font-semibold tracking-[-0.4px]">Import complete</h3>
      <p className="m-0 mt-[7px] max-w-[340px] text-[13.5px] leading-[1.55] text-fg-muted">
        245 keywords added, 3 duplicates skipped. First positions appear after the next check.
      </p>
      <div className="mt-5.5 flex gap-6">
        {["245 Added", "3 Skipped", "0 Failed"].map((item) => (
          <span className="text-center" key={item}>
            <span className="block text-[22px] font-semibold">{item.split(" ")[0]}</span>
            <span className="font-sans tabular-nums text-[10px] uppercase tracking-[0.4px] text-fg-muted">
              {item.split(" ")[1]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
