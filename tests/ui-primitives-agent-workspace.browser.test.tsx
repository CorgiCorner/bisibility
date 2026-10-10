/// <reference types="vite/client" />
import "@/app/globals.css";
import { AgentReportHistory } from "@/components/agent-reports/AgentReportHistory";
import {
  AgentReportsLayout,
  AgentReportsLoading,
  AgentReportsToolbar,
} from "@/components/agent-reports/AgentReportsLayout";
import { AgentWorkspaceAccessProvider } from "@/components/agent-reports/AgentWorkspaceAccessProvider";
import { ProjectContextForm } from "@/components/project-context/ProjectContextForm";
import { ProjectContextLoading } from "@/components/project-context/ProjectContextLayout";
import { PageContent } from "@/components/shell/PageContent";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { featureMessagesElement } from "@/i18n/test-support/render-with-feature-messages";
import { emptyProjectContext } from "@/lib/project-context/model";
import { applyTheme } from "@/lib/theme/browser-theme";
import messages from "@/messages/core/en/agent-workspace.json";
import shared from "@/messages/core/en/shared.json";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

const copy = messages.agentWorkspace;
const projectRef = "prj_abcdefghijklmnopqrstuvwx";
afterEach(() => {
  cleanup();
  applyTheme("light");
});
function bounds(node: Element | null) {
  if (!node) throw new Error("Layout element is missing");
  const { x, y, width, height } = node.getBoundingClientRect();
  return { x, y, width, height };
}
function measure(view: ReactNode, writable: boolean, workspaceMessages = messages) {
  const result = render(
    featureMessagesElement(
      <AgentWorkspaceAccessProvider value={{ canCreate: writable, canEdit: writable }}>
        {view}
      </AgentWorkspaceAccessProvider>,
      { messages: { ...shared, ...workspaceMessages } },
    ),
  );
  const root = bounds(result.container.firstElementChild);
  const card = bounds(result.container.querySelector('[data-slot="card"], [data-empty-state]'));
  const fields = [...result.container.querySelectorAll("textarea")].map(bounds);
  result.unmount();
  return { root, card, fields };
}

describe.each([390, 768, 1440])("Agent workspace geometry at %ipx", (width) => {
  it.each(["light", "dark"] as const)("keeps wrapped field labels stable in %s", async (theme) => {
    await page.viewport(width, 1000);
    applyTheme(theme);
    const localized = {
      agentWorkspace: {
        ...copy,
        business:
          "Business description, positioning and the customer problems this project addresses",
        save: "Projektkontext speichern",
      },
    };
    for (const writable of [true, false]) {
      const loading = measure(
        <PageContent variant="form">
          <ProjectContextLoading />
        </PageContent>,
        writable,
        localized,
      );
      const settled = measure(
        <PageContent variant="form">
          <ProjectContextForm
            projectId={projectRef}
            context={emptyProjectContext}
            canEdit={writable}
            saveAction={async () => emptyProjectContext}
          />
        </PageContent>,
        writable,
        localized,
      );
      expect(settled).toEqual(loading);
    }
  });
  it.each([
    ["light", true],
    ["dark", true],
    ["light", false],
    ["dark", false],
  ] as const)(
    "keeps context fields and card stable through loading in %s, writable=%s",
    async (theme, writable) => {
      await page.viewport(width, 1000);
      applyTheme(theme);
      const loading = measure(
        <PageContent variant="form">
          <ProjectContextLoading />
        </PageContent>,
        writable,
      );
      for (const context of [
        emptyProjectContext,
        { ...emptyProjectContext, business: "Independent retail inventory software." },
      ]) {
        const settled = measure(
          <PageContent variant="form">
            <ProjectContextForm
              projectId={projectRef}
              context={context}
              canEdit={writable}
              saveAction={async () => context}
            />
          </PageContent>,
          writable,
        );
        expect(settled).toEqual(loading);
      }
    },
  );
  it.each([
    ["light", true],
    ["dark", true],
    ["light", false],
    ["dark", false],
  ] as const)(
    "keeps the Reports toolbar and content origin stable in %s, writable=%s",
    async (theme, writable) => {
      await page.viewport(width, 1000);
      applyTheme(theme);
      const loading = measure(
        <AgentReportsLoading
          description={copy.reportsDescription}
          addReportLabel={copy.addReport}
        />,
        writable,
      );
      for (const content of [
        <EmptyState key="empty" title={copy.emptyTitle} description={copy.emptyDescription} />,
        <AgentReportHistory
          key="history"
          reports={[
            {
              id: "agr_abcdefghijklmnopqrstuvwx",
              title: "Content opportunities",
              kind: "manual_analysis",
              createdAt: "2026-10-02T12:00:00.000Z",
            },
          ]}
          projectRef={projectRef}
          locale="en"
          timeZone="UTC"
        />,
      ]) {
        const settled = measure(
          <AgentReportsLayout>
            <AgentReportsToolbar
              description={copy.reportsDescription}
              action={writable ? <Button variant="secondary">{copy.addReport}</Button> : undefined}
            />
            {content}
          </AgentReportsLayout>,
          writable,
        );
        expect({ x: settled.root.x, width: settled.root.width }).toEqual({
          x: loading.root.x,
          width: loading.root.width,
        });
        expect({ x: settled.card.x, y: settled.card.y, width: settled.card.width }).toEqual({
          x: loading.card.x,
          y: loading.card.y,
          width: loading.card.width,
        });
      }
    },
  );
});
