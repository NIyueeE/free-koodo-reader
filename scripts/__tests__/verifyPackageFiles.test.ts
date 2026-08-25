/**
 * Packaging guard test: build.files must cover the main-process require graph.
 *
 * main.js runs from inside app.asar — a require target that no `build.files`
 * pattern matches ships a build that crashes at startup with
 * "Cannot find module" (v3.0.4 regression: ./src/utils/storage/webdavCloud
 * was missing and every desktop artifact died before the first window).
 * This test runs scripts/verify-package-files.js so `yarn test` fails before
 * such a change can reach a release.
 */
import { spawnSync } from "child_process";
import path from "path";

const root = path.resolve(__dirname, "../..");

describe("packaging guard (build.files coverage)", () => {
  it("covers every main-process require target", () => {
    const result = spawnSync(
      "node",
      [path.join(root, "scripts", "verify-package-files.js")],
      { cwd: root, encoding: "utf8" }
    );
    if (result.status !== 0) {
      throw new Error(
        "verify-package-files failed:\n" + (result.stdout || "") + (result.stderr || "")
      );
    }
    expect(result.stdout).toContain("Packaging check passed");
  });
});
