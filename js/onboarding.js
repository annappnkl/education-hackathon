/* ─────────────────────────────────────────────
   Onboarding — chat screen
───────────────────────────────────────────── */

const Onboarding = (() => {

  let selectedType = null;
  let pendingAttachments = [];
  let isWaiting = false;
  let chatHistory = [];
  let exchangeCount = 0; // number of user turns

  const SYSTEM_INTRO = {
    thesis: "Hi! Let's set up your thesis project. What's the broad area you're researching?",
    paper:  "Hi! Let's find papers for your research. What topic are you working on?",
    poster: "Hi! Let's build your poster research base. What's the subject of your poster?",
    other:  "Hi! What are you working on? Tell me as much or as little as you know so far.",
  };

  function init() {
    const presetBar = document.getElementById('preset-bar');
    const sendBtn   = document.getElementById('chat-send');
    const input     = document.getElementById('chat-input');
    const attachBtn = document.getElementById('attach-btn');
    const fileInput = document.getElementById('file-input');

    // Preset chips
    presetBar.addEventListener('click', e => {
      const chip = e.target.closest('.preset-chip');
      if (!chip) return;
      document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedType = chip.dataset.type;
      if (!chatHistory.length) startChat(selectedType);
    });

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    attachBtn.addEventListener('click', () => {
      const raw = input.value.trim();
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        addAttachment('link', raw, raw);
        input.value = '';
      } else {
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files);
      for (const f of files) {
        const buf = await f.arrayBuffer();
        addAttachment('file', f.name, buf);
      }
      fileInput.value = '';
    });

    startChat(null);
    renderProjectsSidebar();
  }

  function startChat(type) {
    const msgs = document.getElementById('chat-messages');
    msgs.innerHTML = '';
    chatHistory = [];
    pendingAttachments = [];
    exchangeCount = 0;

    const greeting = type
      ? SYSTEM_INTRO[type]
      : "Hi! What are you working on? You can pick a format above, or just tell me what you're researching.";

    appendBubble('assistant', greeting);
    chatHistory.push({
      role: 'system',
      content: API.buildOnboardingSystemPrompt(type || 'research project'),
    });
    chatHistory.push({ role: 'assistant', content: greeting });
  }

  function addAttachment(type, name, data) {
    pendingAttachments.push({ type, name, data });
    renderAttachments();
  }

  function renderAttachments() {
    const area = document.getElementById('chat-attachments');
    area.innerHTML = '';
    pendingAttachments.forEach((att, i) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';
      chip.innerHTML = `
        <span class="icon">${att.type === 'link' ? 'link' : 'picture_as_pdf'}</span>
        <span>${att.type === 'link' ? truncateUrl(att.name) : att.name}</span>
        <button style="background:none;border:none;cursor:pointer;padding:0;line-height:1" onclick="Onboarding._removeAttachment(${i})">
          <span class="icon" style="font-size:12px;color:var(--color-text-tertiary)">close</span>
        </button>
      `;
      area.appendChild(chip);
    });
  }

  function _removeAttachment(i) {
    pendingAttachments.splice(i, 1);
    renderAttachments();
  }

  // User confirmation phrases that mean "yes, go ahead"
  const CONFIRM_RE = /^(yes|yeah|yep|sure|ok|okay|ready|go|go ahead|let'?s go|done|start|search|find|i'?m\s*(done|ready)|that'?s\s*(it|everything|all)|sounds good|perfect|great|do it)/i;

  async function sendMessage() {
    if (isWaiting) return;
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();

    if (!text && pendingAttachments.length === 0) return;

    if (!selectedType) {
      selectedType = 'other';
      chatHistory[0] = {
        role: 'system',
        content: API.buildOnboardingSystemPrompt('research project'),
      };
    }

    // Display
    let displayText = text;
    if (pendingAttachments.length) {
      const names = pendingAttachments.map(a => a.name).join(', ');
      displayText = (text ? text + '\n' : '') + `📎 ${names}`;
    }
    appendBubble('user', displayText || '📎 ' + pendingAttachments.map(a => a.name).join(', '));
    input.value = '';
    input.style.height = 'auto';

    // Store uploaded files
    for (const att of pendingAttachments) {
      if (att.type === 'file') {
        const paperId = 'upload_' + State.uid();
        await State.storePDF(paperId, att.data);
        if (State.getProject()) {
          State.addPapers([{
            id: paperId, title: att.name.replace('.pdf', ''),
            authors: [], year: null, citations: 0, abstract: '',
            doi: null, openAccessUrl: null, source: 'upload',
            annotations: [], rating: null, takeaway: '', pdfStorageKey: paperId,
          }]);
        }
      }
    }
    pendingAttachments = [];
    renderAttachments();

    chatHistory.push({ role: 'user', content: text || '[attached files]' });
    exchangeCount++;

    // If the LLM already asked "Is that everything?" and user confirms → go
    const lastAssistant = [...chatHistory].reverse().find(m => m.role === 'assistant');
    const askedIsReady  = lastAssistant && /is that everything|shall i (start|search|look)|ready to search|want me to (search|find|pull)/i.test(lastAssistant.content);

    if (askedIsReady && CONFIRM_RE.test(text)) {
      isWaiting = true;
      appendBubble('assistant', "Perfect — let me find relevant papers for you now.");
      isWaiting = false;
      await transitionToDiscovery();
      return;
    }

    // Show typing
    isWaiting = true;
    const typingId = appendTyping();

    try {
      const reply = await API.chatLLM(chatHistory);
      removeTyping(typingId);

      // Strip __READY__ token if LLM accidentally includes it
      const cleanReply = reply.replace(/__READY__/g, '').trim();

      if (reply.trim() === '__READY__' || (reply.includes('__READY__') && !cleanReply)) {
        // __READY__ alone — go directly
        appendBubble('assistant', "Perfect — let me find relevant papers for you now.");
        isWaiting = false;
        await transitionToDiscovery();
      } else if (reply.includes('__READY__') && cleanReply) {
        // __READY__ mixed with text — show the text, then go
        appendBubble('assistant', cleanReply);
        chatHistory.push({ role: 'assistant', content: cleanReply });
        isWaiting = false;
        setTimeout(() => transitionToDiscovery(), 1200);
      } else {
        appendBubble('assistant', cleanReply || reply);
        chatHistory.push({ role: 'assistant', content: cleanReply || reply });
        isWaiting = false;
      }
    } catch(err) {
      removeTyping(typingId);
      appendBubble('assistant', "Sorry, I had trouble connecting. Please try again.");
      isWaiting = false;
    }
  }

  async function transitionToDiscovery() {
    // Extract a clean search query via LLM (falls back to first user message)
    const searchQuery = await API.extractSearchQuery(chatHistory);

    // Create project — store full topic from conversation, clean query for search
    const userMsgs = chatHistory.filter(m => m.role === 'user').map(m => m.content);
    const topic = userMsgs.join(' ').slice(0, 300);

    State.createProject({ type: selectedType || 'other', topic, searchQuery });
    chatHistory.forEach(m => {
      if (m.role !== 'system') State.addChatMessage(m.role, m.content);
    });

    await Discovery.load(searchQuery);
    App.showScreen('discovery');
    renderProjectsSidebar();
  }

  // ── Projects sidebar ──────────────────────────
  function renderProjectsSidebar() {
    const list = document.getElementById('projects-list');
    if (!list) return;
    const projects = State.getAllProjects();
    list.innerHTML = '';

    if (!projects.length) {
      list.innerHTML = `<div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);padding:var(--space-3) var(--space-2)">No projects yet</div>`;
      return;
    }

    [...projects].reverse().forEach(proj => {
      const item = document.createElement('div');
      item.className = 'project-list-item';
      const current = State.getProject()?.id === proj.id;
      if (current) item.classList.add('active');

      item.innerHTML = `
        <div class="project-list-item__type">${proj.type}</div>
        <div class="project-list-item__topic">${escHtml(proj.topic.slice(0, 60))}${proj.topic.length > 60 ? '…' : ''}</div>
        <div class="project-list-item__date">${formatDate(proj.createdAt)}</div>
      `;
      item.addEventListener('click', () => openProject(proj.id));
      list.appendChild(item);
    });
  }

  function openProject(id) {
    State.switchProject(id);
    const project = State.getProject();
    if (!project) return;
    if (project.papers?.length) {
      App.showScreen('workspace');
      Workspace.init();
    } else {
      App.showScreen('discovery');
      Discovery.load(project.searchQuery || project.topic);
    }
  }

  function newProject() {
    selectedType = null;
    document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('selected'));
    startChat(null);
    App.showScreen('onboarding');
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function appendBubble(role, text) {
    const msgs = document.getElementById('chat-messages');
    const div  = document.createElement('div');
    div.className = `chat-bubble chat-bubble--${role}`;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function appendTyping() {
    const msgs = document.getElementById('chat-messages');
    const id   = 'typing_' + Date.now();
    const div  = document.createElement('div');
    div.id = id;
    div.className = 'chat-bubble chat-bubble--assistant chat-bubble--typing';
    div.innerHTML = `<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return id;
  }

  function removeTyping(id) { document.getElementById(id)?.remove(); }

  function truncateUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname + (u.pathname.length > 20 ? u.pathname.slice(0, 20) + '…' : u.pathname);
    } catch { return url.slice(0, 40); }
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
  }

  return { init, newProject, renderProjectsSidebar, _removeAttachment };
})();
