import { colorSchemes, colorTokenNames } from "@/lib/theme/tokens";
import type { Meta, StoryObj } from "@storybook/react";

function DesignTokens() {
  return (
    <main className="min-h-dvh bg-bg p-6 text-fg">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.5px] text-fg-muted">
            Design tokens
          </p>
          <h1 className="text-[21px] font-semibold">Foundation palette</h1>
        </header>
        {Object.entries(colorSchemes).map(([scheme, tokens]) => (
          <section key={scheme} className="space-y-3">
            <h2 className="text-[15px] font-semibold capitalize">{scheme}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {colorTokenNames.map((name) => (
                <article
                  key={`${scheme}-${name}`}
                  className="overflow-hidden rounded-[14px] border border-border bg-bg-elev"
                >
                  <div
                    className="h-16 border-b border-border"
                    style={{ backgroundColor: tokens[name] }}
                  />
                  <div className="flex items-center justify-between gap-3 p-3">
                    <span className="font-mono text-[11px] text-fg-muted">--{name}</span>
                    <span className="font-mono text-[11px] text-fg-muted">{tokens[name]}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

const meta = {
  title: "Foundation/Design Tokens",
  component: DesignTokens,
} satisfies Meta<typeof DesignTokens>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Palette: Story = {};
