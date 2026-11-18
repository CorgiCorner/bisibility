import { registerModelProvider } from "@/lib/providers/model/registry";
import { getIntegrationCategories } from "@/lib/queries/integrations";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { renderNative } from "./model-playground-render.test-support";

const mocks = vi.hoisted(() => ({ rows: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    providerConnection: { findMany: mocks.rows },
    operationalRun: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: async () => ({ project: { id: "project" } }),
}));
vi.mock("@/lib/queries/integration-consumer-status", () => ({
  loadGscConsumerStatuses: async () => [],
}));
vi.mock("@/lib/integrations/provider-recovery/read", () => ({
  readConnectionRecovery: async () => null,
}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestProjectDefaults: async () => null,
}));
vi.mock("@/lib/integrations/provider-identity", () => ({
  readableProviderIdentity: () => ({ state: "readable" }),
}));

it.each([false, true])(
  "feeds real connection and drawer projections into the composer (adapter=%s)",
  async (registered) => {
    const removeRegistration = registerModelProvider("openai", vi.fn());
    if (!registered) removeRegistration();
    const unregister = registered ? removeRegistration : () => {};
    try {
      mocks.rows.mockResolvedValue([
        {
          id: "internal",
          publicId: `conn_a${"1".repeat(23)}`,
          provider: "openai",
          kind: "model",
          credentialSource: "own",
          credentialsEncrypted: "synthetic-stored-key",
          enabled: true,
          status: "connected",
          priority: 100,
          costPerCheckCents: null,
          rates: [],
          lastUsedAt: null,
          updatedAt: new Date(),
        },
      ]);
      const categories = await getIntegrationCategories("project");
      const connection = categories
        .find((category) => category.id === "model")
        ?.providers.find((provider) => provider.id === "openai");
      expect(connection).toMatchObject({
        status: registered ? "connected" : "planned",
        hasStoredCredentials: true,
        meta: registered
          ? [{ labelKey: "state", valueKey: "enabled" }]
          : [{ labelKey: "state", value: "Not available yet" }],
      });
      if (!connection) throw new Error("Expected projected connection");
      expect(JSON.stringify(connection)).not.toContain("synthetic-stored-key");
      const { preview } = renderNative(true, (f) => {
        f.connections[0] = connection;
        f.input.columns = f.input.columns.slice(0, 1);
      });
      expect(screen.queryByRole("region", { name: "Keys" })).toBeNull();
      if (registered) {
        expect(screen.queryByRole("link", { name: "Manage OpenAI" })).toBeNull();
        await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).toBeEnabled());
      } else {
        expect(screen.queryByRole("link", { name: "Connect OpenAI" })).toBeNull();
        expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
        expect(screen.getAllByText(/OpenAI is not available yet/)).toHaveLength(2);
        expect(preview).not.toHaveBeenCalled();
      }
      await userEvent.click(screen.getByRole("button", { name: /^Settings:/ }));
      await userEvent.click(screen.getByRole("button", { name: "Provider" }));
      const option = screen.getByRole("menuitem", { name: /^OpenAI/ });
      if (registered) expect(option).not.toHaveAttribute("aria-disabled", "true");
      else expect(option).toHaveAttribute("aria-disabled", "true");
    } finally {
      unregister();
    }
  },
);
