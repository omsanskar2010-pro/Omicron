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
 *   5. Add an environment variable in Render's dashboard:
 *        OPENROUTER_API_KEY = sk-or-v1-your-real-key
 *      (Do NOT put the key in this file or commit it to GitHub.)
 *   6. Deploy. Render gives you a URL like:
 *        https://omicron-backend.onrender.com
 *   7. In your frontend's script.js, set CONFIG.API_URL to:
 *        https://omicron-backend.onrender.com/api/chat
 */

const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json({ limit: "2mb" }));

// Allow requests from any origin by default. To restrict to just your
// GitHub Pages site, set ALLOWED_ORIGIN in Render's environment variables
// (e.g. https://yourusername.github.io) and it'll be used instead.
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";
app.use(cors({ origin: allowedOrigin }));

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasKey: !!process.env.OPENROUTER_API_KEY });
});

app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
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