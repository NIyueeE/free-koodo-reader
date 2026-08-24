/**
 * i18n data integrity tests.
 *
 * Verifies that every locale file is valid JSON and that the two fully
 * maintained locales (English and Simplified Chinese) expose the same key
 * set, so missing UI strings are caught in CI.
 */
import fs from "fs";
import path from "path";

const localesDir = path.join(__dirname, "..", "assets", "locales");

const allLocaleFiles = fs
  .readdirSync(localesDir)
  .filter((f) => f.endsWith(".json"))
  .sort();

const loadLocale = (file: string): Record<string, unknown> => {
  const raw = fs.readFileSync(path.join(localesDir, file), "utf8");
  return JSON.parse(raw);
};

describe("i18n locale files", () => {
  it("all locale JSON files are valid and non-empty", () => {
    expect(allLocaleFiles.length).toBeGreaterThan(10);
    for (const file of allLocaleFiles) {
      const data = loadLocale(file);
      expect(typeof data).toBe("object");
      expect(Object.keys(data).length).toBeGreaterThan(0);
    }
  });

  it("every key has a non-empty string value", () => {
    const en = loadLocale("en.json");
    for (const value of Object.values(en)) {
      expect(typeof value).toBe("string");
      expect((value as string).trim().length).toBeGreaterThan(0);
    }
  });

  it("en.json and zh-CN.json expose the same key set", () => {
    const en = loadLocale("en.json");
    const zh = loadLocale("zh-CN.json");
    const missingInZh = Object.keys(en).filter((key) => !(key in zh));
    const missingInEn = Object.keys(zh).filter((key) => !(key in en));
    expect(missingInZh).toEqual([]);
    expect(missingInEn).toEqual([]);
  });
});
