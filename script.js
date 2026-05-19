// ============================================================
// BlogForge AI — full client
// Features: streaming, outline-first, per-section regen,
// language/audience/preset/custom-instructions, history,
// split markdown editor, humanize pass, token stats.
// ============================================================

// ====== Element refs ======
const $ = (id) => document.getElementById(id);

const apiKeyInput = $("apiKey");
const modelInput = $("model");
const streamingToggle = $("streamingToggle");
const topicInput = $("topic");
const presetSelect = $("preset");
const postTypeSelect = $("postType");
const toneSelect = $("tone");
const lengthSelect = $("length");
const audienceSelect = $("audience");
const languageSelect = $("language");
const keywordsInput = $("keywords");
const customInstructions = $("customInstructions");

const generateBtn = $("generateBtn");
const stopBtn = $("stopBtn");
const copyMdBtn = $("copyMdBtn");
const copyHtmlBtn = $("copyHtmlBtn");
const copyTxtBtn = $("copyTxtBtn");
const copyRenderedHtmlBtn = $("copyRenderedHtmlBtn");
const downloadBtn = $("downloadBtn");
const humanizeBtn = $("humanizeBtn");
const shorterBtn = $("shorterBtn");
const longerBtn = $("longerBtn");
const introBtn = $("introBtn");
const conclusionBtn = $("conclusionBtn");
const examplesBtn = $("examplesBtn");
const internalLinksBtn = $("internalLinksBtn");
const simplifyBtn = $("simplifyBtn");
const saveHistoryBtn = $("saveHistoryBtn");
const statusEl = $("status");

const outlineSection = $("outlineSection");
const outlineEditor = $("outlineEditor");
const expandOutlineBtn = $("expandOutlineBtn");
const regenOutlineBtn = $("regenOutlineBtn");
const cancelOutlineBtn = $("cancelOutlineBtn");

const outputSection = $("outputSection");
const outputEl = $("output");
const editorContainer = $("editorContainer");
const markdownEditor = $("markdownEditor");
const metaStats = $("metaStats");

const openSettingsBtn = $("openSettingsBtn");
const settingsModal = $("settingsModal");
const saveSettingsBtn = $("saveSettingsBtn");
const testConnectionBtn = $("testConnectionBtn");
const testResultEl = $("testResult");
const toggleKeyBtn = $("toggleKeyBtn");
const apiStatusBadge = $("apiStatusBadge");

const openHistoryBtn = $("openHistoryBtn");
const historyDrawer = $("historyDrawer");
const historyList = $("historyList");
const clearHistoryBtn = $("clearHistoryBtn");

// ====== Constants ======
const DEFAULT_MODEL = "gemini-2.5-flash";
const LEGACY_DEFAULT_MODELS = new Set(["gemma-4-31b-it"]);
const STORAGE = {
  KEY: "gemini_api_key",
  MODEL: "gemini_model",
  STREAM: "gemini_streaming",
  HISTORY: "blogforge_history",
};
const HISTORY_LIMIT = 10;

let lastMarkdown = "";
let lastUsage = null;
let currentAbortController = null;

// ====== Settings ======
function loadSettings() {
  apiKeyInput.value = localStorage.getItem(STORAGE.KEY) || "";
  const savedModel = (localStorage.getItem(STORAGE.MODEL) || "").trim();
  modelInput.value = !savedModel || LEGACY_DEFAULT_MODELS.has(savedModel) ? DEFAULT_MODEL : savedModel;
  const streaming = localStorage.getItem(STORAGE.STREAM);
  streamingToggle.checked = streaming === null ? true : streaming === "true";
  updateApiBadge();
}

function saveSettings() {
  localStorage.setItem(STORAGE.KEY, apiKeyInput.value.trim());
  localStorage.setItem(STORAGE.MODEL, (modelInput.value.trim() || DEFAULT_MODEL));
  localStorage.setItem(STORAGE.STREAM, streamingToggle.checked ? "true" : "false");
  updateApiBadge();
}

const getApiKey = () => (localStorage.getItem(STORAGE.KEY) || "").trim();
const getModel = () => {
  const savedModel = (localStorage.getItem(STORAGE.MODEL) || "").trim();
  return !savedModel || LEGACY_DEFAULT_MODELS.has(savedModel) ? DEFAULT_MODEL : savedModel;
};
const getStreaming = () => localStorage.getItem(STORAGE.STREAM) !== "false";
const canUseProxy = () => location.protocol === "http:" || location.protocol === "https:";

function updateApiBadge() {
  if (getApiKey()) {
    apiStatusBadge.textContent = "✓ " + getModel();
    apiStatusBadge.className = "api-badge api-badge-ok";
  } else if (canUseProxy()) {
    apiStatusBadge.textContent = "Server proxy mode";
    apiStatusBadge.className = "api-badge api-badge-ok";
  } else {
    apiStatusBadge.textContent = "API key not set";
    apiStatusBadge.className = "api-badge api-badge-missing";
  }
}

// ====== Modal / Drawer ======
function openModal() {
  settingsModal.classList.remove("hidden");
  testResultEl.textContent = "";
  testResultEl.className = "status";
  apiKeyInput.focus();
}
function closeModal() { settingsModal.classList.add("hidden"); }

function openDrawer() { renderHistory(); historyDrawer.classList.remove("hidden"); }
function closeDrawer() { historyDrawer.classList.add("hidden"); }

openSettingsBtn.addEventListener("click", openModal);
openHistoryBtn.addEventListener("click", openDrawer);

settingsModal.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]")) closeModal();
});
historyDrawer.addEventListener("click", (e) => {
  if (e.target.matches("[data-close-drawer]")) closeDrawer();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!settingsModal.classList.contains("hidden")) closeModal();
    if (!historyDrawer.classList.contains("hidden")) closeDrawer();
  }
});

saveSettingsBtn.addEventListener("click", () => {
  saveSettings();
  setStatus("Settings saved.", "success");
  closeModal();
});

toggleKeyBtn.addEventListener("click", () => {
  apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
});

// ====== Test connection ======
testConnectionBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || DEFAULT_MODEL;
  if (!key && !canUseProxy()) {
    setTestResult("Enter an API key, or run this through server.js with GEMINI_API_KEY.", "error");
    return;
  }

  testConnectionBtn.disabled = true;
  setTestResult("Testing connection…", "loading");
  try {
    const { text } = await callGeminiOnce(key, model, "Reply with the single word: OK");
    setTestResult(`✓ Connection OK via ${key ? "browser key" : "server proxy"}. Model "${model}" responded${text ? `: "${text.slice(0, 60)}"` : ""}.`, "success");
    saveSettings();
  } catch (err) {
    setTestResult("✗ " + err.message, "error");
  } finally {
    testConnectionBtn.disabled = false;
  }
});

function setTestResult(text, kind = "") {
  testResultEl.className = "status " + kind;
  testResultEl.innerHTML = kind === "loading" ? `<span class="spinner"></span>${text}` : text;
}

// ====== Prompt builders ======
function getFormValues() {
  return {
    topic: topicInput.value.trim(),
    preset: presetSelect.value,
    postType: postTypeSelect.value,
    tone: toneSelect.value,
    length: lengthSelect.value,
    audience: audienceSelect.value,
    language: languageSelect.value,
    keywords: keywordsInput.value.trim(),
    custom: customInstructions.value.trim(),
    mode: document.querySelector('input[name="mode"]:checked').value,
  };
}

const WORD_TARGETS = { short: 500, medium: 1000, long: 1500, xlong: 2500 };

function presetGuidance(preset) {
  return {
    standard: "General SEO article with strong search intent coverage.",
    affiliate: "Affiliate review. Include buyer intent, pros/cons, who it is best for, alternatives, and a balanced recommendation without fake claims.",
    saas: "SaaS blog. Address business pain points, workflows, ROI, use cases, integrations, and clear product-led takeaways.",
    localSeo: "Local SEO article. Mention local search intent, service-area relevance, trust signals, FAQs, and location-specific examples where appropriate.",
    tutorial: "Tutorial. Use clear prerequisites, numbered steps, troubleshooting tips, and a practical final checklist.",
    comparison: "Comparison article. Include decision criteria, tradeoffs, side-by-side analysis, and a best-choice summary.",
    productLaunch: "Product launch post. Lead with the announcement, target users, key benefits, feature details, use cases, and launch CTA wording.",
  }[preset] || "";
}

function postTypeGuidance(type) {
  return {
    standard:   "Standard informative article with clear sections.",
    howto:      "Step-by-step how-to guide. Body H2 sections should represent ordered steps (e.g. 'Step 1: …').",
    listicle:   "Listicle format. Body H2 sections should each be a numbered list item (e.g. '1. Item Name').",
    comparison: "Comparison article. Include a clear pros/cons or side-by-side breakdown using lists.",
    review:     "Honest product/service review. Include features, pros, cons, and a final verdict section.",
    news:       "News update style. Start with the key facts (who/what/when/where/why) and add context.",
  }[type] || "";
}

function buildFullPrompt(v) {
  const wordTarget = WORD_TARGETS[v.length] || 1000;
  const kw = v.keywords ? `Naturally integrate these SEO keywords: ${v.keywords}.` : "";
  const cust = v.custom ? `Additional user instructions: ${v.custom}` : "";
  return `You are an expert SEO blog writer. Write a complete, well-structured blog post in Markdown on the topic:

"${v.topic}"

Requirements:
- Language: write the entire post in ${v.language}.
- Tone: ${v.tone}.
- Target audience: ${v.audience}.
- Blog preset: ${presetGuidance(v.preset)}
- Format: ${postTypeGuidance(v.postType)}
- Approximate length: ${wordTarget} words.
- ${kw}
- ${cust}
- Do NOT include any images, image placeholders, or markdown image syntax.
- Output MUST follow this exact structure, in order:

1. A single H1 title (# Title) — catchy and SEO-friendly.
2. A short engaging introduction paragraph (no heading).
3. A "## Table of Contents" section as an ordered list linking to each H2 section below using Markdown anchor links like [Section Name](#section-name).
4. The main body: 4 to 6 H2 sections (## Heading) with substantive paragraphs, occasional bullet lists, and H3 subheadings where useful.
5. A "## Conclusion" section summarizing key takeaways.
6. A "## Frequently Asked Questions" section containing 5 FAQs. Format each FAQ EXACTLY as:
   ### Q: question text here?
   Answer paragraph here.

Important:
- Output ONLY the Markdown content. No preamble, no code fences, no commentary before or after.
- Do not include images.
- Keep anchors lowercase with hyphens (e.g., #getting-started).
`;
}

function buildOutlinePrompt(v) {
  return `You are an expert blog editor. Create ONLY a detailed outline (no full article) for the following blog post.

Topic: "${v.topic}"
Language: ${v.language}
Tone: ${v.tone}
Audience: ${v.audience}
Format style: ${postTypeGuidance(v.postType)}
Blog preset: ${presetGuidance(v.preset)}
Keywords (weave in naturally): ${v.keywords || "(none)"}
Custom instructions: ${v.custom || "(none)"}

Output strictly in this Markdown form (and nothing else):

# Proposed Title

## Section 1 Title
- One-line description of what this section will cover.
### Optional sub-section
- One-line description.

## Section 2 Title
- ...

(Provide 4–6 H2 body sections plus a "## Conclusion" section.
Also include a "## Frequently Asked Questions" section listing 5 planned FAQs as "### Q: question?" lines without answers.)

Do not include images. Do not output anything but the Markdown outline.`;
}

function buildExpandPrompt(v, outline) {
  const wordTarget = WORD_TARGETS[v.length] || 1000;
  const kw = v.keywords ? `Naturally integrate these SEO keywords: ${v.keywords}.` : "";
  const cust = v.custom ? `Additional user instructions: ${v.custom}` : "";
  return `Expand the following approved outline into a full blog post in Markdown.

Outline:
---
${outline}
---

Requirements:
- Language: ${v.language}
- Tone: ${v.tone}
- Audience: ${v.audience}
- Blog preset: ${presetGuidance(v.preset)}
- Approximate length: ${wordTarget} words.
- ${kw}
- ${cust}
- Keep every heading from the outline. You may slightly refine wording but do not remove or reorder sections.
- For the "## Table of Contents" — if missing, add one near the top, as an ordered list of links to each body H2 section.
- For FAQs: under each "### Q: …" line, write a full answer paragraph.
- Do NOT include images or markdown image syntax.
- Output ONLY the Markdown article. No preamble or code fences.
`;
}

function buildRegenSectionPrompt(v, sectionTitle, fullMarkdown) {
  return `You are rewriting one section of an existing blog post.

Whole article (for context):
---
${fullMarkdown}
---

Rewrite ONLY the section titled "${sectionTitle}". Keep its H2 heading exactly as "## ${sectionTitle}".
- Match the existing tone (${v.tone}), audience (${v.audience}), and language (${v.language}).
- Use H3 subheadings and bullet lists where appropriate.
- Produce fresh content — do not repeat the previous wording verbatim.
- No images.

Output ONLY the rewritten section starting with the "## ${sectionTitle}" heading, nothing else.`;
}

function buildHumanizePrompt(markdown, language) {
  return `Rewrite the following blog post to sound more natural and human-written in ${language}, while preserving:
- All headings (H1/H2/H3) and their order
- The Table of Contents and FAQ structure
- Markdown formatting
- The same overall meaning and information

Improvements to make:
- Vary sentence length and structure
- Avoid AI-typical transitions ("In conclusion", "It is important to note", "Furthermore", overuse of "Moreover")
- Use more concrete examples and natural phrasing
- Reduce repetition

Do not add images or commentary. Output ONLY the rewritten Markdown article.

Article:
${markdown}`;
}

function buildRewritePrompt(markdown, language, action) {
  const instructions = {
    shorter: "Make the article 25-35% shorter. Preserve all major headings, search intent, and key facts.",
    longer: "Make the article 25-35% longer with useful detail, examples, and stronger transitions. Do not add fluff.",
    intro: "Rewrite only the introduction to be sharper, more specific, and more engaging. Keep the rest of the article unchanged.",
    conclusion: "Rewrite only the conclusion to be clearer, more useful, and action-oriented. Keep the rest of the article unchanged.",
    examples: "Add practical examples where they naturally improve the article. Preserve headings and avoid fake statistics.",
    internalLinks: "Add 4-6 natural internal link placeholders in Markdown format, using relevant anchor text and relative URLs like /blog/topic-slug.",
    simplify: "Simplify the language for easier reading while preserving meaning, structure, headings, TOC, and FAQs.",
  }[action];

  return `Edit this Markdown blog post in ${language}.

Task:
${instructions}

Rules:
- Output ONLY the revised Markdown.
- Preserve Markdown formatting.
- Do not add images or commentary.
- Keep factual claims cautious unless already supported by the article.

Article:
${markdown}`;
}

// ====== API call (non-streaming) ======
function buildGeminiBody(prompt) {
  return {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, topP: 0.95, maxOutputTokens: 8192 },
  };
}

function getApiErrorMessage(status, rawMessage = "") {
  const msg = String(rawMessage || "").toLowerCase();
  if (status === 401) return "401 unauthorized. Check that your Gemini API key is valid.";
  if (status === 403) return "403 forbidden. Enable Gemini API access for this key/project or use an allowed model.";
  if (status === 404) return "404 not found. If using proxy mode, run node server.js; otherwise check the selected model name.";
  if (status === 429 || msg.includes("quota")) return "Quota/rate limit hit. Wait, reduce requests, or check billing/quota in Google AI Studio.";
  if (status >= 500) return `${status} Google API/server error. Retrying without streaming may help; try again shortly.`;
  if (msg.includes("model") && (msg.includes("not found") || msg.includes("invalid"))) {
    return `Invalid/unavailable model. Use ${DEFAULT_MODEL} or another model enabled for your API key.`;
  }
  if (msg.includes("empty")) return "Empty response from model. Try a shorter prompt, another model, or disable streaming.";
  return rawMessage || `API error ${status}`;
}

async function readApiError(res) {
  let raw = `API error ${res.status}`;
  try {
    const err = await res.json();
    raw = err?.error?.message || err?.message || raw;
  } catch {}
  return getApiErrorMessage(res.status, raw);
}

async function callGeminiOnce(apiKey, model, prompt, signal) {
  const direct = Boolean(apiKey);
  const url = direct
    ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
    : `/api/gemini/generate?model=${encodeURIComponent(model)}`;
  const body = buildGeminiBody(prompt);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  if (!text.trim()) throw new Error("Empty response from model.");
  const usage = data?.usageMetadata || null;
  return { text: text.trim(), usage };
}

// ====== API call (streaming via SSE) ======
async function callGeminiStream(apiKey, model, prompt, onChunk, signal) {
  const direct = Boolean(apiKey);
  const url = direct
    ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
    : `/api/gemini/stream?model=${encodeURIComponent(model)}`;
  const body = buildGeminiBody(prompt);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw new Error(await readApiError(res));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let usage = null;

  const handleSsePart = (part) => {
    const dataLines = part.split("\n").filter(l => l.startsWith("data:"));
    if (!dataLines.length) return;
    const payload = dataLines.map(l => l.slice(5).trim()).join("\n").trim();
    if (!payload || payload === "[DONE]") return;
    const obj = JSON.parse(payload);
    const piece = obj?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    if (piece) { full += piece; onChunk(full, piece); }
    if (obj?.usageMetadata) usage = obj.usageMetadata;
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE: events separated by \n\n; lines starting with "data: "
    const parts = buffer.split("\n\n");
    buffer = parts.pop();
    for (const part of parts) {
      try { handleSsePart(part); } catch { /* ignore parse errors mid-stream */ }
    }
  }

  if (buffer.trim()) {
    try { handleSsePart(buffer); } catch { /* ignore trailing parse errors */ }
  }

  if (!full.trim()) throw new Error("Empty stream response from model.");
  return { text: full.trim(), usage };
}

// Streaming wrapper that falls back to non-streaming on certain errors
async function callGemini({ prompt, onChunk, signal, forceNoStream }) {
  const apiKey = getApiKey();
  const model = getModel();
  if (!apiKey && !canUseProxy()) throw new Error("API key missing. Open Settings to add it, or run server.js with GEMINI_API_KEY.");

  if (forceNoStream || !getStreaming() || !onChunk) {
    return await callGeminiOnce(apiKey, model, prompt, signal);
  }

  try {
    return await callGeminiStream(apiKey, model, prompt, onChunk, signal);
  } catch (err) {
    if (err.name === "AbortError") throw err;
    const msg = String(err.message || "").toLowerCase();
    if (
      msg.includes("not supported") ||
      msg.includes("does not support") ||
      msg.includes("404") ||
      msg.includes("500") ||
      msg.includes("503") ||
      msg.includes("empty stream") ||
      msg.includes("method")
    ) {
      // Fall back to non-streaming
      return await callGeminiOnce(apiKey, model, prompt, signal);
    }
    throw err;
  }
}

// ====== Markdown -> HTML ======
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function slugify(s) {
  return s.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}
function inlineFormat(text) {
  text = escapeHtml(text);
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return text;
}

function renderMarkdown(md) {
  md = md.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/, "");
  const lines = md.split(/\r?\n/);
  let html = ""; let i = 0;
  let inFAQ = false, inTOC = false;
  let tocBuf = [], faqBuf = [];

  const flushList = (buf, ord) => buf.length
    ? `<${ord ? "ol" : "ul"}>${buf.map(it => `<li>${inlineFormat(it)}</li>`).join("")}</${ord ? "ol" : "ul"}>`
    : "";
  const flushTOC = () => tocBuf.length
    ? `<nav class="toc-box"><h2>Table of Contents</h2><ol>${tocBuf.map(it => `<li>${inlineFormat(it)}</li>`).join("")}</ol></nav>`
    : "";
  const flushFAQ = () => faqBuf.length
    ? `<section class="faq-section"><h2>Frequently Asked Questions</h2>${faqBuf.map(f =>
        `<div class="faq-item">
           <button class="faq-question" type="button">${inlineFormat(f.q)}</button>
           <div class="faq-answer"><p>${inlineFormat(f.a)}</p></div>
         </div>`).join("")}</section>`
    : "";

  while (i < lines.length) {
    const t = lines[i].trim();
    const h1 = t.match(/^#\s+(.*)$/);
    const h2 = t.match(/^##\s+(.*)$/);
    const h3 = t.match(/^###\s+(.*)$/);

    if (h2) {
      const title = h2[1].trim();
      const lower = title.toLowerCase();
      if (inTOC) { html += flushTOC(); tocBuf = []; inTOC = false; }
      if (inFAQ) { html += flushFAQ(); faqBuf = []; inFAQ = false; }

      if (lower.startsWith("table of contents")) { inTOC = true; i++; continue; }
      if (lower.startsWith("frequently asked questions") || lower === "faq" || lower.startsWith("faqs")) {
        inFAQ = true; i++; continue;
      }

      const slug = slugify(title);
      html += `<h2 id="${slug}"><span>${inlineFormat(title)}</span><button class="section-regen" data-section="${escapeHtml(title)}" title="Regenerate this section">↻ Regen</button></h2>`;
      i++; continue;
    }

    if (h1) { html += `<h1>${inlineFormat(h1[1].trim())}</h1>`; i++; continue; }

    if (h3) {
      const title = h3[1].trim();
      if (inFAQ) {
        const qMatch = title.match(/^Q\s*[:.\-]\s*(.*)$/i);
        const question = qMatch ? qMatch[1] : title;
        let answer = []; let j = i + 1;
        while (j < lines.length) {
          const l = lines[j].trim();
          if (!l) { j++; if (answer.length) break; else continue; }
          if (/^###\s+/.test(l) || /^##\s+/.test(l)) break;
          answer.push(l.replace(/^A\s*[:.\-]\s*/i, ""));
          j++;
        }
        faqBuf.push({ q: question, a: answer.join(" ") });
        i = j; continue;
      }
      html += `<h3>${inlineFormat(title)}</h3>`;
      i++; continue;
    }

    if (/^[-*]\s+/.test(t)) {
      const buf = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^[-*]\s+/, "")); i++;
      }
      if (inTOC) tocBuf = tocBuf.concat(buf); else html += flushList(buf, false);
      continue;
    }
    if (/^\d+\.\s+/.test(t)) {
      const buf = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^\d+\.\s+/, "")); i++;
      }
      if (inTOC) tocBuf = tocBuf.concat(buf); else html += flushList(buf, true);
      continue;
    }
    if (/^>\s?/.test(t)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        buf.push(lines[i].trim().replace(/^>\s?/, "")); i++;
      }
      html += `<blockquote>${inlineFormat(buf.join(" "))}</blockquote>`; continue;
    }
    if (!t) { i++; continue; }

    const para = [];
    while (i < lines.length && lines[i].trim()
      && !/^#{1,6}\s+/.test(lines[i].trim())
      && !/^[-*]\s+/.test(lines[i].trim())
      && !/^\d+\.\s+/.test(lines[i].trim())
      && !/^>\s?/.test(lines[i].trim())) {
      para.push(lines[i].trim()); i++;
    }
    if (para.length) html += `<p>${inlineFormat(para.join(" "))}</p>`;
  }
  if (inTOC) html += flushTOC();
  if (inFAQ) html += flushFAQ();
  return html;
}

// ====== Render helpers ======
function setMarkdown(md, { syncEditor = true } = {}) {
  lastMarkdown = md;
  outputEl.innerHTML = renderMarkdown(md);
  if (syncEditor) markdownEditor.value = md;
  attachFAQHandlers();
  attachSectionRegenHandlers();
  updateMetaStats();
}

function attachFAQHandlers() {
  outputEl.querySelectorAll(".faq-item").forEach((item) => {
    const q = item.querySelector(".faq-question");
    q.addEventListener("click", () => item.classList.toggle("open"));
  });
}

function attachSectionRegenHandlers() {
  outputEl.querySelectorAll(".section-regen").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sectionTitle = btn.getAttribute("data-section");
      regenerateSection(sectionTitle);
    });
  });
}

function updateMetaStats() {
  const text = lastMarkdown.replace(/[#*`>\-\[\]\(\)]/g, " ");
  const words = (text.trim().match(/\S+/g) || []).length;
  const minutes = Math.max(1, Math.round(words / 220));
  let tokenStr = "";
  if (lastUsage) {
    const inT = lastUsage.promptTokenCount ?? 0;
    const outT = lastUsage.candidatesTokenCount ?? 0;
    tokenStr = ` • ${inT} in / ${outT} out tokens`;
  }
  metaStats.textContent = `${words.toLocaleString()} words • ${minutes} min read${tokenStr}`;
}

function countWords(markdown) {
  const text = markdown.replace(/[#*`>\-\[\]\(\)]/g, " ");
  return (text.trim().match(/\S+/g) || []).length;
}

function updateMetaStats() {
  const words = countWords(lastMarkdown);
  const minutes = Math.max(1, Math.round(words / 220));
  const target = WORD_TARGETS[getFormValues().length] || 1000;
  const diff = words - target;
  const targetStr = lastMarkdown.trim() ? ` • target ${target.toLocaleString()} (${diff >= 0 ? "+" : ""}${diff.toLocaleString()})` : "";
  let tokenStr = "";
  if (lastUsage) {
    const inT = lastUsage.promptTokenCount ?? 0;
    const outT = lastUsage.candidatesTokenCount ?? 0;
    tokenStr = ` • ${inT} in / ${outT} out tokens`;
  }
  metaStats.textContent = `${words.toLocaleString()} words • ${minutes} min read${targetStr}${tokenStr}`;
}

// ====== Status ======
function setStatus(text, kind = "") {
  statusEl.className = "status " + kind;
  statusEl.innerHTML = kind === "loading" ? `<span class="spinner"></span>${text}` : text;
}

function startBusy() {
  generateBtn.disabled = true;
  stopBtn.classList.remove("hidden");
  currentAbortController = new AbortController();
}
function endBusy() {
  generateBtn.disabled = false;
  stopBtn.classList.add("hidden");
  currentAbortController = null;
}

stopBtn.addEventListener("click", () => {
  if (currentAbortController) currentAbortController.abort();
});

// ====== Generation flows ======
generateBtn.addEventListener("click", async () => {
  const v = getFormValues();
  if (!getApiKey() && !canUseProxy()) {
    setStatus("Please add your Gemini API key in Settings, or run server.js with GEMINI_API_KEY.", "error");
    openModal();
    return;
  }
  if (!v.topic) return setStatus("Please enter a blog topic.", "error");

  outputSection.classList.add("hidden");
  outlineSection.classList.add("hidden");
  setMarkdown("");
  lastUsage = null;

  if (v.mode === "outline") {
    await generateOutline(v);
  } else {
    await generateFull(v);
  }
});

async function generateFull(v) {
  startBusy();
  setStatus("Generating your blog post…", "loading");
  outputSection.classList.remove("hidden");
  outputEl.innerHTML = '<p class="muted">Streaming response…</p>';

  try {
    const { text, usage } = await callGemini({
      prompt: buildFullPrompt(v),
      signal: currentAbortController.signal,
      onChunk: (full) => setMarkdown(full),
    });
    lastUsage = usage;
    setMarkdown(text);
    setStatus("✓ Blog post generated.", "success");
    outputSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    if (err.name === "AbortError") setStatus("Stopped.", "");
    else setStatus("Error: " + err.message, "error");
  } finally { endBusy(); }
}

async function generateOutline(v) {
  startBusy();
  setStatus("Drafting outline…", "loading");
  outlineSection.classList.remove("hidden");
  outlineEditor.value = "";

  try {
    const { text } = await callGemini({
      prompt: buildOutlinePrompt(v),
      signal: currentAbortController.signal,
      onChunk: (full) => { outlineEditor.value = full; },
    });
    outlineEditor.value = text;
    setStatus("Outline ready. Edit headings, then expand.", "success");
    outlineSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    if (err.name === "AbortError") setStatus("Stopped.", "");
    else setStatus("Error: " + err.message, "error");
  } finally { endBusy(); }
}

expandOutlineBtn.addEventListener("click", async () => {
  const outline = outlineEditor.value.trim();
  if (!outline) return setStatus("Outline is empty.", "error");
  const v = getFormValues();

  startBusy();
  setStatus("Expanding outline into full post…", "loading");
  outputSection.classList.remove("hidden");
  outlineSection.classList.add("hidden");
  outputEl.innerHTML = '<p class="muted">Expanding…</p>';

  try {
    const { text, usage } = await callGemini({
      prompt: buildExpandPrompt(v, outline),
      signal: currentAbortController.signal,
      onChunk: (full) => setMarkdown(full),
    });
    lastUsage = usage;
    setMarkdown(text);
    setStatus("✓ Blog post generated.", "success");
    outputSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    if (err.name === "AbortError") setStatus("Stopped.", "");
    else setStatus("Error: " + err.message, "error");
  } finally { endBusy(); }
});

regenOutlineBtn.addEventListener("click", async () => {
  await generateOutline(getFormValues());
});

cancelOutlineBtn.addEventListener("click", () => {
  outlineSection.classList.add("hidden");
  setStatus("", "");
});

// ====== Per-section regeneration ======
async function regenerateSection(sectionTitle) {
  if (!lastMarkdown) return;
  const v = getFormValues();

  startBusy();
  setStatus(`Regenerating section: "${sectionTitle}"…`, "loading");

  try {
    const { text } = await callGemini({
      prompt: buildRegenSectionPrompt(v, sectionTitle, lastMarkdown),
      signal: currentAbortController.signal,
      forceNoStream: true,
    });

    const updated = replaceSection(lastMarkdown, sectionTitle, text.trim());
    if (!updated) {
      setStatus("Could not locate section to replace.", "error");
      return;
    }
    setMarkdown(updated);
    setStatus(`✓ Section "${sectionTitle}" regenerated.`, "success");
  } catch (err) {
    if (err.name === "AbortError") setStatus("Stopped.", "");
    else setStatus("Error: " + err.message, "error");
  } finally { endBusy(); }
}

function replaceSection(md, sectionTitle, newSectionMd) {
  const lines = md.split(/\r?\n/);
  const titleNorm = sectionTitle.trim().toLowerCase();
  let startIdx = -1, endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.*)$/);
    if (m && m[1].trim().toLowerCase() === titleNorm) { startIdx = i; break; }
  }
  if (startIdx === -1) return null;

  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { endIdx = i; break; }
  }

  let cleaned = newSectionMd.trim();
  if (!/^##\s+/.test(cleaned)) cleaned = `## ${sectionTitle}\n${cleaned}`;

  return [...lines.slice(0, startIdx), cleaned, "", ...lines.slice(endIdx)].join("\n");
}

// ====== Humanize pass ======
humanizeBtn.addEventListener("click", async () => {
  if (!lastMarkdown) return setStatus("Generate a post first.", "error");
  const v = getFormValues();

  startBusy();
  setStatus("Humanizing — rewriting in a more natural voice…", "loading");

  try {
    const { text, usage } = await callGemini({
      prompt: buildHumanizePrompt(lastMarkdown, v.language),
      signal: currentAbortController.signal,
      onChunk: (full) => setMarkdown(full),
    });
    lastUsage = usage;
    setMarkdown(text);
    setStatus("✓ Humanized rewrite complete.", "success");
  } catch (err) {
    if (err.name === "AbortError") setStatus("Stopped.", "");
    else setStatus("Error: " + err.message, "error");
  } finally { endBusy(); }
});

async function rewriteArticle(action, label) {
  if (!lastMarkdown) return setStatus("Generate a post first.", "error");
  const v = getFormValues();

  startBusy();
  setStatus(`${label}…`, "loading");

  try {
    const { text, usage } = await callGemini({
      prompt: buildRewritePrompt(lastMarkdown, v.language, action),
      signal: currentAbortController.signal,
      onChunk: (full) => setMarkdown(full),
    });
    lastUsage = usage;
    setMarkdown(text);
    setStatus(`✓ ${label} complete.`, "success");
  } catch (err) {
    if (err.name === "AbortError") setStatus("Stopped.", "");
    else setStatus("Error: " + err.message, "error");
  } finally { endBusy(); }
}

shorterBtn.addEventListener("click", () => rewriteArticle("shorter", "Shortening article"));
longerBtn.addEventListener("click", () => rewriteArticle("longer", "Expanding article"));
introBtn.addEventListener("click", () => rewriteArticle("intro", "Improving intro"));
conclusionBtn.addEventListener("click", () => rewriteArticle("conclusion", "Improving conclusion"));
examplesBtn.addEventListener("click", () => rewriteArticle("examples", "Adding examples"));
internalLinksBtn.addEventListener("click", () => rewriteArticle("internalLinks", "Adding internal links"));
simplifyBtn.addEventListener("click", () => rewriteArticle("simplify", "Simplifying article"));

// ====== View toggle ======
document.querySelectorAll(".view-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const view = btn.getAttribute("data-view");
    editorContainer.className = "editor-container view-" + view;
  });
});

// Live preview from editor
let editorDebounce;
markdownEditor.addEventListener("input", () => {
  clearTimeout(editorDebounce);
  editorDebounce = setTimeout(() => {
    lastMarkdown = markdownEditor.value;
    outputEl.innerHTML = renderMarkdown(lastMarkdown);
    attachFAQHandlers();
    attachSectionRegenHandlers();
    updateMetaStats();
  }, 250);
});

// ====== Copy / Download ======
function markdownToPlainText(markdown) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderMarkdown(markdown);
  return wrapper.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

function markdownToHtmlDocument(markdown) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(topicInput.value.trim() || "Blog Post")}</title>
</head>
<body>
${renderMarkdown(markdown)}
</body>
</html>`;
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(`${label} copied to clipboard.`, "success");
  } catch { setStatus("Could not copy.", "error"); }
}

copyMdBtn.addEventListener("click", () => {
  if (!lastMarkdown) return;
  copyText(lastMarkdown, ".md");
});

copyHtmlBtn.addEventListener("click", () => {
  if (!lastMarkdown) return;
  copyText(markdownToHtmlDocument(lastMarkdown), ".html");
});

copyTxtBtn.addEventListener("click", () => {
  if (!lastMarkdown) return;
  copyText(markdownToPlainText(lastMarkdown), ".txt");
});

copyRenderedHtmlBtn.addEventListener("click", () => {
  if (!lastMarkdown) return;
  copyText(outputEl.innerHTML, "HTML");
});

downloadBtn.addEventListener("click", () => {
  if (!lastMarkdown) return;
  const blob = new Blob([lastMarkdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeTitle = (topicInput.value.trim() || "blog-post")
    .toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
  a.href = url; a.download = `${safeTitle}.md`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ====== History ======
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE.HISTORY) || "[]"); }
  catch { return []; }
}
function saveHistoryArr(arr) {
  localStorage.setItem(STORAGE.HISTORY, JSON.stringify(arr.slice(0, HISTORY_LIMIT)));
}

saveHistoryBtn.addEventListener("click", () => {
  if (!lastMarkdown) return setStatus("Nothing to save.", "error");
  const v = getFormValues();
  const titleMatch = lastMarkdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : (v.topic || "Untitled");
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title,
    topic: v.topic,
    timestamp: new Date().toISOString(),
    markdown: lastMarkdown,
    settings: v,
  };
  const arr = loadHistory();
  arr.unshift(entry);
  saveHistoryArr(arr);
  setStatus(`✓ Saved "${title}" to history.`, "success");
});

function renderHistory() {
  const arr = loadHistory();
  historyList.innerHTML = "";
  if (!arr.length) {
    historyList.innerHTML = '<li class="history-empty">No saved posts yet. Generate one and click "Save to History".</li>';
    return;
  }
  for (const item of arr) {
    const li = document.createElement("li");
    li.className = "history-item";
    const date = new Date(item.timestamp).toLocaleString();
    li.innerHTML = `
      <div class="history-title">${escapeHtml(item.title)}</div>
      <div class="history-meta">
        <span>${date}</span>
        <button class="history-delete" data-id="${item.id}" type="button">Delete</button>
      </div>
    `;
    li.addEventListener("click", (e) => {
      if (e.target.classList.contains("history-delete")) return;
      restoreHistory(item);
      closeDrawer();
    });
    li.querySelector(".history-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      const id = e.target.getAttribute("data-id");
      saveHistoryArr(loadHistory().filter(x => x.id !== id));
      renderHistory();
    });
    historyList.appendChild(li);
  }
}

function restoreHistory(item) {
  topicInput.value = item.settings?.topic || item.topic || "";
  if (item.settings) {
    presetSelect.value = item.settings.preset || "standard";
    postTypeSelect.value = item.settings.postType || "standard";
    toneSelect.value = item.settings.tone || "professional";
    lengthSelect.value = item.settings.length || "medium";
    audienceSelect.value = item.settings.audience || "general";
    languageSelect.value = item.settings.language || "English";
    keywordsInput.value = item.settings.keywords || "";
    customInstructions.value = item.settings.custom || "";
  }
  outputSection.classList.remove("hidden");
  outlineSection.classList.add("hidden");
  lastUsage = null;
  setMarkdown(item.markdown);
  setStatus(`Loaded "${item.title}" from history.`, "success");
  outputSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

clearHistoryBtn.addEventListener("click", () => {
  if (!confirm("Delete all saved blog posts from history?")) return;
  saveHistoryArr([]);
  renderHistory();
});

// ====== Init ======
loadSettings();
if (!getApiKey() && canUseProxy()) {
  setStatus("Server proxy mode enabled. API key stays on the server.", "success");
}
if (!getApiKey() && !canUseProxy()) {
  setStatus("Click ⚙ Settings (top-right) to add your Gemini API key.", "");
}
