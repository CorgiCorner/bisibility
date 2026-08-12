import { deferred } from "@/tests/deferred";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChunkedTransfer } from "./useChunkedTransfer";

const mocks = vi.hoisted(() => ({
  createRemoteImportSession: vi.fn(),
  exportAndTransferChunk: vi.fn(),
  exportCloudImportPackage: vi.fn(),
  finalizeRemoteImportSession: vi.fn(),
  planChunkedTransfer: vi.fn(),
  preflightMigrationTarget: vi.fn(),
  transferCloudImportPackage: vi.fn(),
  transferSectionsChunk: vi.fn(),
}));

vi.mock("@/lib/actions/cloud", () => ({
  exportCloudImportPackage: mocks.exportCloudImportPackage,
  preflightMigrationTarget: mocks.preflightMigrationTarget,
  transferCloudImportPackage: mocks.transferCloudImportPackage,
}));
vi.mock("@/lib/actions/instance-migration", () => ({
  createRemoteImportSession: mocks.createRemoteImportSession,
  exportAndTransferChunk: mocks.exportAndTransferChunk,
  finalizeRemoteImportSession: mocks.finalizeRemoteImportSession,
  planChunkedTransfer: mocks.planChunkedTransfer,
  transferSectionsChunk: mocks.transferSectionsChunk,
}));

const jobId = "imp_abcdefghijklmnopqrstuvwx";
const keywordId = "kw_abcdefghijklmnopqrstuvwx";
const projectId = "prj_abcdefghijklmnopqrstuvwx";

function Harness() {
  const transfer = useChunkedTransfer();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        onClick={() =>
          void transfer
            .runChunkedTransfer({ projectId, token: "mig_valid_token_value_123" })
            .catch((caught: unknown) =>
              setError(caught instanceof Error ? caught.message : "failed"),
            )
        }
        type="button"
      >
        Run
      </button>
      <div data-testid="stage">{transfer.progress?.stage ?? "idle"}</div>
      <div data-testid="message">{transfer.progress?.message ?? ""}</div>
      <div data-testid="chunks">
        {transfer.progress
          ? `${transfer.progress.sentChunks}/${transfer.progress.totalChunks}`
          : ""}
      </div>
      <div data-testid="error">{error}</div>
    </>
  );
}

describe("useChunkedTransfer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preflightMigrationTarget.mockResolvedValue({
      appVersion: "1.2.3",
      latestMigration: "20260708010000_target",
      reachable: true,
      schemaVersionsSupported: [5],
      supportsSessions: true,
    });
  });

  it("reports chunked transfer progress through finalize", async () => {
    const plan = deferred<{
      chunkCount: number;
      totalKeywords: number;
      totalRankChecks: number;
      useSessions: boolean;
    }>();
    const session = deferred<{ ok: true; value: { sessionId: string } }>();
    const firstChunk = deferred<{
      ok: true;
      value: { chunksReceived: number; done: boolean; nextCursor: string };
    }>();
    const secondChunk = deferred<{
      ok: true;
      value: { chunksReceived: number; done: boolean; nextCursor: string | null };
    }>();
    const sections = deferred<{ ok: true; value: { chunksReceived: number } }>();
    const finalize = deferred<{
      ok: true;
      value: {
        counts: Record<string, number>;
        jobId: string;
        state: "done";
      };
    }>();
    mocks.planChunkedTransfer.mockReturnValue(plan.promise);
    mocks.createRemoteImportSession.mockReturnValue(session.promise);
    mocks.exportAndTransferChunk
      .mockReturnValueOnce(firstChunk.promise)
      .mockReturnValueOnce(secondChunk.promise);
    mocks.transferSectionsChunk.mockReturnValue(sections.promise);
    mocks.finalizeRemoteImportSession.mockReturnValue(finalize.promise);

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(screen.getByTestId("stage")).toHaveTextContent("planning");
    await act(async () => {
      plan.resolve({
        chunkCount: 3,
        totalKeywords: 401,
        totalRankChecks: 25_001,
        useSessions: true,
      });
    });
    await waitFor(() => expect(mocks.createRemoteImportSession).toHaveBeenCalled());
    expect(screen.getByTestId("message")).toHaveTextContent("Creating import session.");

    await act(async () => {
      session.resolve({ ok: true, value: { sessionId: jobId } });
    });
    await waitFor(() => expect(mocks.exportAndTransferChunk).toHaveBeenCalledTimes(1));
    await act(async () => {
      firstChunk.resolve({
        ok: true,
        value: { chunksReceived: 1, done: false, nextCursor: keywordId },
      });
    });
    await waitFor(() => expect(screen.getByTestId("chunks")).toHaveTextContent("1/3"));
    await act(async () => {
      secondChunk.resolve({
        ok: true,
        value: { chunksReceived: 2, done: true, nextCursor: null },
      });
    });
    await waitFor(() =>
      expect(mocks.transferSectionsChunk).toHaveBeenCalledWith(
        expect.objectContaining({ index: 2, sessionId: jobId }),
      ),
    );
    await act(async () => {
      sections.resolve({ ok: true, value: { chunksReceived: 3 } });
    });
    await waitFor(() => expect(screen.getByTestId("stage")).toHaveTextContent("finalizing"));
    await act(async () => {
      finalize.resolve({
        ok: true,
        value: { counts: { keywords: 401 }, jobId, state: "done" },
      });
    });

    await waitFor(() => expect(screen.getByTestId("stage")).toHaveTextContent("done"));
    expect(screen.getByTestId("chunks")).toHaveTextContent("3/3");
  });

  it("uses the single-shot package path when sessions are not needed", async () => {
    mocks.planChunkedTransfer.mockResolvedValue({
      chunkCount: 2,
      totalKeywords: 12,
      totalRankChecks: 400,
      useSessions: false,
    });
    mocks.exportCloudImportPackage.mockResolvedValue({
      content: "{}",
      counts: {
        alertRules: 0,
        competitors: 0,
        keywords: 12,
        notificationPreferences: 0,
        rankChecks: 400,
        savedViews: 0,
      },
      filename: "package.json",
      mimeType: "application/json",
    });
    mocks.transferCloudImportPackage.mockResolvedValue({
      ok: true,
      value: {
        counts: { keywords: 12 },
        jobId: "imp_bbcdefghijklmnopqrstuvwx",
        state: "done",
      },
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(screen.getByTestId("stage")).toHaveTextContent("done"));
    expect(mocks.exportCloudImportPackage).toHaveBeenCalledWith({ projectId });
    expect(mocks.transferCloudImportPackage).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "package.json", token: "mig_valid_token_value_123" }),
    );
    expect(mocks.createRemoteImportSession).not.toHaveBeenCalled();
  });

  it("unwraps a handled single-shot rejection into the existing error state", async () => {
    mocks.planChunkedTransfer.mockResolvedValue({
      chunkCount: 1,
      totalKeywords: 1,
      totalRankChecks: 0,
      useSessions: false,
    });
    mocks.exportCloudImportPackage.mockResolvedValue({
      content: "{}",
      counts: { keywords: 1, rankChecks: 0 },
      filename: "package.json",
      mimeType: "application/json",
    });
    mocks.transferCloudImportPackage.mockResolvedValue({
      error: {
        code: "remote_migration_rejected",
        message: "Migration token is invalid or expired.",
        status: 419,
      },
      ok: false,
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(screen.getByTestId("stage")).toHaveTextContent("error"));
    expect(screen.getByTestId("message")).toHaveTextContent(
      "Migration token is invalid or expired.",
    );
    expect(screen.getByTestId("error")).toHaveTextContent("Migration token is invalid or expired.");
  });

  it("unwraps a handled mid-session rejection into the existing error state", async () => {
    mocks.planChunkedTransfer.mockResolvedValue({
      chunkCount: 3,
      totalKeywords: 401,
      totalRankChecks: 25_001,
      useSessions: true,
    });
    mocks.createRemoteImportSession.mockResolvedValue({
      ok: true,
      value: { sessionId: jobId },
    });
    mocks.exportAndTransferChunk.mockResolvedValue({
      error: {
        code: "remote_migration_rejected",
        message: "Migration token is invalid or expired.",
        status: 419,
      },
      ok: false,
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(screen.getByTestId("stage")).toHaveTextContent("error"));
    expect(screen.getByTestId("error")).toHaveTextContent("Migration token is invalid or expired.");
    expect(mocks.transferSectionsChunk).not.toHaveBeenCalled();
    expect(mocks.finalizeRemoteImportSession).not.toHaveBeenCalled();
  });

  it("blocks session transfers when the target is too old", async () => {
    mocks.planChunkedTransfer.mockResolvedValue({
      chunkCount: 3,
      totalKeywords: 401,
      totalRankChecks: 25_001,
      useSessions: true,
    });
    mocks.preflightMigrationTarget.mockResolvedValue({
      appVersion: null,
      latestMigration: null,
      reachable: true,
      reason: "Target instance is too old for chunked sessions - upgrade it.",
      schemaVersionsSupported: null,
      supportsSessions: false,
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => expect(screen.getByTestId("stage")).toHaveTextContent("error"));
    expect(screen.getByTestId("error")).toHaveTextContent(
      "Target instance is too old for chunked sessions - upgrade it.",
    );
    expect(mocks.createRemoteImportSession).not.toHaveBeenCalled();
    expect(mocks.transferCloudImportPackage).not.toHaveBeenCalled();
  });
});
