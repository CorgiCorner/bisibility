import { colorSchemes, colorTokenNames } from "@/lib/theme/tokens";
import type { Meta, StoryObj } from "@storybook/react";

const typeRoles = [
  { role: "text-ui-h1", label: "UI H1", desc: "21px / 1.25 / 600" },
  { role: "text-ui-section", label: "UI Section", desc: "15px / 1.35 / 600" },
  { role: "text-ui-body", label: "UI Body", desc: "13px / 1.5" },
  { role: "text-ui-body-relaxed", label: "UI Body Relaxed", desc: "14px / 1.5" },
  { role: "text-ui-caption", label: "UI Caption", desc: "12px / 1.45" },
  { role: "text-ui-micro", label: "UI Micro", desc: "10px / 1.4 (non-label)" },
] as const;

const radiusRoles = [
  { role: "rounded-control", label: "Control", px: "9px" },
  { role: "rounded-card", label: "Card", px: "14px" },
  { role: "rounded-card-lg", label: "Card LG", px: "16px" },
] as const;

function DesignTokens() {
  return (
    <main className="min-h-dvh bg-bg p-6 text-fg">
      <div className="mx-auto space-y-8">
        <header className="space-y-2">
          <p className="type-label text-fg-muted">Design tokens</p>
          <h1 className="text-ui-h1 font-semibold">Foundation palette</h1>
        </header>

        <section className="space-y-3">
          <h2 className="text-ui-section font-semibold">Type roles</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {typeRoles.map((t) => (
              <article
                key={t.role}
                className="space-y-2 rounded-card border border-border bg-bg-elev p-4"
              >
                <p className={t.role}>{t.label}</p>
                <p className="text-ui-caption text-fg-muted">{t.desc}</p>
                <code className="type-label text-fg-muted">{t.role}</code>
              </article>
            ))}
            <article className="space-y-2 rounded-card border border-border bg-bg-elev p-4">
              <p className="type-label">Type Label</p>
              <p className="text-ui-caption text-fg-muted">
                11px / 1.2 / 600 / mono / uppercase / 0.5px
              </p>
              <code className="type-label text-fg-muted">type-label</code>
            </article>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-ui-section font-semibold">Radius roles</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {radiusRoles.map((r) => (
              <article key={r.role} className="space-y-2 border border-border bg-bg-elev p-4">
                <div className={`h-16 w-full border border-border bg-bg ${r.role}`} />
                <p className="text-ui-caption text-fg-muted">
                  {r.label} - {r.px}
                </p>
                <code className="type-label text-fg-muted">{r.role}</code>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-ui-section font-semibold">Max-width roles</h2>
          <div className="space-y-3">
            <article className="space-y-2 rounded-card border border-border bg-bg-elev p-4">
              <div className="w-full max-w-content border-b-2 border-accent pb-2">
                <p className="text-ui-body font-semibold">max-w-content</p>
              </div>
              <p className="text-ui-caption text-fg-muted">1200px</p>
              <code className="type-label text-fg-muted">max-w-content</code>
            </article>
            <article className="space-y-2 rounded-card border border-border bg-bg-elev p-4">
              <div className="w-full max-w-settings border-b-2 border-accent pb-2">
                <p className="text-ui-body font-semibold">max-w-settings</p>
              </div>
              <p className="text-ui-caption text-fg-muted">780px</p>
              <code className="type-label text-fg-muted">max-w-settings</code>
            </article>
          </div>
        </section>

        {Object.entries(colorSchemes).map(([scheme, tokens]) => (
          <section key={scheme} className="space-y-3">
            <h2 className="text-ui-section font-semibold capitalize">{scheme}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {colorTokenNames.map((name) => (
                <article
                  key={`${scheme}-${name}`}
                  className="overflow-hidden rounded-card border border-border bg-bg-elev"
                >
                  <div
                    className="h-16 border-b border-border"
                    style={{ backgroundColor: tokens[name] }}
                  />
                  <div className="flex items-center justify-between gap-3 p-3">
                    <span className="type-label text-fg-muted">--{name}</span>
                    <span className="type-label text-fg-muted">{tokens[name]}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}

        <section className="space-y-3">
          <h2 className="text-ui-section font-semibold">Component-owned geometry</h2>
          <p className="text-ui-body text-fg-muted">
            The collapsed application shell is 80px and remains component-owned geometry - no global
            width token.
          </p>
          <p className="text-ui-body text-fg-muted">
            The metric grid uses minmax(150px,1fr) as intentional local geometry - no global
            grid-template token.
          </p>
        </section>
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
