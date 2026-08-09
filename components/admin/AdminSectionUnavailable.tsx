export function AdminSectionUnavailable({ children }: Readonly<{ children: string }>) {
  return (
    <p className="rounded-xl bg-yellow/10 p-3 text-xs text-yellow-text">
      {children} Values are unknown, not zero.
    </p>
  );
}
