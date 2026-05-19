# BlogForge AI — Blog Post Generator

A static website that generates SEO-ready blog posts using **Google Gemini API**. Outputs include a **Table of Contents** and **FAQ** section. No images.

## Files

- `index.html` — UI
- `style.css` — styling
- `script.js` — Gemini API call + Markdown rendering

## Run locally

Just open `index.html` in a browser (double-click). No build step, no server needed.

> If your browser blocks `fetch` to the API on `file://`, serve the folder instead:
>
> ```powershell
> # Python
> python -m http.server 8000
> # then open http://localhost:8000
> ```

## Safer production mode

Do not expose a Gemini API key in frontend code. Run the included proxy instead:

```powershell
$env:GEMINI_API_KEY="your-key"
node server.js
```

Then open <http://localhost:8000>. Leave the API key field blank; requests go through `/api/gemini/*`.

DuckDuckGo research also uses the backend proxy at `/api/search`, so it works in local `server.js` mode and Netlify Function mode.

## Setup

1. Get a free Gemini API key: <https://aistudio.google.com/app/apikey>
2. Open the website and paste your key (stored only in your browser's localStorage).
3. Enter a topic, choose tone/length, optionally add keywords.
4. Click **Generate Blog Post**.

## Model

The default model is `gemini-2.5-flash`. If the API returns model or quota errors, choose a supported model for your API key in Google AI Studio and update the **Model** field in the UI.

## Features

- Google Gemini API integration
- Configurable tone, length, keywords
- Server-side API key proxy option
- Blog presets and rewrite tools
- Optional free DuckDuckGo research before generation
- Copy as `.md`, `.html`, `.txt`, or rendered HTML
- Word count vs target check
- Automatic Table of Contents
- Collapsible FAQ section (5 questions)
- Copy as Markdown / Download `.md`
- Fully client-side; no backend needed
- No images — text content only
