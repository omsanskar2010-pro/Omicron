/**
 * ═══════════════════════════════════════════════════════════════════
 *  OMICRON BACKEND PROXY
 *  server.js  ·  Node.js + Express
 * ═══════════════════════════════════════════════════════════════════
 *
 * WHAT THIS IS:
 *   A small server that sits between your frontend (hosted on GitHub
 *   Pages) and OpenRouter. It holds your real API key as an
 *   environment variable — never in code, never shipped to the
 *   browser. Your frontend calls THIS server; this server adds the
 *   real key and forwards the request to OpenRouter.
 *
 * DEPLOY THIS FOLDER TO RENDER (or any Node host):
 *   1. Push this repo to GitHub (the whole project, including this
 *      /server folder).
 *   2. On render.com: New → Web Service → connect your repo.
 *   3. Set "Root Directory" to: server
 *   4. Build command:  npm install
 *      Start command:  npm start
 *   5. Add environment variables in Render's dashboard:
 *        OPENROUTER_API_KEY = sk-or-v1-your-real-key   (baseline/backup key)
 *        ADMIN_TOKEN        = choose-your-own-long-random-string
 *        GITHUB_TOKEN       = ghp_your-personal-access-token (optional, for GitHub tools;
 *                              needs "repo" scope — create at github.com/settings/tokens)
 *      (Do NOT put these in this file or commit them to GitHub.)
 *   6. Deploy. Render gives you a URL like:
 *        https://omicron-backend.onrender.com
 *   7. In your frontend's script.js, set CONFIG.API_URL to:
 *        https://omicron-backend.onrender.com/api/chat
 *   8. To change the API key anytime WITHOUT redeploying, visit:
 *        https://omicron-backend.onrender.com/admin.html
 *      Enter your ADMIN_TOKEN and the new key, click Update — takes effect
 *      immediately for all future requests.
 */

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json({ limit: "2mb" }));

// Serve the admin panel (server/public/admin.html) at /admin.html
app.use(express.static(path.join(__dirname, "public")));

// Allow requests from any origin by default. To restrict to just your
// GitHub Pages site, set ALLOWED_ORIGIN in Render's environment variables
// (e.g. https://yourusername.github.io) and it'll be used instead.
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * The active OpenRouter key. Starts from the OPENROUTER_API_KEY environment
 * variable (survives restarts), but can be hot-swapped at runtime via the
 * admin panel below without needing a redeploy. A runtime swap only lasts
 * until the server restarts, at which point it falls back to the env var —
 * so keep the env var as your baseline/backup key.
 */
let currentApiKey = process.env.OPENROUTER_API_KEY || null;

/**
 * GitHub Personal Access Token, used for the GitHub agent tools.
 * Needs "repo" scope (create repos, read/write files, create issues).
 * Same hot-swap pattern as the OpenRouter key — set via env var as a
 * baseline, or update anytime via the admin panel.
 */
let currentGithubToken = process.env.GITHUB_TOKEN || null;

/** Simple constant-time-ish comparison to avoid trivial timing leaks. */
function tokensMatch(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function requireAdmin(req, res, next) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    res.status(500).json({ error: "Server has no ADMIN_TOKEN configured." });
    return;
  }
  const provided = req.headers["x-admin-token"];
  if (!tokensMatch(provided, adminToken)) {
    res.status(401).json({ error: "Invalid admin token." });
    return;
  }
  next();
}

/** Check current key/token status (masked — never returns full secrets). */
app.get("/api/admin/status", requireAdmin, (req, res) => {
  const key = currentApiKey || "";
  const gh  = currentGithubToken || "";
  res.json({
    hasKey: !!key,
    maskedKey: key ? `${key.slice(0, 10)}…${key.slice(-4)}` : null,
    hasGithubToken: !!gh,
    maskedGithubToken: gh ? `${gh.slice(0, 6)}…${gh.slice(-4)}` : null,
  });
});

/** Hot-swap the active API key without redeploying. */
app.post("/api/admin/set-key", requireAdmin, (req, res) => {
  const { apiKey } = req.body || {};
  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-or-")) {
    res.status(400).json({ error: "Provide a valid OpenRouter key (starts with sk-or-)." });
    return;
  }
  currentApiKey = apiKey.trim();
  console.log("[OMICRON backend] API key updated via admin panel.");
  res.json({ ok: true, maskedKey: `${currentApiKey.slice(0, 10)}…${currentApiKey.slice(-4)}` });
});

/** Hot-swap the GitHub token without redeploying. */
app.post("/api/admin/set-github-token", requireAdmin, (req, res) => {
  const { githubToken } = req.body || {};
  if (!githubToken || typeof githubToken !== "string" || githubToken.length < 10) {
    res.status(400).json({ error: "Provide a valid GitHub personal access token." });
    return;
  }
  currentGithubToken = githubToken.trim();
  console.log("[OMICRON backend] GitHub token updated via admin panel.");
  res.json({ ok: true, maskedToken: `${currentGithubToken.slice(0, 6)}…${currentGithubToken.slice(-4)}` });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasKey: !!currentApiKey });
});

app.post("/api/chat", async (req, res) => {
  const apiKey = currentApiKey;
  if (!apiKey) {
    res.status(500).json({ error: { message: "Server is missing OPENROUTER_API_KEY." } });
    return;
  }

  const { model, messages, temperature, max_tokens, tools, stream } = req.body || {};
  if (!model || !messages) {
    res.status(400).json({ error: { message: "Missing 'model' or 'messages' in request." } });
    return;
  }

  const payload = {
    model,
    messages,
    temperature: temperature ?? 0.7,
    max_tokens:  max_tokens ?? 4096,
    stream:      !!stream,
    ...(tools ? { tools } : {}),
  };

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer":  process.env.SITE_URL || "https://github.com",
        "X-Title":       "OMICRON AI Coding Assistant",
      },
      body: JSON.stringify(payload),
    });

    if (payload.stream) {
      // Pipe the SSE stream straight through to the browser.
      res.writeHead(upstream.status, {
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache",
        "Connection":        "keep-alive",
      });
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(decoder.decode(value, { stream: true }));
      }
      res.end();
    } else {
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    }
  } catch (err) {
    console.error("[OMICRON backend] Upstream error:", err);
    if (!res.headersSent) {
      res.status(502).json({ error: { message: "Failed to reach OpenRouter. Please try again." } });
    } else {
      res.end();
    }
  }
});

/* ─────────────────────────────────────────────────────────────────
   GITHUB PROXY
   Frontend never holds the GitHub token — it calls this endpoint,
   which adds the real token and talks to the GitHub REST API.
────────────────────────────────────────────────────────────────── */
const GITHUB_API = "https://api.github.com";

async function githubRequest(method, urlPath, body) {
  const res = await fetch(`${GITHUB_API}${urlPath}`, {
    method,
    headers: {
      "Authorization": `Bearer ${currentGithubToken}`,
      "Accept":        "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* some endpoints return no body */ }
  return { ok: res.ok, status: res.status, data };
}

app.post("/api/github", async (req, res) => {
  if (!currentGithubToken) {
    res.status(500).json({ error: "No GitHub token configured. Add one via /admin.html." });
    return;
  }

  const { action, params = {} } = req.body || {};

  try {
    switch (action) {
      case "list_repos": {
        const r = await githubRequest("GET", "/user/repos?per_page=30&sort=updated");
        if (!r.ok) return res.status(r.status).json({ error: r.data });
        return res.json({ repos: r.data.map(x => ({ name: x.full_name, private: x.private, url: x.html_url })) });
      }

      case "create_repo": {
        const { name, description = "", isPrivate = true } = params;
        if (!name) return res.status(400).json({ error: "Missing 'name'." });
        const r = await githubRequest("POST", "/user/repos", {
          name, description, private: !!isPrivate, auto_init: true,
        });
        if (!r.ok) return res.status(r.status).json({ error: r.data });
        return res.json({ ok: true, url: r.data.html_url, fullName: r.data.full_name });
      }

      case "create_or_update_file": {
        const { owner, repo, path: filePath, content, message, branch } = params;
        if (!owner || !repo || !filePath || content === undefined || !message) {
          return res.status(400).json({ error: "Missing owner, repo, path, content, or message." });
        }
        // Check if the file already exists (need its SHA to update rather than create).
        let sha;
        const existing = await githubRequest(
          "GET",
          `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}${branch ? `?ref=${branch}` : ""}`,
        );
        if (existing.ok && existing.data?.sha) sha = existing.data.sha;

        const r = await githubRequest("PUT", `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`, {
          message,
          content: Buffer.from(content, "utf-8").toString("base64"),
          ...(sha ? { sha } : {}),
          ...(branch ? { branch } : {}),
        });
        if (!r.ok) return res.status(r.status).json({ error: r.data });
        return res.json({
          ok: true,
          action: sha ? "updated" : "created",
          commitUrl: r.data.commit?.html_url,
          fileUrl: r.data.content?.html_url,
        });
      }

      case "get_file": {
        const { owner, repo, path: filePath, branch } = params;
        if (!owner || !repo || !filePath) return res.status(400).json({ error: "Missing owner, repo, or path." });
        const r = await githubRequest(
          "GET",
          `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}${branch ? `?ref=${branch}` : ""}`,
        );
        if (!r.ok) return res.status(r.status).json({ error: r.data });
        const content = r.data.content
          ? Buffer.from(r.data.content, "base64").toString("utf-8")
          : null;
        return res.json({ ok: true, content, sha: r.data.sha });
      }

      case "create_issue": {
        const { owner, repo, title, body } = params;
        if (!owner || !repo || !title) return res.status(400).json({ error: "Missing owner, repo, or title." });
        const r = await githubRequest("POST", `/repos/${owner}/${repo}/issues`, { title, body: body || "" });
        if (!r.ok) return res.status(r.status).json({ error: r.data });
        return res.json({ ok: true, url: r.data.html_url, number: r.data.number });
      }

      default:
        return res.status(400).json({ error: `Unknown GitHub action: ${action}` });
    }
  } catch (err) {
    console.error("[OMICRON backend] GitHub error:", err);
    res.status(502).json({ error: "Failed to reach GitHub. Please try again." });
  }
});

/* ─────────────────────────────────────────────────────────────────
   DOCUMENT GENERATION / EDITING
   Word (docx), PowerPoint (pptxgenjs), Excel (exceljs).
   All return { filename, base64 } for the frontend to download.
────────────────────────────────────────────────────────────────── */
const { Document, Packer, Paragraph, HeadingLevel } = require("docx");
const PptxGenJS = require("pptxgenjs");
const ExcelJS = require("exceljs");
const mammoth = require("mammoth");

/** Build a .docx from a simple structured outline. */
app.post("/api/docs/word", async (req, res) => {
  try {
    const { title = "Untitled", sections = [] } = req.body || {};
    const children = [
      new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
      ...sections.flatMap((s) => [
        ...(s.heading ? [new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 })] : []),
        ...(s.paragraphs || []).map((p) => new Paragraph({ text: p })),
      ]),
    ];
    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);
    res.json({ ok: true, filename: `${title.replace(/[^\w\- ]/g, "").slice(0, 60) || "document"}.docx`, base64: buffer.toString("base64") });
  } catch (err) {
    console.error("[OMICRON backend] Word generation error:", err);
    res.status(500).json({ error: "Failed to generate Word document." });
  }
});

/** Extract plain text from an uploaded .docx so the model can propose edits. */
app.post("/api/docs/word-extract", async (req, res) => {
  try {
    const { base64 } = req.body || {};
    if (!base64) return res.status(400).json({ error: "Missing 'base64' file content." });
    const buffer = Buffer.from(base64, "base64");
    const result = await mammoth.extractRawText({ buffer });
    res.json({ ok: true, text: result.value });
  } catch (err) {
    console.error("[OMICRON backend] Word extract error:", err);
    res.status(500).json({ error: "Failed to read that Word document." });
  }
});

/** Build a .pptx from a simple slide outline. */
app.post("/api/docs/powerpoint", async (req, res) => {
  try {
    const { title = "Untitled", slides = [] } = req.body || {};
    const pres = new PptxGenJS();
    const titleSlide = pres.addSlide();
    titleSlide.addText(title, { x: 0.5, y: 2, w: 9, h: 1.5, fontSize: 32, bold: true, align: "center" });

    for (const s of slides) {
      const slide = pres.addSlide();
      slide.addText(s.title || "", { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 24, bold: true });
      if (Array.isArray(s.bullets) && s.bullets.length) {
        slide.addText(
          s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
          { x: 0.5, y: 1.4, w: 9, h: 4.5, fontSize: 18 },
        );
      }
    }
    const buffer = await pres.write({ outputType: "nodebuffer" });
    res.json({ ok: true, filename: `${title.replace(/[^\w\- ]/g, "").slice(0, 60) || "presentation"}.pptx`, base64: buffer.toString("base64") });
  } catch (err) {
    console.error("[OMICRON backend] PowerPoint generation error:", err);
    res.status(500).json({ error: "Failed to generate PowerPoint." });
  }
});

/** Build a new .xlsx from headers + rows. */
app.post("/api/docs/excel-create", async (req, res) => {
  try {
    const { sheetName = "Sheet1", headers = [], rows = [] } = req.body || {};
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    if (headers.length) {
      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true };
    }
    rows.forEach((r) => sheet.addRow(r));
    sheet.columns.forEach((col) => { col.width = 18; });
    const buffer = await workbook.xlsx.writeBuffer();
    res.json({ ok: true, filename: `${sheetName.replace(/[^\w\- ]/g, "").slice(0, 60) || "workbook"}.xlsx`, base64: Buffer.from(buffer).toString("base64") });
  } catch (err) {
    console.error("[OMICRON backend] Excel generation error:", err);
    res.status(500).json({ error: "Failed to generate Excel file." });
  }
});

/** Read an uploaded .xlsx so the model can see existing data before editing. */
app.post("/api/docs/excel-extract", async (req, res) => {
  try {
    const { base64 } = req.body || {};
    if (!base64) return res.status(400).json({ error: "Missing 'base64' file content." });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(base64, "base64"));
    const sheets = workbook.worksheets.map((sheet) => {
      const rows = [];
      sheet.eachRow((row, rowNumber) => {
        rows.push({ row: rowNumber, values: row.values.slice(1) }); // slice(1): exceljs pads index 0
      });
      return { name: sheet.name, rows };
    });
    res.json({ ok: true, sheets });
  } catch (err) {
    console.error("[OMICRON backend] Excel extract error:", err);
    res.status(500).json({ error: "Failed to read that Excel file. Is it a valid .xlsx?" });
  }
});

/** True in-place edit of an existing .xlsx: apply cell updates, return the modified file. */
app.post("/api/docs/excel-edit", async (req, res) => {
  try {
    const { base64, sheetName, edits = [] } = req.body || {};
    if (!base64) return res.status(400).json({ error: "Missing 'base64' file content." });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(base64, "base64"));
    const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ error: `Sheet not found: ${sheetName}` });

    // edits: [{ cell: "B2", value: "New value" }, ...]
    for (const e of edits) {
      if (e.cell) sheet.getCell(e.cell).value = e.value;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.json({ ok: true, filename: "edited-workbook.xlsx", base64: Buffer.from(buffer).toString("base64") });
  } catch (err) {
    console.error("[OMICRON backend] Excel edit error:", err);
    res.status(500).json({ error: "Failed to edit that Excel file. Is it a valid .xlsx?" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OMICRON backend proxy listening on port ${PORT}`);
});