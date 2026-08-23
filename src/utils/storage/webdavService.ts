import { createClient, WebDAVClient } from "webdav";

/**
 * free-koodo-reader: minimal WebDAV sync implementation using the open-source
 * `webdav` package. It intentionally supports HTTPS only and stores credentials
 * locally (TokenService already encrypts them).
 */
export default class WebDavService {
  private client: WebDAVClient;
  private config: { url: string; dir?: string; username?: string; password?: string };
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
    };
    this.client = createClient(this.config.url, {
      username: this.config.username,
      password: this.config.password,
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
