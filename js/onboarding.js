/* ─────────────────────────────────────────────
   Onboarding — chat screen
───────────────────────────────────────────── */

const Onboarding = (() => {

  let selectedType = null;
  let pendingAttachments = []; // { type: 'file'|'link', name, data }
  let isWaiting = false;
  let chatHistory = []; // OpenAI-format messages

  const SYSTEM_INTRO = {
    thesis: "Hi! Let's set up your thesis project. What's the broad area you're researching?",
    paper:  "Hi! Let's find papers for your research. What topic are you working on?",
    poster: "Hi! Let's build your poster research base. What's the subject of your poster?",
    other:  "Hi! What are you researching? Tell me as much or as little as you know so far.",
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

    // Send message
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Attach — detect link or file
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

    // Start with a generic greeting if no preset selected
    startChat(null);
  }

  function startChat(type) {
    const msgs = document.getElementById('chat-messages');
    msgs.innerHTML = '';
    chatHistory = [];
    pendingAttachments = [];

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

  async function sendMessage() {
    if (isWaiting) return;
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();

    // Allow sending with just attachments
    if (!text && pendingAttachments.length === 0) return;

    // If no type selected yet, default to 'other'
    if (!selectedType) {
      selectedType = 'other';
      chatHistory[0] = {
        role: 'system',
        content: API.buildOnboardingSystemPrompt('research project'),
      };
    }

    // Build display message
    let displayText = text;
    if (pendingAttachments.length) {
      const names = pendingAttachments.map(a => a.name).join(', ');
      displayText = (text ? text + '\n' : '') + `📎 ${names}`;
    }

    appendBubble('user', displayText || '📎 ' + pendingAttachments.map(a => a.name).join(', '));
    input.value = '';
    input.style.height = 'auto';

    // Store PDFs / links
    for (const att of pendingAttachments) {
      if (att.type === 'file') {
        const paperId = 'upload_' + State.uid();
        await State.storePDF(paperId, att.data);
        // Register as a paper in state if project exists
        if (State.getProject()) {
          State.addPapers([{
            id: paperId,
            title: att.name.replace('.pdf', ''),
            authors: [],
            year: null,
            citations: 0,
            abstract: '',
            doi: null,
            openAccessUrl: null,
            source: 'upload',
            annotations: [],
            rating: null,
            takeaway: '',
            pdfStorageKey: paperId,
          }]);
        }
      }
    }
    pendingAttachments = [];
    renderAttachments();

    // Push user message to history
    chatHistory.push({ role: 'user', content: text || '[attached files]' });

    // Show typing
    isWaiting = true;
    const typingId = appendTyping();

    try {
      const reply = await API.chatLLM(chatHistory.filter(m => m.role !== 'system' ? true : true));
      removeTyping(typingId);

      if (reply === '__READY__') {
        // LLM is satisfied — move to discovery
        appendBubble('assistant', "Perfect — I have everything I need. Let me search for relevant papers now.");
        isWaiting = false;
        await transitionToDiscovery();
      } else {
        appendBubble('assistant', reply);
        chatHistory.push({ role: 'assistant', content: reply });
        isWaiting = false;
      }
    } catch(err) {
      removeTyping(typingId);
      appendBubble('assistant', "Sorry, I had trouble connecting. Please try again.");
      isWaiting = false;
    }
  }

  async function transitionToDiscovery() {
    // Derive topic from conversation
    const userMessages = chatHistory.filter(m => m.role === 'user').map(m => m.content);
    const topic = userMessages.join(' ').slice(0, 200);

    // Create project
    State.createProject({ type: selectedType || 'other', topic });
    chatHistory.forEach(m => {
      if (m.role !== 'system') State.addChatMessage(m.role, m.content);
    });

    await Discovery.load(topic);
    App.showScreen('discovery');
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

  function removeTyping(id) {
    document.getElementById(id)?.remove();
  }

  function truncateUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname + (u.pathname.length > 20 ? u.pathname.slice(0, 20) + '…' : u.pathname);
    } catch { return url.slice(0, 40); }
  }

  return { init, _removeAttachment };
})();
