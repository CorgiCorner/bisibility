import { trackingEntityObservations } from "@/lib/ai-tracking/execution/observations";
import { trackingCsv } from "@/lib/ai-tracking/exports/csv";
import { boundedRaw, boundedUtf8 } from "@/lib/ai-tracking/identity";
import {
  trackingExportProjection,
  trackingSampleProjection,
  trackingTrendProjection,
} from "@/lib/ai-tracking/projections/evidence";
import { trackingPromptForm } from "@/lib/ai-tracking/projections/forms";
import { compareTrackingPeriods, trackingDenominator } from "@/lib/ai-tracking/projections/trends";
import { describe, expect, it } from "vitest";

type StoredSample = Parameters<typeof trackingSampleProjection>[0];
const sample = {
  publicId: "asm_test",
  runId: "internal-run",
  promptRevisionId: "internal-revision",
  measurement: "answer_present",
  source: "consumer_scrape",
  engine: "chat_gpt",
  plan: { promptText: "=Exact prompt", promptRevisionId: "internal-revision" },
  answerText: '+Retained answer, "with quotes"',
  raw: { items: [{ text: "retained" }] },
  evidence: { actualModel: null, recordedSource: "fresh", observedAt: "2026-10-08T09:00:00Z" },
  receipt: { amountUsd: "0.0006", state: "confirmed", providerCostEntryId: "ledger-entry" },
  promptRevision: { publicId: "apr_test", text: "=Exact prompt" },
  run: { publicId: "air_test" },
  citations: [{ url: "https://example.com/cited", title: "Citation", position: 0 }],
} as unknown as StoredSample;

describe("tracking persistence, projections, export and trends agree", () => {
  it("keeps exact prompt bytes at the surface validation boundary", () => {
    const text = "  Which team uses café + 100% growth? 🙂\n ";
    expect(trackingPromptForm.parse({ text }).text).toBe(text);
    expect(() => trackingPromptForm.parse({ text: " \n\t " })).toThrow();
  });
  it("reconstructs retained text and raw from their dedicated store columns", () => {
    const projected = trackingSampleProjection(sample);
    expect(projected.evidence?.answerText).toBe(sample.answerText);
    expect(projected.evidence?.raw).toEqual(sample.raw);
    expect(projected.evidence?.actualModel).toBeNull();
    expect(projected.costUsd).toBe("0.0006");
    expect(projected.promptRevisionId).toBe("apr_test");
  });

  it("exports public identities and safely preserves exact retained prompt and answer", () => {
    const row = trackingExportProjection(sample);
    expect(row.runId).toBe("air_test");
    expect(row.promptRevisionId).toBe("apr_test");
    const csv = trackingCsv([row]);
    expect(csv).toContain("'=Exact prompt");
    expect(csv).toContain('"\'+Retained answer, ""with quotes"""');
    expect(csv).toContain("https://example.com/cited");
    expect(csv).not.toContain("internal-run");
  });

  it("counts absent AIO as completed coverage while excluding it from mention rate", () => {
    const rows = [
      {
        identity: "a",
        measurement: "answer_present" as const,
        mentioned: true,
        recordedSource: "fresh" as const,
      },
      {
        identity: "b",
        measurement: "aio_not_present" as const,
        mentioned: false,
        recordedSource: "fresh" as const,
      },
      {
        identity: "c",
        measurement: "partial" as const,
        mentioned: false,
        recordedSource: "fresh" as const,
      },
      {
        identity: "d",
        measurement: "unknown" as const,
        mentioned: null,
        recordedSource: "fresh" as const,
      },
      {
        identity: "e",
        measurement: "answer_present" as const,
        mentioned: true,
        recordedSource: "cache" as const,
      },
    ];
    expect(trackingDenominator(rows, 5)).toEqual({
      expected: 5,
      observed: 4,
      eligible: 1,
      mentioned: 1,
      absentAio: 1,
      partial: 1,
      failed: 0,
      unknown: 1,
      missing: 1,
      coverage: 0.4,
      mentionRate: 1,
    });
    expect(compareTrackingPeriods(rows, rows, 5, 5).comparable).toBe(false);
  });

  it("rejects configuration changes even at complete coverage", () => {
    const row = {
      identity: "revision1:configuration1",
      measurement: "answer_present" as const,
      mentioned: true,
      recordedSource: "fresh" as const,
    };
    expect(
      compareTrackingPeriods([row], [{ ...row, identity: "revision2:configuration1" }], 1, 1),
    ).toMatchObject({ comparable: false, delta: null, reason: "Configuration changed" });
    expect(compareTrackingPeriods([row], [{ ...row, mentioned: false }], 1, 1)).toMatchObject({
      comparable: true,
      delta: -1,
    });
  });

  it("does not turn a competitor-only observation into a project brand mention", () => {
    const observations = trackingEntityObservations(
      "Example is mentioned here; the tracked project is absent.",
      [
        { id: "project", kind: "project", label: "Acme", domain: "acme.dev", aliases: [] },
        {
          id: "competitor",
          kind: "competitor",
          label: "Example",
          domain: "example.com",
          aliases: [],
        },
      ],
    );
    expect(observations.map((row) => [row.name, row.mentioned])).toEqual([
      ["Acme", false],
      ["Example", true],
    ]);
    expect(observations[1]).toMatchObject({
      matchPolicy: "nfkc_unicode_word_v1",
      snippet: expect.stringContaining("Example"),
    });
    expect(
      trackingTrendProjection([{ ...sample, observations }] as unknown as StoredSample[]).mentioned,
    ).toBe(0);
  });

  it("retains valid UTF-8 and bounds raw projection after escaping", () => {
    const answer = boundedUtf8("🙂".repeat(100_000), 256 * 1024);
    expect(answer.truncated).toBe(true);
    expect(Buffer.byteLength(answer.text, "utf8")).toBeLessThanOrEqual(256 * 1024);
    const raw = boundedRaw({ answer: "\u0000".repeat(100_000) });
    expect(raw.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(raw.raw), "utf8")).toBeLessThanOrEqual(512 * 1024);
  });
});
