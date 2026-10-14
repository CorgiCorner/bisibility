import { renderWithSharedMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusinessCandidateReview } from "./BusinessCandidateReview";
import { BusinessMatchProvenance } from "./BusinessMatchProvenance";
import {
  projectId,
  businessFixtureTranslate as t,
  viewerPermissions,
  weakCandidate,
} from "./test-fixtures";

describe("retained match provenance", () => {
  it.each(["automatic", "manual", "rematch"] as const)(
    "labels %s without substituting recorded time for observed time",
    (source) => {
      render(
        <dl>
          <BusinessMatchProvenance
            decision={{
              ...weakCandidate,
              source,
              rankScale: "maps_organic",
              originalOrdinals: {
                ...weakCandidate.originalOrdinals,
                group: 7,
                scale: "maps_organic",
              },
            }}
            translate={t}
            formatDate={(value) => value}
          />
        </dl>,
      );
      expect(screen.getByText(t(`decisionSources.${source}`))).toBeInTheDocument();
      expect(screen.getByText(weakCandidate.recordedAt)).toBeInTheDocument();
      expect(screen.getByText(weakCandidate.matcherVersion)).toBeInTheDocument();
      expect(screen.getByText("7")).toBeInTheDocument();
      expect(screen.getByText("maps_organic")).toBeInTheDocument();
    },
  );
  it("actual candidate control keeps original observation time and unknown scale distinct", () => {
    render(
      <BusinessCandidateReview
        projectId={projectId}
        decision={weakCandidate}
        identityActive
        permissions={viewerPermissions}
        translate={t}
        formatDate={(value) => value}
        review={async () => {
          throw new Error("Viewer must never mutate");
        }}
        onSaved={() => undefined}
        onCancel={() => undefined}
        onFocusReturn={() => undefined}
      />,
    );
    expect(screen.getByText(weakCandidate.observedAt!)).toBeInTheDocument();
    expect(screen.getByText(weakCandidate.recordedAt)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save item review" })).toBeDisabled();
    expect(screen.getAllByText(t("notProvided")).length).toBeGreaterThan(0);
  });
});
