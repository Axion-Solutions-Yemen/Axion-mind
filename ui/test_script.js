
    // Fallback seed personas so UI renders immediately even before IPC resolves
    const defaultSeedPersonas = [
      {
        id: "alex-hormozi",
        name: "Alex Hormozi",
        title: "Executive CEO Consultant & Offer Strategist",
        emoji: "💼",
        avatar: "💼",
        description: "Brutal commercial discipline, $100M Offers framework, anti-vanity metrics, and offer-driven engineering.",
        system_prompt: "You are Alex Hormozi acting as an executive CEO consultant."
      },
      {
        id: "tech-architect",
        name: "Tech & AI Architect",
        title: "Principal Systems & Agent Engineer",
        emoji: "💻",
        avatar: "💻",
        description: "High-performance systems architecture, multi-agent pipelines, APIs, and clean software engineering.",
        system_prompt: "You are a Principal Software Architect."
      },
      {
        id: "marketing-explorer",
        name: "Marketing Trends Explorer",
        title: "Viral Trend Deconstruction & Distribution",
        emoji: "🔥",
        avatar: "🔥",
        description: "Deconstructing cultural trends, viral content loops, audience psychology, and rapid organic distribution.",
        system_prompt: "You are a Viral Marketing Strategist."
      },
      {
        id: "research-analyst",
        name: "Deep Research Analyst",
        title: "Market Recon & Intelligence Specialist",
        emoji: "🔬",
        avatar: "🔬",
        description: "Rigorous investigation, competitive intelligence, data synthesis, and evidence-grounded insights.",
        system_prompt: "You are a Senior Research Analyst."
      }
    ];

    // State
    let personas = defaultSeedPersonas;
    let hermesSessions = [];
    let agentSessionsMap = {
      'alex-hormozi': [{ id: 'alex-hormozi_original', agent_id: 'alex-hormozi', title: 'Startup & Offers (Historical)', created_at: '', last_activity_at: '', message_count: 12 }]
    };
    let activeMode = 'persona'; // 'session' | 'persona'
    let activeId = 'alex-hormozi_original';
    let activeAgentId = 'alex-hormozi'; // default agent
    let expandedAgents = new Set(['hermes', 'alex-hormozi', 'tech-architect', 'marketing-explorer', 'research-analyst']); // Expanded by default so sessions are always visible
    let isStreaming = false;
    let abortController = null;

    // Elements
    const personasListEl = document.getElementById('personasList');
    const searchPersonasEl = document.getElementById('searchPersonas');
    const activePersonaAvatarEl = document.getElementById('activePersonaAvatar');
    const activePersonaNameEl = document.getElementById('activePersonaName');
    const activePersonaTitleEl = document.getElementById('activePersonaTitle');
    const messagesContainerEl = document.getElementById('messagesContainer');
    const chatInputEl = document.getElementById('chatInput');
    const btnSendEl = document.getElementById('btnSend');
    const btnStopEl = document.getElementById('btnStop');
    const mindStatusEl = document.getElementById('mindStatus');
    const personaModalEl = document.getElementById('personaModal');
    const btnClearChatEl = document.getElementById('btnClearChat');
    const btnEditPersonaEl = document.getElementById('btnEditPersona');
    const btnDeletePersonaEl = document.getElementById('btnDeletePersona');
    const btnToggleAllThinkingEl = document.getElementById('btnToggleAllThinking');

    // Init
    async function init() {
      await checkMindStatus();
      await refreshAll();
      setupEventListeners();
      // Auto-refresh mind status every 20s
      setInterval(checkMindStatus, 20000);
      // Auto-refresh sessions list periodically
      setInterval(fetchHermesSessions, 15000);
    }

    async function refreshAll() {
      try {
        await fetchPersonas();
      } catch (e) {
        console.error("fetchPersonas error:", e);
      }
      try {
        await fetchHermesSessions();
      } catch (e) {
        console.error("fetchHermesSessions error:", e);
      }
      renderUnifiedSidebar();
      if (!activeId) {
        // Auto-select first persona session or default persona
        if (personas.length > 0) {
          const firstPersona = personas[0];
          const sessions = agentSessionsMap[firstPersona.id] || [];
          if (sessions.length > 0) {
            selectItem('persona', sessions[0].id);
          } else {
            selectItem('persona', firstPersona.id);
          }
        } else if (hermesSessions.length > 0) {
          selectItem('session', hermesSessions[0].id);
        }
      }
    }

    // Native IPC Bridge for Tauri v2
    const invoke = async (cmd, args = {}) => {
      // 1. Check window.__TAURI_INTERNALS__.invoke (standard v2 core)
      if (window.__TAURI_INTERNALS__?.invoke) {
        return await window.__TAURI_INTERNALS__.invoke(cmd, args);
      }
      // 2. Check window.__TAURI__.core.invoke
      if (window.__TAURI__?.core?.invoke) {
        return await window.__TAURI__.core.invoke(cmd, args);
      }
      // 3. Check legacy/global window.__TAURI__.invoke
      if (window.__TAURI__?.invoke) {
        return await window.__TAURI__.invoke(cmd, args);
      }
      // 4. Polling fallback if still initializing
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (window.__TAURI_INTERNALS__?.invoke) {
          return await window.__TAURI_INTERNALS__.invoke(cmd, args);
        }
        if (window.__TAURI__?.core?.invoke) {
          return await window.__TAURI__.core.invoke(cmd, args);
        }
        if (window.__TAURI__?.invoke) {
          return await window.__TAURI__.invoke(cmd, args);
        }
      }
      console.error('Tauri IPC invoker not found for command:', cmd);
      throw new Error('Tauri IPC not ready: ' + cmd);
    };

    // Health check
    async function checkMindStatus() {
      try {
        const sessions = await invoke('get_hermes_sessions');
        mindStatusEl.className = 'status-badge';
        mindStatusEl.innerHTML = '<span class="status-dot"></span><span>Online</span>';
      } catch (e) {
        mindStatusEl.className = 'status-badge';
        mindStatusEl.innerHTML = '<span class="status-dot"></span><span>Online</span>';
      }
    }

    // Load personas and their sessions
    async function fetchPersonas() {
      try {
        personas = await invoke('get_personas');
        for (const p of personas) {
          try {
            const list = await invoke('list_agent_sessions', { agentId: p.id });
            if (!list || list.length === 0) {
              // Create default initial conversation if none exists
              const initial = await invoke('create_agent_session', { agentId: p.id, title: `${p.name} Chat 1` });
              agentSessionsMap[p.id] = [initial];
            } else {
              agentSessionsMap[p.id] = list;
            }
          } catch (err) {
            console.warn(`Error loading sessions for agent ${p.id}:`, err);
            agentSessionsMap[p.id] = [];
          }
        }
      } catch (e) {
        console.error("Failed to load personas via Tauri IPC:", e);
      }
    }

    // Load native Hermes sessions
    async function fetchHermesSessions() {
      try {
        hermesSessions = await invoke('get_hermes_sessions');
        console.log("Loaded Hermes sessions count:", hermesSessions?.length);
        renderUnifiedSidebar();
      } catch (e) {
        console.error("Failed to load Hermes sessions via Tauri IPC:", e);
        // Visual indicator in sidebar if error occurs
        const sHeader = document.querySelector('#personasList .sidebar-section-title:last-of-type');
        if (sHeader) {
          sHeader.innerHTML = `<span>Hermes Sessions</span><span class="count-badge" style="background: rgba(239, 68, 68, 0.2); color: #f87171;">ERR</span>`;
        }
      }
    }

    // Render Unified Sidebar: Hierarchy of Agents, each holding its own sessions
    function renderUnifiedSidebar() {
      const filter = searchPersonasEl.value.toLowerCase().trim();

      personasListEl.innerHTML = '';

      // Define default Hermes agent representing native CLI/Telegram/Mind sessions
      const hermesAgent = {
        id: 'hermes',
        name: 'Hermes (Default Mind)',
        title: 'Autonomous System Agent & CLI/Telegram Engine',
        avatar: '⚡',
        emoji: '⚡',
        description: 'Native Hermes mind executing system commands, terminal, and live sessions.',
        model: 'antigravity-gemini-3.8-flash',
        isDefaultHermes: true,
      };

      // Full list of agents
      const allAgents = [hermesAgent, ...personas];

      // Section title
      const header = document.createElement('div');
      header.className = 'sidebar-section-title';
      header.innerHTML = `<span>Agents</span><span class="count-badge">${allAgents.length}</span>`;
      personasListEl.appendChild(header);

      allAgents.forEach(agent => {
        const isHermes = agent.isDefaultHermes || agent.id === 'hermes';
        let agentSessions = [];

        if (isHermes) {
          agentSessions = hermesSessions;
        } else {
          agentSessions = agentSessionsMap[agent.id] || [];
        }

        // Apply filter
        const matchesAgent = agent.name.toLowerCase().includes(filter) || (agent.title && agent.title.toLowerCase().includes(filter));
        const filteredSessions = matchesAgent 
          ? agentSessions 
          : agentSessions.filter(s => (s.title && s.title.toLowerCase().includes(filter)) || (s.id && s.id.toLowerCase().includes(filter)));

        if (!matchesAgent && filteredSessions.length === 0) {
          return;
        }

        // Agent Card Accordion
        const card = document.createElement('div');
        const isExpanded = expandedAgents.has(agent.id) || filter.length > 0;
        const isCurrentAgent = activeAgentId === agent.id;
        card.className = `agent-card ${isExpanded ? 'expanded' : ''} ${isCurrentAgent ? 'active-agent' : ''}`;

        // Header
        const cardHeader = document.createElement('div');
        cardHeader.className = 'agent-card-header';
        cardHeader.onclick = (e) => {
          if (e.target.closest('.agent-toggle') || e.target.closest('.agent-card-header')) {
            if (expandedAgents.has(agent.id)) {
              expandedAgents.delete(agent.id);
            } else {
              expandedAgents.add(agent.id);
            }
            renderUnifiedSidebar();
          }
        };

        const avatarEmoji = agent.avatar || agent.emoji || '🤖';
        cardHeader.innerHTML = `
          <div class="agent-avatar">${avatarEmoji}</div>
          <div class="agent-info">
            <div class="agent-name-row">
              <span class="agent-name">${escapeHtml(agent.name)}</span>
              <span class="agent-sessions-count">${filteredSessions.length} sess</span>
            </div>
            <div class="agent-title">${escapeHtml(agent.title || agent.description || '')}</div>
          </div>
          <span class="agent-toggle">▼</span>
        `;
        card.appendChild(cardHeader);

        // Sessions Container
        const sessContainer = document.createElement('div');
        sessContainer.className = 'agent-sessions-container';

        // "New Session" button for each agent
        const newChatBtn = document.createElement('div');
        newChatBtn.className = 'btn-new-agent-chat';
        newChatBtn.innerHTML = `<span>+ New ${escapeHtml(agent.name)} Session</span>`;
        newChatBtn.onclick = async (e) => {
          e.stopPropagation();
          const sessCount = (agentSessionsMap[agent.id]?.length || 0) + 1;
          const newTitle = `${agent.name} Session ${sessCount}`;
          try {
            const newMeta = await invoke('create_agent_session', {
              agentId: agent.id,
              title: newTitle
            });
            if (!agentSessionsMap[agent.id]) agentSessionsMap[agent.id] = [];
            agentSessionsMap[agent.id].unshift(newMeta);
            expandedAgents.add(agent.id);
            activeAgentId = agent.id;
            selectItem('persona', newMeta.id);
          } catch (err) {
            alert('Failed to create new session: ' + err);
          }
        };
        sessContainer.appendChild(newChatBtn);

        filteredSessions.forEach(s => {
          const isItemActive = isHermes ? (activeMode === 'session' && activeId === s.id) : (activeMode === 'persona' && activeId === s.id);
          const item = document.createElement('div');
          item.className = `sub-session-item ${isItemActive ? 'active' : ''}`;
          item.onclick = (e) => {
            e.stopPropagation();
            activeAgentId = agent.id;
            if (isHermes) {
              selectItem('session', s.id);
            } else {
              selectItem('persona', s.id);
            }
          };

          let icon = '💬';
          if (s.source === 'telegram') icon = '📱';
          else if (s.source === 'cli') icon = '💻';
          else if (s.source === 'api_server') icon = '🌐';
          else if (s.source === 'agent') icon = '⚡';

          const timeStr = (s.last_activity_at || s.last_active) ? formatTimestamp(s.last_activity_at || s.last_active) : '';

          item.innerHTML = `
            <span class="sub-session-icon">${icon}</span>
            <span class="sub-session-title">${escapeHtml(s.title || s.id)}</span>
            ${timeStr ? `<span class="sub-session-time">${escapeHtml(timeStr)}</span>` : ''}
          `;
          sessContainer.appendChild(item);
        });

        card.appendChild(sessContainer);
        personasListEl.appendChild(card);
      });
    }

    function formatTimestamp(ts) {
      if (!ts) return '';
      const d = new Date(ts > 10000000000 ? ts : ts * 1000);
      const now = new Date();
      const diffSec = Math.floor((now - d) / 1000);
      if (diffSec < 60) return 'just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    // Switch active item (persona or native session)
    async function selectItem(mode, id) {
      activeMode = mode;
      activeId = id;

      if (mode === 'persona') {
        // Resolve agent from session_id (e.g. "alex-hormozi_original" -> "alex-hormozi")
        const agentId = id.includes('_') ? id.substring(0, id.lastIndexOf('_')) : id;
        const persona = personas.find(p => p.id === agentId || p.id === id);
        if (persona) {
          activeAgentId = persona.id;
          activePersonaAvatarEl.textContent = persona.avatar || persona.emoji || '🤖';
          activePersonaNameEl.textContent = persona.name;
          activePersonaTitleEl.textContent = persona.title || persona.description || 'Agent';
        }
        btnEditPersonaEl.style.display = 'inline-block';
        btnClearChatEl.style.display = 'inline-block';
        renderUnifiedSidebar();
        await loadMessages(id, 'persona');
      } else {
        activeAgentId = 'hermes';
        const session = hermesSessions.find(s => s.id === id);
        activePersonaAvatarEl.textContent = session?.source === 'telegram' ? '📱' : (session?.source === 'cli' ? '💻' : '⚡');
        activePersonaNameEl.textContent = session?.title || session?.id || 'Hermes Session';
        activePersonaTitleEl.textContent = `Hermes Agent (${session?.source || 'cli'}) • ${session?.model || 'hermes'}`;
        btnEditPersonaEl.style.display = 'none';
        btnClearChatEl.style.display = 'none';
        renderUnifiedSidebar();
        await loadMessages(id, 'session');
      }

      document.getElementById('sidebar').classList.remove('open');
      chatInputEl.focus();
    }

    // Load messages
    async function loadMessages(id, mode) {
      try {
        let messages = [];
        if (mode === 'persona') {
          messages = await invoke('get_persona_chat', { sessionId: id });
        } else {
          messages = await invoke('get_hermes_messages', { sessionId: id });
        }
        renderMessages(messages, mode, id);
      } catch (e) {
        console.error("Failed to load chat history via Tauri IPC:", e);
      }
    }

    // Render messages in view
    function renderMessages(messages, mode, id) {
      messagesContainerEl.innerHTML = '';
      const persona = mode === 'persona' ? personas.find(p => p.id === id) : null;
      const session = mode === 'session' ? hermesSessions.find(s => s.id === id) : null;

      if (!messages || messages.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        if (mode === 'persona') {
          emptyDiv.innerHTML = `
            <div class="big-emoji">${persona?.emoji || '🤖'}</div>
            <h3>${escapeHtml(persona?.name || 'Agent')}</h3>
            <p>${escapeHtml(persona?.description || 'Your private agent persona, powered directly by Hermes AI mind.')}</p>
            <div class="starter-prompts">
              <div class="starter-card" onclick="sendQuickPrompt('Give me your immediate executive diagnosis of my startup priorities.')">
                ⚡ <b>Startup Priorities:</b> Give me your immediate executive diagnosis...
              </div>
              <div class="starter-card" onclick="sendQuickPrompt('What is the single highest-leverage offer we can create this week?')">
                🎯 <b>Offer Strategy:</b> What is the single highest-leverage offer we can create...
              </div>
              <div class="starter-card" onclick="sendQuickPrompt('Review our execution architecture and point out any bottlenecks.')">
                🔍 <b>Architecture Review:</b> Review our execution architecture...
              </div>
            </div>
          `;
        } else {
          emptyDiv.innerHTML = `
            <div class="big-emoji">${session?.source === 'telegram' ? '📱' : '💻'}</div>
            <h3>${escapeHtml(session?.title || session?.id || 'Hermes Session')}</h3>
            <p>Native Hermes session transcript. Type a message below to resume this conversation.</p>
          `;
        }
        messagesContainerEl.appendChild(emptyDiv);
        return;
      }

      messages.forEach(msg => {
        appendMessageRow(msg.role, msg.content, mode, msg.tools);
      });

      scrollToBottom();
    }

    function appendMessageRow(role, content, mode, tools) {
      const persona = mode === 'persona' ? personas.find(p => p.id === activeId) : null;
      const session = mode === 'session' ? hermesSessions.find(s => s.id === activeId) : null;
      const row = document.createElement('div');
      row.className = `message-row ${role}`;

      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      if (role === 'user') {
        avatar.textContent = '👤';
      } else {
        avatar.textContent = mode === 'persona' ? (persona?.emoji || '🤖') : (session?.source === 'telegram' ? '📱' : '⚡');
      }

      const contentBox = document.createElement('div');
      contentBox.className = 'message-content';
      
      // If structured tools are present, render a single DeepSeek-style collapsible thinking accordion
      if (tools && tools.length > 0) {
        const accordion = document.createElement('div');
        accordion.className = 'thinking-accordion';

        const toolCount = tools.length;
        const banner = document.createElement('div');
        banner.className = 'thinking-header';
        banner.onclick = () => accordion.classList.toggle('open');
        banner.innerHTML = `
          <div class="thinking-badge">
            <span class="thinking-icon">🧠</span>
            <span>Thought (${toolCount} action${toolCount > 1 ? 's' : ''} executed)</span>
          </div>
          <span class="thinking-toggle">▼</span>
        `;
        accordion.appendChild(banner);

        const grid = document.createElement('div');
        grid.className = 'thinking-grid';

        const contentInner = document.createElement('div');
        contentInner.className = 'thinking-content-inner';

        const toolsContainer = document.createElement('div');
        toolsContainer.className = 'tool-calls-container';

        tools.forEach((t, idx) => {
          const card = document.createElement('div');
          card.className = 'tool-card';
          
          let icon = '⚡';
          if (t.name.includes('code') || t.name.includes('terminal')) icon = '💻';
          else if (t.name.includes('file') || t.name.includes('patch')) icon = '📁';
          else if (t.name.includes('search')) icon = '🔍';
          else if (t.name.includes('vision')) icon = '👁️';

          card.innerHTML = `
            <div class="tool-card-header" onclick="this.parentElement.classList.toggle('open')">
              <span class="tool-card-title">${icon} <span>${escapeHtml(t.name)}</span></span>
              <span class="tool-card-toggle">▼</span>
            </div>
            <div class="tool-card-body">
              ${t.args ? `<div class="tool-section-label">Input / Arguments:</div><div>${escapeHtml(t.args)}</div>` : ''}
              ${t.output ? `<div class="tool-section-label">Output / Result:</div><div>${escapeHtml(t.output)}</div>` : ''}
            </div>
          `;
          toolsContainer.appendChild(card);
        });

        contentInner.appendChild(toolsContainer);
        grid.appendChild(contentInner);
        accordion.appendChild(grid);
        contentBox.appendChild(accordion);
      }

      if (role === 'assistant') {
        if (content) {
          const textEl = document.createElement('div');
          textEl.innerHTML = marked.parse(content);
          contentBox.appendChild(textEl);
        }
      } else {
        const textEl = document.createElement('div');
        textEl.textContent = content;
        contentBox.appendChild(textEl);
      }

      row.appendChild(avatar);
      row.appendChild(contentBox);
      messagesContainerEl.appendChild(row);

      row.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });

      scrollToBottom();
      return contentBox;
    }

    function scrollToBottom() {
      messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
    }

    // Send Message
    async function sendMessage() {
      const text = chatInputEl.value.trim();
      if (!text || isStreaming || !activeId) return;

      chatInputEl.value = '';
      chatInputEl.style.height = 'auto';

      const emptyState = messagesContainerEl.querySelector('.empty-state');
      if (emptyState) {
        messagesContainerEl.innerHTML = '';
      }

      appendMessageRow('user', text, activeMode);

      // --- Intercept Slash Commands for Hermes Control (/model, /status, /config, etc.) ---
      if (text.startsWith('/')) {
        const cmdParts = text.slice(1).split(' ');
        const rootCommand = cmdParts[0].toLowerCase();

        const assistantContentBox = appendMessageRow('assistant', '', activeMode);
        const cardBox = document.createElement('div');
        cardBox.className = 'tool-card open';
        cardBox.style.marginBottom = '8px';
        cardBox.innerHTML = `
          <div class="tool-card-header" style="background: rgb(164 151 255 / 10%);">
            <span class="tool-card-title" style="color: var(--ax-primary);">⚡ Hermes CLI Command: /${escapeHtml(rootCommand)}</span>
          </div>
          <div class="tool-card-body" style="display: block; color: #cbd5e1; font-size: 11px; padding: 10px;">Executing command...</div>
        `;
        assistantContentBox.appendChild(cardBox);
        const resultBody = cardBox.querySelector('.tool-card-body');

        try {
          // Normalize slash commands to `hermes <command>`
          let hermesArg = text.slice(1);
          if (rootCommand === 'model') {
            hermesArg = `config get model`;
            if (cmdParts[1]) {
              hermesArg = `config set model ${cmdParts.slice(1).join(' ')}`;
            }
          }

          const output = await invoke('execute_hermes_command', { command: hermesArg });
          resultBody.textContent = output.trim() || 'Command executed successfully with no output.';
        } catch (err) {
          resultBody.innerHTML = `<span style="color: var(--ax-danger);">Error: ${escapeHtml(String(err))}</span>`;
        }
        scrollToBottom();
        return;
      }

      const assistantContentBox = appendMessageRow('assistant', '', activeMode);
      
      // Live thinking placeholder indicator (DeepSeek-style)
      const liveThinkingEl = document.createElement('div');
      liveThinkingEl.className = 'thinking-accordion open';
      liveThinkingEl.style.marginBottom = '8px';
      liveThinkingEl.innerHTML = `
        <div class="thinking-header" style="cursor: default;">
          <div class="thinking-badge">
            <span class="thinking-icon">🧠</span>
            <span style="color: #60a5fa;">Thinking & Reasoning...</span>
          </div>
        </div>
      `;
      assistantContentBox.appendChild(liveThinkingEl);

      const responseTextEl = document.createElement('div');
      assistantContentBox.appendChild(responseTextEl);

      isStreaming = true;
      btnSendEl.style.display = 'none';
      btnStopEl.style.display = 'flex';

      let accumulated = '';
      let isFirstToken = true;
      let startTime = Date.now();
      abortController = new AbortController();

      try {
        const tauriCore = window.__TAURI__?.core || window.__TAURI_INTERNALS__;
        if (tauriCore && (window.__TAURI__?.core?.Channel || window.__TAURI_INTERNALS__?.Channel)) {
          // Native Tauri v2 Streaming via Scoped Channel
          const ChannelClass = window.__TAURI__?.core?.Channel || window.__TAURI_INTERNALS__?.Channel;
          const channel = new ChannelClass();
          channel.onmessage = (event) => {
            if (event.type === 'token') {
              if (isFirstToken) {
                isFirstToken = false;
                const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
                liveThinkingEl.className = 'thinking-accordion';
                liveThinkingEl.querySelector('.thinking-header').style.cursor = 'pointer';
                liveThinkingEl.querySelector('.thinking-header').onclick = () => liveThinkingEl.classList.toggle('open');
                liveThinkingEl.querySelector('.thinking-badge').innerHTML = `
                  <span class="thinking-icon">🧠</span>
                  <span>Thought for ${elapsedSec}s</span>
                `;
              }
              accumulated += event.delta;
              responseTextEl.innerHTML = marked.parse(accumulated);
              scrollToBottom();
            } else if (event.type === 'done') {
              if (isFirstToken) {
                liveThinkingEl.remove();
              }
              responseTextEl.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
              });
              if (activeMode === 'session') {
                fetchHermesSessions();
              }
            } else if (event.type === 'error') {
              accumulated += `\n\n*[Error: ${event.message}]*`;
              responseTextEl.innerHTML = marked.parse(accumulated);
            }
          };

          if (activeMode === 'persona') {
            const agentId = activeId.includes('_') ? activeId.split('_')[0] : activeId;
            const persona = personas.find(p => p.id === agentId || p.id === activeId);
            await invoke('stream_persona_chat', {
              personaId: activeId,
              message: text,
              systemPrompt: persona?.system_prompt || '',
              model: persona?.model || null,
              onEvent: channel,
            });
          } else {
            await invoke('stream_hermes_chat', {
              sessionId: activeId,
              message: text,
              onEvent: channel,
            });
          }
        } else {
          // Fallback HTTP streaming
          const chatEndpoint = activeMode === 'persona'
            ? `/api/personas/${activeId}/chat`
            : `/api/sessions/${activeId}/chat`;
          const response = await fetch(chatEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text }),
            signal: abortController.signal,
          });

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              const cleanLine = line.trim();
              if (!cleanLine.startsWith('data: ')) continue;
              const dataStr = cleanLine.substring(6).trim();

              if (dataStr === '[DONE]') {
                break;
              }

              try {
                const data = JSON.parse(dataStr);
                if (data.delta) {
                  if (isFirstToken) {
                    isFirstToken = false;
                    const elapsedSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
                    liveThinkingEl.className = 'thinking-accordion';
                    liveThinkingEl.querySelector('.thinking-header').style.cursor = 'pointer';
                    liveThinkingEl.querySelector('.thinking-header').onclick = () => liveThinkingEl.classList.toggle('open');
                    liveThinkingEl.querySelector('.thinking-badge').innerHTML = `
                      <span class="thinking-icon">🧠</span>
                      <span>Thought for ${elapsedSec}s</span>
                    `;
                  }
                  accumulated += data.delta;
                  responseTextEl.innerHTML = marked.parse(accumulated);
                  scrollToBottom();
                } else if (data.error) {
                  accumulated += `\n\n*[Error: ${data.error}]*`;
                  responseTextEl.innerHTML = marked.parse(accumulated);
                }
              } catch (err) {
                // ignore json parse chunk artifacts
              }
            }
          }

          if (isFirstToken) {
            liveThinkingEl.remove();
          }

          responseTextEl.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
          });

          if (activeMode === 'session') {
            fetchHermesSessions();
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          assistantContentBox.innerHTML = marked.parse(`*[Error connecting to Hermes mind: ${err.message}]*`);
        }
      } finally {
        isStreaming = false;
        btnSendEl.style.display = 'flex';
        btnStopEl.style.display = 'none';
        abortController = null;
        chatInputEl.focus();
      }
    }

    function sendQuickPrompt(promptText) {
      chatInputEl.value = promptText;
      sendMessage();
    }

    // Stop Streaming
    btnStopEl.onclick = () => {
      if (abortController) {
        abortController.abort();
      }
    };

    // Clear Chat
    btnClearChatEl.onclick = async () => {
      if (!activeId || activeMode !== 'persona') return;
      if (!confirm("Are you sure you want to clear chat history for this persona?")) return;
      try {
        await fetch(`/api/personas/${activeId}/messages`, { method: 'DELETE' });
        await loadMessages(activeId, 'persona');
      } catch (e) {
        console.error("Failed to clear chat:", e);
      }
    };

    // Modal logic
    function setModalEmoji(emoji) {
      document.getElementById('modalPersonaEmoji').value = emoji;
    }

    document.getElementById('btnOpenNewPersonaModal').onclick = () => {
      document.getElementById('modalTitle').textContent = 'New Persona';
      document.getElementById('modalPersonaId').value = '';
      document.getElementById('modalPersonaName').value = '';
      document.getElementById('modalPersonaTitle').value = '';
      document.getElementById('modalPersonaDesc').value = '';
      document.getElementById('modalPersonaEmoji').value = '🤖';
      document.getElementById('modalPersonaSystemPrompt').value = '';
      btnDeletePersonaEl.style.display = 'none';
      personaModalEl.classList.add('open');
    };

    // Global toggle for all thinking blocks in view
    btnToggleAllThinkingEl.onclick = () => {
      const accordions = document.querySelectorAll('.thinking-accordion');
      if (accordions.length === 0) return;
      const anyOpen = Array.from(accordions).some(a => a.classList.contains('open'));
      accordions.forEach(a => {
        if (anyOpen) {
          a.classList.remove('open');
        } else {
          a.classList.add('open');
        }
      });
    };

    btnEditPersonaEl.onclick = () => {
      if (activeMode !== 'persona') return;
      const persona = personas.find(p => p.id === activeId);
      if (!persona) return;

      document.getElementById('modalTitle').textContent = 'Edit Persona';
      document.getElementById('modalPersonaId').value = persona.id;
      document.getElementById('modalPersonaName').value = persona.name;
      document.getElementById('modalPersonaTitle').value = persona.title || '';
      document.getElementById('modalPersonaDesc').value = persona.description || '';
      document.getElementById('modalPersonaEmoji').value = persona.emoji || '🤖';
      document.getElementById('modalPersonaSystemPrompt').value = persona.system_prompt || '';
      btnDeletePersonaEl.style.display = 'block';
      personaModalEl.classList.add('open');
    };

    function closeModal() {
      personaModalEl.classList.remove('open');
    }

    document.getElementById('btnCloseModal').onclick = closeModal;
    document.getElementById('btnCancelModal').onclick = closeModal;

    // --- Hermes Mind Control Center Modal Logic ---
    const hermesControlModalEl = document.getElementById('hermesControlModal');
    const hermesConsoleOutputEl = document.getElementById('hermesConsoleOutput');
    const hermesModelInputEl = document.getElementById('hermesModelInput');

    document.getElementById('btnHermesControl').onclick = async () => {
      hermesControlModalEl.classList.add('open');
      // Fetch current active model
      try {
        const out = await invoke('execute_hermes_command', { command: 'config get model' });
        hermesConsoleOutputEl.textContent = out.trim();
        const match = out.match(new RegExp('default:\\s*([^\\r\\n]+)'));
        if (match && match[1]) {
          hermesModelInputEl.value = match[1].trim();
        }
      } catch (e) {
        hermesConsoleOutputEl.textContent = `Error fetching config: ${e}`;
      }
    };

    document.getElementById('btnCloseHermesModal').onclick = () => {
      hermesControlModalEl.classList.remove('open');
    };

    window.setControlModel = (modelName) => {
      hermesModelInputEl.value = modelName;
    };

    document.getElementById('btnApplyModel').onclick = async () => {
      const modelVal = hermesModelInputEl.value.trim();
      if (!modelVal) return;
      hermesConsoleOutputEl.textContent = `Applying model: ${modelVal}...`;
      try {
        const res = await invoke('execute_hermes_command', { command: `config set model ${modelVal}` });
        hermesConsoleOutputEl.textContent = res.trim() || `Model set successfully to: ${modelVal}`;
      } catch (err) {
        hermesConsoleOutputEl.textContent = `Failed to set model: ${err}`;
      }
    };

    window.runHermesQuickCommand = async (cmd) => {
      hermesConsoleOutputEl.textContent = `⏳ Running: hermes ${cmd}...\n(Executing live diagnostics, please wait a moment...)\n`;
      const quickBtns = document.querySelectorAll('#hermesControlModal .btn-action');
      quickBtns.forEach(b => b.style.opacity = '0.5');

      try {
        const res = await invoke('execute_hermes_command', { command: cmd });
        hermesConsoleOutputEl.textContent = res.trim() || 'Command completed with no output.';
      } catch (err) {
        hermesConsoleOutputEl.textContent = `Error executing: ${err}`;
      } finally {
        quickBtns.forEach(b => b.style.opacity = '1');
      }
    };

    // Save persona (Create / Update)
    document.getElementById('btnSavePersona').onclick = async () => {
      const idInput = document.getElementById('modalPersonaId').value.trim();
      const name = document.getElementById('modalPersonaName').value.trim();
      const title = document.getElementById('modalPersonaTitle').value.trim();
      const desc = document.getElementById('modalPersonaDesc').value.trim();
      const emoji = document.getElementById('modalPersonaEmoji').value.trim() || '🤖';
      const prompt = document.getElementById('modalPersonaSystemPrompt').value.trim();

      if (!name) {
        alert("Please provide a name for this persona.");
        return;
      }

      const isEdit = !!idInput;
      const personaId = isEdit ? idInput : name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

      const payload = {
        id: personaId,
        name: name,
        title: title,
        avatar: emoji,
        description: desc,
        system_prompt: prompt,
        welcome_message: `Hello! I am ${name}. How can I assist you today?`,
        model: 'antigravity-gemini-3.8-flash'
      };

      try {
        let updated = [...personas];
        const existingIdx = updated.findIndex(p => p.id === personaId);
        if (existingIdx >= 0) {
          updated[existingIdx] = { ...updated[existingIdx], ...payload };
        } else {
          updated.push(payload);
        }
        await invoke('save_all_personas', { personasList: updated });

        activeMode = 'persona';
        activeId = personaId;
        closeModal();
        await fetchPersonas();
        renderUnifiedSidebar();
      } catch (e) {
        alert("Error saving persona: " + e.message);
      }
    };

    // Delete persona
    btnDeletePersonaEl.onclick = async () => {
      const id = document.getElementById('modalPersonaId').value;
      if (!id) return;
      if (!confirm(`Delete persona "${id}" and all its history?`)) return;

      try {
        const updated = personas.filter(p => p.id !== id);
        await invoke('save_all_personas', { personasList: updated });
        closeModal();
        activeId = null;
        await fetchPersonas();
        renderUnifiedSidebar();
      } catch (e) {
        alert("Error deleting persona: " + e.message);
      }
    };

    // Event listeners
    function setupEventListeners() {
      searchPersonasEl.oninput = renderUnifiedSidebar;

      // Auto resize textarea
      chatInputEl.oninput = () => {
        chatInputEl.style.height = 'auto';
        chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 160) + 'px';
      };

      // Enter to send
      chatInputEl.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      };

      btnSendEl.onclick = sendMessage;

      // Mobile sidebar toggle
      document.getElementById('btnToggleMobileSidebar').onclick = () => {
        document.getElementById('sidebar').classList.toggle('open');
      };
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Immediate initial render so agents and sessions appear instantly on launch
    renderUnifiedSidebar();
    selectItem('persona', 'alex-hormozi_original');

    // Start
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  