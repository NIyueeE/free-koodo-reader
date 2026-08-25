/**
 * Live WebDAV smoke test for the Electron-main layer (webdavCloud.js).
 *
 * The unit suite mocks the webdav client; this file drives the exact
 * production code path used by the packaged app's cloud-upload /
 * cloud-download IPC handlers (webdavCloud -> webdav client -> real HTTPS
 * server) through a full round trip, plus the robustness guarantees:
 *
 *   1. round trip: ensureCollection -> put -> exists -> list -> get (byte
 *      comparison) -> delete.
 *   2. a server that accepts the connection and then stalls must be aborted
 *      by the per-request deadline instead of hanging forever (the Node
 *      agent `timeout` alone does not abort in-flight requests).
 */
import fs from "fs";
import https from "https";
import path from "path";
import tls from "tls";
import { v2 as webdavServer } from "webdav-server";
import { HTTPBasicAuthentication } from "webdav-server/lib/user/v2/authentication/HTTPBasicAuthentication";
import { SimpleUserManager } from "webdav-server/lib/user/v2/simple/SimpleUserManager";

const webdavCloud = require("../webdavCloud");

const FIXTURE_DIR = path.join(__dirname, "fixtures");

// The jsdom test environment does not always expose TextDecoder, which
// node-fetch (used by the webdav client) relies on for PROPFIND parsing.
if (typeof (globalThis as any).TextDecoder === "undefined") {
  (globalThis as any).TextDecoder = require("util").TextDecoder;
}

describe("webdavCloud live smoke (real HTTPS server, main-process layer)", () => {
  let server: InstanceType<typeof webdavServer.WebDAVServer>;
  let baseUrl: string;
  let agent: https.Agent;

  beforeAll(async () => {
    const key = fs.readFileSync(
      path.join(FIXTURE_DIR, "webdav-test-key.pem"),
      "utf8"
    );
    const cert = fs.readFileSync(
      path.join(FIXTURE_DIR, "webdav-test-cert.pem"),
      "utf8"
    );
    const userManager = new SimpleUserManager();
    userManager.addUser("smoke-user", "smoke-pass");
    const auth = new HTTPBasicAuthentication(userManager, "realm");
    server = new webdavServer.WebDAVServer({
      port: 0,
      https: { key, cert },
      httpAuthentication: auth,
    });
    const httpServer: any = await server.startAsync(0);
    const port = httpServer.address().port;
    baseUrl = `https://127.0.0.1:${port}`;
    // createWebDavClient only takes the custom-agent branch when BOTH agents
    // are provided; the default branch would fail on the self-signed cert.
    agent = new https.Agent({ rejectUnauthorized: false });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.stop(() => resolve()));
    }
  });

  it("round-trips a file: mkdir -> upload -> check -> list -> download -> delete", async () => {
    const util = webdavCloud.createWebDavSyncUtil({
      url: baseUrl,
      dir: "WebDAV/Free-Koodo-Reader",
      username: "smoke-user",
      password: "smoke-pass",
      httpAgent: new (require("http").Agent)(),
      httpsAgent: agent,
    });
    const payload = Buffer.from(
      "free-koodo-reader main-layer webdav smoke " + Date.now().toString()
    );

    // Upload auto-creates the remote collection (strict-server semantics).
    expect(await util.uploadFile("book.epub", "library", payload)).toEqual({
      code: 200,
    });

    expect(await util.isExist("book.epub", "library")).toBe(true);

    const files = await util.listFiles("library");
    expect(files).toContain("book.epub");

    const downloaded = await util.downloadFile("book.epub", "library");
    expect(Buffer.from(downloaded).toString()).toBe(payload.toString());
    expect(util.getDownloadedSize()).toBe(payload.length);

    expect(await util.deleteFile("book.epub", "library")).toBe(true);
    expect(await util.isExist("book.epub", "library")).toBe(false);
  });

  it(
    "aborts a stalled server instead of hanging forever"
    , async () => {
      // TLS server that accepts the handshake and never responds. The Node
      // agent `timeout` alone leaves the request pending (verified); the
      // module's per-request abort deadline must reject it.
      const stall = tls.createServer(
        {
          key: fs.readFileSync(path.join(FIXTURE_DIR, "webdav-test-key.pem")),
          cert: fs.readFileSync(path.join(FIXTURE_DIR, "webdav-test-cert.pem")),
        },
        (socket) => {
          socket.on("data", () => {
            /* swallow the request, never reply */
          });
          socket.on("error", () => {
            /* ignore */
          });
        }
      );
      await new Promise<void>((resolve) => stall.listen(0, "127.0.0.1", resolve));
      const port = (stall.address() as any).port;

      const util = webdavCloud.createWebDavSyncUtil({
        url: `https://127.0.0.1:${port}/dav`,
        dir: "x",
        username: "u",
        password: "p",
        timeoutMs: 1000, // test-speed override of the metadata deadline
        httpAgent: new (require("http").Agent)({ timeout: 500 }),
        httpsAgent: new https.Agent({ timeout: 500, rejectUnauthorized: false }),
      });

      const started = Date.now();
      await expect(util.listFiles("config")).rejects.toThrow();
      const elapsed = Date.now() - started;
      expect(elapsed).toBeLessThan(8000); // bounded, not hung
      stall.unref();
      await new Promise<void>((resolve) => stall.close(() => resolve()));
    },
  );
});
