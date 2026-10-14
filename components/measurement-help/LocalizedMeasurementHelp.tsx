"use client";

import { useFormatter, useTranslations } from "next-intl";
import { MeasurementHelp, type MeasurementHelpProps } from "./MeasurementHelp";
import { createHelpTranslator } from "./translate";

/** Shared catalogs are available both in full routes and feature islands. */
export function LocalizedMeasurementHelp(
  props: Omit<MeasurementHelpProps, "translate" | "formatCount">,
) {
  const t = useTranslations("shared.measurementHelp");
  const format = useFormatter();
  return (
    <MeasurementHelp
      {...props}
      translate={createHelpTranslator(t)}
      formatCount={(value) => format.number(value, { maximumFractionDigits: 0 })}
    />
  );
}
