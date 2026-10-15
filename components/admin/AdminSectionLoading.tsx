import { Card } from "@/components/ui/Card";

function Bar({ className = "w-32" }: { className?: string }) {
  return <span className={`block h-3 rounded bg-border ${className}`} />;
}
function Header() {
  return (
    <>
      <Bar className="h-5 w-40" />
      <Bar className="mt-1 h-4 w-72 max-w-full" />
    </>
  );
}
export function AdminSectionLoading({ section }: { section: "audit" | "administration" }) {
  return (
    <div
      aria-hidden="true"
      aria-busy="true"
      className="grid min-w-0 grid-cols-1 gap-4 animate-pulse motion-reduce:animate-none"
    >
      {section === "audit" ? (
        <Card size="lg">
          <Header />
          <div className="mt-3 flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-7 w-16 rounded-full border border-border" />
            ))}
          </div>
          <div className="mt-3 overflow-x-auto rounded-control border border-border">
            <div className="min-w-[50rem]">
              <div className="grid h-10 grid-cols-5 items-center gap-3 border-b border-border bg-bg-sunken px-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Bar key={i} className="w-16" />
                ))}
              </div>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="grid h-12 grid-cols-5 items-center gap-3 border-b border-border-soft px-3 last:border-0"
                >
                  {[0, 1, 2, 3, 4].map((j) => (
                    <Bar key={j} className="w-20" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card size="lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Header />
              </div>
              <span className="h-[34px] w-28 rounded-control border border-border-control" />
            </div>
            <Bar className="mt-4 w-52" />
          </Card>
          <Card size="lg">
            <Header />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-card border border-border p-4">
                  <Bar className="w-24" />
                  <Bar className="mt-3 h-7 w-12" />
                  <Bar className="mt-3 h-8 w-full" />
                </div>
              ))}
            </div>
          </Card>
          <Card size="lg">
            <Header />
            <div className="mt-4 h-40 rounded-card border border-border bg-bg-sunken" />
          </Card>
          <Card size="lg">
            <Header />
            <div className="mt-4 flex flex-wrap gap-3">
              <span className="h-[34px] w-72 max-w-full rounded-control border border-border-control" />
              <span className="h-[34px] w-24 rounded-control border border-border-control" />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
