import { createClient, WebDAVClient } from "webdav";
import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";

/**
 * Idle-socket timeout for HTTP/HTTPS agents. Prevents sync operations (and
 * the "test connection" flow) from hanging forever on a stalled server.
 */
const DEFAULT_AGENT_TIMEOUT_MS = 15000;

/**
 * free-koodo-reader: minimal WebDAV sync implementation using the open-source
 * `webdav` package. It intentionally supports HTTPS only and stores credentials
 * locally (TokenService already encrypts them).
 */
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
      // Default agents bound to an idle timeout so stalled connections
      // fail instead of hanging (overridable via custom agents).
      httpAgent:
        config.httpAgent || new HttpAgent({ timeout: DEFAULT_AGENT_TIMEOUT_MS }),
      httpsAgent:
        config.httpsAgent ||
        new HttpsAgent({ timeout: DEFAULT_AGENT_TIMEOUT_MS }),
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

  async uploadFile(fileName: string, category: string, data: Blob | ArrayBuffer | Buffer) {
    let content: any = data;
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      content = Buffer.from(await data.arrayBuffer());
    }
    await this.client.putFileContents(this.getPath(category, fileName), content, {
      overwrite: true,
    });
    this.completed += 1;
    return { code: 200 };
  }

  async downloadFile(fileName: string, category: string): Promise<ArrayBuffer> {
    const data = (await this.client.getFileContents(this.getPath(category, fileName), {
      format: "binary" as any,
    })) as ArrayBuffer;
    this.downloadedSize += data.byteLength || 0;
    return data;
  }

  async deleteFile(fileName: string, category: string) {
    await this.client.deleteFile(this.getPath(category, fileName));
    return true;
  }

  async createDirectory(category: string): Promise<boolean> {
    try {
      await this.client.createDirectory(this.getPath(category));
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
    const items = (await this.client.getDirectoryContents(this.getPath(category))) as any[];
    return (items || [])
      .filter((item) => item.type === "file")
      .map((item) => item.basename || item.filename?.split("/").pop() || "");
  }

  async isExist(fileName: string, category: string): Promise<boolean> {
    return this.client.exists(this.getPath(category, fileName));
  }

  async listFileInfos(currentPath: string) {
    const items = (await this.client.getDirectoryContents(
      [this.config.dir, currentPath].filter(Boolean).join("/")
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
        { format: "binary" as any }
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
