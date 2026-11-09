import "./real-page-mocks.test-fixture";
import type { AppLocale } from "@/i18n/config";
import { ossAdminRoutes } from "@/lib/instance-admin/routes";
import { expect, it, vi } from "vitest";
import { renderRealPage } from "./real-page-render.test-fixture";
import { prepareRealScenario } from "./real-page-scenario.test-fixture";

for (const locale of ["en", "pl", "ja", "es-ES"] as AppLocale[]) {
  it.each(ossAdminRoutes)(
    `renders real $href with complete ${locale} messages and a page question`,
    async ({ view, questionKey }) => {
      prepareRealScenario(view === "Tasks" ? "RecoveryParity" : "OverviewParity");
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await renderRealPage(view, locale);
      const catalog = (await import(`../../../messages/core/${locale}/instance-admin.json`)).default
        .instanceAdmin;
      const question = questionKey
        .split(".")
        .reduce((value: unknown, key: string) => (value as Record<string, unknown>)[key], catalog);
      expect(result.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent(String(question));
      for (const heading of result.getAllByRole("heading", { level: 2 }))
        expect(heading.textContent?.trim()).not.toBe("");
      expect(
        errors.mock.calls.filter((args) =>
          /MISSING_MESSAGE|INVALID_MESSAGE|IntlError/.test(args.map(String).join(" ")),
        ),
      ).toEqual([]);
      errors.mockRestore();
    },
  );
}
