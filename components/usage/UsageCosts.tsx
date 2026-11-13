"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { emptyCostForm, formFromStored } from "@/lib/cost-items/form-state";
import type { CostItemInput } from "@/lib/cost-items/input";
import type { CostRow } from "@/lib/cost-items/present";
import type { UsageCostsView } from "@/lib/cost-items/view";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState } from "react";
import { CostDrawer } from "./CostDrawer";
import { CostSubscriptions } from "./CostSubscriptions";
import { CostTiles } from "./CostTiles";

type CostAction = (input: CostItemInput) => Promise<void>;
type IdAction = (input: { projectId: string; publicId: string }) => Promise<void>;

export function UsageCosts({
  children,
  createItem,
  deleteItem,
  endItem,
  updateItem,
  view,
}: Readonly<{
  children?: ReactNode;
  createItem: CostAction;
  deleteItem: IdAction;
  endItem: IdAction;
  updateItem: CostAction;
  view: UsageCostsView;
}>) {
  const t = useTranslations("projectUsageCosts");
  const [drawer, setDrawer] = useState<{ id?: string; mode: "create" | "edit" } | null>(null);
  const [remove, setRemove] = useState<CostRow | null>(null);
  const editing = view.rows.find((row) => row.id === drawer?.id);
  const initial = editing
    ? formFromStored(editing, view.projectPublicId)
    : emptyCostForm(view.projectPublicId, view.today);
  return (
    <>
      <section className="flex min-w-0 flex-col gap-5" data-usage-section="tiles">
        <p className="text-ui-body text-fg-muted">{t("lead")}</p>
        <CostTiles tiles={view.tiles} />
      </section>
      {children}
      <CostSubscriptions
        canEdit={view.canEdit}
        onAdd={() => setDrawer({ mode: "create" })}
        onDelete={setRemove}
        onEdit={(row) => setDrawer({ id: row.id, mode: "edit" })}
        onEnd={(row) => void endItem({ projectId: view.projectPublicId, publicId: row.id })}
        rows={view.rows}
      />
      <CostDrawer
        catalog={view.catalog}
        editingId={editing?.id}
        initial={initial}
        key={`${drawer?.mode ?? "closed"}-${drawer?.id ?? "new"}`}
        mode={drawer?.mode ?? "create"}
        onClose={() => setDrawer(null)}
        onSubmit={drawer?.mode === "edit" ? updateItem : createItem}
        open={drawer !== null}
        projectPublicId={view.projectPublicId}
        suggestHref={view.suggestHref}
      />
      <Modal
        description={
          remove ? (
            <>
              {t("card.deleteBody", { name: remove.name })}
              {remove.projects.length > 1 ? (
                <>
                  {" "}
                  {t("card.deleteShared", {
                    count: remove.projects.filter(
                      (project) => project.publicId !== view.projectPublicId,
                    ).length,
                  })}
                </>
              ) : null}
            </>
          ) : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRemove(null)} type="button" variant="outline">
              {t("card.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!remove) return;
                const row = remove;
                setRemove(null);
                void deleteItem({ projectId: view.projectPublicId, publicId: row.id });
              }}
              type="button"
              variant="destructive"
            >
              {t("card.delete")}
            </Button>
          </div>
        }
        onClose={() => setRemove(null)}
        open={remove !== null}
        title={t("card.deleteTitle")}
      >
        {null}
      </Modal>
    </>
  );
}
