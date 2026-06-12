/* ─────────────────────────────────────────────
   API layer
   - Semantic Scholar (free, no key)
   - Unpaywall (free, email param)
   - LLM: placeholder — fill in your endpoint
───────────────────────────────────────────── */

const API = (() => {

  const SEMANTIC_SCHOLAR_BASE = 'https://api.semanticscholar.org/graph/v1';
  const UNPAYWALL_EMAIL = 'research@researchstudio.app'; // public-use email for Unpaywall

  // ── Semantic Scholar ──────────────────────────
  async function searchPapers(query, { limit = 20, offset = 0 } = {}) {
    const fields = [
      'title', 'abstract', 'authors', 'year',
      'citationCount', 'externalIds', 'openAccessPdf',
      'publicationTypes', 'publicationDate',
    ].join(',');

    const url = `${SEMANTIC_SCHOLAR_BASE}/paper/search?query=${encodeURIComponent(query)}&fields=${fields}&limit=${limit}&offset=${offset}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Semantic Scholar error: ${res.status}`);
    const data = await res.json();

    return (data.data || []).map(normalizePaper);
  }

  function normalizePaper(raw) {
    return {
      id: raw.paperId || State.uid(),
      title: raw.title || 'Untitled',
      authors: (raw.authors || []).map(a => a.name),
      year: raw.year || null,
      citations: raw.citationCount || 0,
      abstract: raw.abstract || '',
      doi: raw.externalIds?.DOI || null,
      openAccessUrl: raw.openAccessPdf?.url || null,
      source: 'semantic_scholar',
      annotations: [],
      rating: null,
      takeaway: '',
      pdfStorageKey: null,
    };
  }

  // ── Unpaywall ─────────────────────────────────
  async function findOpenAccessPDF(doi) {
    if (!doi) return null;
    try {
      const res = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${UNPAYWALL_EMAIL}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.best_oa_location?.url_for_pdf || data.best_oa_location?.url || null;
    } catch {
      return null;
    }
  }

  // ── LLM ───────────────────────────────────────
  // TODO: Replace with your LLM API endpoint + key.
  // The function below expects an OpenAI-compatible chat completion API.
  // Set LLM_ENDPOINT and LLM_KEY, or swap the fetch call entirely.

  const LLM_ENDPOINT = ''; // e.g. 'https://api.openai.com/v1/chat/completions'
  const LLM_KEY      = ''; // e.g. 'sk-...'
  const LLM_MODEL    = ''; // e.g. 'gpt-4o' or 'claude-3-5-sonnet-20241022'

  async function chatLLM(messages) {
    if (!LLM_ENDPOINT || !LLM_KEY) {
      // Mock mode — simulate assistant narrowing questions
      return mockLLMResponse(messages);
    }

    const res = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_KEY}`,
      },
      body: JSON.stringify({ model: LLM_MODEL, messages }),
    });

    if (!res.ok) throw new Error(`LLM error: ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async function explainText(text, context) {
    const messages = [
      {
        role: 'system',
        content: 'You are a research assistant. Explain the following excerpt from an academic paper clearly and concisely (2-4 sentences). Focus on what it means in plain language and why it might matter for a researcher.',
      },
      {
        role: 'user',
        content: `Context: ${context || 'academic paper'}\n\nExcerpt: "${text}"`,
      },
    ];
    return chatLLM(messages);
  }

  // Simple mock — returns a narrowing question based on conversation length
  function mockLLMResponse(messages) {
    const userMessages = messages.filter(m => m.role === 'user');
    const count = userMessages.length;
    const last = userMessages[userMessages.length - 1]?.content || '';

    const isReady = /ready|let'?s go|find|search|pull|start|yes|ok|sure|go ahead/i.test(last);
    if (isReady && count >= 2) {
      return Promise.resolve('__READY__');
    }

    const narrowing = [
      "Interesting! To find the most relevant papers, could you tell me a bit more? Are you focusing on a particular population, setting, or time period?",
      "Got it. What angle matters most to you — theoretical frameworks, empirical findings, methodologies, or a specific debate in the field?",
      "Perfect. Last thing: are you looking to challenge existing work, build on it, or synthesise different perspectives into something new?",
      "Great — I think I have a clear enough picture. Shall I go ahead and search for papers now?",
    ];

    const idx = Math.min(count - 1, narrowing.length - 1);
    return new Promise(resolve => setTimeout(() => resolve(narrowing[idx]), 800));
  }

  // Build the system prompt for onboarding chat
  function buildOnboardingSystemPrompt(projectType) {
    return `You are a research assistant helping a student start a ${projectType} project.
Your goal is to understand their research topic well enough to search for relevant academic papers.
Ask 2-4 focused clarifying questions to narrow the topic — one at a time, conversationally.
Once you have enough detail, respond with exactly the token "__READY__" to signal that paper search should begin.
Keep responses short and encouraging. Do not list papers yourself.`;
  }

  return {
    searchPapers,
    findOpenAccessPDF,
    chatLLM,
    explainText,
    buildOnboardingSystemPrompt,
    normalizePaper,
  };
})();
