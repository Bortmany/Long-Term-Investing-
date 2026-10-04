// Small fixes from the full-journey test: the import file count, and the
// stock page treating a stock the person may not see as "not found".
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { fileCountLine } from "@/components/import/file-step";

const read = (relative: string) =>
  readFileSync(path.resolve(__dirname, "../..", relative), "utf8");

describe("import file count line", () => {
  it("counts a good file as ready", () => {
    expect(fileCountLine([{}])).toBe("1 file ready");
    expect(fileCountLine([{}, {}])).toBe("2 files ready");
  });

  it("never calls a mismatched file ready", () => {
    expect(fileCountLine([{ problem: "Doesn't match" }])).toBe("1 file can't be used");
    expect(fileCountLine([{}, { problem: "Doesn't match" }])).toBe("1 file ready, 1 can't be used");
  });
});

describe("stock page and pickers use the one visibility rule", () => {
  it("/stocks/[id] answers not-found for a stock outside the person's view", () => {
    const page = read("src/app/(app)/stocks/[id]/page.tsx");
    expect(page).toContain("getVisibleInstrument(userId, id)");
    expect(page).toContain("notFound()");
    expect(page).not.toContain("prisma.instrument.findUnique");
  });

  it("the Add Transaction, Committee and import pickers never list every instrument", () => {
    for (const file of [
      "src/app/(app)/portfolio/page.tsx",
      "src/app/(app)/committee/page.tsx",
      "src/app/(app)/portfolio/import/page.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toMatch(/prisma\.instrument\.findMany\(\s*\{\s*(orderBy|select)/);
      expect(source).toContain("listVisibleInstruments");
    }
  });
});
