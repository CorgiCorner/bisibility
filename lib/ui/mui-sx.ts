import type { SxProps, Theme } from "@mui/material/styles";

type SxArray = Extract<SxProps<Theme>, readonly unknown[]>;
type SxItem = Exclude<SxProps<Theme>, readonly unknown[]>;

export function sxArray(sx: SxProps<Theme> | undefined): SxArray {
  if (Array.isArray(sx)) return sx as SxArray;
  return sx ? [sx as SxItem] : [];
}
