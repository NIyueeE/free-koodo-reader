import { createClient, WebDAVClient } from "webdav";
import type { Agent as HttpAgent } from "http";
import type { Agent as HttpsAgent } from "https";

/**
 * Note: this module is bundled into the browser/web build, so it must not
 * import Node built-ins at runtime. Agents (with optional idle timeouts) are
 * provided by callers; the Electron main process injects timeout-bounded
 * agents in main.js (`createWebDavSyncUtil`).
 *
 * free-koodo-reader: minimal WebDAV sync implementation using the open-source
 * `webdav` package. It intentionally supports HTTPS only and stores credentials
 * locally (TokenService already encrypts them).
 */

// Absolute abort deadline per request. Without it, a server that accepts the
// connection and stalls hangs the call forever (browser fetch has no default
// timeout). Metadata calls get a short bound; data transfers a long one so a
// slow large book download is not cut off mid-flight. Uses the native
// AbortSignal.timeout when available (modern browsers / WebViews); older
// runtimes degrade to no signal.
const METADATA_TIMEOUT_MS = 15000;
const DATA_TIMEOUT_MS = 600000;
const timeoutSignal = (fallbackMs: number): AbortSignal | undefined => {
  const abortSignal: any = typeof AbortSignal !== "undefined" ? AbortSignal : null;
  if (abortSignal && typeof abortSignal.timeout === "function") {
    return abortSignal.timeout(fallbackMs);
  }
  // Runtimes whose AbortSignal lacks .timeout (jsdom under jest): fall back to
  // a manual controller so requests stay bounded. The timer is unref'd where
  // possible so a completed request never keeps the process alive.
  if (typeof AbortController !== "undefined") {
    const controller = new AbortController();
    const timer: any = setTimeout(() => controller.abort(), fallbackMs);
    if (timer && typeof timer.unref === "function") timer.unref();
    return controller.signal;
  }
  return undefined;
};
export default class WebDavService {
  private client: WebDAVClient;
  private config: {
    url: string;
    dir?: string;
    username?: string;
    password?: string;
    httpAgent?: HttpAgent;
    httpsAgent?: HttpsAgent;
  };
  private downloadedSize = 0;
  private completed = 0;

  constructor(config: any) {
    if (!config || !config.url) {
      throw new Error("WebDAV config missing url");
    }
    const url = String(config.url).trim();
    if (!/^https:\/\//i.test(url)) {
      throw new Error("WebDAV requires HTTPS");
    }
    this.config = {
      url,
      dir: config.dir || "",
      username: config.username || "",
      password: config.password || "",
      httpAgent: config.httpAgent || undefined,
      httpsAgent: config.httpsAgent || undefined,
    };
    this.client = createClient(this.config.url, {
      username: this.config.username,
      password: this.config.password,
      httpAgent: this.config.httpAgent,
      httpsAgent: this.config.httpsAgent,
    });
  }

  private getPath(category: string, fileName?: string) {
    const base = [this.config.dir, category].filter(Boolean).join("/");
    return fileName ? `${base}/${fileName}` : base;
  }

  private ensuredCollections = new Set<string>();

  /** Auto-create the remote [dir]/<category> collection if it is missing. */
  private async ensureCollection(category: string) {
    const collectionPath = [this.config.dir, category]
      .filter(Boolean)
      .join("/");
    if (!collectionPath || this.ensuredCollections.has(collectionPath)) return;
    try {
      await this.client.createDirectory(collectionPath, {
        recursive: true,
        signal: timeoutSignal(METADATA_TIMEOUT_MS),
      });
    } catch (error: any) {
      // 301/302/405/409 mean the collection (or a parent) already exists or
      // is not allowed to be created - treat as idempotent success.
      if (![301, 302, 405, 409].includes(error?.status)) throw error;
    }
    this.ensuredCollections.add(collectionPath);
  }

  async uploadFile(fileName: string, category: string, data: Blob | ArrayBuffer | Buffer) {
    let content: any = data;
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      content = Buffer.from(await data.arrayBuffer());
    }
    // Strict servers (e.g. Seafile seafdav) return 409 for missing parent
    // collections - create the remote category before uploading.
    await this.ensureCollection(category);
    await this.client.putFileContents(this.getPath(category, fileName), content, {
      overwrite: true,
      signal: timeoutSignal(DATA_TIMEOUT_MS),
    });
    this.completed += 1;
    return { code: 200 };
  }

  async downloadFile(fileName: string, category: string): Promise<ArrayBuffer> {
    const data = (await this.client.getFileContents(this.getPath(category, fileName), {
      format: "binary" as any,
      signal: timeoutSignal(DATA_TIMEOUT_MS),
    })) as ArrayBuffer;
    this.downloadedSize += data.byteLength || 0;
    return data;
  }

  async deleteFile(fileName: string, category: string) {
    // webdav 5.7.1's client type omits the options parameter for deleteFile,
    // but the runtime passes it through to the request (signal works).
    await (this.client.deleteFile as (filename: string, options?: object) => Promise<void>)(
      this.getPath(category, fileName),
      { signal: timeoutSignal(METADATA_TIMEOUT_MS) }
    );
    return true;
  }

  async createDirectory(category: string): Promise<boolean> {
    try {
      await this.client.createDirectory(this.getPath(category), {
        recursive: true,
        signal: timeoutSignal(METADATA_TIMEOUT_MS),
      });
    } catch (error: any) {
      // 405 / 301 responses mean the directory already exists.
      if ([301, 302, 405, 409].includes(error?.status)) {
        return false;
      }
      throw error;
    }
    return true;
  }

  async listFiles(category: string): Promise<string[]> {
    const items = (await this.client.getDirectoryContents(this.getPath(category), {
        signal: timeoutSignal(METADATA_TIMEOUT_MS),
      })) as any[];
    return (items || [])
      .filter((item) => item.type === "file")
      .map((item) => item.basename || item.filename?.split("/").pop() || "");
  }

  async isExist(fileName: string, category: string): Promise<boolean> {
    // Same typing gap as deleteFile above - exists supports options at runtime.
    return (this.client.exists as (path: string, options?: object) => Promise<boolean>)(
      this.getPath(category, fileName),
      { signal: timeoutSignal(METADATA_TIMEOUT_MS) }
    );
  }

  async listFileInfos(currentPath: string) {
    const items = (await this.client.getDirectoryContents(
      [this.config.dir, currentPath].filter(Boolean).join("/"),
      { signal: timeoutSignal(METADATA_TIMEOUT_MS) }
    )) as any[];
    return (items || []).map((item) => ({
      name: item.basename || item.filename?.split("/").pop() || "",
      type: item.type === "directory" ? "folder" : "file",
      size: item.size || 0,
      path: currentPath,
    }));
  }

  remote = {
    downloadFile: async (sourcePath: string): Promise<ArrayBuffer> => {
      const data = (await this.client.getFileContents(
        [this.config.dir, sourcePath.replace(/^\//, "")].filter(Boolean).join("/"),
        { format: "binary" as any, signal: timeoutSignal(DATA_TIMEOUT_MS) }
      )) as ArrayBuffer;
      return data;
    },
  };

  getDownloadedSize() {
    return this.downloadedSize;
  }

  resetCounters() {
    this.downloadedSize = 0;
    this.completed = 0;
  }

  getStats() {
    return {
      total: this.completed,
      completed: this.completed,
      downloadedSize: this.downloadedSize,
    };
  }

  clearQueue() {
    // no-op for the open-source WebDAV client.
  }
}
