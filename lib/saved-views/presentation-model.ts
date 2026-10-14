import { z } from "zod";

export const MAX_PRESENTATION_COLUMNS = 100;
export const MAX_SAVED_VIEW_BYTES = 512 * 1024;
export const presentationIdSchema = z.string().trim().min(1).max(128);

const boundedRecord = <T extends z.ZodType>(value: T) =>
  z
    .record(presentationIdSchema, value)
    .refine(
      (record) => Object.keys(record).length <= MAX_PRESENTATION_COLUMNS,
      "Use 100 columns or fewer",
    );

export const tablePresentationSchema = z
  .object({
    columnOrder: z
      .array(presentationIdSchema)
      .max(MAX_PRESENTATION_COLUMNS)
      .refine((ids) => new Set(ids).size === ids.length, "Column IDs must be unique")
      .default([]),
    registryVersion: z.int().positive(),
    sizing: boundedRecord(z.number().finite().min(16).max(4096)).default({}),
    version: z.literal(1),
    visibility: boundedRecord(z.boolean()).default({}),
  })
  .strict();

export type TablePresentation = z.infer<typeof tablePresentationSchema>;

export const emptyTablePresentation: TablePresentation = {
  columnOrder: [],
  registryVersion: 1,
  sizing: {},
  version: 1,
  visibility: {},
};

export function cloneTablePresentation(value: TablePresentation): TablePresentation {
  return {
    ...value,
    columnOrder: [...value.columnOrder],
    sizing: { ...value.sizing },
    visibility: { ...value.visibility },
  };
}

export function fitsSavedViewPayload(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= MAX_SAVED_VIEW_BYTES;
}
