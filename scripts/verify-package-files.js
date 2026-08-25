/**
 * Static packaging guard for electron-builder (CI).
 *
 * main.js runs from inside app.asar, so every module it requires must be
 * matched by a `build.files` pattern. A missing pattern ships a build that
 * dies at startup with "Cannot find module" — the v3.0.4 regression, where
 * main.js required ./src/utils/storage/webdavCloud but no pattern covered
 * it and every desktop artifact crashed before the first window.
 *
 * This script walks the static require() graph of the main-process entries
 * (main.js, preload.js) inside the repo and fails if any local file is not
 * matched by build.files. Bare specifiers (npm packages) are skipped:
 * electron-builder bundles production dependencies automatically, and the
 * dependency placement (dependencies vs devDependencies) is asserted
 * separately by the runtime packaged smoke test in the release workflow.
 *
 * Usage: node scripts/verify-package-files.js  (exit 0 = safe to package)
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const patterns = (pkg.build && pkg.build.files) || [];

if (patterns.length === 0) {
  console.error("::error::package.json build.files is empty or missing");
  process.exit(1);
}

/** Translate the electron-builder glob subset used by build.files to a RegExp. */
const globToRegExp = (pattern) => {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          re += "(?:.*/)?"; // "**/" spans zero or more segments
          i += 2;
        } else {
          re += ".*";
          i++;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp("^" + re + "$");
};

const regexes = patterns.map(globToRegExp);
const isCovered = (rel) => regexes.some((re) => re.test(rel));

const RESOLVE_EXTS = ["", ".js", ".json", ".node"];
const resolveLocal = (fromFile, spec) => {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of RESOLVE_EXTS) {
    const candidate = base + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  for (const candidate of [path.join(base, "package.json"), path.join(base, "index.js")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

const entries = ["main.js", "preload.js"].map((f) => path.join(root, f));
for (const entry of entries) {
  if (!fs.existsSync(entry)) {
    console.error("::error::main-process entry missing: " + path.relative(root, entry));
    process.exit(1);
  }
}

const seen = new Set();
const problems = [];
const queue = [...entries];
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  const rel = path.relative(root, file).split(path.sep).join("/");
  if (!isCovered(rel)) problems.push(rel);
  const src = fs.readFileSync(file, "utf8");
  const requireRe = /require\(\s*["']([^"']+)["']\s*\)/g;
  let match;
  while ((match = requireRe.exec(src))) {
    const spec = match[1];
    if (!spec.startsWith(".")) continue; // bare specifier: npm dependency
    const resolved = resolveLocal(file, spec);
    if (resolved) {
      queue.push(resolved);
    } else {
      problems.push(rel + ': unresolved require("' + spec + '")');
    }
  }
}

if (problems.length) {
  console.error(
    '::error::main-process files not matched by build.files — the packaged app would crash at startup with "Cannot find module":'
  );
  for (const item of Array.from(new Set(problems))) console.error("  - " + item);
  console.error("build.files patterns: " + JSON.stringify(patterns));
  process.exit(1);
}
console.log(
  "Packaging check passed: " +
    seen.size +
    " main-process files all matched by build.files (" +
    patterns.length +
    " patterns)"
);
