import type { ReactNode } from "react";

const themes = ["light", "dark"] as const;

export function KeywordDetailStoryThemes({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="grid gap-4 p-4 xl:grid-cols-2">
      {themes.map((theme) => (
        <section
          className="min-w-0 rounded-[14px] bg-bg p-5 text-fg"
          data-theme={theme}
          key={theme}
        >
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.6px] text-fg-muted">
            {theme} theme
          </p>
          {children}
        </section>
      ))}
    </div>
  );
}
