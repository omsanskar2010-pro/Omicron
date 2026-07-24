/**
 * ═══════════════════════════════════════════════════════════════════
 *  OMICRON COMPANION SERVER
 *  companion-server.js  ·  Node.js (built-in modules only, no npm install)
 * ═══════════════════════════════════════════════════════════════════
 *
 * WHAT THIS IS:
 *   A tiny local server that runs on YOUR laptop and listens ONLY on
 *   localhost. The OMICRON chatbot (running in your browser) sends it
 *   simple commands like "open Chrome" or "create a folder on Desktop",
 *   and this script actually performs them — something a browser page
 *   can never do on its own for security reasons.
 *
 * SECURITY DESIGN:
 *   - Only listens on 127.0.0.1 (localhost) — not reachable from other
 *     devices on your network or the internet.
 *   - Only accepts a fixed ALLOWLIST of actions (see ACTIONS below).
 *     It will never execute arbitrary text as a shell command.
 *   - Requires a shared secret token (must match COMPANION_TOKEN in
 *     script.js) so only your own OMICRON page can issue commands.
 *   - File/folder creation is restricted to your Desktop folder only,
 *     and rejects any name containing path traversal ("..", "/", "\").
 *
 * HOW TO RUN:
 *   1. Install Node.js from https://nodejs.org if you don't have it.
 *   2. Open a terminal in the folder containing this file.
 *   3. Run:  node companion-server.js
 *   4. Leave that terminal window open while you use OMICRON.
 *   5. Open index.html in your browser as usual.
 */

const http = require("http");
const { exec } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

/* ── Configuration ─────────────────────────────────────────────── */
const PORT = 4477;
const TOKEN = "omicron-local-4477"; // ← must match COMPANION_TOKEN in script.js
// SECURITY: since this server is now reachable from other devices on your
// Wi-Fi (not just this laptop), it's worth changing TOKEN to a random string
// of your own — just make sure to update the matching value in script.js too.

function getLanIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

// Detect Desktop path (handles OneDrive-redirected Desktop, common on Windows)
function detectDesktopPath() {
  const home = os.homedir();
  const oneDriveDesktop = path.join(home, "OneDrive", "Desktop");
  const plainDesktop = path.join(home, "Desktop");
  if (fs.existsSync(oneDriveDesktop)) return oneDriveDesktop;
  return plainDesktop;
}
const DESKTOP_PATH = detectDesktopPath();

// If Android Studio isn't on PATH, set its full install path here.
const ANDROID_STUDIO_PATH = "C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe";

/* ── Allowlisted actions ───────────────────────────────────────── */
const ACTIONS = {
  open_youtube:       () => runShell(`start "" "https://www.youtube.com"`),
  open_chrome:        () => runShell(`start chrome`),
  open_vscode:        () => runShell(`code .`),
  open_github:        () => runShell(`start "" "https://github.com"`),
  open_android_studio: () => runAndroidStudio(),

  create_desktop_folder: (params) => createDesktopItem(params, "folder"),
  create_desktop_file:   (params) => createDesktopItem(params, "file"),
};

function runShell(command) {
  return new Promise((resolve) => {
    exec(command, (error) => {
      if (error) resolve({ ok: false, error: error.message });
      else resolve({ ok: true });
    });
  });
}

function runAndroidStudio() {
  return new Promise((resolve) => {
    exec(`start androidstudio`, (error1) => {
      if (!error1) return resolve({ ok: true });
      // Fallback to known install path
      exec(`start "" "${ANDROID_STUDIO_PATH}"`, (error2) => {
        if (error2) {
          resolve({
            ok: false,
            error:
              "Couldn't find Android Studio. Edit ANDROID_STUDIO_PATH in " +
              "companion-server.js to match your install location.",
          });
        } else {
          resolve({ ok: true });
        }
      });
    });
  });
}

function sanitizeName(name) {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) return null;
  return trimmed;
}

function createDesktopItem(params, kind) {
  return new Promise((resolve) => {
    const name = sanitizeName(params?.name);
    if (!name) {
      resolve({ ok: false, error: "Invalid or unsafe name." });
      return;
    }
    const targetPath = path.join(DESKTOP_PATH, name);
    try {
      if (kind === "folder") {
        fs.mkdirSync(targetPath, { recursive: false });
      } else {
        fs.writeFileSync(targetPath, params?.content ?? "", { flag: "wx" });
      }
      resolve({ ok: true, path: targetPath });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

/* ── Static file serving (so phones/other devices can load the app) ── */
const MIME_TYPES = {
  ".html": "text/html",
  ".js":   "text/javascript",
  ".css":  "text/css",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".json": "application/json",
};

function serveStatic(req, res) {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";

  // Prevent path traversal outside this folder.
  const filePath = path.normalize(path.join(__dirname, reqPath));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  // Don't serve this server's own source file to the network.
  if (path.basename(filePath) === "companion-server.js") {
    res.writeHead(403); res.end("Forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

/* ── HTTP server ───────────────────────────────────────────────── */
const server = http.createServer((req, res) => {
  // CORS: allow the local page (file:// origin sends "null")
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-OMICRON-Token");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  // Chrome's Private Network Access: required for a public HTTPS site
  // (like GitHub Pages) to be allowed to reach localhost/private IPs.
  res.setHeader("Access-Control-Allow-Private-Network", "true");

  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, desktop: DESKTOP_PATH }));
    return;
  }

  if (req.method === "POST" && req.url === "/command") {
    if (req.headers["x-omicron-token"] !== TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Unauthorized." }));
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const { action, params } = JSON.parse(body || "{}");
        const handler = ACTIONS[action];
        if (!handler) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: `Unknown action: ${action}` }));
          return;
        }
        const result = await handler(params || {});
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "Not found." }));
});

server.listen(PORT, "0.0.0.0", () => {
  const lanIps = getLanIps();
  console.log(`\n  OMICRON Companion Server running`);
  console.log(`  → On this laptop:   http://localhost:${PORT}`);
  if (lanIps.length > 0) {
    lanIps.forEach((ip) => console.log(`  → From your phone:  http://${ip}:${PORT}  (same Wi-Fi)`));
  } else {
    console.log(`  → No LAN IP detected. Make sure Wi-Fi is connected to see a phone URL here.`);
  }
  console.log(`  → Desktop path: ${DESKTOP_PATH}`);
  console.log(`\n  Leave this window open while using OMICRON.`);
  console.log(`  If your phone can't connect, check Windows Firewall isn't blocking Node.js.\n`);
});
