import { ToastContext } from "@/components/ui/toast-context";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { PlaygroundEntity } from "@/lib/ai-research/model-playground-view";
import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import type { ResultColumn } from "@/lib/model-playground/result-view";
import aiMessages from "@/messages/core/en/project-ai-research.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { vi } from "vitest";
import { ModelPlayground } from "./ModelPlayground";
import { composerCopy } from "./model-playground-composer-copy.test-support";

vi.mock("./ModelPlaygroundHistory", () => ({
  ModelPlaygroundHistoryButton: () => <span>History</span>,
}));
vi.mock("@/lib/actions/ai-tracking", () => ({ mutateAiTrackingAction: vi.fn() }));
vi.mock("@/lib/actions/research-history", () => ({
  saveModelPlaygroundReportAction: vi.fn(async () => ({ ok: false, reason: "pending" })),
}));
vi.mock("@/lib/actions/ai-research", () => ({
  analyzeAiResearchAction: vi.fn(() => {
    throw new Error("Legacy action reached from native render");
  }),
  getAiResearchCatalogAction: vi.fn(() => {
    throw new Error("Legacy catalog reached from native render");
  }),
}));
vi.mock("./useAiResearchSubmission", () => ({
  useAiResearchSubmission: () => {
    throw new Error("Native composer must not enter the legacy payment hook");
  },
}));
export function renderNative(
  canRun = true,
  configure?: (fixture: ReturnType<typeof composerFixture>) => void,
  canConnect = true,
  entities: readonly PlaygroundEntity[] = [],
  initialResults?: readonly ResultColumn[],
) {
  const fixture = composerFixture();
  configure?.(fixture);
  const service = createFakeModelPlaygroundLaunchService(fixture);
  const launch = vi.spyOn(service, "launch");
  const originalPreview = service.preview.bind(service);
  const preview = vi.spyOn(service, "preview");
  const showToast = vi.fn();
  renderWithFeatureMessages(
    <ToastContext.Provider value={{ showToast }}>
      <ModelPlayground
        projectId="prj_test"
        projectName="Acme"
        domain="acme.example"
        entities={entities}
        topics={[]}
        sourceOverrides={[]}
        canRun={canRun}
        nativeComposer={{
          ...fixture,
          initialResults,
          service,
          enabled: true,
          canConnect,
          copy: composerCopy,
          debounceMs: 80,
          languages: [
            { code: "en", name: "English" },
            { code: "pl", name: "Polish" },
          ],
          markets: [
            { code: "US", name: "United States" },
            { code: "PL", name: "Poland" },
          ],
        }}
      />
    </ToastContext.Provider>,
    { messages: { ...sharedMessages, ...aiMessages } },
  );
  return {
    launch,
    preview,
    originalPreview,
    fixture,
    showToast,
    holdNextQuote() {
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      preview.mockImplementationOnce(async (...args) => {
        await held;
        return originalPreview(...args);
      });
      return release;
    },
  };
}
