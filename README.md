# OMICRON– Premium AI Coding Assistant

> A cinematic, glassmorphism-styled AI coding assistant built for **Om**.

![Alpha Banner](logo.png)

---

## 🚀 Features

| Feature | Details |
|---|---|
| **Multi-Chat** | Create, rename, delete, and switch between unlimited conversations |
| **Chat History** | Fully persisted in LocalStorage — restores on every visit |
| **Search Chats** | Instant client-side fuzzy search through all chat titles |
| **Markdown** | Full GFM rendering via Marked.js |
| **Syntax Highlighting** | 189 languages via Highlight.js |
| **Code Copy** | One-click copy button on every code block |
| **Streaming** | Real-time token-by-token streaming with typing animation |
| **Regenerate** | Re-run any assistant response |
| **Like / Dislike** | Reaction buttons on every assistant message |
| **Dark / Light / System** | Three themes with smooth transitions |
| **Settings** | Model selector, Temperature slider, Max Tokens slider |
| **Keyboard Shortcuts** | Ctrl+Enter, Ctrl+N, Ctrl+K, Escape |
| **Toast Notifications** | Friendly status messages for all actions |
| **Context Menu** | Right-click-style menu on chat list items |
| **Responsive** | Collapsible sidebar, mobile-first layout |
| **Error Handling** | 401/403/404/429/500/offline/timeout with retry |

---

## 📁 Project Structure

```
Alpha/
├── index.html      # Semantic HTML structure
├── style.css       # Complete design system with CSS variables
├── script.js       # Vanilla JS ES2022+ application logic
├── logo.png        # Alpha branding logo
└── README.md       # You are here
```

---

## ⚡ Quick Start

### 1. Add Your API Key

Open `script.js` and replace the placeholder:

```js
const CONFIG = {
  API_KEY: "PASTE_OPENROUTER_API_KEY_HERE",   // ← Replace this
  MODEL:   "deepseek/deepseek-chat",
  API_URL: "https://openrouter.ai/api/v1/chat/completions",
};
```

> **⚠️ Security Warning:** This placeholder is for development only. For production deployments, keep the API key on a backend or proxy server instead of exposing it in frontend JavaScript.

### 2. Get an OpenRouter API Key

1. Visit [openrouter.ai](https://openrouter.ai)
2. Sign up and go to **Keys**
3. Create a new key and paste it into `script.js`

### 3. Open the App

Simply open `index.html` in any modern browser — no build step required.

```bash
# Or serve with any static file server, e.g.:
npx serve .
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Enter` | Send message |
| `Ctrl + N` | New chat |
| `Ctrl + K` | Focus search |
| `Escape` | Close modal / Stop generation |

---

## 🎨 Design System

The UI is powered by CSS custom properties (variables):

```css
/* Brand colors */
--clr-blue-400:   #4FC3F7;
--clr-violet:     #7C3AED;

/* Gradients */
--grad-primary:   linear-gradient(135deg, var(--clr-blue-400), var(--clr-violet));

/* Glassmorphism */
--glass-bg:        rgba(255,255,255,.04);
--glass-border:    rgba(255,255,255,.08);
```

---

## 🤖 Supported Models (via OpenRouter)

| Model | ID |
|---|---|
| DeepSeek Chat (Default) | `deepseek/deepseek-chat` |
| DeepSeek Coder | `deepseek/deepseek-coder` |
| Claude 3.5 Sonnet | `anthropic/claude-3.5-sonnet` |
| GPT-4o | `openai/gpt-4o` |
| GPT-4o Mini | `openai/gpt-4o-mini` |
| Gemini Pro 1.5 | `google/gemini-pro-1.5` |
| Llama 3.1 70B | `meta-llama/llama-3.1-70b-instruct` |
| Mistral Large | `mistralai/mistral-large` |

You can add more models from the OpenRouter model list in the settings modal.

---

## 📦 Dependencies (CDN)

| Library | Version | Purpose |
|---|---|---|
| [Marked.js](https://marked.js.org/) | 9.1.6 | Markdown parsing |
| [Highlight.js](https://highlightjs.org/) | 11.9.0 | Syntax highlighting |
| [DOMPurify](https://github.com/cure53/DOMPurify) | 3.0.6 | XSS sanitization |
| [Inter Font](https://fonts.google.com/specimen/Inter) | — | UI typography |
| [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | — | Code font |

No npm, no build step, no frameworks.

---

## 🛡️ Error Handling

Alpha handles all common API errors gracefully:

| Error | User-Facing Message |
|---|---|
| `401` | Authentication failed. Please check your API key. |
| `403` | Access denied. Your API key may not have the required permissions. |
| `404` | Model not found. Please select a different model in settings. |
| `429` | Rate limit reached. Please wait a moment and try again. |
| `500` | The AI service is experiencing issues. Please try again. |
| Offline | You appear to be offline. Please check your connection. |
| Timeout | Request timed out. Please try again. |

All temporary errors are retried once automatically.

---

## 📄 License

MIT — build freely, Om. 🚀

---

*Built with ❤️ for Om by Alpha.*
