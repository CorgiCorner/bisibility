import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectionResources, keywordResearchPageProject, keywordResearchProject } from "./context";

const mocks = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { project: mocks.project } }));

const provider = { id: "dataforseo", label: "DataForSEO" };
const connection = {
  credentialsEncrypted: "secret",
  id: "connection_1",
  provider: "dataforseo",
  publicId: "conn_a00000000000000000000000",
};

describe("keyword research connection IDs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.project.findFirst.mockResolvedValue(null);
  });

  it("loads public IDs in both project contexts", async () => {
    await keywordResearchProject("project_1");
    await keywordResearchPageProject("project_1");

    for (const [input] of mocks.project.findFirst.mock.calls) {
      expect(input).toMatchObject({
        select: {
          providerConnections: {
            select: { credentialsEncrypted: true, id: true, provider: true, publicId: true },
          },
        },
      });
    }
  });

  it("returns only strict public connection IDs", () => {
    expect(connectionResources([{ connection, provider }] as never)).toEqual([
      {
        id: "conn_a00000000000000000000000",
        label: "DataForSEO",
        provider: "dataforseo",
      },
    ]);
  });

  it.each(["connection_1", "key_a00000000000000000000000"])(
    "fails closed for stored connection ID %s",
    (publicId) => {
      expect(() =>
        connectionResources([{ connection: { ...connection, publicId }, provider }] as never),
      ).toThrow("Expected a v3 public");
    },
  );
});
