/**
 * Mobile/narrow-screen layout screenshot harness (dev tool, not used by CI).
 *
 * Boots the real Electron app under an Xvfb display, forces a phone-portrait
 * (or desktop) viewport through the Chrome DevTools Protocol, imports demo
 * EPUBs, walks the main manager routes / view modes / dialogs and the reader
 * panels, and saves a PNG per state to the output directory. Use it to verify
 * layout changes in `src/assets/styles/responsive.css` and the reader panels
 * against the running app instead of eyeballing CSS.
 *
 * Usage:
 *   Xvfb :99 -screen 0 1200x900x24 &   # needs libgtk-3 on bare containers
 *   DISPLAY=:99 node scripts/mobile-screenshot.js /tmp/shots phone
 *     outDir defaults to /tmp/koodo-mobile-shots
 *     mode: phone (390x844) | desktop (1280x800) | both (default)
 *   Optional flags:
 *     --fresh   wipe the Electron userData profile first (empty library)
 *   Add DISPLAY/xvfb yourself; the script only spawns Electron.
 *
 * Requires: node_modules/ws (already a transitive dependency) and network
 * access on first boot. Screenshots land in <outDir>/<tag>-<state>.png.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const JSZip = require("jszip");
const WebSocket = require("ws");

const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] || "/tmp/koodo-mobile-shots";
const MODE = process.argv.includes("--desktop")
  ? "desktop"
  : process.argv.includes("--both")
    ? "both"
    : process.argv.find((a) => a === "phone" || a === "desktop" || a === "both") || "both";
const FRESH = process.argv.includes("--fresh");
const PORT = 9333;
const SIZES = MODE === "phone" ? [[390, 844]] : MODE === "desktop" ? [[1280, 800]] : [[390, 844], [1280, 800]];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Generate a minimal valid EPUB so the shelf has books to render. */
async function makeEpub(title, author, chapters) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.folder("META-INF").file(
    "container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  );
  const oebps = zip.folder("OEBPS");
  const manifest = [];
  const spine = [];
  chapters.forEach((ch, i) => {
    const name = `chapter${i + 1}.xhtml`;
    const paras = Array.from(
      { length: 20 },
      (_, p) => `<p>${title} — ${ch} paragraph ${p + 1}. Sample text long enough to observe wrapping and margins. The quick brown fox jumps over the lazy dog 0123456789.</p>`
    ).join("\n");
    oebps.file(
      name,
      `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${ch}</title></head><body><h1>${ch}</h1>${paras}</body></html>`
    );
    manifest.push(`<item id="c${i + 1}" href="${name}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="c${i + 1}"/>`);
  });
  oebps.file(
    "content.opf",
    `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:language>en</dc:language><identifier id="bookid">urn:uuid:${title.replace(/\s/g, "-")}</identifier></metadata><manifest>${manifest.join("")}</manifest><spine>${spine.join("")}</spine></package>`
  );
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const file = path.join(OUT, `${title.replace(/\s/g, "-")}.epub`);
  fs.writeFileSync(file, buf);
  return { name: path.basename(file), path: file };
}

async function getJson(p) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port: PORT, path: p }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(JSON.parse(data)));
      })
      .on("error", reject);
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error("CDP timeout: " + method));
        }
      }, 30000);
    });
  }
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl, {
    perMessageDeflate: false,
    maxPayload: 512 * 1024 * 1024,
  });
  await new Promise((res, rej) => {
    ws.on("open", res);
    ws.on("error", rej);
  });
  return new CDP(ws);
}

async function waitPage(match, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const list = await getJson("/json/list");
      const t = list.filter((x) => x.type === "page").find((x) => x.url.includes(match));
      if (t) return t;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error("page not found: " + match);
}

async function evaluate(cdp, expression) {
  const res = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    console.warn("eval error:", JSON.stringify(res.exceptionDetails).slice(0, 300));
  }
  return res.result && res.result.value;
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: width <= 768,
  });
}

async function shot(cdp, file) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(OUT, file), Buffer.from(res.data, "base64"));
      console.log("shot:", file);
      return;
    } catch (e) {
      console.warn(`shot retry ${i + 1} for ${file}: ${e.message}`);
      await sleep(3000);
    }
  }
  console.warn("shot FAILED:", file);
}

const clickSelector = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true; }
  return false;
})()`;

async function dismissDialogs(cdp) {
  await evaluate(cdp, `document.querySelector('.drag-background')?.click(); true`);
}

/** Import demo books by dropping synthetic File entries on the manager's
 *  drop background (same handler as an OS drag & drop). */
async function importBooks(cdp, files) {
  const count = () =>
    evaluate(cdp, `document.querySelectorAll('.card-list-item, .book-list-item, .book-list-cover-item').length`);
  const before = (await count()) || 0;
  const payload = files.map((f) => ({ name: f.name, b64: fs.readFileSync(f.path).toString("base64") }));
  await evaluate(cdp, `(() => {
    const files = ${JSON.stringify(payload)}.map((f) => {
      const bin = atob(f.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new File([bytes], f.name, { type: "application/epub+zip" });
    });
    const bg = document.querySelector('.drag-background');
    if (!bg) return "no-drag-background";
    const items = files.map((file) => ({
      kind: "file",
      webkitGetAsEntry: () => ({ isFile: true, file: (cb) => cb(file) }),
    }));
    const ev = new DragEvent("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", { value: { items, files } });
    bg.dispatchEvent(ev);
    return "dispatched";
  })()`);
  const end = Date.now() + 90000;
  while (Date.now() < end) {
    await sleep(2000);
    if (((await count()) || 0) > before) return true;
  }
  return false;
}

async function openReaderWindow(cdp) {
  const known = new Set((await getJson("/json/list")).map((t) => t.id));
  await evaluate(
    cdp,
    `(() => {
      const el =
        document.querySelector('.book-list-cover-item .book-cover-item-cover') ||
        document.querySelector('.book-item-cover') ||
        document.querySelector('.book-list-cover-item');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return !!el;
    })()`
  );
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const list = await getJson("/json/list");
    const t = list.find(
      (x) => x.type === "page" && !known.has(x.id) && /#\/(epub|pdf|mobi|txt|md)/.test(x.url)
    );
    if (t) return t;
    await sleep(500);
  }
  return null;
}

const READER_PANEL_TOGGLE = (pos) =>
  `window.dispatchEvent(new CustomEvent("koodo-reading-panel-toggle", { detail: { position: "${pos}" } })); true`;

async function captureSize(W, H, books) {
  const tag = W <= 768 ? "phone" : "desktop";
  console.log(`=== ${tag} ${W}x${H} ===`);
  const target = await waitPage("index.html");
  const cdp = await connect(target);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await setViewport(cdp, W, H);
  await sleep(6000);
  await dismissDialogs(cdp);
  await sleep(1500);

  if (tag === "phone" && books.length) {
    console.log("import ok:", await importBooks(cdp, books));
    await sleep(2000);
  }

  await evaluate(cdp, `location.hash = "#/manager/home"; true`);
  await sleep(2500);
  await dismissDialogs(cdp);
  await sleep(500);
  await shot(cdp, `${tag}-manager-home.png`);

  if (tag === "phone") {
    // Import FAB "more options" menu (folder / cloud / OPDS / URL)
    if (await evaluate(cdp, clickSelector(".import-from-local .more-import-option"))) {
      await sleep(1200);
      await shot(cdp, `${tag}-manager-import-menu.png`);
      await evaluate(cdp, `document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); true`);
      await sleep(600);
    }
    // View modes: cover (icon-cover) -> list (icon-menu) -> card (icon-grid)
    const views = [["cover", "manager-cover"], ["menu", "manager-list"]];
    for (const [icon, name] of views) {
      if (await evaluate(cdp, clickSelector(`.book-list-view .icon-${icon}`))) {
        await sleep(1500);
        await shot(cdp, `${tag}-${name}.png`);
      }
    }
    // Book context menu ("..." on the first card)
    await evaluate(cdp, clickSelector(".book-list-view .icon-grid"));
    await sleep(1200);
    if (await evaluate(cdp, clickSelector(".book-more-action"))) {
      await sleep(1200);
      await shot(cdp, `${tag}-manager-action-menu.png`);
      await dismissDialogs(cdp);
      await sleep(600);
    }
  }

  for (const route of ["note", "trash"]) {
    await evaluate(cdp, `location.hash = "#/manager/${route}"; true`);
    await sleep(2000);
    await shot(cdp, `${tag}-manager-${route}.png`);
  }

  await evaluate(cdp, `location.hash = "#/manager/home"; true`);
  await sleep(1500);
  if (await evaluate(cdp, clickSelector(".setting-icon-container .icon-setting"))) {
    await sleep(2000);
    await shot(cdp, `${tag}-manager-settings.png`);
    await dismissDialogs(cdp);
    await sleep(800);
  }
  await evaluate(cdp, `(() => {
    const input = document.querySelector('.header-search-container input');
    if (input) { input.focus(); return true; }
    return false;
  })()`);
  await sleep(1000);
  await shot(cdp, `${tag}-manager-search.png`);

  // Reader window: default + all four panels
  const readerTarget = await openReaderWindow(cdp);
  if (readerTarget) {
    const rcdp = await connect(readerTarget);
    await rcdp.send("Page.enable");
    await rcdp.send("Runtime.enable");
    await setViewport(rcdp, W, H);
    await sleep(10000);
    await shot(rcdp, `${tag}-reader-default.png`);
    for (const pos of ["left", "right", "top", "bottom"]) {
      await evaluate(rcdp, READER_PANEL_TOGGLE(pos));
      await sleep(1500);
      await shot(rcdp, `${tag}-reader-${pos === "left" ? "nav" : pos === "right" ? "setting" : pos}.png`);
      await evaluate(rcdp, READER_PANEL_TOGGLE(pos));
      await sleep(800);
    }
  } else {
    console.warn("reader window did not open");
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const os = require("os");
  const profile = path.join(os.homedir(), ".config", "free-koodo-reader");
  if (FRESH) {
    fs.rmSync(profile, { recursive: true, force: true });
    console.log("cleared profile:", profile);
  } else {
    // A previous SIGKILLed run leaves Chromium singleton locks behind and the
    // next launch silently refuses to start. Remove them if no app runs.
    for (const f of ["SingletonLock", "SingletonCookie", "SingletonSocket", "DevToolsActivePort"]) {
      fs.rmSync(path.join(profile, f), { force: true });
    }
  }
  const books = MODE === "desktop" ? [] : [
    await makeEpub("Sample Book One", "Author One", ["Chapter One", "Chapter Two", "Chapter Three"]),
    await makeEpub("Sample Book Two", "Author Two", ["Chapter One", "Chapter Two"]),
    await makeEpub("样例书三", "作者三", ["第一章", "第二章", "第三章", "第四章"]),
  ];

  const child = spawn(
    require(path.join(ROOT, "node_modules", "electron")),
    [
      ".",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--in-process-gpu",
      `--remote-debugging-port=${PORT}`,
    ],
    {
      cwd: ROOT,
      env: { ...process.env, ELECTRON_IS_DEV: "0", ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
      stdio: "ignore",
    }
  );

  try {
    for (const [W, H] of SIZES) {
      await captureSize(W, H, books);
    }
  } finally {
    child.kill("SIGKILL");
  }
  console.log("done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
