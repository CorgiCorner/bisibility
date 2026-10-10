import { getBacklinks } from "@/lib/api/backlinks";
import {
  expectedFailedSummaryDetails,
  failedSummaryApiContext,
  failedSummaryFixture,
  failedSummaryProjectId,
} from "@/lib/api/backlinks-failed-summary.test-fixture";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it, vi } from "vitest";
import { createBisibilityMcpServer } from "./server";

const mocks = vi.hoisted(() => ({ analyze: vi.fn(), handleApiRequest: vi.fn() }));
vi.mock("@/lib/backlinks/service", () => ({ analyzeBacklinks: mocks.analyze }));
vi.mock("@/lib/api/router", () => ({
  handleApiRequest: mocks.handleApiRequest,
  handleMcpPreauthenticatedApiRequest: vi.fn(),
}));

it("keeps failed summary evidence in an MCP error rather than a success tool result", async () => {
  mocks.analyze.mockResolvedValue({
    ...failedSummaryFixture,
    cause: { message: "private-provider-error" },
    attemptId: "private-attempt",
  });
  mocks.handleApiRequest.mockImplementation((request: Request) =>
    getBacklinks(failedSummaryApiContext(request), failedSummaryProjectId),
  );
  const server = createBisibilityMcpServer({ authorization: "bsb_key_test_fixture_00000000" });
  const client = new Client({ name: "backlinks-failure-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: "analyze_backlinks",
      arguments: { project_id: failedSummaryProjectId, target: "example.com" },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        status: 500,
        message: "bisibility API request failed.",
        payload: { status: 500, details: expectedFailedSummaryDetails },
      },
    });
    expect(JSON.stringify(result)).not.toContain("private-");
    expect(mocks.handleApiRequest).toHaveBeenCalledOnce();
  } finally {
    await client.close();
    await server.close();
  }
});
