import { actionPaymentOption } from "@/lib/action-payment/options";
import { beforeEach, expect, it, vi } from "vitest";
import { domainOverviewProject, domainOverviewSource } from "../domain-overview/context";
import { backlinksProject, backlinksSource } from "./context";

const mocks = vi.hoisted(() => ({ project: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { project: { findFirst: mocks.project } } }));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.provider }));
vi.mock("@/lib/providers/crypto", () => ({ getPurposeSecretKeys: () => [Buffer.alloc(32, 7)] }));

const provider = {
  id: "future-capable",
  label: "Future provider",
  payment: {
    basis: "provider_quantity" as const,
    unit: {
      kind: "provider_native" as const,
      providerId: "future-capable",
      key: "records",
      singular: "record",
      plural: "records",
    },
  },
  fetchBacklinksSummary: vi.fn(),
  fetchBacklinksHistory: vi.fn(),
  fetchBacklinksRows: vi.fn(),
  fetchDomainRankOverview: vi.fn(),
  fetchHistoricalRankOverview: vi.fn(),
  fetchRankedKeywords: vi.fn(),
  fetchRelevantPages: vi.fn(),
};
const project = {
  id: "project",
  publicId: "prj_example",
  ownerId: "owner",
  lookupCacheTtlSeconds: null,
  providerConnections: [
    {
      id: "own",
      publicId: "conn_a00000000000000000000000",
      provider: provider.id,
      credentialSource: "own" as const,
      credentialsEncrypted: "encrypted",
      updatedAt: new Date(),
    },
    {
      id: "hosted",
      publicId: "conn_b00000000000000000000000",
      provider: "another-capable",
      credentialSource: "hosted" as const,
      credentialsEncrypted: null,
      updatedAt: new Date(),
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockResolvedValue(project);
  mocks.provider.mockImplementation((id: string) => ({
    ...provider,
    id,
    payment: { ...provider.payment, unit: { ...provider.payment.unit, providerId: id } },
  }));
});

it("selects the exact capable backlinks payment route without a provider allowlist", () => {
  const selected = {
    connection: project.providerConnections[1],
    provider: mocks.provider("another-capable"),
  };
  const option = actionPaymentOption(selected, "backlinks");
  if (!option) throw new Error("Missing payment option");
  expect(backlinksSource(project, undefined, option.id)?.connection.id).toBe("hosted");
});
it("selects the exact capable domain payment route and refuses unknown options", () => {
  const option = actionPaymentOption(
    {
      connection: project.providerConnections[1],
      provider: mocks.provider("another-capable"),
    },
    "domain_overview",
  );
  if (!option) throw new Error("Missing payment option");
  expect(domainOverviewSource(project, option.id)?.connection.id).toBe("hosted");
  expect(() => domainOverviewSource(project, "unrecognized")).toThrow("payment_quote_changed");
});
it.each([backlinksProject, domainOverviewProject])(
  "loads route and owner metadata for quote binding",
  async (read) => {
    await read("prj_example");
    expect(mocks.project).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          ownerId: true,
          providerConnections: expect.objectContaining({
            select: expect.objectContaining({
              publicId: true,
              credentialSource: true,
              updatedAt: true,
            }),
          }),
        }),
      }),
    );
  },
);

it("resolves action-specific units for a future capable provider without falling back to its unrelated default", () => {
  const source = {
    connection: project.providerConnections[0],
    provider: {
      ...provider,
      paymentFor: (feature: string) => ({
        ...provider.payment,
        unit: {
          ...provider.payment.unit,
          key: feature,
          singular: `${feature} record`,
          plural: `${feature} records`,
        },
      }),
    },
  };
  const backlinks = actionPaymentOption(source, "backlinks");
  const overview = actionPaymentOption(source, "domain_overview");
  expect(backlinks?.payableUnit).toMatchObject({ key: "backlinks" });
  expect(overview?.payableUnit).toMatchObject({ key: "domain_overview" });
  expect(backlinks?.id).not.toBe(overview?.id);
});
