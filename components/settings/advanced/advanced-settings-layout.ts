const advancedBackupCardGeometryClassName = "min-h-[254px]";

export const advancedCardGeometryClassNames = {
  audit: "min-h-[220px]",
  backup: advancedBackupCardGeometryClassName,
  danger: "min-h-[184px]",
  migration: "min-h-[210px]",
} as const;

export const advancedLoadingCardGeometryClassNames = {
  audit: "h-[579px] sm:h-[462px]",
  backup: advancedBackupCardGeometryClassName,
  danger: "h-[184px]",
  migration: "min-h-[210px]",
} as const;
