
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
    let expandedSessionsAgents = new Set();
    let activeSidebarTab = 'personas';
    let showAdvancedModels = false;
    let isStreaming = false;
    let abortController = null;
    let activeStreamController = null;
    let activeChatRequest = null;
    const pendingChatSaves = new Map();
    let historyLoadEpoch = 0;
    let activeScrollTracker = null;

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
    const btnScrollBottomEl = document.getElementById('btnScrollBottom');
    const mindStatusEl = document.getElementById('mindStatus');
    const personaModalEl = document.getElementById('personaModal');
    const btnClearChatEl = document.getElementById('btnClearChat');
    const btnEditPersonaEl = document.getElementById('btnEditPersona');
    const btnDeletePersonaEl = document.getElementById('btnDeletePersona');
    const btnToggleAllThinkingEl = document.getElementById('btnToggleAllThinking');

    // Init
    async function init() {
      await loadSettingsUI();
      await populateChatModelPicker();
      await updateAccountUI();
      await checkMindStatus();
      await refreshAll();
      setupEventListeners();
      attachCodeCopyButtons();

      // Request desktop notification permission on startup
      if (window.Notification && Notification.permission === 'default') {
        try {
          Notification.requestPermission();
        } catch (_) {}
      }

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
        mindStatusEl.className = 'status-badge offline';
        mindStatusEl.innerHTML = '<span class="status-dot offline" style="background: #ef4444;"></span><span style="color: #ef4444;">Offline</span>';
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
        name: 'Hermes (Personal Agent)',
        title: 'Autonomous System Agent & CLI/Telegram Engine',
        avatar: '⚡',
        emoji: '⚡',
        description: 'Personal Hermes agent executing system commands, terminal, and live sessions.',
        model: 'antigravity-gemini-3.8-flash',
        isDefaultHermes: true,
      };

      // Tab segmentation: In search mode, search both. Otherwise, show current tab
      let allAgents = [];
      if (filter.length > 0) {
        allAgents = [hermesAgent, ...personas];
      } else if (activeSidebarTab === 'hermes') {
        allAgents = [hermesAgent];
      } else {
        allAgents = personas;
      }

      // Section title
      const header = document.createElement('div');
      header.className = 'sidebar-section-title';
      header.innerHTML = `<span>${activeSidebarTab === 'hermes' ? 'Personal Agent' : 'Personas'}</span><span class="count-badge">${allAgents.length}</span>`;
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
            card.classList.toggle('expanded', expandedAgents.has(agent.id));
          }
        };

        const avatarEmoji = agent.avatar || agent.emoji || '🤖';
        cardHeader.innerHTML = `
          <div class="agent-avatar">${escapeHtml(avatarEmoji)}</div>
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

        // Session Capping: Render 5 by default with clean accordion
        const MAX_INITIAL = 5;
        const isShowAll = expandedSessionsAgents.has(agent.id) || filter.length > 0;
        const visibleSessions = isShowAll ? filteredSessions : filteredSessions.slice(0, MAX_INITIAL);

        visibleSessions.forEach(s => {
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

        if (filteredSessions.length > MAX_INITIAL && filter.length === 0) {
          const toggleBtn = document.createElement('div');
          toggleBtn.className = 'btn-show-more-sessions';
          toggleBtn.style.cssText = 'padding: 6px 12px; font-size: 11px; color: var(--ax-primary); cursor: pointer; text-align: center; border-radius: 6px; margin: 4px 10px 8px; background: rgba(99, 102, 241, 0.08); transition: background 0.15s; font-weight: 500;';
          toggleBtn.textContent = isShowAll 
            ? '▲ Show fewer sessions' 
            : `▼ ${filteredSessions.length - MAX_INITIAL} earlier sessions...`;
          toggleBtn.onclick = (e) => {
            e.stopPropagation();
            if (expandedSessionsAgents.has(agent.id)) {
              expandedSessionsAgents.delete(agent.id);
            } else {
              expandedSessionsAgents.add(agent.id);
            }
            renderUnifiedSidebar();
          };
          sessContainer.appendChild(toggleBtn);
        }

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
      window.AxionConferenceUI?.leave();
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

      window.AxionMotion.enter(messagesContainerEl);
      if (activeMode !== mode || activeId !== id) return;
      document.getElementById('sidebar').classList.remove('open');
      if (!document.querySelector('.modal-backdrop.open')) chatInputEl.focus({ preventScroll: true });
    }

    // Load messages
    async function loadMessages(id, mode) {
      const epoch = ++historyLoadEpoch;
      try {
        let messages = [];
        if (mode === 'persona') {
          messages = await invoke('get_persona_chat', { sessionId: id });
        } else {
          messages = await invoke('get_hermes_messages', { sessionId: id });
        }
        if (epoch !== historyLoadEpoch || activeId !== id || activeMode !== mode) return;
        renderMessages(messages, mode, id);
      } catch (e) {
        console.error("Failed to load chat history via Tauri IPC:", e);
      }
    }

    // Render messages in view
    function restoreLiveRequest(mode, id) {
      const requests = new Set([...pendingChatSaves.values(), activeChatRequest].filter(Boolean));
      for (const request of requests) {
        if (request.origin.mode !== mode || request.origin.id !== id) continue;
        messagesContainerEl.querySelector('.empty-state')?.remove();
        // A successful chat-file commit followed by index failure is already on disk.
        // Reuse live rows only if this request isn't in the loaded history.
        messagesContainerEl.querySelectorAll(`[data-request-id="${request.id}"]`).forEach(row=>row.remove());
        messagesContainerEl.append(request.userRow, request.assistantRow);
      }
      if (requests.size) scrollToBottom();
    }

    function renderMessages(messages, mode, id) {
      queueMicrotask(() => { if (activeMode === mode && activeId === id) restoreLiveRequest(mode, id); });
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
              <div class="starter-card" data-action="sendQuickPrompt" data-value="Give me your immediate executive diagnosis of my startup priorities.">
                ⚡ <b>Startup Priorities:</b> Give me your immediate executive diagnosis...
              </div>
              <div class="starter-card" data-action="sendQuickPrompt" data-value="What is the single highest-leverage offer we can create this week?">
                🎯 <b>Offer Strategy:</b> What is the single highest-leverage offer we can create...
              </div>
              <div class="starter-card" data-action="sendQuickPrompt" data-value="Review our execution architecture and point out any bottlenecks.">
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
        restoreLiveRequest(mode, id);
        return;
      }

      messages.forEach(msg => {
        const box = appendMessageRow(msg.role, msg.content, mode, msg.tools, msg.model);
        if (msg.request_id) box.parentElement.dataset.requestId = msg.request_id;
      });

      scrollToBottom();
    }

    function appendMessageRow(role, content, mode, tools, modelId, animate = false) {
      const persona = mode === 'persona' ? personas.find(p => p.id === activeId) : null;
      const session = mode === 'session' ? hermesSessions.find(s => s.id === activeId) : null;
      const row = document.createElement('div');
      row.className = `message-row ${role}`;
      if (animate) row.classList.add('motion-new');

      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      if (role === 'user') {
        avatar.textContent = '👤';
      } else {
        avatar.textContent = mode === 'persona' ? (persona?.emoji || '🤖') : (session?.source === 'telegram' ? '📱' : '⚡');
      }

      const contentBox = document.createElement('div');
      contentBox.className = 'message-content';

      // Explicit Model Badge on top of Assistant Turns for Transparency
      if (role === 'assistant') {
        const effectiveModel = modelId || currentChatModel;
        if (effectiveModel) {
          const badge = document.createElement('div');
          badge.className = 'message-model-badge';
          badge.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 12px; background: rgba(99, 102, 241, 0.1); border: 1px solid rgba(99, 102, 241, 0.22); color: #c7d2fe; margin-bottom: 8px; letter-spacing: 0.2px;';
          badge.innerHTML = `<span>${getModelIcon ? getModelIcon(effectiveModel) : '⚡'}</span> <span class="model-badge-name">${escapeHtml(effectiveModel)}</span>`;
          contentBox.appendChild(badge);
        }
      }
      
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
            <div class="tool-card-header" data-action="toggleKnowledge">
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
          textEl.dir = 'auto'; textEl.innerHTML = marked.parse(content);
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
      if (activeMode === 'conference') return;
      const text = chatInputEl.value.trim();
      if (!text || !activeId) return;
      if (isStreaming && activeChatRequest?.stopped) {
        await activeChatRequest.settled;
        if (chatInputEl.value.trim() === text) return sendMessage();
        return;
      }
      if (isStreaming) return;
      if ([...pendingChatSaves.values()].some(r=>r.origin.id===activeId && r.origin.mode===activeMode)) {
        alert('Retry saving the unsaved response before sending another turn in this chat.'); return;
      }
      const origin = { mode: activeMode, id: activeId, model: currentChatModel,
        name: activePersonaNameEl.textContent || 'Agent' };
      ++historyLoadEpoch; // A pending history load must never erase this new turn.
      chatInputEl.value = '';
      chatInputEl.style.height = 'auto';
      messagesContainerEl.querySelector('.empty-state')?.remove();
      const userBox = appendMessageRow('user', text, origin.mode, null, null, true);
      const assistantContentBox = appendMessageRow('assistant', '', origin.mode, null, origin.model, true);
      const request = { id: crypto.randomUUID(), origin, stopped: false, error: '', saved: false,
        userRow: userBox.parentElement, assistantRow: assistantContentBox.parentElement,
        abort: new AbortController(), savePromise: Promise.resolve(), started: performance.now() };
      let settleRequest;
      request.settled = new Promise(resolve => { settleRequest = resolve; });
      activeChatRequest = request;
      isStreaming = true;
      btnSendEl.style.display = 'none'; btnSendEl.disabled = false;
      btnStopEl.style.display = 'flex'; btnStopEl.disabled = false;
      const isOriginVisible = () => activeMode === origin.mode && activeId === origin.id && assistantContentBox.isConnected;
      const shouldRestoreFocus = () => isOriginVisible() && !document.querySelector('.modal-backdrop.open') &&
        (document.activeElement === chatInputEl || document.activeElement === btnStopEl || document.activeElement === btnSendEl || document.activeElement === document.body);
      const statusEl = document.createElement('span');
      statusEl.className = 'thinking-live-indicator'; statusEl.textContent = 'Waiting for model…';
      assistantContentBox.appendChild(statusEl);
      const thinkingPanel = document.createElement('details'); thinkingPanel.className = 'thinking-accordion live-reasoning';
      thinkingPanel.open = true; thinkingPanel.hidden = true;
      const thinkingSummary = document.createElement('summary'); thinkingSummary.className = 'thinking-header';
      const thinkingBody = document.createElement('div'); thinkingBody.className = 'thinking-content live-reasoning-text';
      thinkingBody.style.cssText = 'white-space:pre-wrap;padding:12px;overflow-wrap:anywhere;max-height:260px;overflow-y:auto';
      thinkingPanel.append(thinkingSummary, thinkingBody); assistantContentBox.appendChild(thinkingPanel);
      const thinkingCtrl = window.AxionStreamUX.createThinkingController({
        onRender: (raw, active) => {
          thinkingPanel.hidden = !raw; thinkingBody.textContent = raw;
          thinkingSummary.textContent = active ? 'Thinking…' : (request.stopped ? 'Thinking (interrupted)' : 'Thinking (complete)');
          thinkingBody.scrollTop = thinkingBody.scrollHeight;
          if (isOriginVisible()) scrollToBottom();
        }
      });
      const responseTextEl = document.createElement('div'); responseTextEl.className = 'live-answer'; responseTextEl.dir = 'auto';
      assistantContentBox.appendChild(responseTextEl);
      let isFirstToken = true;
      const timerInterval = setInterval(() => {
        if (!isFirstToken || !statusEl.isConnected) return;
        statusEl.textContent = `Waiting for model… ${Math.round((performance.now() - request.started) / 1000)}s`;
      }, 1000);
      const persist = async raw => {
        if (request.saved || origin.mode !== 'persona') return;
        const content = raw + (request.stopped ? '\n\n[Stopped by user]' : request.error ? `\n\n[Error: ${request.error}]` : '');
        await invoke('append_persona_turn', { sessionId: origin.id, requestId: request.id, message: text,
          response: content, model: origin.model || null, scope: request.storageScope });
        request.saved = true; pendingChatSaves.delete(request.id);
      };
      const scrollTracker = new window.AxionStreamUX.ScrollTracker({ threshold: 60 });
      activeScrollTracker = scrollTracker;
      const streamCtrl = window.AxionStreamUX.createStreamController({
        onRender: (preparedMarkdown, meta) => {
          if (isFirstToken && preparedMarkdown.length > 0) { isFirstToken = false; clearInterval(timerInterval); statusEl.remove(); }
          let html = marked.parse(preparedMarkdown);
          if (meta.active) html += '<span class="streaming-cursor"></span>';
          else if (request.stopped) html += '<div class="stream-stopped-badge">⏹ Stopped by user</div>';
          responseTextEl.innerHTML = html;
          if (isOriginVisible()) {
            scrollTracker.scrollToBottom(messagesContainerEl);
            btnScrollBottomEl?.classList.remove('visible');
          }
        },
        onDone: (finalRawText, interrupted) => {
          clearInterval(timerInterval); thinkingCtrl.complete(); statusEl.remove();
          responseTextEl.querySelectorAll('pre code').forEach(block => window.hljs?.highlightElement(block));
          attachCodeCopyButtons();
          if (isOriginVisible()) scrollToBottom();
          request.savePromise = persist(finalRawText);
          // Attach a handler immediately; finally awaits the original promise and reports errors.
          request.savePromise.catch(() => {});
        }
      });
      request.controller = streamCtrl; activeStreamController = streamCtrl; abortController = request.abort;
      request.stop = async () => {
        if (request.stopped || !streamCtrl.isActive()) return;
        request.stopped = true; btnStopEl.disabled = true;
        streamCtrl.stop(); request.abort.abort();
        try { await invoke('cancel_chat_stream', { requestId: request.id }); }
        catch (error) { console.warn('Cancellation failed', String(error)); }
      };
      const receive = event => {
        if (!streamCtrl.isActive() || request.stopped) return;
        if (event.type === 'thinking') {
          if (statusEl.isConnected) {
            statusEl.remove();
            clearInterval(timerInterval);
          }
          thinkingCtrl.append(event.delta);
        }
        else if (event.type === 'token') {
          if (statusEl.isConnected) {
            statusEl.remove();
            clearInterval(timerInterval);
          }
          streamCtrl.append(event.delta);
        }
        else if (event.type === 'error') {
          request.error = String(event.message || 'Generation failed'); streamCtrl.complete();
          const errorEl = document.createElement('div'); errorEl.className = 'stream-error'; errorEl.textContent = request.error;
          responseTextEl.appendChild(errorEl);
        } else if (event.type === 'done') {
          if (!streamCtrl.getText()) request.error = 'The model returned no answer text.';
          streamCtrl.complete();
          if (origin.mode === 'session') fetchHermesSessions();
          if (!request.error) triggerResponseNotification(origin.name, streamCtrl.getText());
        }
      };
      try {
        request.storageScope = await invoke('get_chat_storage_scope');
        if (text.startsWith('/')) {
          let command = text.slice(1);
          if (command.split(' ')[0] === 'model') command = command.trim() === 'model' ? 'config get model' : 'config set model ' + command.split(' ').slice(1).join(' ');
          const output = await invoke('execute_hermes_command', { command });
          streamCtrl.append(String(output || 'Command completed.')); streamCtrl.complete();
        } else {
          const ChannelClass = window.__TAURI__?.core?.Channel || window.__TAURI_INTERNALS__?.Channel;
          if (ChannelClass) {
            const channel = new ChannelClass(); channel.onmessage = receive;
            if (origin.mode === 'session') await invoke('stream_hermes_chat', {sessionId:origin.id,message:text,onEvent:channel,requestId:request.id});
            else {
              const persona = personas.find(p=>p.id===origin.id || origin.id.startsWith(p.id + '_'));
              await invoke('stream_persona_chat', {personaId:origin.id,message:text,systemPrompt:persona?.system_prompt || '',model:origin.model || persona?.model || null,onEvent:channel,requestId:request.id});
            }
          } else {
            const endpoint = origin.mode === 'persona' ? `/api/personas/${origin.id}/chat` : `/api/sessions/${origin.id}/chat`;
            const response = await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text}),signal:request.abort.signal});
            if (!response.ok) throw new Error(`Chat HTTP ${response.status}`);
            const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
            const line=raw=>{if(!raw.startsWith('data:'))return;const data=raw.slice(5).trim();if(data==='[DONE]'){receive({type:'done'});return;}if(!data)return;const e=JSON.parse(data);const d=e.choices?.[0]?.delta;
              if(e.error)receive({type:'error',message:typeof e.error==='string'?e.error:e.error.message});
              else {if(d?.reasoning_content)receive({type:'thinking',delta:d.reasoning_content});if(d?.content||typeof e.delta==='string')receive({type:'token',delta:d?.content||e.delta});}};
            while(!request.stopped){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){line(buffer.slice(0,end).trim());buffer=buffer.slice(end+1);}}
            buffer+=decoder.decode();if(buffer.trim())line(buffer.trim());
          }
        }
        if (streamCtrl.isActive()) receive({type:'done'});
      } catch (error) {
        if (!request.stopped) receive({type:'error',message:String(error?.message || error)});
      } finally {
        clearInterval(timerInterval); thinkingCtrl.complete(); statusEl.remove();
        if (streamCtrl.isActive()) streamCtrl.complete();
        try { await request.savePromise; }
        catch (error) {
          pendingChatSaves.set(request.id, request);
          const el=document.createElement('div');el.className='stream-error';el.textContent='Response is not saved. Keep the app open. ';
          const retry=document.createElement('button');retry.type='button';retry.textContent='Retry saving';
          retry.onclick=async()=>{retry.disabled=true;try {await persist(streamCtrl.getText());el.remove();}catch(e){retry.disabled=false;retry.textContent='Retry saving (still unavailable)';}};
          el.appendChild(retry);assistantContentBox.appendChild(el);
        }
        if (activeChatRequest === request) {
          const restoreFocus = shouldRestoreFocus();
          activeChatRequest = null; isStreaming = false; activeStreamController = null; abortController = null;
          btnSendEl.style.display='flex'; btnSendEl.disabled=false;btnStopEl.style.display='none';btnStopEl.disabled=false;
          if (restoreFocus) chatInputEl.focus({preventScroll:true});
          settleRequest();
        }
      }
    }

    function sendQuickPrompt(promptText) {
      chatInputEl.value = promptText;
      sendMessage();
    }

    // --- Web Audio Notification Chime (Zero External Files) ---
    function playNotificationChime() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;
        
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        gain1.gain.setValueAtTime(0.08, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.00, now + 0.08); // A5
        gain2.gain.setValueAtTime(0.08, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.5);
      } catch (_) {}
    }

    // --- Desktop & Toast Notification Trigger ---
    async function triggerResponseNotification(agentName, textContent) {
      const cleanSnippet = (textContent || '')
        .replace(/[*#_`>]/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 140);

      // Suppress notifications and chime on empty responses or error states
      if (!cleanSnippet || cleanSnippet.startsWith('[Empty response') || cleanSnippet.startsWith('[Error')) {
        return;
      }

      playNotificationChime();

      const title = `⚡ ${agentName || 'Axion Mind'} finished`;
      const body = cleanSnippet;

      // Prioritize native Windows WinRT toast via Rust IPC; avoid duplicate web notifications
      let nativeDelivered = false;
      try {
        await invoke('show_desktop_notification', { title, body });
        nativeDelivered = true;
      } catch (_) {}

      // Fallback: Web Notification API (only if native toast did not succeed)
      if (!nativeDelivered && window.Notification) {
        if (Notification.permission === 'granted') {
          try {
            const n = new Notification(title, {
              body: body,
              icon: 'assets/app_logo.png'
            });
            n.onclick = () => { window.focus(); n.close(); };
          } catch (_) {}
        } else if (Notification.permission === 'default') {
          Notification.requestPermission();
        }
      }
    }

    // --- 1-Click Code Block Copy Button ---
    function attachCodeCopyButtons() {
      document.querySelectorAll('pre code').forEach((codeBlock) => {
        const pre = codeBlock.parentElement;
        if (pre && !pre.querySelector('.btn-copy-code')) {
          const copyBtn = document.createElement('button');
          copyBtn.className = 'btn-copy-code';
          copyBtn.textContent = '📋 Copy';
          copyBtn.style.cssText = 'position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #cbd5e1; font-size: 11px; padding: 3px 8px; cursor: pointer; transition: all 0.2s; z-index: 10;';
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(codeBlock.innerText);
            copyBtn.textContent = '✓ Copied!';
            copyBtn.style.color = '#10b981';
            setTimeout(() => {
              copyBtn.textContent = '📋 Copy';
              copyBtn.style.color = '#cbd5e1';
            }, 2000);
          };
          pre.style.position = 'relative';
          pre.appendChild(copyBtn);
        }
      });
    }

    // Stop Streaming
    btnStopEl.onclick = () => activeChatRequest?.stop();

    // Clear Chat
    btnClearChatEl.onclick = async () => {
      if (!activeId || activeMode !== 'persona') return;
      if (activeChatRequest?.origin.id === activeId || [...pendingChatSaves.values()].some(r=>r.origin.id===activeId)) { alert('Finish or save the active response before clearing this chat.'); return; }
      if (!confirm("Are you sure you want to clear chat history for this conversation?")) return;
      try {
        await invoke('save_persona_chat', { sessionId: activeId, messages: [] });
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
      const chipLabel = document.getElementById('thinkingChipLabel');
      if (chipLabel) {
        chipLabel.textContent = anyOpen ? 'Thinking: Hidden' : 'Thinking: Open';
      }
      btnToggleAllThinkingEl.style.borderColor = anyOpen ? 'var(--ax-border)' : 'var(--ax-primary)';
      btnToggleAllThinkingEl.style.color = anyOpen ? 'var(--ax-text-muted)' : 'var(--ax-primary)';
    };

    btnEditPersonaEl.onclick = () => {
      if (activeMode !== 'persona') return;
      const targetId = activeAgentId || (activeId && activeId.includes('_') ? activeId.substring(0, activeId.lastIndexOf('_')) : activeId);
      const persona = personas.find(p => p.id === targetId || p.id === activeId || p.id === activeAgentId);
      if (!persona) return;

      document.getElementById('modalTitle').textContent = 'Edit Persona';
      document.getElementById('modalPersonaId').value = persona.id;
      document.getElementById('modalPersonaName').value = persona.name;
      document.getElementById('modalPersonaTitle').value = persona.title || '';
      document.getElementById('modalPersonaDesc').value = persona.description || '';
      document.getElementById('modalPersonaEmoji').value = persona.avatar || persona.emoji || '🤖';
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
    const hermesModelSelectEl = document.getElementById('hermesModelSelect');
    const hermesModelInputEl = document.getElementById('hermesModelInput');
    const hermesManualModelContainer = document.getElementById('hermesManualModelContainer');
    const hermesModelStatusBadgeEl = document.getElementById('hermesModelStatusBadge');
    const btnRefreshModelsEl = document.getElementById('btnRefreshModels');

    async function loadHermesModelsDropdown() {
      hermesModelStatusBadgeEl.textContent = 'Scanning available AIs...';
      hermesModelStatusBadgeEl.style.color = 'var(--ax-text-muted)';

      try {
        const [models, configOut] = await Promise.allSettled([
          invoke('get_connected_hermes_models'),
          invoke('execute_hermes_command', { command: 'config get model' })
        ]);

        let modelList = [];
        if (models.status === 'fulfilled' && Array.isArray(models.value)) {
          modelList = models.value;
        }

        let activeModel = '';
        if (configOut.status === 'fulfilled' && typeof configOut.value === 'string') {
          hermesConsoleOutputEl.textContent = configOut.value.trim();
          const match = configOut.value.match(new RegExp('default:\\s*([^\
\\n]+)'));
          if (match && match[1]) {
            activeModel = match[1].trim().replace(/^"|"$/g, '');
          }
        }

        // Group models by provider
        const groups = {};
        modelList.forEach(m => {
          const prov = m.provider || 'Other Connected';
          if (!groups[prov]) groups[prov] = [];
          groups[prov].push(m);
        });

        hermesModelSelectEl.innerHTML = '';
        let foundActive = false;

        for (const [providerName, items] of Object.entries(groups)) {
          const optgroup = document.createElement('optgroup');
          optgroup.label = `⚡ ${providerName}`;
          items.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            if (activeModel && (m.id === activeModel || m.name === activeModel)) {
              opt.selected = true;
              foundActive = true;
            }
            optgroup.appendChild(opt);
          });
          hermesModelSelectEl.appendChild(optgroup);
        }

        // Add custom manual option
        const customGroup = document.createElement('optgroup');
        customGroup.label = '🔧 Custom / Other';
        const customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = '✏️ Enter Custom Model...';
        customGroup.appendChild(customOpt);
        hermesModelSelectEl.appendChild(customGroup);

        if (!foundActive && activeModel) {
          const currentOpt = document.createElement('option');
          currentOpt.value = activeModel;
          currentOpt.textContent = `★ ${activeModel} (Current Active)`;
          currentOpt.selected = true;
          hermesModelSelectEl.insertBefore(currentOpt, hermesModelSelectEl.firstChild);
        }

        hermesManualModelContainer.style.display = hermesModelSelectEl.value === '__custom__' ? 'block' : 'none';
        if (hermesModelSelectEl.value !== '__custom__') {
          hermesModelInputEl.value = hermesModelSelectEl.value;
        }

        hermesModelStatusBadgeEl.textContent = `${modelList.length} AIs Connected`;
        hermesModelStatusBadgeEl.style.color = '#10b981';
      } catch (e) {
        hermesModelStatusBadgeEl.textContent = 'Detection error';
        hermesModelStatusBadgeEl.style.color = '#ef4444';
        hermesConsoleOutputEl.textContent = `Error fetching connected models: ${e}`;
      }
    }

    hermesModelSelectEl.onchange = () => {
      if (hermesModelSelectEl.value === '__custom__') {
        hermesManualModelContainer.style.display = 'block';
        hermesModelInputEl.focus();
      } else {
        hermesManualModelContainer.style.display = 'none';
        hermesModelInputEl.value = hermesModelSelectEl.value;
      }
    };

    btnRefreshModelsEl.onclick = loadHermesModelsDropdown;

    document.getElementById('btnHermesControl').onclick = async () => {
      hermesControlModalEl.classList.add('open');
      await loadHermesModelsDropdown();
    };

    document.getElementById('btnCloseHermesModal').onclick = () => {
      hermesControlModalEl.classList.remove('open');
    };

    window.setControlModel = (modelName) => {
      hermesModelInputEl.value = modelName;
      let matched = false;
      for (let i = 0; i < hermesModelSelectEl.options.length; i++) {
        if (hermesModelSelectEl.options[i].value === modelName) {
          hermesModelSelectEl.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched) {
        hermesModelSelectEl.value = '__custom__';
        hermesManualModelContainer.style.display = 'block';
      } else {
        hermesManualModelContainer.style.display = 'none';
      }
    };

    document.getElementById('btnApplyModel').onclick = async () => {
      const selected = hermesModelSelectEl.value === '__custom__'
        ? hermesModelInputEl.value.trim()
        : hermesModelSelectEl.value.trim();

      if (!selected) {
        alert('Please select or enter a model name');
        return;
      }

      hermesConsoleOutputEl.textContent = `Applying model: ${selected}...`;
      try {
        const res = await invoke('execute_hermes_command', { command: `config set model ${selected}` });
        hermesConsoleOutputEl.textContent = res.trim() || `Model switched successfully to: ${selected}`;
        await loadHermesModelsDropdown();
      } catch (err) {
        hermesConsoleOutputEl.textContent = `Failed to set model: ${err}`;
      }
    };

    // --- ChatGPT-Style Floating Chat Model Picker ---
    let currentChatModel = 'antigravity-gemini-3.8-flash';
    const btnChatModelPicker = document.getElementById('btnChatModelPicker');
    const chatModelDropdownMenu = document.getElementById('chatModelDropdownMenu');
    const chatModelPickerLabel = document.getElementById('chatModelPickerLabel');
    const chatModelPickerIcon = document.getElementById('chatModelPickerIcon');

    function formatModelName(id) {
      if (!id) return 'Select Model';
      const cleanMap = {
        'antigravity-gemini-3.8-flash': 'Gemini 3.8 Flash',
        'antigravity-gemini-3.7-flash': 'Gemini 3.7 Flash',
        'antigravity-gemini-3.6-flash': 'Gemini 3.6 Flash',
        'antigravity-gemini-3.5-flash': 'Gemini 3.5 Flash',
        'antigravity-gemini-3.1-pro': 'Gemini 3.1 Pro',
        'antigravity-claude-sonnet-4-6-thinking': 'Claude Sonnet 3.7 Thinking',
        'antigravity-claude-opus-4-6-thinking': 'Claude Opus 3.7 Thinking',
        'antigravity-gemini-3.1-flash-image': 'Gemini 3.1 Vision',
        'antigravity-gpt-oss-120b-medium': 'GPT OSS 120B',
        'gemini-4-argon': 'Gemini 4 Argon',
        'web-argon': 'Gemini Web Argon',
        'gemini-web': 'Gemini Web',
        'deepseek-v4': 'DeepSeek V4',
        'deepseek-chat': 'DeepSeek Chat',
        'deepseek-reasoner': 'DeepSeek Reasoner',
        'ag-gemini': 'Gemini (Antigravity)',
        'argon': 'Argon (Web)',
        'gpt-lan': 'GPT LAN',
        'ant-6-sol': 'Claude Solution'
      };
      if (cleanMap[id]) return cleanMap[id];
      return id.replace(/^antigravity-/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    function getModelIcon(modelId) {
      if (!modelId) return '🤖';
      const lower = modelId.toLowerCase();
      if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('opus')) return '🧠';
      if (lower.includes('gemini') || lower.includes('argon') || lower.includes('flash')) return '⚡';
      if (lower.includes('deepseek') || lower.includes('reasoner')) return '⚡';
      if (lower.includes('gpt') || lower.includes('openai')) return '✨';
      return '🤖';
    }

    function setChatModel(modelId, displayName) {
      currentChatModel = modelId;
      const formatted = displayName || formatModelName(modelId);
      chatModelPickerLabel.textContent = formatted;
      chatModelPickerIcon.textContent = getModelIcon(modelId);

      document.querySelectorAll('.chat-model-menu-item').forEach(el => {
        const isMatch = el.getAttribute('data-model') === modelId;
        el.style.background = isMatch ? 'rgba(99, 102, 241, 0.2)' : 'transparent';
        const check = el.querySelector('.model-check');
        if (check) check.style.opacity = isMatch ? '1' : '0';
      });

      document.querySelectorAll('.quick-model-btn').forEach(btn => {
        const isActive = btn.dataset.value === modelId;
        btn.style.borderColor = isActive ? 'var(--ax-primary)' : 'var(--ax-border)';
        btn.style.color = isActive ? 'var(--ax-primary)' : 'var(--ax-text-muted)';
      });

      chatModelDropdownMenu.style.display = 'none';

      if (typeof window.setControlModel === 'function') {
        window.setControlModel(modelId);
      }
    }

    window.quickSelectChatModel = (modelId) => {
      setChatModel(modelId);
    };

    let modelSearchQuery = '';

    async function populateChatModelPicker() {
      try {
        const models = await invoke('get_connected_hermes_models');
        if (!models || models.length === 0) return;

        chatModelDropdownMenu.innerHTML = '';

        // Search input
        const searchBox = document.createElement('div');
        searchBox.style.cssText = 'padding: 2px 2px 6px; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 6px;';
        searchBox.innerHTML = `
          <input type="text" id="modelFilterInput" placeholder="🔍 Search or filter any model..." value="${escapeHtml(modelSearchQuery)}" style="width: 100%; box-sizing: border-box; background: rgba(255,255,255,0.06); border: 1px solid var(--ax-border); border-radius: 8px; padding: 6px 10px; font-size: 11.5px; color: var(--ax-text); outline: none;">
        `;
        chatModelDropdownMenu.appendChild(searchBox);

        const filterInput = searchBox.querySelector('#modelFilterInput');
        filterInput.onclick = (e) => e.stopPropagation();
        filterInput.onkeydown = (e) => e.stopPropagation();
        filterInput.oninput = (e) => {
          modelSearchQuery = e.target.value.toLowerCase().trim();
          renderFilteredModels();
        };

        // Scrollable container for list
        const listContainer = document.createElement('div');
        listContainer.id = 'modelListItemsContainer';
        listContainer.style.cssText = 'max-height: 280px; overflow-y: auto;';
        chatModelDropdownMenu.appendChild(listContainer);

        function renderFilteredModels() {
          listContainer.innerHTML = '';

          const filtered = models.filter(m => {
            if (!modelSearchQuery) return true;
            const name = (m.name || '').toLowerCase();
            const id = (m.id || '').toLowerCase();
            const friendly = formatModelName(m.id).toLowerCase();
            return name.includes(modelSearchQuery) || id.includes(modelSearchQuery) || friendly.includes(modelSearchQuery);
          });

          if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--ax-text-muted); font-size: 11px;">No models match your search.</div>';
          } else {
            // Group models by clean category
            const groups = {};
            filtered.forEach(m => {
              let prov = m.provider || 'Other Models';
              if (prov.includes('8766')) prov = 'Antigravity / OAuth Models';
              else if (prov.includes('8768')) prov = 'Gemini Web Models';
              else if (prov.includes('8769')) prov = 'DeepSeek Web Models';
              else if (prov.includes('Alias')) prov = 'Configured Aliases';

              if (!groups[prov]) groups[prov] = [];
              groups[prov].push(m);
            });

            for (const [groupName, items] of Object.entries(groups)) {
              const groupHeader = document.createElement('div');
              groupHeader.style.cssText = 'font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ax-text-muted); padding: 6px 8px 3px;';
              groupHeader.textContent = groupName;
              listContainer.appendChild(groupHeader);

              items.forEach(m => {
                const item = document.createElement('div');
                item.className = 'chat-model-menu-item';
                item.setAttribute('data-model', m.id);
                item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 7px 10px; border-radius: 8px; cursor: pointer; transition: all 0.15s; margin-bottom: 2px;';

                const isSelected = m.id === currentChatModel;
                if (isSelected) {
                  item.style.background = 'rgba(99, 102, 241, 0.18)';
                  item.style.border = '1px solid rgba(99, 102, 241, 0.35)';
                } else {
                  item.style.border = '1px solid transparent';
                }

                const friendlyName = formatModelName(m.id);
                item.innerHTML = `
                  <div style="display: flex; align-items: center; gap: 9px; overflow: hidden; min-width: 0;">
                    <span style="font-size: 14px; flex-shrink: 0;">${getModelIcon(m.id)}</span>
                    <div style="display: flex; flex-direction: column; min-width: 0;">
                      <span style="font-size: 12px; font-weight: ${isSelected ? '600' : '500'}; color: var(--ax-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(friendlyName)}</span>
                      <span style="font-size: 9.5px; color: var(--ax-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.75;">${escapeHtml(m.id)}</span>
                    </div>
                  </div>
                  <span class="model-check" style="color: #818cf8; font-weight: bold; font-size: 12px; opacity: ${isSelected ? '1' : '0'}; flex-shrink: 0; margin-left: 6px;">✓</span>
                `;

                item.onmouseenter = () => {
                  if (item.getAttribute('data-model') !== currentChatModel) {
                    item.style.background = 'rgba(255, 255, 255, 0.05)';
                  }
                };
                item.onmouseleave = () => {
                  if (item.getAttribute('data-model') !== currentChatModel) {
                    item.style.background = 'transparent';
                  }
                };

                item.onclick = (e) => {
                  e.stopPropagation();
                  setChatModel(m.id, friendlyName);
                };

                listContainer.appendChild(item);
              });
            }
          }
        }

        renderFilteredModels();

        // Custom Model Direct Input row at bottom
        const customContainer = document.createElement('div');
        customContainer.style.cssText = 'border-top: 1px solid rgba(255,255,255,0.08); padding-top: 8px; margin-top: 6px;';
        customContainer.innerHTML = `
          <div style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: var(--ax-text-muted); margin-bottom: 4px; padding-left: 2px;">Use Custom Model ID</div>
          <div style="display: flex; gap: 6px;">
            <input type="text" id="customModelDirectInput" placeholder="e.g. claude-3-7-sonnet" style="flex: 1; min-width: 0; background: rgba(255,255,255,0.06); border: 1px solid var(--ax-border); border-radius: 6px; padding: 5px 8px; font-size: 11px; color: var(--ax-text); outline: none;">
            <button type="button" id="btnApplyCustomDirectModel" style="background: var(--ax-primary); color: var(--ax-on-primary); border: none; border-radius: 6px; padding: 5px 12px; font-size: 11px; font-weight: 600; cursor: pointer; white-space: nowrap;">Set</button>
          </div>
        `;
        customContainer.onclick = (e) => e.stopPropagation();
        chatModelDropdownMenu.appendChild(customContainer);

        const customInput = customContainer.querySelector('#customModelDirectInput');
        const customBtn = customContainer.querySelector('#btnApplyCustomDirectModel');
        const applyCustom = (e) => {
          e.stopPropagation();
          const val = customInput.value.trim();
          if (val) {
            setChatModel(val, val);
          }
        };
        customBtn.onclick = applyCustom;
        customInput.onkeydown = (e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            applyCustom(e);
          }
        };

        setTimeout(() => filterInput.focus(), 60);
      } catch (err) {
        console.error('Failed to populate chat model picker:', err);
      }
    }

    btnChatModelPicker.onclick = (e) => {
      e.stopPropagation();
      const isVisible = chatModelDropdownMenu.style.display === 'block';
      if (!isVisible) {
        populateChatModelPicker();
        chatModelDropdownMenu.style.display = 'block';
      } else {
        chatModelDropdownMenu.style.display = 'none';
      }
    };

    document.addEventListener('click', (e) => {
      if (!chatModelDropdownMenu.contains(e.target) && e.target !== btnChatModelPicker) {
        chatModelDropdownMenu.style.display = 'none';
      }
    });

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

    // --- Connection Settings Modal Logic ---
    const connectionSettingsModalEl = document.getElementById('connectionSettingsModal');
    const btnOpenSettingsEl = document.getElementById('btnOpenSettings');
    const sidebarConnPillEl = document.getElementById('sidebarConnPill');
    const btnCloseSettingsModalEl = document.getElementById('btnCloseSettingsModal');
    const btnCancelSettingsEl = document.getElementById('btnCancelSettings');
    const btnSaveSettingsEl = document.getElementById('btnSaveSettings');
    const btnTestConnEl = document.getElementById('btnTestConn');
    const cfgTestStatusEl = document.getElementById('cfgTestStatus');

    const btnModeLocalHermes = document.getElementById('btnModeLocalHermes');
    const btnModeDirectCloud = document.getElementById('btnModeDirectCloud');
    const btnModeCustomGateway = document.getElementById('btnModeCustomGateway');

    const sectionLocalHermes = document.getElementById('sectionLocalHermes');
    const sectionDirectCloud = document.getElementById('sectionDirectCloud');
    const sectionCustomGateway = document.getElementById('sectionCustomGateway');

    let currentConfig = {
      mode: 'hermes_local',
      hermes_gateway_url: 'http://127.0.0.1:8642',
      hermes_auth_token: '',
      cloud_provider: 'gemini',
      cloud_api_key: '',
      cloud_model: 'google/gemini-2.0-flash-001',
      custom_url: 'http://127.0.0.1:8766/v1/chat/completions',
      custom_auth_token: '',
      custom_model: 'antigravity-gemini-3.8-flash'
    };

    function setSettingsMode(mode) {
      currentConfig.mode = mode;
      btnModeLocalHermes.style.background = mode === 'hermes_local' ? 'var(--ax-primary)' : 'var(--ax-surface)';
      btnModeLocalHermes.style.color = mode === 'hermes_local' ? '#fff' : 'var(--ax-text)';
      btnModeDirectCloud.style.background = mode === 'direct_cloud' ? 'var(--ax-primary)' : 'var(--ax-surface)';
      btnModeDirectCloud.style.color = mode === 'direct_cloud' ? '#fff' : 'var(--ax-text)';
      btnModeCustomGateway.style.background = mode === 'custom_gateway' ? 'var(--ax-primary)' : 'var(--ax-surface)';
      btnModeCustomGateway.style.color = mode === 'custom_gateway' ? '#fff' : 'var(--ax-text)';

      sectionLocalHermes.style.display = mode === 'hermes_local' ? 'flex' : 'none';
      sectionDirectCloud.style.display = mode === 'direct_cloud' ? 'flex' : 'none';
      sectionCustomGateway.style.display = mode === 'custom_gateway' ? 'flex' : 'none';
    }

    async function loadSettingsUI() {
      try {
        const cfg = await invoke('get_connection_config');
        if (cfg) {
          currentConfig = cfg;
          document.getElementById('cfgHermesUrl').value = cfg.hermes_gateway_url || 'http://127.0.0.1:8642';
          document.getElementById('cfgHermesToken').value = cfg.hermes_auth_token || '';
          document.getElementById('cfgCloudProvider').value = cfg.cloud_provider || 'gemini';
          document.getElementById('cfgCloudKey').value = cfg.cloud_api_key || '';
          document.getElementById('cfgCloudModel').value = cfg.cloud_model || 'google/gemini-2.0-flash-001';
          document.getElementById('cfgCustomUrl').value = cfg.custom_url || 'http://127.0.0.1:8766/v1/chat/completions';
          document.getElementById('cfgCustomToken').value = cfg.custom_auth_token || '';
          document.getElementById('cfgCustomModel').value = cfg.custom_model || 'antigravity-gemini-3.8-flash';
          document.getElementById('cfgStorageDir').value = cfg.custom_storage_dir || '';
          setSettingsMode(cfg.mode || 'hermes_local');
          updateSidebarConnIndicator();
        }
      } catch (e) {
        console.error('Failed to load connection config:', e);
      }
    }

    function updateSidebarConnIndicator() {
      const modeText = document.getElementById('sidebarConnMode');
      const dot = document.getElementById('sidebarConnDot');
      if (!modeText || !dot) return;
      if (currentConfig.mode === 'direct_cloud') {
        modeText.textContent = `Cloud (${(currentConfig.cloud_provider || 'ai').toUpperCase()})`;
        dot.style.background = '#10b981';
      } else if (currentConfig.mode === 'custom_gateway') {
        modeText.textContent = 'Custom Server';
        dot.style.background = '#8b5cf6';
      } else {
        modeText.textContent = 'Local Hermes';
        dot.style.background = '#3b82f6';
      }
    }

    function openSettingsModal() {
      if (cfgTestStatusEl) cfgTestStatusEl.style.display = 'none';
      if (connectionSettingsModalEl) connectionSettingsModalEl.classList.add('open');
      loadSettingsUI();
    }

    function closeSettingsModal() {
      if (connectionSettingsModalEl) connectionSettingsModalEl.classList.remove('open');
    }

    if (btnOpenSettingsEl) btnOpenSettingsEl.onclick = openSettingsModal;
    if (sidebarConnPillEl) sidebarConnPillEl.onclick = openSettingsModal;
    const mindStatusElBtn = document.getElementById('mindStatus');
    if (mindStatusElBtn) mindStatusElBtn.onclick = openSettingsModal;
    if (btnCloseSettingsModalEl) btnCloseSettingsModalEl.onclick = closeSettingsModal;
    if (btnCancelSettingsEl) btnCancelSettingsEl.onclick = closeSettingsModal;

    // Click outside backdrop to close any modal
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.remove('open');
        }
      });
    });

    // Universal Escape key listener to close active modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
      }
    });

    btnModeLocalHermes.onclick = () => setSettingsMode('hermes_local');
    btnModeDirectCloud.onclick = () => setSettingsMode('direct_cloud');
    btnModeCustomGateway.onclick = () => setSettingsMode('custom_gateway');

    document.getElementById('cfgCloudProvider').onchange = (e) => {
      const p = e.target.value;
      const modelInput = document.getElementById('cfgCloudModel');
      if (p === 'gemini') modelInput.value = 'gemini-2.0-flash';
      else if (p === 'openai') modelInput.value = 'gpt-4o';
      else if (p === 'groq') modelInput.value = 'llama-3.3-70b-versatile';
      else if (p === 'openrouter') modelInput.value = 'anthropic/claude-3.5-sonnet';
    };

    btnSaveSettingsEl.onclick = async () => {
      currentConfig.hermes_gateway_url = document.getElementById('cfgHermesUrl').value.trim();
      currentConfig.hermes_auth_token = document.getElementById('cfgHermesToken').value.trim();
      currentConfig.cloud_provider = document.getElementById('cfgCloudProvider').value;
      currentConfig.cloud_api_key = document.getElementById('cfgCloudKey').value.trim();
      currentConfig.cloud_model = document.getElementById('cfgCloudModel').value.trim();
      currentConfig.custom_url = document.getElementById('cfgCustomUrl').value.trim();
      currentConfig.custom_auth_token = document.getElementById('cfgCustomToken').value.trim();
      currentConfig.custom_model = document.getElementById('cfgCustomModel').value.trim();
      
      const customStorage = document.getElementById('cfgStorageDir').value.trim();
      currentConfig.custom_storage_dir = customStorage ? customStorage : null;

      try {
        await invoke('save_connection_config', { config: currentConfig });
        updateSidebarConnIndicator();
        closeSettingsModal();
        await fetchPersonas();
        renderUnifiedSidebar();
      } catch (err) {
        alert('Failed to save settings: ' + err);
      }
    };

    // Browse Folder for Cloud / Persistent Storage
    document.getElementById('btnPickStorageDir').onclick = async () => {
      try {
        const folder = await invoke('pick_folder');
        if (folder) {
          document.getElementById('cfgStorageDir').value = folder;
        }
      } catch (e) {
        console.error('Error picking folder:', e);
      }
    };

    btnTestConnEl.onclick = async () => {
      cfgTestStatusEl.style.display = 'block';
      cfgTestStatusEl.style.background = 'rgba(59, 130, 246, 0.15)';
      cfgTestStatusEl.style.color = '#93c5fd';
      cfgTestStatusEl.style.border = '1px solid rgba(59, 130, 246, 0.3)';
      cfgTestStatusEl.textContent = '⏳ Testing connection ping...';

      const probeConfig = {
        mode: currentConfig.mode,
        hermes_gateway_url: document.getElementById('cfgHermesUrl').value.trim(),
        hermes_auth_token: document.getElementById('cfgHermesToken').value.trim(),
        cloud_provider: document.getElementById('cfgCloudProvider').value,
        cloud_api_key: document.getElementById('cfgCloudKey').value.trim(),
        cloud_model: document.getElementById('cfgCloudModel').value.trim(),
        custom_url: document.getElementById('cfgCustomUrl').value.trim(),
        custom_auth_token: document.getElementById('cfgCustomToken').value.trim(),
        custom_model: document.getElementById('cfgCustomModel').value.trim()
      };

      try {
        const res = await invoke('test_connection', { config: probeConfig });
        cfgTestStatusEl.style.background = 'rgba(16, 185, 129, 0.15)';
        cfgTestStatusEl.style.color = '#a7f3d0';
        cfgTestStatusEl.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        cfgTestStatusEl.textContent = '✅ ' + res;
      } catch (err) {
        cfgTestStatusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        cfgTestStatusEl.style.color = '#fca5a5';
        cfgTestStatusEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        cfgTestStatusEl.textContent = '❌ ' + err;
      }
    };

    // 1-Click Backup Export & Restore Logic
    const btnExportBackupEl = document.getElementById('btnExportBackup');
    const btnRestoreBackupEl = document.getElementById('btnRestoreBackup');
    const backupFeedbackEl = document.getElementById('backupFeedback');

    btnExportBackupEl.onclick = async () => {
      backupFeedbackEl.style.display = 'block';
      backupFeedbackEl.style.background = 'rgba(59, 130, 246, 0.15)';
      backupFeedbackEl.style.color = '#93c5fd';
      backupFeedbackEl.textContent = '⏳ Creating compressed backup zip archive...';
      try {
        const zipFile = await invoke('export_customer_backup');
        backupFeedbackEl.style.background = 'rgba(16, 185, 129, 0.15)';
        backupFeedbackEl.style.color = '#a7f3d0';
        backupFeedbackEl.textContent = '✅ Backup saved to: ' + zipFile;
      } catch (err) {
        backupFeedbackEl.style.background = 'rgba(239, 68, 68, 0.15)';
        backupFeedbackEl.style.color = '#fca5a5';
        backupFeedbackEl.textContent = '❌ Backup failed: ' + err;
      }
    };

    btnRestoreBackupEl.onclick = async () => {
      try {
        const selectedZip = await invoke('pick_backup_zip_file');
        if (!selectedZip) return;

        if (!confirm(`Are you sure you want to restore data from:\n${selectedZip}\n\nThis replaces matching personas, chats, and conference room files. Unlisted files are kept.`)) {
          return;
        }

        backupFeedbackEl.style.display = 'block';
        backupFeedbackEl.style.background = 'rgba(59, 130, 246, 0.15)';
        backupFeedbackEl.style.color = '#93c5fd';
        backupFeedbackEl.textContent = '⏳ Restoring backup archive...';

        const restoredCount = await invoke('restore_customer_backup', { zipPath: selectedZip });
        backupFeedbackEl.style.background = 'rgba(16, 185, 129, 0.15)';
        backupFeedbackEl.style.color = '#a7f3d0';
        backupFeedbackEl.textContent = `✅ Successfully restored ${restoredCount} files! Refreshing...`;

        setTimeout(async () => {
          await fetchPersonas();
          renderUnifiedSidebar();
          closeSettingsModal();
        }, 1500);
      } catch (err) {
        backupFeedbackEl.style.display = 'block';
        backupFeedbackEl.style.background = 'rgba(239, 68, 68, 0.15)';
        backupFeedbackEl.style.color = '#fca5a5';
        backupFeedbackEl.textContent = '❌ Restore failed: ' + err;
      }
    };

    // --- Cloud Account & Sync Modal Logic ---
    const authSyncModalEl = document.getElementById('authSyncModal');
    const btnOpenAuthModalEl = document.getElementById('btnOpenAuthModal');
    const sidebarAccountPillEl = document.getElementById('sidebarAccountPill');
    const btnCloseAuthModalEl = document.getElementById('btnCloseAuthModal');
    const tabLoginEl = document.getElementById('tabLogin');
    const tabRegisterEl = document.getElementById('tabRegister');
    const btnSubmitAuthEl = document.getElementById('btnSubmitAuth');
    const authEmailEl = document.getElementById('authEmail');
    const authPasswordEl = document.getElementById('authPassword');
    const authFeedbackEl = document.getElementById('authFeedback');
    const authLoggedInViewEl = document.getElementById('authLoggedInView');
    const authLoggedOutViewEl = document.getElementById('authLoggedOutView');
    const loggedInUserEmailEl = document.getElementById('loggedInUserEmail');
    const accountUserEmailEl = document.getElementById('accountUserEmail');
    const accountAvatarDotEl = document.getElementById('accountAvatarDot');
    const btnLogoutEl = document.getElementById('btnLogout');
    const btnForceCloudSyncEl = document.getElementById('btnForceCloudSync');

    let currentAuthMode = 'login'; // 'login' or 'register'
    let cloudAccountSession = null; // Tokens stay in memory; persistence is backend DPAPI only.
    let cloudAutoBackup = null, cloudJobBusy = false;

    function renderAccountSession(userObj) {
      cloudAccountSession = userObj || null;
      const signedIn = Boolean(userObj && userObj.email && userObj.id && userObj.token);
      authLoggedInViewEl.style.display = signedIn ? 'block' : 'none';
      authLoggedOutViewEl.style.display = signedIn ? 'none' : 'block';
      loggedInUserEmailEl.textContent = signedIn ? userObj.email : '';
      accountUserEmailEl.textContent = signedIn ? userObj.email : 'Local / Sign In';
      accountAvatarDotEl.style.background = signedIn ? '#10b981' : '#64748b';
      accountAvatarDotEl.title = signedIn ? 'Authenticated account (sync status is separate)' : 'Offline / Local';
      document.getElementById('syncStatusBadge').textContent = signedIn ? 'Signed in · Checking backup status' : '';
      cloudAutoBackup?.accountChanged(signedIn ? userObj.id : null);
      if (cloudAutoBackup) renderCloudBackupState(cloudAutoBackup.status());
    }

    async function updateAccountUI() {
      // Only a backend-verified session is authoritative, never a cached badge.
      try {
        const session = await invoke('get_user_cloud_session');
        localStorage.removeItem('axion_mind_user'); // Remove the legacy plaintext browser cache.
        renderAccountSession(session);
      } catch (_) {
        localStorage.removeItem('axion_mind_user');
        renderAccountSession(null);
      }
    }

    async function openAuthModal() {
      authFeedbackEl.style.display = 'none';
      const defaultSbUrl = 'https://kefxeysyvtdxxdupkapa.supabase.co';
      const defaultSbKey = 'sb_publishable_m6nFD1nyCmeP5xMz0K_5Hw_HqIHOr2N';
      const savedSbUrl = localStorage.getItem('axion_sb_url') || defaultSbUrl;
      const savedSbKey = localStorage.getItem('axion_sb_key') || defaultSbKey;
      if (document.getElementById('cfgSupabaseUrl')) {
        document.getElementById('cfgSupabaseUrl').value = savedSbUrl;
      }
      if (document.getElementById('cfgSupabaseKey')) {
        document.getElementById('cfgSupabaseKey').value = savedSbKey;
      }
      await updateAccountUI();
      authSyncModalEl.classList.add('open');
    }

    function closeAuthModal() {
      authSyncModalEl.classList.remove('open');
    }

    // --- Deep Diagnostics & System Log Telemetry Logic ---
    const diagnosticsModalEl = document.getElementById('diagnosticsModal');
    const btnOpenDiagnosticsEl = document.getElementById('btnOpenDiagnostics');
    const btnCloseDiagnosticsModalEl = document.getElementById('btnCloseDiagnosticsModal');
    const btnRunDeepHealthCheckEl = document.getElementById('btnRunDeepHealthCheck');
    const btnExportDiagnosticReportEl = document.getElementById('btnExportDiagnosticReport');
    const btnRefreshDiagnosticLogsEl = document.getElementById('btnRefreshDiagnosticLogs');
    const btnClearDiagnosticLogsEl = document.getElementById('btnClearDiagnosticLogs');
    const inputFilterDiagLogsEl = document.getElementById('inputFilterDiagLogs');
    const diagTerminalConsoleEl = document.getElementById('diagTerminalConsole');
    let cachedDiagLogs = [];
    let currentDiagFilter = 'all';
    let diagAutoRefreshTimer = null;

    // Global frontend telemetry: capture any uncaught JS errors and send to Rust logger
    window.addEventListener('error', (event) => {
      invoke('log_frontend_event', {
        level: 'error',
        tag: 'UI_ERROR',
        message: event.message || 'Window script error',
        details: `${event.filename || 'index.html'}:${event.lineno || 0}:${event.colno || 0}`
      }).catch(() => {});
    });

    window.addEventListener('unhandledrejection', (event) => {
      invoke('log_frontend_event', {
        level: 'error',
        tag: 'PROMISE_REJECT',
        message: event.reason?.message || String(event.reason),
        details: event.reason?.stack || null
      }).catch(() => {});
    });

    async function openDiagnosticsModal() {
      diagnosticsModalEl.classList.add('open');
      await refreshDiagnosticsData();
      if (!diagAutoRefreshTimer) {
        diagAutoRefreshTimer = setInterval(refreshDiagnosticsData, 4000);
      }
    }

    function closeDiagnosticsModal() {
      diagnosticsModalEl.classList.remove('open');
      if (diagAutoRefreshTimer) {
        clearInterval(diagAutoRefreshTimer);
        diagAutoRefreshTimer = null;
      }
    }

    async function refreshDiagnosticsData() {
      try {
        const [logs, status] = await Promise.all([
          invoke('get_recent_logs', { limit: 300 }),
          invoke('run_system_diagnostics')
        ]);
        cachedDiagLogs = logs || [];
        renderDiagnosticsStatus(status);
        renderDiagnosticsLogs();
      } catch (err) {
        console.warn('Diagnostics polling notice:', err);
      }
    }

    function renderDiagnosticsStatus(s) {
      if (!s) return;
      document.getElementById('diagStorageStatus').textContent = s.storage_writable ? '● ONLINE (R/W OK)' : '❌ ERROR (Blocked)';
      document.getElementById('diagStorageStatus').style.color = s.storage_writable ? '#34d399' : '#f87171';
      document.getElementById('diagStoragePath').textContent = s.storage_dir;
      document.getElementById('diagStoragePath').title = s.storage_dir;

      document.getElementById('diagRagStatus').textContent = `${s.frameworks_count + s.anecdotes_count} Knowledge Cards`;
      document.getElementById('diagRagDetails').textContent = `${s.frameworks_count} FW · ${s.anecdotes_count} Anecdotes · ${s.personas_count} Persona(s)`;

      const activeBridges = [];
      if (s.hermes_reachable) activeBridges.push('Hermes (8642)');
      if (s.antigravity_reachable) activeBridges.push('Antigravity (8766)');
      if (s.gemini_web_reachable) activeBridges.push('Argon (8768)');
      if (s.deepseek_reachable) activeBridges.push('DeepSeek (8769)');
      document.getElementById('diagModelStatus').textContent = activeBridges.length > 0 ? activeBridges.join(', ') : '⚠️ No Local Bridge';
      document.getElementById('diagModelStatus').style.color = activeBridges.length > 0 ? '#38bdf8' : '#f87171';

      document.getElementById('diagCloudStatus').textContent = s.supabase_reachable ? 'Supabase reachable · backup status is separate' : 'Cloud unreachable · local files retained';
      document.getElementById('diagCloudStatus').style.color = s.supabase_reachable ? '#34d399' : '#fca5a5';
      const savedUser = cloudAccountSession ? JSON.stringify(cloudAccountSession) : null;
      let userEmail = 'Local';
      if (savedUser) {
        try { userEmail = JSON.parse(savedUser).email; } catch (_) {}
      }
      document.getElementById('diagCloudUser').textContent = userEmail;
    }

    function renderDiagnosticsLogs() {
      const searchTxt = (inputFilterDiagLogsEl.value || '').toLowerCase().trim();
      let filtered = cachedDiagLogs.filter(item => {
        // Filter by category pill
        if (currentDiagFilter === 'error') {
          const lvl = (item.level || '').toUpperCase();
          if (!lvl.includes('ERROR') && !lvl.includes('WARN') && !lvl.includes('FATAL')) return false;
        } else if (currentDiagFilter === 'llm') {
          if (item.tag !== 'LLM') return false;
        } else if (currentDiagFilter === 'rag') {
          if (item.tag !== 'RAG') return false;
        } else if (currentDiagFilter === 'sync') {
          if (item.tag !== 'STORAGE' && item.tag !== 'CLOUD_SYNC' && item.tag !== 'SYNC') return false;
        }

        // Filter by text search
        if (searchTxt) {
          const matchMsg = (item.message || '').toLowerCase().includes(searchTxt);
          const matchTag = (item.tag || '').toLowerCase().includes(searchTxt);
          const matchDet = (item.details || '').toLowerCase().includes(searchTxt);
          if (!matchMsg && !matchTag && !matchDet) return false;
        }
        return true;
      });

      // Update counter badges
      document.getElementById('countAllLogs').textContent = cachedDiagLogs.length;
      document.getElementById('countErrorLogs').textContent = cachedDiagLogs.filter(i => {
        const l = (i.level || '').toUpperCase();
        return l.includes('ERROR') || l.includes('WARN') || l.includes('FATAL');
      }).length;
      document.getElementById('countLlmLogs').textContent = cachedDiagLogs.filter(i => i.tag === 'LLM').length;
      document.getElementById('countRagLogs').textContent = cachedDiagLogs.filter(i => i.tag === 'RAG').length;
      document.getElementById('countSyncLogs').textContent = cachedDiagLogs.filter(i => ['STORAGE', 'CLOUD_SYNC', 'SYNC'].includes(i.tag)).length;

      if (filtered.length === 0) {
        diagTerminalConsoleEl.innerHTML = '<div style="color: #64748b; padding: 20px 0; text-align: center;">No diagnostic events match current filter. System operating cleanly.</div>';
        return;
      }

      let html = '';
      for (const log of filtered) {
        let color = '#38bdf8'; // Info
        const lvl = (log.level || '').toUpperCase();
        if (lvl.includes('ERROR') || lvl.includes('FATAL')) color = '#f87171';
        else if (lvl.includes('WARN')) color = '#fbbf24';
        else if (lvl.includes('DEBUG') || lvl.includes('TRACE')) color = '#94a3b8';
        else if (lvl.includes('PERF')) color = '#34d399';

        html += `<div style="margin-bottom: 5px; line-height: 1.45;">`;
        html += `<span style="color: #64748b;">[${log.timestamp}]</span> `;
        html += `<span style="color: ${color}; font-weight: 700;">[${log.level}]</span> `;
        html += `<span style="color: #c084fc; font-weight: 600;">[${log.tag}]</span> `;
        html += `<span style="color: #e2e8f0;">${escapeHtml(log.message)}</span>`;
        if (log.details) {
          html += `<div style="color: #94a3b8; padding-left: 20px; font-size: 10.5px; opacity: 0.85;">└─ ${escapeHtml(log.details)}</div>`;
        }
        html += `</div>`;
      }
      diagTerminalConsoleEl.innerHTML = html;
      diagTerminalConsoleEl.scrollTop = diagTerminalConsoleEl.scrollHeight;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Filter pill click handlers
    document.querySelectorAll('.diag-filter-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.diag-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDiagFilter = btn.dataset.filter;
        renderDiagnosticsLogs();
      };
    });

    inputFilterDiagLogsEl.oninput = renderDiagnosticsLogs;
    btnOpenDiagnosticsEl.onclick = openDiagnosticsModal;
    btnCloseDiagnosticsModalEl.onclick = closeDiagnosticsModal;

    btnRunDeepHealthCheckEl.onclick = async () => {
      btnRunDeepHealthCheckEl.innerHTML = '<span>⏳</span> Scanning...';
      try {
        const report = await invoke('run_system_diagnostics');
        renderDiagnosticsStatus(report);
        await refreshDiagnosticsData();
        const issuesCount = report.issues_detected ? report.issues_detected.length : 0;
        document.getElementById('diagExportStatusFeedback').textContent = issuesCount === 0 ? '✅ Health scan passed! 0 issues found.' : `⚠️ Scan flagged ${issuesCount} item(s).`;
      } catch (err) {
        document.getElementById('diagExportStatusFeedback').textContent = 'Scan error: ' + err;
      } finally {
        btnRunDeepHealthCheckEl.innerHTML = '<span>⚡</span> Run Full Health Check';
      }
    };

    btnExportDiagnosticReportEl.onclick = async () => {
      btnExportDiagnosticReportEl.innerHTML = '<span>⏳</span> Writing...';
      try {
        const exportPath = await invoke('export_diagnostic_report');
        document.getElementById('diagExportStatusFeedback').textContent = `✅ Saved: ${exportPath}`;
      } catch (err) {
        document.getElementById('diagExportStatusFeedback').textContent = `Export failed: ${err}`;
      } finally {
        btnExportDiagnosticReportEl.innerHTML = '<span>📥</span> Export Report (.md)';
      }
    };

    btnRefreshDiagnosticLogsEl.onclick = refreshDiagnosticsData;
    btnClearDiagnosticLogsEl.onclick = async () => {
      await invoke('clear_system_logs');
      await refreshDiagnosticsData();
    };

    btnOpenAuthModalEl.onclick = openAuthModal;
    sidebarAccountPillEl.onclick = openAuthModal;
    btnCloseAuthModalEl.onclick = closeAuthModal;

    const btnGoogleSignInEl = document.getElementById('btnGoogleSignIn');
    const btnCancelGoogleSignInEl = document.getElementById('btnCancelGoogleSignIn');
    const googleSignIn = window.AxionGoogleAuth.createController({
      invoke,
      onSession: async session => {
        renderAccountSession(session);
      },
      onStatus: (message, kind) => {
        authFeedbackEl.style.display = 'block';
        authFeedbackEl.style.background = kind === 'error' ? 'rgba(239,68,68,.15)' : 'rgba(59,130,246,.15)';
        authFeedbackEl.style.color = kind === 'error' ? '#fca5a5' : '#a7f3d0';
        authFeedbackEl.textContent = message;
      },
      onBusy: busy => {
        btnGoogleSignInEl.disabled = busy;
        btnSubmitAuthEl.disabled = busy;
        btnGoogleSignInEl.textContent = busy ? 'Waiting for Google…' : 'Continue with Google';
        btnCancelGoogleSignInEl.style.display = busy ? 'block' : 'none';
      }
    });
    btnGoogleSignInEl.onclick = () => googleSignIn.start();
    btnCancelGoogleSignInEl.onclick = () => googleSignIn.cancel();
    new MutationObserver(() => {
      if (!authSyncModalEl.classList.contains('open')) googleSignIn.cancel();
    }).observe(authSyncModalEl, { attributes: true, attributeFilter: ['class'] });

    tabLoginEl.onclick = () => {
      currentAuthMode = 'login';
      tabLoginEl.style.color = 'var(--ax-primary)';
      tabLoginEl.style.borderBottom = '2px solid var(--ax-primary)';
      tabRegisterEl.style.color = 'var(--ax-text-muted)';
      tabRegisterEl.style.borderBottom = 'none';
      btnSubmitAuthEl.textContent = 'Sign In';
    };

    tabRegisterEl.onclick = () => {
      currentAuthMode = 'register';
      tabRegisterEl.style.color = 'var(--ax-primary)';
      tabRegisterEl.style.borderBottom = '2px solid var(--ax-primary)';
      tabLoginEl.style.color = 'var(--ax-text-muted)';
      tabLoginEl.style.borderBottom = 'none';
      btnSubmitAuthEl.textContent = 'Create Account';
    };

    function getSupabaseClient() {
      const sbUrl = document.getElementById('cfgSupabaseUrl').value.trim() || localStorage.getItem('axion_sb_url') || 'https://kefxeysyvtdxxdupkapa.supabase.co';
      const sbKey = document.getElementById('cfgSupabaseKey').value.trim() || localStorage.getItem('axion_sb_key') || 'sb_publishable_m6nFD1nyCmeP5xMz0K_5Hw_HqIHOr2N';
      if (sbUrl && sbKey && window.supabase && typeof window.supabase.createClient === 'function') {
        localStorage.setItem('axion_sb_url', sbUrl);
        localStorage.setItem('axion_sb_key', sbKey);
        return window.supabase.createClient(sbUrl, sbKey);
      }
      return null;
    }

    btnSubmitAuthEl.onclick = async () => {
      const email = authEmailEl.value.trim();
      const password = authPasswordEl.value.trim();

      if (!email || !password) {
        authFeedbackEl.style.display = 'block';
        authFeedbackEl.style.background = 'rgba(239, 68, 68, 0.15)';
        authFeedbackEl.style.color = '#fca5a5';
        authFeedbackEl.textContent = 'Please enter both email and password.';
        return;
      }

      authFeedbackEl.style.display = 'block';
      authFeedbackEl.style.background = 'rgba(59, 130, 246, 0.15)';
      authFeedbackEl.style.color = '#93c5fd';
      authFeedbackEl.textContent = currentAuthMode === 'login' ? '⏳ Connecting & Authenticating...' : '⏳ Creating account on Cloud Vault...';

      const sbUrl = document.getElementById('cfgSupabaseUrl').value.trim() || 'https://kefxeysyvtdxxdupkapa.supabase.co';
      const sbKey = document.getElementById('cfgSupabaseKey').value.trim() || 'sb_publishable_m6nFD1nyCmeP5xMz0K_5Hw_HqIHOr2N';

      if (sbUrl && sbKey) {
        try {
          let authRes = null;
          let authData = null;

          if (currentAuthMode === 'register') {
            // 1. Direct REST Sign Up
            const suResp = await fetch(`${sbUrl}/auth/v1/signup`, {
              method: 'POST',
              headers: {
                'apikey': sbKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ email, password })
            });
            const suJson = await suResp.json();
            if (!suResp.ok) {
              throw new Error(suJson.msg || suJson.error_description || suJson.message || 'Registration failed');
            }
          }

          // 2. Direct REST Sign In
          const siResp = await fetch(`${sbUrl}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
              'apikey': sbKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
          });
          const siJson = await siResp.json();

          if (!siResp.ok) {
            // Auto-heal: If user clicked Sign In without registering first, attempt auto-signup then login
            if (currentAuthMode === 'login' && (siJson.error_description?.includes('Invalid') || siJson.msg?.includes('Invalid'))) {
              const retrySu = await fetch(`${sbUrl}/auth/v1/signup`, {
                method: 'POST',
                headers: { 'apikey': sbKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
              });
              if (retrySu.ok) {
                const retrySi = await fetch(`${sbUrl}/auth/v1/token?grant_type=password`, {
                  method: 'POST',
                  headers: { 'apikey': sbKey, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, password })
                });
                if (retrySi.ok) {
                  authData = await retrySi.json();
                }
              }
            }
            if (!authData) {
              throw new Error(siJson.msg || siJson.error_description || siJson.message || 'Authentication failed');
            }
          } else {
            authData = siJson;
          }

          const userObj = {
            email: authData.user ? authData.user.email : email,
            id: authData.user ? authData.user.id : null,
            token: authData.access_token,
            refresh_token: authData.refresh_token,
            expires_at: authData.expires_at || Math.floor(Date.now() / 1000) + (authData.expires_in || 3600),
            signed_in_at: new Date().toISOString()
          };
          await invoke('save_user_cloud_session', { session: userObj });
          authPasswordEl.value = '';
          renderAccountSession(userObj);
          localStorage.setItem('axion_sb_url', sbUrl);
          localStorage.setItem('axion_sb_key', sbKey);

          // Test and hydrate sync with cloud_personas
          try {
            const pullResp = await fetch(`${sbUrl}/rest/v1/cloud_personas?user_id=eq.${userObj.id}`, {
              headers: {
                'apikey': sbKey,
                'Authorization': `Bearer ${userObj.token}`
              }
            });
            if (pullResp.ok) {
              const cloudPersonas = await pullResp.json();
              if (cloudPersonas && cloudPersonas.length > 0) {
                console.log('Restored cloud personas from Supabase:', cloudPersonas.length);
              }
            }
          } catch (syncErr) {
            console.warn('Initial cloud sync notice:', syncErr);
          }

          authFeedbackEl.style.background = 'rgba(16, 185, 129, 0.15)';
          authFeedbackEl.style.color = '#a7f3d0';
          authFeedbackEl.textContent = 'Signed in. Cloud backup is available; no backup has been verified by signing in.';
          updateAccountUI();
          setTimeout(closeAuthModal, 1200);
          return;
        } catch (sbError) {
          authFeedbackEl.style.background = 'rgba(239, 68, 68, 0.15)';
          authFeedbackEl.style.color = '#fca5a5';
          authFeedbackEl.textContent = 'Supabase: ' + (sbError.message || sbError);
          return;
        }
      }

      authFeedbackEl.textContent = 'Cloud authentication is not configured. Local mode does not require sign-in.';
    };

    btnLogoutEl.onclick = async () => {
      localStorage.removeItem('axion_mind_user');
      try {
        await invoke('clear_user_cloud_session');
      } catch (_) {}
      await updateAccountUI();
      authFeedbackEl.style.display = 'block';
      authFeedbackEl.style.background = 'rgba(245, 158, 11, 0.15)';
      authFeedbackEl.style.color = '#fcd34d';
      authFeedbackEl.textContent = 'Signed out. Operating in offline/local-only mode.';
    };

    // Verified manual cloud backup. Authentication and backup are separate states.
    const recoveryButtonEl = document.getElementById('btnRecoverCloudBackup');
    const cancelBackupEl = document.getElementById('btnCancelCloudBackup');
    function cloudBackupStatus(message, kind = 'info') {
      authFeedbackEl.style.display = 'block';
      authFeedbackEl.style.whiteSpace = 'pre-wrap';
      authFeedbackEl.style.overflowWrap = 'anywhere';
      authFeedbackEl.style.background = kind === 'error' ? 'rgba(239,68,68,.15)' : kind === 'success' ? 'rgba(16,185,129,.15)' : 'rgba(59,130,246,.15)';
      authFeedbackEl.style.color = kind === 'error' ? '#fca5a5' : kind === 'success' ? '#a7f3d0' : '#93c5fd';
      authFeedbackEl.textContent = message;
    }
    function renderCloudBackupState(state) {
      const own = !state.owner || state.owner === cloudAccountSession?.id;
      const toggle = document.getElementById('autoBackupEnabled');
      toggle.checked = own && state.enabled;
      toggle.disabled = cloudJobBusy || !cloudAccountSession || !own || (!state.enabled && ['checking', 'signed-out', 'unavailable'].includes(state.state));
      let detail = 'Checking the current account and local files...', short = 'Checking backup';
      if (!own) { detail = 'Account changed. Backup status is being rechecked.'; }
      else if (state.state === 'signed-out') { detail = 'Local-only mode. Sign in to back up or recover data.'; short = 'Local only'; }
      else if (state.state === 'verified') { detail = 'Local files match the last verified cloud backup.'; short = 'Backup matches local'; }
      else if (state.state === 'backing-up') { detail = 'Backing up and reading back cloud contents. Verification is not complete yet.'; short = 'Backing up...'; }
      else if (state.state === 'retrying') { detail = 'Backup incomplete. Local changes remain unverified. Next automatic retry: ' + new Date(state.nextAttemptAt).toLocaleTimeString(); short = 'Backup retry pending'; }
      else if (state.persistenceError) { detail = 'Automatic backups are OFF for this run only. The off setting could not be saved; it may not survive a restart.'; short = 'Off setting not saved'; }
      else if (state.state === 'paused') { detail = 'Automatic backup paused after an authentication, permission or validation failure. Fix the issue, then turn the option off/on to retry.'; short = 'Backup paused'; }
      else if (state.state === 'unavailable') { detail = 'Cannot currently verify the account or local files. No up-to-date cloud claim is made; your local data is retained.'; short = 'Backup status unknown'; }
      else if (state.dirty) { detail = state.enabled ? 'Local changes are pending backup. The app will retry when the schedule allows.' : 'Local changes are not backed up. Use Back Up & Verify Now or enable automatic backups.'; short = 'Changes not backed up'; }
      const at = own && state.lastVerifiedAt ? new Date(state.lastVerifiedAt).toLocaleString() : 'No verified backup recorded on this device for this account/folder';
      document.getElementById('cloudBackupSummary').textContent = detail + '\nLast verified: ' + at + '\nAutomatic backups: ' + (own && state.enabled ? 'ON while this app is open' : 'OFF');
      document.getElementById('sidebarBackupStatus').textContent = short;
      document.getElementById('sidebarBackupStatus').style.color = own && state.state === 'verified' ? 'var(--ax-success)' : state.dirty ? 'var(--ax-warning)' : 'var(--ax-text-muted)';
      document.getElementById('syncStatusBadge').textContent = own && state.lastVerifiedAt ? 'Last verified: ' + at + (state.dirty ? ' · local changes pending' : '') : 'Signed in · Backup status is separate';
    }
    const cloudBackupEngine = window.AxionCloudSync.createEngine({
      key: 'sb_publishable_m6nFD1nyCmeP5xMz0K_5Hw_HqIHOr2N',
      getSession: () => invoke('get_user_cloud_session'),
      ownerNow: () => cloudAccountSession?.id,
      snapshotNow: () => invoke('export_cloud_snapshot'),
      confirmPlan: (plan, user, settings) => settings.automatic
        ? settings.autoOwner === user.id && cloudAutoBackup.authorized(user.id, settings.autoScope, plan.digest)
        : confirm(`Back up all LOCAL customer data to ${user.email}?\n\n${plan.counts.personas} personas, ${plan.counts.frameworks} frameworks, ${plan.counts.anecdotes} anecdotes, ${plan.counts.chats} chats; ${plan.counts.files} files.\n\nLocal files may include work from another signed-in account. Continue only if this account should receive that data. No cloud records will be deleted.`),
      onState: state => {
        const labels = { authenticating: 'Verifying cloud account...', exporting: 'Preparing the complete backup manifest...', uploading: 'Uploading personas, knowledge cards, and chats...', downloading: 'Downloading the latest complete cloud backup...', verifying: 'Reading back and verifying cloud contents...' };
        if (labels[state.state]) cloudBackupStatus(labels[state.state]);
      }
    });
    const cloudSyncController = window.AxionCloudSync.createController({
      invoke, engine: cloudBackupEngine,
      onStatus: cloudBackupStatus,
      onBusy: busy => {
        cloudJobBusy = busy;
        for (const el of [btnForceCloudSyncEl, recoveryButtonEl, btnLogoutEl, btnSubmitAuthEl, btnGoogleSignInEl, document.getElementById('autoBackupEnabled')]) if (el) el.disabled = busy;
        cancelBackupEl.style.display = busy ? 'inline-flex' : 'none';
        if (!busy && cloudAutoBackup) renderCloudBackupState(cloudAutoBackup.status());
      },
      confirmRecovery: envelope => confirm(`Recover ${envelope.counts.files} verified files into a NEW folder?\nYour active customer files will not be overwritten. You can select the recovered folder in Settings afterward.`),
      onVerified: result => {
        cloudAutoBackup?.recordVerified(result);
        setTimeout(() => cloudAutoBackup?.poll(), 0);
        document.getElementById('syncStatusBadge').textContent = 'Cloud backup verified · ' + new Date(result.verified_at).toLocaleString();
        invoke('log_frontend_event', { level: 'info', tag: 'SYNC', message: `Cloud backup verified: ${result.counts.files} files; ${result.counts.frameworks} frameworks, ${result.counts.anecdotes} anecdotes, ${result.counts.chats} chats.`, details: null }).catch(() => {});
      }
    });
    cloudAutoBackup = window.AxionAutoBackup.createScheduler({
      storage: localStorage,
      defaultEnabled: true, // User requested automatic backup for every verified signed-in account.
      pausePolicy: () => invoke('pause_current_cloud_auto_backup'),
      setPolicy: (disabled, context) => invoke('set_cloud_auto_backup_disabled', { owner: context.owner, scope: context.scope, disabled }),
      inspect: async () => {
        const context = await invoke('inspect_cloud_backup');
        if ((context?.owner || null) !== (cloudAccountSession?.id || null)) await updateAccountUI();
        return context;
      },
      backup: (snapshot, context) => cloudSyncController.start({ automatic: true, autoOwner: context.owner, autoScope: context.scope, snapshot }),
      isBusy: () => cloudSyncController.isBusy() || cloudBackupEngine.isBusy(),
      cancel: () => cloudSyncController.cancel(),
      onState: renderCloudBackupState
    });
    btnForceCloudSyncEl.onclick = () => cloudSyncController.start();
    recoveryButtonEl.onclick = () => cloudSyncController.recover();
    cancelBackupEl.onclick = async () => {
      cloudSyncController.cancel();
      const context = cloudAutoBackup.context();
      if (context) { try { await cloudAutoBackup.setEnabled(false, context); } catch (_) {} }
    };
    document.getElementById('btnPauseAutomaticBackups').onclick = async event => {
      cloudSyncController.cancel();event.target.disabled=true;
      try { await cloudAutoBackup.pauseOffline();cloudBackupStatus('Automatic backups are durably OFF for the last signed-in account and current storage folder. Sign in and turn the option on to resume.','info'); }
      catch(error){cloudBackupStatus('Pause could not be saved: '+String(error),'error');}
      finally{event.target.disabled=false;}
    };
    document.getElementById('autoBackupEnabled').onchange = async event => {
      const wanted = event.target.checked; event.target.disabled = true;
      try {
        if (wanted) await cloudAutoBackup.poll();
        const context = wanted ? cloudAutoBackup.context() : cloudAutoBackup.status();
        if (!context) throw new Error('Cannot verify this account and storage folder. Try again when online.');
        if (wanted) {
          const plan = await window.AxionCloudSync.prepare(context.snapshot, context.owner);
          const yes = confirm(`Enable automatic backups to ${context.email}?\n\nThis will upload ALL local data in the current storage folder: ${plan.counts.personas} personas, ${plan.counts.frameworks} frameworks, ${plan.counts.anecdotes} anecdotes, ${plan.counts.chats} chats; ${plan.counts.files} files.\n\nLocal data may include work created under another account. Backups run while the app is open, at most once every 5 minutes when files change, with an immediate catch-up. This enables backups for this account and storage folder. Other signed-in accounts also default to automatic backup unless disabled individually. No cloud records will be deleted. Continue?`);
          if (!yes) return;
        }
        await cloudAutoBackup.setEnabled(wanted, context);
        if (wanted) await cloudAutoBackup.poll();
      } catch (error) { cloudBackupStatus(error.message || 'Automatic backup settings could not be saved.', 'error'); }
      finally { renderCloudBackupState(cloudAutoBackup.status()); }
    };
    window.addEventListener('online', () => cloudAutoBackup.poll());
    window.addEventListener('focus', () => cloudAutoBackup.poll());
    window.addEventListener('beforeunload', () => cloudAutoBackup.stop());
    updateAccountUI().then(() => cloudAutoBackup.start());

    // Auto-Clone Mind Handler
    document.getElementById('btnAutoCloneMind').onclick = async () => {
      const name = document.getElementById('modalPersonaName').value.trim();
      const source = document.getElementById('modalPersonaSourceInput').value.trim();
      const statusEl = document.getElementById('cloneMindStatus');

      if (!name) {
        alert("Please enter the Persona Name first (e.g. Codie Sanchez, Charlie Munger).");
        return;
      }
      if (!source) {
        alert("Please enter a YouTube link or paste source notes in the box.");
        return;
      }

      statusEl.style.display = 'block';
      statusEl.style.color = 'var(--ax-primary)';
      statusEl.textContent = '⏳ Distilling Knowledge Bank via Hermes Mind... (Extracting rules, math & style)';
      document.getElementById('btnAutoCloneMind').style.opacity = '0.5';

      try {
        const result = await invoke('clone_persona_from_source', { name: name, source: source });
        statusEl.style.color = 'var(--ax-success)';
        statusEl.textContent = '✅ Knowledge Bank extracted! Review details below and click Save Persona.';
        
        if (result.system_prompt) {
          document.getElementById('modalPersonaSystemPrompt').value = result.system_prompt;
        }
        if (result.title && !document.getElementById('modalPersonaTitle').value) {
          document.getElementById('modalPersonaTitle').value = result.title;
        }
        if (result.description && !document.getElementById('modalPersonaDesc').value) {
          document.getElementById('modalPersonaDesc').value = result.description;
        }
        if (result.avatar) {
          document.getElementById('modalPersonaEmoji').value = result.avatar;
        }
      } catch (err) {
        statusEl.style.color = 'var(--ax-danger)';
        statusEl.textContent = '❌ Cloning error: ' + err;
      } finally {
        document.getElementById('btnAutoCloneMind').style.opacity = '1';
      }
    };

    // Choose Book / PDF File Picker Handler
    const btnPickBook = document.getElementById('btnPickBookFile');
    if (btnPickBook) {
      btnPickBook.onclick = async () => {
        try {
          const filePath = await invoke('pick_source_file');
          if (filePath) {
            const inputEl = document.getElementById('modalPersonaSourceInput');
            const current = inputEl.value.trim();
            inputEl.value = current ? current + '\n' + filePath : filePath;
          }
        } catch (err) {
          alert("Could not open file picker: " + err);
        }
      };
    }

    // Drag-and-drop file path listener for Books & PDFs
    const sourceInputEl = document.getElementById('modalPersonaSourceInput');
    if (sourceInputEl) {
      sourceInputEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        sourceInputEl.style.borderColor = 'var(--ax-primary)';
      });
      sourceInputEl.addEventListener('dragleave', (e) => {
        sourceInputEl.style.borderColor = '';
      });
      sourceInputEl.addEventListener('drop', (e) => {
        e.preventDefault();
        sourceInputEl.style.borderColor = '';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          // If native path is available in Tauri/WebView2, use it
          if (file.path) {
            sourceInputEl.value = file.path;
          } else if (file.name) {
            sourceInputEl.value = file.name;
          }
        }
      });
    }

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

        // Keep the currently open chat session if editing the same persona
        if (existingIdx >= 0 && activeId && (activeId === personaId || activeId.startsWith(personaId + '_'))) {
          // Keep activeId intact
        } else {
          activeMode = 'persona';
          activeId = personaId;
        }
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
        activeAgentId = null;
        await fetchPersonas();
        if (personas.length > 0) {
          const nextPersona = personas[0];
          const sessions = agentSessionsMap[nextPersona.id] || [];
          selectItem('persona', sessions.length > 0 ? sessions[0].id : nextPersona.id);
        } else {
          messagesContainerEl.innerHTML = '<div class="empty-state"><div class="big-emoji">🤖</div><h3>No Personas</h3><p>Click "+ New Persona" in the sidebar to create one.</p></div>';
          activePersonaNameEl.textContent = 'No Persona Selected';
          activePersonaTitleEl.textContent = '';
          activePersonaAvatarEl.textContent = '🤖';
        }
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

      // Smart Floating Jump to Bottom Button
      if (btnScrollBottomEl) {
        btnScrollBottomEl.onclick = () => {
          if (activeScrollTracker) {
            activeScrollTracker.scrollToBottom(messagesContainerEl, true);
          } else {
            messagesContainerEl.scrollTo({ top: messagesContainerEl.scrollHeight, behavior: 'smooth' });
          }
          btnScrollBottomEl.classList.remove('visible');
        };
      }

      if (messagesContainerEl) {
        messagesContainerEl.addEventListener('scroll', () => {
          if (activeScrollTracker) {
            const userScrolledUp = activeScrollTracker.onUserScroll(messagesContainerEl);
            if (!userScrolledUp && btnScrollBottomEl) {
              btnScrollBottomEl.classList.remove('visible');
            }
          }
        }, { passive: true });
      }

      // Mobile sidebar toggle
      document.getElementById('btnToggleMobileSidebar').onclick = () => {
        document.getElementById('sidebar').classList.toggle('open');
      };

      // 3-dot overflow menu
      const btnChatOverflowMenu = document.getElementById('btnChatOverflowMenu');
      const chatOverflowDropdown = document.getElementById('chatOverflowDropdown');
      if (btnChatOverflowMenu && chatOverflowDropdown) {
        btnChatOverflowMenu.onclick = (e) => {
          e.stopPropagation();
          const isOpen = chatOverflowDropdown.style.display === 'flex';
          chatOverflowDropdown.style.display = isOpen ? 'none' : 'flex';
        };

        document.addEventListener('click', (e) => {
          if (!chatOverflowDropdown.contains(e.target) && e.target !== btnChatOverflowMenu) {
            chatOverflowDropdown.style.display = 'none';
          }
        });
      }

      if (btnEditPersonaEl && chatOverflowDropdown) {
        btnEditPersonaEl.addEventListener('click', () => {
          chatOverflowDropdown.style.display = 'none';
        });
      }

      if (btnClearChatEl && chatOverflowDropdown) {
        btnClearChatEl.addEventListener('click', () => {
          chatOverflowDropdown.style.display = 'none';
        });
      }

      // Sidebar Tab Switching
      const tabPersonas = document.getElementById('tabPersonas');
      const tabHermes = document.getElementById('tabHermes');
      if (tabPersonas && tabHermes) {
        tabPersonas.onclick = () => {
          activeSidebarTab = 'personas';
          tabPersonas.className = 'sidebar-tab-btn active';
          tabHermes.className = 'sidebar-tab-btn';
          tabPersonas.style.background = 'var(--ax-surface-raised)';
          tabPersonas.style.borderColor = 'var(--ax-border)';
          tabPersonas.style.color = 'var(--ax-primary)';
          tabHermes.style.background = 'transparent';
          tabHermes.style.borderColor = 'transparent';
          tabHermes.style.color = 'var(--ax-text-muted)';
          renderUnifiedSidebar();
        };

        tabHermes.onclick = () => {
          activeSidebarTab = 'hermes';
          tabHermes.className = 'sidebar-tab-btn active';
          tabPersonas.className = 'sidebar-tab-btn';
          tabHermes.style.background = 'var(--ax-surface-raised)';
          tabHermes.style.borderColor = 'var(--ax-border)';
          tabHermes.style.color = 'var(--ax-primary)';
          tabPersonas.style.background = 'transparent';
          tabPersonas.style.borderColor = 'transparent';
          tabPersonas.style.color = 'var(--ax-text-muted)';
          renderUnifiedSidebar();
        };
      }
    }

    window.addEventListener('beforeunload', event => { if (pendingChatSaves.size) { event.preventDefault(); event.returnValue = ''; } });

    document.addEventListener('click', event => {
      const target = event.target.closest('[data-action]');
      if (!target || target.disabled || target.closest('.message-row')) return;
      const actions = { setModalEmoji, sendQuickPrompt,
        runHermesQuickCommand: window.runHermesQuickCommand,
        quickSelectChatModel: window.quickSelectChatModel,
        toggleKnowledge: () => target.parentElement.classList.toggle('open') };
      const action = actions[target.dataset.action];
      if (Object.prototype.hasOwnProperty.call(actions, target.dataset.action) && typeof action === 'function') action(target.dataset.value);
    });

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
