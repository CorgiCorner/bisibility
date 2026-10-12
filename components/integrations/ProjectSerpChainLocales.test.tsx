import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import en from "@/messages/core/en/project-integrations.json";
import es from "@/messages/core/es-ES/project-integrations.json";
import ja from "@/messages/core/ja/project-integrations.json";
import pl from "@/messages/core/pl/project-integrations.json";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectSerpChain as Editor } from "./ProjectSerpChain";
import { binding, providers, reply } from "./project-chain-fixtures";

vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: async (id: string) => binding(id),
  readProviderUiAction: async () => reply(),
  executeProviderUiAction: vi.fn(),
  reconcileProviderUiAction: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: "chain-user" }, session: { id: "chain-session" } },
      isPending: false,
    }),
  },
}));

describe("localized project-chain composition", () => {
  it.each([
    ["en", en, "Save fallback order"],
    ["pl", pl, "Zapisz kolejność dostawców"],
    ["es-ES", es, "Guardar orden de proveedores"],
    ["ja", ja, "フォールバック順序を保存"],
  ] as const)("renders %s controls without nesting a form", async (locale, messages, save) => {
    const view = renderWithFeatureMessages(
      <form aria-label="parent">
        <Editor canManageProviders projectId={`prj_chain_locale_${locale}`} providers={providers} />
      </form>,
      { locale, messages },
    );
    expect(await screen.findByRole("button", { name: save })).toBeDisabled();
    expect(view.container.querySelectorAll("form")).toHaveLength(1);
    expect(view.container.querySelectorAll("button:not([type='button'])")).toHaveLength(0);
    expect(screen.queryByText(/projectIntegrations\./)).toBeNull();
  });
});
