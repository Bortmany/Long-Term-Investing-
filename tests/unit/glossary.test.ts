import { describe, expect, it } from "vitest";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

const keys = Object.keys(GLOSSARY) as GlossaryKey[];

describe("GLOSSARY", () => {
  it("has at least 30 entries", () => {
    expect(keys.length).toBeGreaterThanOrEqual(30);
  });

  it.each(keys)("%s has non-empty term, short, and detail", (key) => {
    const entry = GLOSSARY[key];
    expect(entry.term.trim().length).toBeGreaterThan(0);
    expect(entry.short.trim().length).toBeGreaterThan(0);
    expect(entry.detail.trim().length).toBeGreaterThan(0);
  });

  it.each(keys)("%s short is at most 160 characters", (key) => {
    expect(GLOSSARY[key].short.length).toBeLessThanOrEqual(160);
  });

  it.each(keys)("%s contains no TODO or lorem placeholder text", (key) => {
    const entry = GLOSSARY[key];
    const combined = `${entry.term} ${entry.short} ${entry.detail} ${entry.example ?? ""}`;
    expect(combined).not.toMatch(/TODO/i);
    expect(combined).not.toMatch(/lorem/i);
  });

  it.each(keys)("%s detail ends with a period", (key) => {
    expect(GLOSSARY[key].detail.trim().endsWith(".")).toBe(true);
  });
});
