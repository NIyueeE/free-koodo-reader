/**
 * WebDAV sync utilities for the Electron main process.
 *
 * Plain CommonJS module (no TypeScript, no bundler-only imports) shared by
 * main.js. Wraps the open-source `webdav` client:
 *   - orchestrates cloud-upload / cloud-download IPC semantics: the local
 *     file at <storagePath>/<type>/<fileName> is uploaded to
 *     [dir]/<type>/<fileName>, and downloads are written back to the same
 *     local path.
 *   - auto-creates the remote [dir]/<type> collection before uploads
 *     (strict servers such as Seafile seafdav return 409 otherwise).
 *   - never throws raw IPC errors; helpers throw Error with a readable
 *     message, and describeError() turns network/HTTP failures into
 *     user-facing text.
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");

const AGENT_TIMEOUT_MS = 15000;
// Node's Agent `timeout` only marks the socket idle-timed-out; with no
// listener the in-flight request is never aborted, so a server that accepts
// the connection and then stalls hangs the IPC call forever (measured: still
// pending after 8s with a 2s agent timeout). Every request therefore carries
// an absolute abort deadline: short for metadata calls, long for data
// transfers so a slow large book download is not cut off mid-flight.
const METADATA_TIMEOUT_MS = 15000;
const DATA_TIMEOUT_MS = 600000;
const IDEMPOTENT_STATUS = [301, 302, 405, 409];

/**
 * Abort deadline for one request. Prefers the native AbortSignal.timeout
 * (Electron main / modern browsers); falls back to a manual controller for
 * runtimes whose AbortSignal lacks .timeout (jsdom under jest). The fallback
 * timer is unref'd so a completed request never keeps the process alive.
 * A per-call `config.timeoutMs` overrides the default for testing.
 */
const timeoutSignal = (config, fallbackMs) => {
  const ms = (config && config.timeoutMs) || fallbackMs;
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  if (typeof AbortController !== "undefined") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    if (typeof timer.unref === "function") timer.unref();
    return controller.signal;
  }
  return undefined;
};
const metadataSignal = (config) => timeoutSignal(config, METADATA_TIMEOUT_MS);
const dataSignal = (config) => timeoutSignal(config, DATA_TIMEOUT_MS);

const describeError = (error) => {
  const status = error && error.status;
  const code = error && error.code;
  const message = (error && error.message) || String(error || "unknown error");
  if (status === 401 || status === 403) {
    return `Server returned HTTP ${status} (authentication failed - check username/password and WebDAV permissions)`;
  }
  if (status === 404) {
    return "Server returned HTTP 404 (remote folder not found - check the directory path)";
  }
  if (status === 409) {
    return "Server returned HTTP 409 (a parent folder is missing on the server)";
  }
  if (status) return `Server returned HTTP ${status}`;
  if (code === "ECONNREFUSED") return "Connection refused by the server";
  if (code === "ENOTFOUND") return "Server address was not found (DNS)";
  if (code === "ETIMEDOUT" || /timed out/i.test(message)) return "Connection timed out";
  if (code === "ECONNRESET" || /socket hang up/i.test(message)) return "Connection was reset";
  if (/UNABLE_TO_VERIFY|CERT_|error:certificate/i.test(message)) return "TLS certificate could not be verified";
  if (/ssl|tls/i.test(message)) return "TLS/SSL handshake failed";
  if (/requires HTTPS/i.test(message)) return "WebDAV requires HTTPS";
  if ((error && error.name === "AbortError") || /abort/i.test(message)) {
    return "Request timed out and was aborted";
  }
  return message;
};

const createWebDavClient = (config) => {
  const url = String((config && config.url) || "").trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error("WebDAV requires HTTPS");
  }
  if (config.httpAgent) {
    return require("webdav").createClient(url, {
      username: config.username || "",
      password: config.password || "",
      httpAgent: config.httpAgent,
      httpsAgent: config.httpsAgent,
    });
  }
  const client = require("webdav").createClient(url, {
    username: config.username || "",
    password: config.password || "",
    httpAgent: new http.Agent({ timeout: AGENT_TIMEOUT_MS }),
    httpsAgent: new https.Agent({ timeout: AGENT_TIMEOUT_MS }),
  });
  return client;
};

const createWebDavSyncUtil = (config) => {
  const client = createWebDavClient(config);
  const dir = config.dir || "";
  const pathFor = (category, fileName) =>
    [dir, category, fileName].filter(Boolean).join("/");
  const ensured = new Set();
  const ensureCollection = async (category) => {
    const collectionPath = [dir, category].filter(Boolean).join("/");
    if (!collectionPath || ensured.has(collectionPath)) return;
    try {
      await client.createDirectory(collectionPath, {
        recursive: true,
        signal: metadataSignal(config),
      });
    } catch (error) {
      if (!IDEMPOTENT_STATUS.includes(error && error.status)) throw error;
    }
    ensured.add(collectionPath);
  };
  let downloadedSize = 0;
  let completed = 0;
  return {
    async uploadFile(fileName, category, data) {
      let content = data;
      if (Buffer.isBuffer(data)) content = data;
      else if (data && typeof data.arrayBuffer === "function") {
        content = Buffer.from(await data.arrayBuffer());
      }
      await ensureCollection(category);
      await client.putFileContents(pathFor(category, fileName), content, {
        overwrite: true,
        signal: dataSignal(config),
      });
      completed += 1;
      return { code: 200 };
    },
    async downloadFile(fileName, category) {
      // format must be "binary"|"text" in the Node realm of webdav 5.x -
      // "arraybuffer" is only valid in the browser build and throws
      // "Invalid output format" here (binary resolves to a Buffer).
      const buf = await client.getFileContents(pathFor(category, fileName), {
        format: "binary",
        signal: dataSignal(config),
      });
      downloadedSize += buf.byteLength || 0;
      return buf;
    },
    async deleteFile(fileName, category) {
      await client.deleteFile(pathFor(category, fileName), {
        signal: metadataSignal(config),
      });
      return true;
    },
    async listFiles(category) {
      const items = await client.getDirectoryContents(pathFor(category), {
        signal: metadataSignal(config),
      });
      return (items || [])
        .filter((item) => item.type === "file")
        .map((item) => item.basename || item.filename.split("/").pop() || "");
    },
    async isExist(fileName, category) {
      return client.exists(pathFor(category, fileName), {
        signal: metadataSignal(config),
      });
    },
    async listFileInfos(currentPath) {
      const items = await client.getDirectoryContents(
        [dir, currentPath].filter(Boolean).join("/"),
        { signal: metadataSignal(config) }
      );
      return (items || []).map((item) => ({
        name: item.basename || item.filename.split("/").pop() || "",
        type: item.type === "directory" ? "folder" : "file",
        size: item.size || 0,
        path: currentPath,
      }));
    },
    remote: {
      async downloadFile(sourcePath) {
        return client.getFileContents(
          [dir, sourcePath.replace(/^\//, "")].filter(Boolean).join("/"),
          { format: "binary", signal: dataSignal(config) }
        );
      },
    },
    getDownloadedSize() {
      return downloadedSize;
    },
    resetCounters() {
      downloadedSize = 0;
      completed = 0;
    },
    getStats() {
      return { total: completed, completed, downloadedSize };
    },
    clearQueue() {},
  };
};

/** Upload the local file <storagePath>/<type>/<fileName> to the server. */
const uploadLocalFile = async (config, type, fileName, storagePath) => {
  const localPath = path.join(storagePath || "", type, fileName);
  let content;
  try {
    content = fs.readFileSync(localPath);
  } catch (error) {
    throw new Error("Local file not found for upload: " + localPath);
  }
  const syncUtil = createWebDavSyncUtil(config);
  return syncUtil.uploadFile(fileName, type, content);
};

/** Download <type>/<fileName> to the local path <storagePath>/<type>/<fileName>. */
const downloadLocalFile = async (config, type, fileName, storagePath) => {
  const syncUtil = createWebDavSyncUtil(config);
  const buffer = await syncUtil.downloadFile(fileName, type);
  const targetDir = path.join(storagePath || "", type);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, fileName), Buffer.from(buffer));
  return true;
};

module.exports = {
  createWebDavSyncUtil,
  uploadLocalFile,
  downloadLocalFile,
  describeError,
  AGENT_TIMEOUT_MS,
  METADATA_TIMEOUT_MS,
  DATA_TIMEOUT_MS,
};
