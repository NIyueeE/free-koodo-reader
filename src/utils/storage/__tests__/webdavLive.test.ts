/**
 * Live WebDAV smoke test (integration).
 *
 * Starts a real HTTPS WebDAV server (self-signed test certificate fixture,
 * random port) and drives the production `WebDavService` through a full sync
 * round trip:
 *   createDirectory -> uploadFile -> isExist -> listFiles -> downloadFile
 *   (byte comparison) -> deleteFile.
 *
 * The `webdav` client and WebDavService are the exact production code paths;
 * only the server is local. Also asserts the HTTPS-only policy.
 */
import fs from "fs";
import path from "path";
import https from "https";
import WebDavService from "../webdavService";
import { v2 as webdavServer } from "webdav-server";
import { HTTPBasicAuthentication } from "webdav-server/lib/user/v2/authentication/HTTPBasicAuthentication";
import { SimpleUserManager } from "webdav-server/lib/user/v2/simple/SimpleUserManager";

const FIXTURE_DIR = path.join(__dirname, "fixtures");

// The jsdom test environment does not always expose TextDecoder, which
// node-fetch (used by the webdav client) relies on for PROPFIND parsing.
if (typeof (globalThis as any).TextDecoder === "undefined") {
  (globalThis as any).TextDecoder = require("util").TextDecoder;
}

describe("WebDAV live smoke (real HTTPS server)", () => {
  let server: InstanceType<typeof webdavServer.WebDAVServer>;
  let service: WebDavService;

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
    service = new WebDavService({
      url: `https://127.0.0.1:${port}`,
      username: "smoke-user",
      password: "smoke-pass",
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.stop(() => resolve()));
    }
  });

  it("rejects plain HTTP URLs (HTTPS-only policy)", () => {
    expect(() => new WebDavService({ url: "http://127.0.0.1/dav" })).toThrow(
      "WebDAV requires HTTPS"
    );
  });

  it("round-trips a file: mkdir -> upload -> check -> list -> download -> delete", async () => {
    const payload = Buffer.from(
      "free-koodo-reader webdav smoke " + Date.now().toString()
    );

    // Create the remote collection (MKCOL).
    const created = await service.createDirectory("library");
    expect(created).toBe(true);

    // Upload (PUT).
    await service.uploadFile("book.epub", "library", payload);

    // Existence (exists / PROPFIND).
    expect(await service.isExist("book.epub", "library")).toBe(true);

    // List (PROPFIND depth 1) - only files are returned, with basenames.
    const files = await service.listFiles("library");
    expect(files).toContain("book.epub");

    // Download (GET) and compare the bytes.
    const downloaded = await service.downloadFile("book.epub", "library");
    expect(Buffer.from(downloaded).toString()).toBe(payload.toString());
    expect(service.getDownloadedSize()).toBe(payload.length);

    // Delete (DELETE) and verify it is gone.
    expect(await service.deleteFile("book.epub", "library")).toBe(true);
    expect(await service.isExist("book.epub", "library")).toBe(false);
    expect(await service.listFiles("library")).toEqual([]);
  });
});

