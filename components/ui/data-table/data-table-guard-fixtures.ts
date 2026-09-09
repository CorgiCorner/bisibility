import type { TableSource } from "./data-table-guard-helpers";

export const splitTableOpeningTag = `
export function RawTable() {
  return (
    <
      table
      aria-label="Raw data"
    >
      <tbody />
    </table>
  );
}
`;

export const directMuiTableImport = `
import TableBody from "@mui/material/TableBody";
export const value = TableBody;
`;

export const namedMuiTableImport = `
import {
  Button,
  Table as MuiTable,
  TableRow,
} from "@mui/material";
export const value = [Button, MuiTable, TableRow];
`;

export const escapedMuiTableImport = `
import { \\u0054able as MuiTable } from "\\x40mui/material";
export const value = MuiTable;
`;

export const tableMentionsOnly = `
// <table> and @mui/material/Table are diagnostic text, not production elements.
export const migrationNote = "Replace <table> with the shared primitive";
`;

export function tableSource(path: string, source: string): TableSource {
  return { path, source };
}
