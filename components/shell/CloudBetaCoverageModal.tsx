"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { DownloadSimpleIcon as DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { HardDrivesIcon as HardDrives } from "@phosphor-icons/react/dist/csr/HardDrives";
import { InfoIcon as Info } from "@phosphor-icons/react/dist/csr/Info";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";

type CloudBetaCoverageModalProps = {
  onClose: () => void;
  onExport: () => void;
  open: boolean;
  projectRef: string;
};

type PolicyItem = Readonly<{ copy: string; id: string }>;

function PolicyColumn({
  items,
  title,
  tone,
}: Readonly<{
  items: readonly PolicyItem[];
  title: string;
  tone: "covered" | "not-yet";
}>) {
  const coveredTone = tone === "covered";
  return (
    <section className="min-w-0 rounded-card border border-border bg-bg-elev p-3.5">
      <h3 className="m-0 text-[10px] uppercase tracking-[0.5px] text-fg-muted">{title}</h3>
      <ul className="m-0 mt-3 grid list-none gap-3 p-0">
        {items.map((item) => (
          <li className="flex items-start gap-2 text-[12px] leading-[1.45]" key={item.id}>
            <span
              className={`mt-0.5 grid h-[17px] w-[17px] shrink-0 place-items-center rounded-control ${
                coveredTone ? "bg-green/10 text-green-text" : "bg-red/10 text-red-text"
              }`}
            >
              {coveredTone ? (
                <Check aria-hidden size={10} weight="regular" />
              ) : (
                <X aria-hidden size={10} weight="regular" />
              )}
            </span>
            <span>{item.copy}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CloudBetaCoverageModal({
  onClose,
  onExport,
  open,
}: Readonly<CloudBetaCoverageModalProps>) {
  const t = useTranslations("shell.betaCoverage");
  const covered = [
    { copy: t("coveredItems.scheduled"), id: "scheduled" },
    { copy: t("coveredItems.providerOwnership"), id: "providerOwnership" },
    { copy: t("coveredItems.history"), id: "history" },
    { copy: t("coveredItems.export"), id: "export" },
  ];
  const notYet = [
    { copy: t("notYetItems.restore"), id: "restore" },
    { copy: t("notYetItems.uptime"), id: "uptime" },
    { copy: t("notYetItems.migration"), id: "migration" },
    { copy: t("notYetItems.support"), id: "support" },
  ];
  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} type="button" variant="ghost">
            {t("close")}
          </Button>
          <Button
            onClick={onExport}
            startIcon={<DownloadSimple aria-hidden size={15} weight="regular" />}
            type="button"
          >
            {t("exportData")}
          </Button>
        </>
      }
      headerDivider
      onClose={onClose}
      open={open}
      title={
        <span className="block">
          <span className="block">{t("title")}</span>
          <span className="mt-1 block text-[12.5px] font-normal tracking-normal text-fg-muted">
            {t("subtitle")}
          </span>
        </span>
      }
      width={600}
    >
      <div className="grid gap-4.5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PolicyColumn items={covered} title={t("covered")} tone="covered" />
          <PolicyColumn items={notYet} title={t("notYet")} tone="not-yet" />
        </div>

        <section>
          <h3 className="m-0 text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            {t("responsibilities.title")}
          </h3>
          <div className="mt-2 grid gap-2">
            <div className="flex items-start gap-3 rounded-control border border-border px-3.5 py-3">
              <HardDrives
                aria-hidden
                className="mt-0.5 shrink-0 text-fg-muted"
                size={17}
                weight="regular"
              />
              <div>
                <div className="text-[12.5px] font-semibold">
                  {t("responsibilities.ours.title")}
                </div>
                <p className="m-0 mt-0.5 text-[11.5px] leading-[1.45] text-fg-muted">
                  {t("responsibilities.ours.detail")}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-control border border-border px-3.5 py-3">
              <DownloadSimple
                aria-hidden
                className="mt-0.5 shrink-0 text-fg-muted"
                size={17}
                weight="regular"
              />
              <div>
                <div className="text-[12.5px] font-semibold">
                  {t("responsibilities.yours.title")}
                </div>
                <p className="m-0 mt-0.5 text-[11.5px] leading-[1.45] text-fg-muted">
                  {t("responsibilities.yours.detail")}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h3 className="m-0 text-[10px] uppercase tracking-[0.5px] text-fg-muted">
            {t("end.title")}
          </h3>
          <div className="mt-2 flex items-start gap-3 rounded-control border border-border px-3.5 py-3">
            <Info
              aria-hidden
              className="mt-0.5 shrink-0 text-fg-muted"
              data-icon="info"
              size={17}
              weight="regular"
            />
            <p className="m-0 text-[11.5px] leading-[1.5] text-fg-muted">{t("end.detail")}</p>
          </div>
        </section>
      </div>
    </Modal>
  );
}
