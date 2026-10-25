import { withEvidenceMessages } from "@/.storybook/evidence-messages";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { EvidenceProjection } from "@/lib/provider-evidence/projection/model";
import type { Meta, StoryObj } from "@storybook/react";
import { useTranslations } from "next-intl";
import { KeywordChangeCell } from "./KeywordChangeCell";
import { KeywordDeviceCell } from "./KeywordDeviceCell";
import { KeywordRankValue } from "./KeywordRankValue";
import { rankQualityRow } from "./keyword-rank-quality.test-fixture";

function Result({
  position = 7,
  recovered = false,
  unknownCost = false,
}: {
  position?: number | null;
  recovered?: boolean;
  unknownCost?: boolean;
}) {
  const t = useTranslations("projectRankTracker.keywordImport.management.columns");
  const projection: EvidenceProjection = {
    acceptance: "accepted",
    fulfillment: recovered ? "complete" : "partial",
    returnedDepth: 20,
    accounting: unknownCost ? "unknown" : "measured",
    result: recovered ? "recovered" : "partial",
    cost: unknownCost ? "unknown" : "measured",
    recovery: null,
    originalCheckedAt: "2026-10-20T06:00:00Z",
  };
  const row = { ...rankQualityRow(), rankEvidence: { projection, position } };
  return (
    <DataTable
      id="keyword-evidence-story"
      ariaLabel={t("keyword")}
      rows={[row]}
      columns={[
        {
          id: "keyword",
          header: t("keyword"),
          size: 260,
          meta: { sortable: false, flex: 1 },
          cell: () => <KeywordDeviceCell row={row} projectRef="prj_story" />,
        },
        {
          id: "position",
          header: t("position"),
          size: 320,
          meta: { sortable: false },
          cell: () => <KeywordRankValue row={row} />,
        },
        {
          id: "change",
          header: t("change"),
          size: 120,
          meta: { sortable: false },
          cell: () => <KeywordChangeCell row={row} />,
        },
      ]}
      rowHeight={() => 112}
      sorting={null}
      onSortingChange={() => {}}
    />
  );
}
const meta = {
  title: "Keywords/EvidenceResults",
  component: Result,
  decorators: [withEvidenceMessages],
} satisfies Meta<typeof Result>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Partial: Story = {};
export const PartialNoMatch: Story = { args: { position: null } };
export const Recovered: Story = { args: { recovered: true } };
export const RecoveredUnknownCost: Story = { args: { recovered: true, unknownCost: true } };
