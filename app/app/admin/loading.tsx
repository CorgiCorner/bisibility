function Block({ className }: Readonly<{ className: string }>) {
  return <div className={`animate-pulse rounded-xl bg-bg-sunken ${className}`} />;
}

export default function InstanceAdminLoading() {
  return (
    <div aria-hidden className="flex w-full flex-col gap-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="rounded-2xl border border-border bg-bg-elev p-5"
          key={`admin-loading-${index}`}
        >
          <Block className="h-5 w-40" />
          <Block className="mt-2 h-3 w-80 max-w-full" />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Block className="h-16" />
            <Block className="h-16" />
            <Block className="h-16" />
            <Block className="h-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
