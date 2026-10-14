import { describe, expect, it } from "vitest";
import { csvCell, csvRow, csvRowWithNumberFormat } from "./csv";
import { csvTextFixtures } from "./csv-test-fixtures";

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

// Exact wire bytes prove leading controls/BOM are examined without trimming the original text.
it.each([
  ["  =1+1", "'  =1+1"],
  ["\uFEFF@sum", "'\uFEFF@sum"],
  ["\u0000 \u001F\uFEFF-41", "'\u0000 \u001F\uFEFF-41"],
  ["\nplain", '"\'\nplain"'],
  ["  ordinary text  ", "  ordinary text  "],
])("preserves original text while protecting the prefix %j", (value, expected) => {
  expect(csvCell(value)).toBe(expected);
});

it("handles every ASCII leading control or space and BOM before a formula marker", () => {
  for (let code = 0; code <= 32; code += 1) {
    const original = String.fromCharCode(code) + "\uFEFF=1+1";
    const result = csvCell(original);
    const decoded = result.startsWith('"') ? result.slice(1, -1).replaceAll('""', '"') : result;
    expect(decoded).toBe("'" + original);
  }
});

it("keeps finite numeric values numeric in the wire format", () => {
  expect(csvRow([-3, 0, 3.25])).toBe("-3,0,3.25");
});

it("protects text fixture values without mutating the reusable input", () => {
  for (const fixture of csvTextFixtures) {
    const encoded = csvCell(fixture.value);
    const decoded = encoded.startsWith('"') ? encoded.slice(1, -1).replaceAll('""', '"') : encoded;
    expect(decoded).toBe(fixture.exported);
  }
});

it("formats only numeric inputs without turning negative numbers into formula text", () => {
  expect(csvRowWithNumberFormat([-3, "-3", "=1+1"], (value) => value.toFixed(2))).toBe(
    "-3.00,'-3,'=1+1",
  );
  expect(csvRowWithNumberFormat([-3], (value) => value.toFixed(1))).toBe("-3.0");
});

it("never delegates text to a numeric formatter and still escapes its numeric output", () => {
  let calls = 0;
  expect(
    csvRowWithNumberFormat(["-value"], (value) => {
      calls += 1;
      return value.toFixed(2);
    }),
  ).toBe("'-value");
  expect(calls).toBe(0);
  expect(csvRowWithNumberFormat([1234.5], () => "1,234.5")).toBe('"1,234.5"');
  expect(csvRowWithNumberFormat([-3], () => '-3\r"unit"')).toBe('"-3\r""unit"""');
});

it("retains csvRow/csvCell Array.map callback compatibility", () => {
  expect([[-3], [-4]].map(csvRow)).toEqual(["-3", "-4"]);
  expect([-3, "-value"].map(csvCell)).toEqual(["-3", "'-value"]);
});
