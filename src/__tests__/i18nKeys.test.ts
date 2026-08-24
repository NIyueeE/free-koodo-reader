/**
 * i18n key coverage smoke test.
 *
 * Scans the renderer source for every t("...") / i18n.t("...") call and
 * asserts the key exists in en.json and zh-CN.json. A missing key shows the
 * raw key to users instead of a translated message, which is exactly the kind
 * of regression that breaks user-facing error hints.
 */
import fs from "fs";
import path from "path";

const srcRoot = path.join(__dirname, "..");
const localesDir = path.join(srcRoot, "assets", "locales");

const collectSourceFiles = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
};

const collectKeys = (files: string[]): string[] => {
  const keys = new Set<string>();
  const patterns = [
    /(?:^|[^\w])t\(\s*["']([^"']+)["']\s*[,)]/g,
    /i18n\.t\(\s*["']([^"']+)["']\s*[,)]/g,
  ];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const match of content.matchAll(pattern)) {
        keys.add(match[1]);
      }
    }
  }
  return [...keys].sort();
};

const en = JSON.parse(
  fs.readFileSync(path.join(localesDir, "en.json"), "utf8")
);
const zh = JSON.parse(
  fs.readFileSync(path.join(localesDir, "zh-CN.json"), "utf8")
);

describe("i18n key coverage (t() calls used in source)", () => {
  const usedKeys = collectKeys(collectSourceFiles(srcRoot));

  it("finds a meaningful number of statically analyzable keys", () => {
    expect(usedKeys.length).toBeGreaterThan(100);
  });

  it("every used key exists in en.json", () => {
    const missing = usedKeys.filter((key) => !(key in en));
    expect(missing).toEqual([]);
  });

  it("every used key exists in zh-CN.json", () => {
    const missing = usedKeys.filter((key) => !(key in zh));
    expect(missing).toEqual([]);
  });
});
