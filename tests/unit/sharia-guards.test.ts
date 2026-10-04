// Import guard + privacy sync + public-page / AI isolation for the Sharia screen.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

describe("a verdict is bought, never computed", () => {
  it("nothing in src/ imports a ratio-computation helper for Sharia", () => {
    for (const file of walk("src")) {
      expect(read(file), file).not.toMatch(/from ["'][^"']*sharia[^"']*(ratio|compute|calculate)[^"']*["']/i);
    }
    for (const name of readdirSync(path.join(root, "src/lib/sharia"))) {
      expect(name).not.toMatch(/ratio|compute|calculate/i);
    }
  });

  it("only the adapter's mapping and the store write a verdict value", () => {
    const writers = walk("src").filter((f) => /verdict:\s*"(NOT_)?COMPLIANT"/.test(read(f)));
    for (const file of writers) {
      expect(file.endsWith("musaffa.ts") || file.endsWith("vendor.ts"), file).toBe(true);
    }
  });
});

describe("public pages and the AI never see a verdict", () => {
  it("public stock pages and the AI folder do not mention the Sharia code", () => {
    const files = [
      ...walk("src/app/s"),
      ...walk("src/lib/ai"),
      "src/lib/public-stock.ts",
      "src/lib/public-stock-copy.ts",
    ];
    for (const file of files) {
      expect(read(file), file).not.toMatch(/sharia/i);
    }
  });
});

describe("/privacy stays in sync with the Sharia screen", () => {
  it("names the Sharia choice, the shared results, Musaffa, and the public-page counting line", () => {
    const privacy = read("src/app/privacy/page.tsx").replace(/\s+/g, " ");
    for (const phrase of [
      "Your Sharia screen choice",
      "never share it with anyone",
      "Sharia screening results",
      "Not linked to any person",
      "<strong>Musaffa</strong>",
      "Nothing about you, and not whether you use the badge, is sent",
      "Public stock pages:",
      "we do not save it and we set no cookie on those pages",
    ]) {
      expect(privacy, phrase).toContain(phrase);
    }
  });

  it("the schema stores the preference as a plain yes/no, off by default", () => {
    expect(read("prisma/schema.prisma")).toMatch(/shariaScreenEnabled\s+Boolean\s+@default\(false\)/);
  });
});

describe("the plan list is not flipped by this build", () => {
  it("sharia-badge stays coming_soon", () => {
    const plans = read("src/lib/plans.ts");
    const at = plans.indexOf("sharia-badge");
    expect(at).toBeGreaterThan(-1);
    expect(plans.slice(at, at + 300)).toContain("coming_soon");
  });
});
