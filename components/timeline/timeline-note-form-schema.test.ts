import { timelineFeatureTestMessages } from "@/i18n/test-support/render-with-feature-messages";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { createTimelineNoteFormSchema } from "./timeline-note-form-schema";

const t = createTranslator({
  locale: "en",
  messages: timelineFeatureTestMessages,
  namespace: "projectTimeline.form",
});

describe("createTimelineNoteFormSchema", () => {
  it("uses the feature-scoped validation messages without changing server action input", () => {
    const result = createTimelineNoteFormSchema(t).safeParse({
      note: "",
      projectId: "prj_1",
      severity: "info",
      url: "ftp://example.com",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "Add a note.", path: ["note"] }),
        expect.objectContaining({ message: "Use an http(s) URL.", path: ["url"] }),
      ]),
    );
  });
});
