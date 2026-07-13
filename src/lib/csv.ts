// Hand-rolled CSV parser (RFC 4180 subset) — pure, dependency-free, no I/O.
//
// Supports: quoted fields, commas inside quotes, escaped quotes ("" inside a
// quoted field), CRLF and LF line endings, and a tolerated trailing newline.
//
// Malformed input NEVER throws — following the repo's DataResult style, the
// parser returns a typed error result with a plain-English message and the
// 1-based line number where the problem was found.

export type CsvData = {
  /** The first row of the file, treated as column headers. */
  headers: string[];
  /** Every data row after the header, as raw strings (no type conversion). */
  rows: string[][];
};

export type CsvParseErrorCode =
  | "empty_input"
  | "unterminated_quote"
  | "unexpected_character_after_quote";

export type CsvParseError = {
  code: CsvParseErrorCode;
  /** Plain-English description of what is wrong. */
  message: string;
  /** 1-based line number where the problem was detected. */
  line: number;
};

export type CsvParseResult =
  | { ok: true; data: CsvData }
  | { ok: false; error: CsvParseError };

/**
 * Parse CSV text into a header row plus data rows.
 * Never throws — malformed input returns the typed error branch.
 */
export function parseCsv(text: string): CsvParseResult {
  const records: string[][] = [];

  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  /** True once the current field consumed a full quoted section. */
  let fieldWasQuoted = false;
  /** True while there is an open field/record to flush (handles trailing newline). */
  let pending = false;
  let line = 1;

  const endField = () => {
    record.push(field);
    field = "";
    fieldWasQuoted = false;
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
    pending = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote: "" inside a quoted field means one literal ".
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
          fieldWasQuoted = true;
        }
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field.length === 0 && !fieldWasQuoted) {
        // Opening quote at the start of a field.
        inQuotes = true;
        pending = true;
        continue;
      }
      if (fieldWasQuoted && field.length > 0) {
        // e.g. `"abc"x` — text after the closing quote is not valid CSV.
        return {
          ok: false,
          error: {
            code: "unexpected_character_after_quote",
            message: `Line ${line}: unexpected text after a closing quote. Quoted fields must end right before a comma or a line break.`,
            line,
          },
        };
      }
      // A stray quote in the middle of an unquoted field ("ab"c" case).
      if (!fieldWasQuoted) {
        return {
          ok: false,
          error: {
            code: "unexpected_character_after_quote",
            message: `Line ${line}: a quote character appeared in the middle of an unquoted field. Wrap the whole field in quotes instead.`,
            line,
          },
        };
      }
      // fieldWasQuoted && field empty means `""` already handled inside quotes.
      continue;
    }

    if (fieldWasQuoted && char !== "," && char !== "\n" && char !== "\r") {
      return {
        ok: false,
        error: {
          code: "unexpected_character_after_quote",
          message: `Line ${line}: unexpected text after a closing quote. Quoted fields must end right before a comma or a line break.`,
          line,
        },
      };
    }

    if (char === ",") {
      endField();
      pending = true;
      continue;
    }
    if (char === "\r") {
      // CRLF: consume the \r, let the \n (next char) end the record.
      // A lone \r is treated as a line break too.
      if (text[i + 1] === "\n") continue;
      endRecord();
      line += 1;
      continue;
    }
    if (char === "\n") {
      endRecord();
      line += 1;
      continue;
    }

    field += char;
    pending = true;
  }

  if (inQuotes) {
    return {
      ok: false,
      error: {
        code: "unterminated_quote",
        message: `Line ${line}: a quoted field was opened but never closed. Check for a missing closing quote.`,
        line,
      },
    };
  }

  // Flush the final record when the file does not end with a newline.
  if (pending || field.length > 0 || record.length > 0) {
    endRecord();
  }

  // Drop rows that are entirely empty (e.g. stray blank lines).
  const nonEmpty = records.filter(
    (row) => !(row.length === 1 && row[0].trim() === ""),
  );

  if (nonEmpty.length === 0) {
    return {
      ok: false,
      error: {
        code: "empty_input",
        message: "The file is empty — there is nothing to import.",
        line: 1,
      },
    };
  }

  const [headers, ...rows] = nonEmpty;
  return { ok: true, data: { headers, rows } };
}
