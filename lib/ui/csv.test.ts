import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "./csv";

describe("csvCell", () => {
  it("disarms a cell that a spreadsheet would read as a formula", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+41")).toBe("'+41");
    expect(csvCell("-41")).toBe("'-41");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("\t=1+1")).toBe("'\t=1+1");
    expect(csvCell("\r=1+1")).toBe('"\'\r=1+1"');
  });

  it("leaves a negative number alone because only text can carry a formula", () => {
    expect(csvCell(-41)).toBe("-41");
    expect(csvCell(null)).toBe("");
  });

  it("quotes separators, quotes and line breaks", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("x,y")).toBe('"x,y"');
    expect(csvCell("first\nsecond")).toBe('"first\nsecond"');
  });
});

describe("csvRow", () => {
  it("joins the sanitized cells with a comma", () => {
    expect(csvRow(["=cmd", 'a"b', "x,y", 12])).toBe(`'=cmd,"a""b","x,y",12`);
  });
});
