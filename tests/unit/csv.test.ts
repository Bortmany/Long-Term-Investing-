import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses a plain CSV with a header row", () => {
    const result = parseCsv("ticker,type,amount\nAAPL,BUY,100\nKO,SELL,50\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.headers).toEqual(["ticker", "type", "amount"]);
    expect(result.data.rows).toEqual([
      ["AAPL", "BUY", "100"],
      ["KO", "SELL", "50"],
    ]);
  });

  it("handles quoted fields with commas inside quotes", () => {
    const result = parseCsv('name,note\nAAPL,"bought low, sold high"\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([["AAPL", "bought low, sold high"]]);
  });

  it('handles escaped quotes ("" inside a quoted field)', () => {
    const result = parseCsv('a,b\n"say ""hello""",2\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([['say "hello"', "2"]]);
  });

  it("handles CRLF line endings", () => {
    const result = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.headers).toEqual(["a", "b"]);
    expect(result.data.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles quoted fields containing line breaks", () => {
    const result = parseCsv('a,b\n"line one\nline two",2\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([["line one\nline two", "2"]]);
  });

  it("tolerates a missing trailing newline", () => {
    const result = parseCsv("a,b\n1,2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([["1", "2"]]);
  });

  it("keeps empty fields", () => {
    const result = parseCsv("a,b,c\n1,,3\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toEqual([["1", "", "3"]]);
  });

  it("returns a typed error for an unterminated quote (never throws)", () => {
    const result = parseCsv('a,b\n"never closed,2\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unterminated_quote");
    expect(result.error.line).toBeGreaterThanOrEqual(2);
    expect(result.error.message).toMatch(/closing quote/i);
  });

  it("returns a typed error for text after a closing quote", () => {
    const result = parseCsv('a,b\n"abc"xyz,2\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("unexpected_character_after_quote");
  });

  it("returns a typed error for empty input", () => {
    const result = parseCsv("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("empty_input");

    const onlyNewlines = parseCsv("\n\n");
    expect(onlyNewlines.ok).toBe(false);
  });
});
