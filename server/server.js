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

/** Check current key status (masked — never returns the full key). */
app.get("/api/admin/status", requireAdmin, (req, res) => {
  const key = currentApiKey || "";
  res.json({
    hasKey: !!key,
    maskedKey: key ? `${key.slice(0, 10)}…${key.slice(-4)}` : null,
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OMICRON backend proxy listening on port ${PORT}`);
});
