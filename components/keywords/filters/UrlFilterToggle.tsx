type UrlFilterToggleProps = {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
};

export function UrlFilterToggle({
  active,
  description,
  label,
  onClick,
}: Readonly<UrlFilterToggleProps>) {
  return (
    <button
      className="flex w-full items-center gap-[11px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-fg">{label}</span>
        <span className="mt-0.5 block text-[11.5px] text-fg-muted">{description}</span>
      </span>
      <span
        className="flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-0.5"
        style={{
          backgroundColor: active ? "var(--accent)" : "var(--border-strong)",
          justifyContent: active ? "flex-end" : "flex-start",
        }}
      >
        <span className="h-[18px] w-[18px] rounded-full bg-white" />
      </span>
    </button>
  );
}
