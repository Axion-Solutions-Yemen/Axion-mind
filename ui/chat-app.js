    const workspaceUI = window.AxionPresentation;

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
    let agentSessionsMap = {};
    let activeMode = 'persona'; // 'session' | 'persona'
    let activeId = null;
    let activeAgentId = null;
    let selectedPersonaId = null;
    const expandedAgents = new Set(['hermes']); // Per-Agent history disclosure preferences.
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
    const personaModalEl = document.getElementById('personaModal');
    const btnClearChatEl = document.getElementById('btnClearChat');
    const btnEditPersonaEl = document.getElementById('btnEditPersona');
    const btnDeletePersonaEl = document.getElementById('btnDeletePersona');
    const btnToggleAllThinkingEl = document.getElementById('btnToggleAllThinking');

    // Theme changes only presentation; the current document remains mounted.
    const themeToggleEl = document.getElementById('btnToggleTheme');
    themeToggleEl.onclick = () => {
      const rootEl = document.documentElement;
      rootEl.dataset.theme = rootEl.dataset.theme === 'light' ? 'dark' : 'light';
      const actionLabel = rootEl.dataset.theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme';
      themeToggleEl.setAttribute('aria-label', actionLabel);
      themeToggleEl.title = actionLabel;
    };

    // Floating workspace controls own presentation and focus only.
    function bindAnchoredSurface(trigger, panel, { initialFocus, items = 'button:not(:disabled)', align = 'start', duration = 180, stagger = 0 } = {}) {
      document.body.appendChild(panel);
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      let open = false, animation;
      let rowAnimations = [];
      function position() {
        if (!open) return;
        if (!trigger.getClientRects().length) { close({ restoreFocus: false }); return; }
        const rect = trigger.getBoundingClientRect();
        const gap = 8, edge = 12;
        const below = window.innerHeight - rect.bottom - gap - edge;
        const above = rect.top - gap - edge;
        const placeAbove = below < 160 && above > below;
        panel.style.maxHeight = `${Math.max(0, Math.min(440, placeAbove ? above : below))}px`;
        const size = panel.getBoundingClientRect();
        const left = align === 'end' ? rect.right - size.width : rect.left;
        panel.style.left = `${Math.max(edge, Math.min(left, window.innerWidth - size.width - edge))}px`;
        panel.style.top = `${Math.max(edge, placeAbove ? rect.top - gap - size.height : rect.bottom + gap)}px`;
      }
      function motion(show) {
        const style = animation?.playState === 'running' ? getComputedStyle(panel) : null;
        const from = style ? { opacity: style.opacity, transform: style.transform } : null;
        const previous = animation;
        animation = null;
        previous?.cancel();
        rowAnimations.forEach(row => row.cancel());
        rowAnimations = [];
        if (reducedMotion.matches) { panel.hidden = !show; return; }
        const current = window.AxionMotion.play(panel, show
          ? [from || { opacity: 0, transform: 'translateY(-5px)' }, { opacity: 1, transform: 'translateY(0)' }]
          : [from || { opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-4px)' }],
        { duration: show ? duration : Math.max(150, duration - 20) });
        animation = current;
        if (!current) { panel.hidden = !show; return; }
        const finish = () => { if (animation === current && !open) panel.hidden = true; };
        current.addEventListener('finish', finish, { once: true });
        current.addEventListener('cancel', finish, { once: true });
        if (show && stagger) rowAnimations = [...panel.querySelectorAll(items)]
          .filter(row => row.getClientRects().length).map((row, index) => window.AxionMotion.play(row, [
            { opacity: 0, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }
          ], { duration: 140, delay: Math.min(index * stagger, 60), fill: 'backwards' })).filter(Boolean);
      }
      function show() {
        if (open) return;
        open = true;
        panel.hidden = false;
        panel.inert = false;
        trigger.setAttribute('aria-expanded', 'true');
        position();
        if (!open) return;
        motion(true);
        const first = initialFocus?.() || [...panel.querySelectorAll(items)].find(el => el.getClientRects().length && !el.disabled) || panel.querySelector('[data-close-surface]');
        first?.focus({ preventScroll: true });
        if (first && !panel.contains(searchPersonasEl)) first.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      function close({ restoreFocus = true } = {}) {
        if (!open) return;
        open = false;
        panel.inert = true;
        trigger.setAttribute('aria-expanded', 'false');
        motion(false);
        if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
      }
      trigger.onclick = () => open ? close() : show();
      trigger.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (open) [...panel.querySelectorAll(items)].find(el => el.getClientRects().length && !el.disabled)?.focus();
          else show();
        } else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
      });
      panel.addEventListener('click', event => {
        if (event.target.closest('[data-close-surface]')) close();
      });
      panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
        if (panel.contains(searchPersonasEl)) return;
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const choices = [...panel.querySelectorAll(items)].filter(el => el.getClientRects().length && !el.disabled);
        if (!choices.length) return;
        event.preventDefault();
        const current = choices.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
          : current < 0 ? (event.key === 'ArrowDown' ? 0 : choices.length - 1)
          : (current + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length;
        choices[next].focus({ preventScroll: false });
      });
      document.addEventListener('pointerdown', event => {
        if (open && !panel.contains(event.target) && !trigger.contains(event.target)) close({ restoreFocus: panel.contains(document.activeElement) });
      }, true);
      document.addEventListener('focusin', event => {
        if (open && event.target !== document.body && !panel.contains(event.target) && !trigger.contains(event.target)) close({ restoreFocus: false });
      });
      window.addEventListener('resize', position);
      document.addEventListener('scroll', event => { if (open && !panel.contains(event.target)) position(); }, true);
      reducedMotion.addEventListener('change', () => {
        if (reducedMotion.matches) { animation?.cancel(); rowAnimations.forEach(row => row.cancel()); panel.hidden = !open; }
      });
      return { close };
    }

    const personaSelectorEl = document.getElementById('selectedPersonaSelector');
    const personaOptionsEl = document.getElementById('personaSelectorOptions');
    const personaSurface = bindAnchoredSurface(personaSelectorEl, document.getElementById('personaSelectorPopover'), {
      initialFocus: () => personaOptionsEl.querySelector('[aria-pressed="true"]'), items: '.persona-navigation-item'
    });
    bindAnchoredSurface(document.getElementById('btnSearchConversations'), document.getElementById('conversationSearchPopover'), {
      initialFocus: () => searchPersonasEl, duration: 180
    });
    document.getElementById('btnClearConversationSearch').onclick = () => {
      searchPersonasEl.value = '';
      renderUnifiedSidebar();
      searchPersonasEl.focus();
    };
    const chatOverflowSurface = bindAnchoredSurface(document.getElementById('btnChatOverflowMenu'), document.getElementById('chatOverflowDropdown'), {
      items: '[role="menuitem"]', align: 'end'
    });
    document.getElementById('chatOverflowDropdown').addEventListener('click', event => {
      if (event.target.closest('[role="menuitem"]')) chatOverflowSurface.close();
    }, true);

    const userMenuEl = document.getElementById('userUtilityMenu');
    const userMenuSurface = bindAnchoredSurface(document.getElementById('btnOpenAuthModal'), userMenuEl, {
      items: '[role="menuitem"]', duration: 180, stagger: 12
    });
    userMenuEl.addEventListener('click', event => {
      if (event.target.closest('[role="menuitem"]:not(:disabled)')) userMenuSurface.close();
    }, true);

    function setControlBusy(control, busy) {
      control.disabled = busy;
      control.setAttribute('aria-busy', String(busy));
    }

    function setInterfaceFeedback(element, name, text) {
      element.classList.add('interface-feedback');
      const glyph = document.createElement('span');
      glyph.innerHTML = workspaceUI.icon(name);
      const label = document.createElement('span');
      label.textContent = text;
      element.replaceChildren(glyph, label);
    }

    const thinkingPreferences = new Map();
    const initializedDisclosures = new WeakMap();
    function thinkingConversationKey() { return JSON.stringify([activeMode, activeId]); }
    function thinkingState() {
      const key = thinkingConversationKey();
      if (!thinkingPreferences.has(key)) thinkingPreferences.set(key, { defaultExpanded: undefined, disclosures: new Map() });
      return thinkingPreferences.get(key);
    }
    function displayedDisclosures() {
      const key = thinkingConversationKey();
      const rows = [...messagesContainerEl.querySelectorAll('.message-row')].filter(row => row.dataset.conversationKey === key);
      return rows.flatMap((row, rowIndex) => [...row.querySelectorAll('.thinking-accordion')]
        .map((panel, index) => ({ panel, id: `${rowIndex}:${index}` })).filter(({ panel }) => !panel.hidden));
    }
    function disclosureOpen(panel) { return panel.matches('details') ? panel.open : panel.classList.contains('open'); }
    function setDisclosureOpen(panel, expanded) {
      if (disclosureOpen(panel) !== expanded) {
        if (panel.matches('details')) panel.open = expanded;
        else panel.classList.toggle('open', expanded);
      }
      if (!panel.matches('details')) panel.querySelector('.thinking-header')?.setAttribute('aria-expanded', String(expanded));
    }
    function refreshThinkingControl() {
      const entries = displayedDisclosures();
      const state = thinkingState();
      const key = thinkingConversationKey();
      for (const { panel, id } of entries) {
        if (initializedDisclosures.get(panel) !== key) {
          const remembered = state.disclosures.has(id) ? state.disclosures.get(id) : state.defaultExpanded;
          if (typeof remembered === 'boolean') setDisclosureOpen(panel, remembered);
          initializedDisclosures.set(panel, key);
        }
        state.disclosures.set(id, disclosureOpen(panel));
        if (!panel.matches('details')) panel.querySelector('.thinking-header')?.setAttribute('aria-expanded', String(disclosureOpen(panel)));
      }
      const anyOpen = entries.some(({ panel }) => disclosureOpen(panel));
      const available = entries.length > 0;
      const activeConversation = Boolean(activeId && activeMode !== 'conference' &&
        !messagesContainerEl.querySelector(':scope > .conversation-welcome'));
      const label = anyOpen ? 'Hide Thinking' : 'Show Thinking';
      const showControl = activeConversation && available;
      btnToggleAllThinkingEl.hidden = !showControl;
      document.getElementById('transcriptToolbar').hidden = !showControl;
      btnToggleAllThinkingEl.setAttribute('aria-pressed', String(anyOpen));
      btnToggleAllThinkingEl.title = label + ': reasoning and tool disclosures in this conversation';
      document.getElementById('thinkingChipLabel').textContent = label;
    }
    btnToggleAllThinkingEl.onclick = () => {
      const entries = displayedDisclosures();
      if (!entries.length) return;
      const expanded = !entries.some(({ panel }) => disclosureOpen(panel));
      const state = thinkingState();
      state.defaultExpanded = expanded;
      state.disclosures.clear();
      for (const { panel, id } of entries) {
        setDisclosureOpen(panel, expanded);
        state.disclosures.set(id, expanded);
      }
      refreshThinkingControl();
    };
    // Observe transcript rows and disclosure state; streamed text does not drive this UI.
    new MutationObserver(records => {
      const relevant = records.some(record => record.type === 'attributes'
        ? record.target.matches('.thinking-accordion')
        : [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
          (node.matches('.message-row, .conversation-welcome, .thinking-accordion') || node.querySelector('.thinking-accordion'))));
      if (relevant) refreshThinkingControl();
    }).observe(messagesContainerEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class', 'hidden'] });

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
      if (activeMode === 'conference') return;
      if (!activeId || !conversationOwner(activeMode, activeId)) {
        const firstPersona = personas.find(persona => (agentSessionsMap[persona.id] || []).length) || personas[0];
        if (firstPersona) await activatePersona(firstPersona);
        else if (hermesSessions.length) await selectItem('session', datedEntries(hermesSessions, hermesIdentity())[0].session.id);
        else showEmptyConversation(null);
      } else updateConversationIdentity(conversationOwner(activeMode, activeId), activeMode);
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

    // Keep the existing health probe without a visible workspace status component.
    async function checkMindStatus() {
      try { await invoke('get_hermes_sessions'); }
      catch (error) { console.debug('Hermes health check unavailable:', error); }
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
        if (activeSidebarTab === 'hermes' && !document.getElementById('hermesSessionError')) {
          const status = document.createElement('p');
          status.id = 'hermesSessionError';
          status.className = 'navigation-empty';
          status.setAttribute('role', 'status');
          status.textContent = 'Hermes sessions unavailable.';
          personasListEl.appendChild(status);
        }
      }
    }

    // Navigation reads existing collections; selecting a Persona leaves the transcript mounted.
    function renderUnifiedSidebar() {
      const filter = searchPersonasEl.value.toLowerCase().trim();
      document.getElementById('navigationPanelTitle').textContent = activeSidebarTab === 'hermes' ? 'Personal Agent' : 'Agents';
      document.getElementById('tabPersonas').setAttribute('aria-pressed', String(activeSidebarTab === 'personas'));
      document.getElementById('tabHermes').setAttribute('aria-pressed', String(activeSidebarTab === 'hermes'));

      const hermesAgent = {
        id: 'hermes',
        name: 'Hermes (Personal Agent)',
        avatar: '⚡',
        isDefaultHermes: true
      };
      const allAgents = [hermesAgent, ...personas];
      const sessionsFor = agent => agent.isDefaultHermes ? hermesSessions : (agentSessionsMap[agent.id] || []);
      const matchesAgent = agent => [agent.name, agent.title].some(value => String(value || '').toLowerCase().includes(filter));
      const matchesSession = session => [session.title, session.id].some(value => String(value || '').toLowerCase().includes(filter));
      const navigationRoots = [personasListEl, personaOptionsEl];
      const previousScroll = new Map(navigationRoots.flatMap(root => [...root.querySelectorAll('[data-navigation-scroll]')])
        .map(el => [el.dataset.navigationScroll, el.scrollTop]));
      const focusedControl = navigationRoots.some(root => root.contains(document.activeElement)) ? document.activeElement.dataset.navigationKey : null;
      const optionsScroll = personaOptionsEl.scrollTop;
      personasListEl.replaceChildren();

      let selectedAgent = activeSidebarTab === 'hermes' ? hermesAgent : personas.find(agent => agent.id === selectedPersonaId);
      if (!selectedAgent) {
        selectedAgent = personas.find(agent => agent.id === activeAgentId) || personas[0];
        selectedPersonaId = selectedAgent?.id || null;
        if (selectedAgent) expandedAgents.add(selectedAgent.id);
      }
      personaSelectorEl.hidden = activeSidebarTab === 'hermes';
      document.getElementById('hermesNavigationContext').hidden = activeSidebarTab !== 'hermes';
      document.getElementById('selectedPersonaIdentity').innerHTML = `<span class="agent-avatar">${workspaceUI.avatar(selectedAgent)}</span><span class="agent-name">${escapeHtml(selectedAgent?.name || 'Select Persona')}</span>`;
      personaSelectorEl.title = selectedAgent?.name || 'Select Persona';
      personaSelectorEl.setAttribute('aria-label', `Choose Persona: ${selectedAgent?.name || 'none selected'}`);
      document.getElementById('btnClearConversationSearch').hidden = searchPersonasEl.value.length === 0;
      const searchTrigger = document.getElementById('btnSearchConversations');
      searchTrigger.classList.toggle('is-filtered', Boolean(filter));
      searchTrigger.title = filter ? 'Search conversations · Filter active' : 'Search Personas and conversations';
      searchTrigger.setAttribute('aria-label', searchTrigger.title);
      personaOptionsEl.replaceChildren();
      for (const agent of personas) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `agent-card-header persona-navigation-item${selectedAgent?.id === agent.id ? ' is-selected' : ''}`;
        row.dataset.navigationKey = `persona:${agent.id}`;
        row.setAttribute('aria-pressed', String(selectedAgent?.id === agent.id));
        row.title = agent.name;
        row.innerHTML = `<span class="agent-avatar">${workspaceUI.avatar(agent)}</span><span class="agent-name">${escapeHtml(agent.name)}</span>`;
        row.onclick = () => {
          selectedPersonaId = agent.id;
          expandedAgents.add(agent.id);
          personaSurface.close();
          if (activeSidebarTab !== 'personas') document.getElementById('tabPersonas').click();
          activatePersona(agent);
        };
        personaOptionsEl.appendChild(row);
      }
      if (!personas.length) {
        const empty = document.createElement('p');
        empty.className = 'navigation-empty';
        empty.textContent = 'No Personas available.';
        personaOptionsEl.appendChild(empty);
      }
      personaOptionsEl.scrollTop = optionsScroll;
      if (selectedAgent) renderPersonaHistory(selectedAgent);

      for (const el of navigationRoots.flatMap(root => [...root.querySelectorAll('[data-navigation-scroll]')])) {
        el.scrollTop = previousScroll.get(el.dataset.navigationScroll) || 0;
      }
      if (focusedControl) {
        navigationRoots.flatMap(root => [...root.querySelectorAll('[data-navigation-key]')])
          .find(el => el.dataset.navigationKey === focusedControl)?.focus({ preventScroll: true });
      }

      function renderPersonaHistory(agent) {
        const agentSessions = sessionsFor(agent);
        const filteredSessions = agentSessions.filter(session => !filter || matchesAgent(agent) || matchesSession(session));
        const history = document.createElement('section');
        const isExpanded = expandedAgents.has(agent.id) || Boolean(filter);
        history.className = `agent-card persona-history${isExpanded ? ' expanded' : ''}`;
        history.setAttribute('aria-label', `${agent.name} conversations`);
        const header = document.createElement('div');
        header.className = 'persona-history-header';
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'history-toggle btn-ghost';
        toggle.dataset.navigationKey = `history:${agent.id}`;
        toggle.setAttribute('aria-expanded', String(isExpanded));
        toggle.setAttribute('aria-controls', 'selectedPersonaHistory');
        toggle.innerHTML = `<span>Conversations</span><span class="agent-toggle" aria-hidden="true">${workspaceUI.icon('chevron')}</span>`;
        toggle.onclick = () => {
          const open = history.classList.contains('expanded');
          if (open) expandedAgents.delete(agent.id);
          else expandedAgents.add(agent.id);
          history.classList.add('is-disclosing');
          body.inert = open;
          history.classList.toggle('expanded', !open);
          toggle.setAttribute('aria-expanded', String(!open));
        };
        const newChatBtn = document.createElement('button');
        newChatBtn.type = 'button';
        newChatBtn.className = 'btn-new-agent-chat btn-ghost btn-icon';
        newChatBtn.dataset.navigationKey = `new-session:${agent.id}`;
        newChatBtn.innerHTML = workspaceUI.icon('plus');
        newChatBtn.title = `New ${agent.name} Session`;
        newChatBtn.setAttribute('aria-label', newChatBtn.title);
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
            selectedPersonaId = agent.id;
            selectItem('persona', newMeta.id);
          } catch (err) {
            alert('Failed to create new session: ' + err);
          }
        };
        header.append(toggle, newChatBtn);
        const body = document.createElement('div');
        body.id = 'selectedPersonaHistory';
        body.className = 'agent-sessions-container';
        body.inert = !isExpanded;
        body.dataset.navigationScroll = `history:${agent.id}`;
        const entries = datedEntries(filteredSessions, agent);
        const MAX_INITIAL = 5;
        const isShowAll = expandedSessionsAgents.has(agent.id) || Boolean(filter);
        appendDateGroups(body, isShowAll ? entries : entries.slice(0, MAX_INITIAL), false);
        if (!entries.length) {
          const empty = document.createElement('p');
          empty.className = 'navigation-empty';
          empty.textContent = filter ? 'No matching conversations for this Persona.' : 'No conversations yet. Use + to start a session.';
          body.appendChild(empty);
        }
        if (entries.length > MAX_INITIAL && !filter) {
          const more = document.createElement('button');
          more.type = 'button';
          more.className = 'btn-show-more-sessions btn-ghost';
          more.dataset.navigationKey = `more-sessions:${agent.id}`;
          more.setAttribute('aria-expanded', String(isShowAll));
          more.innerHTML = workspaceUI.icon(isShowAll ? 'arrow-up' : 'chevron') + (isShowAll
            ? '<span>Show fewer sessions</span>'
            : `<span>${entries.length - MAX_INITIAL} earlier sessions...</span>`);
          more.onclick = () => {
            if (expandedSessionsAgents.has(agent.id)) expandedSessionsAgents.delete(agent.id);
            else expandedSessionsAgents.add(agent.id);
            renderUnifiedSidebar();
          };
          body.appendChild(more);
        }
        // Cross-Persona search results stay distinct from the selected Persona's history.
        if (filter) {
          const otherMatches = allAgents.filter(other => other.id !== agent.id).flatMap(other =>
            datedEntries(sessionsFor(other).filter(session => matchesAgent(other) || matchesSession(session)), other));
          if (otherMatches.length) {
            const results = document.createElement('section');
            results.className = 'conversation-search-results';
            results.setAttribute('aria-label', 'Other matching conversations');
            const title = document.createElement('h3');
            title.className = 'sidebar-section-title';
            title.textContent = 'Other matching conversations';
            results.appendChild(title);
            appendDateGroups(results, sortDatedEntries(otherMatches.map((entry, index) => ({ ...entry, index }))), true);
            body.appendChild(results);
          }
        }
        history.append(header, body);
        personasListEl.appendChild(history);
      }

      function appendDateGroups(container, entries, showOwner) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
        const groups = new Map();
        for (const entry of entries) {
          const date = entry.date;
          const day = date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() : null;
          if (!groups.has(day)) groups.set(day, []);
          groups.get(day).push(entry);
        }
        for (const [day, group] of groups) {
          const section = document.createElement('section');
          section.className = 'conversation-date-group';
          const heading = document.createElement('h3');
          heading.className = 'conversation-date-heading';
          heading.textContent = day === null ? 'Earlier / Undated' : day === today ? 'Today' : day === yesterday ? 'Yesterday'
            : new Date(day).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
          section.setAttribute('aria-label', heading.textContent);
          section.appendChild(heading);
          for (const { session, agent, date } of group) {
            const isHermes = Boolean(agent.isDefaultHermes);
            const selected = activeId === session.id && activeMode === (isHermes ? 'session' : 'persona');
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `sub-session-item${selected ? ' active' : ''}`;
            item.dataset.navigationKey = `session:${agent.id}:${session.id}`;
            if (selected) item.setAttribute('aria-current', 'true');
            item.title = `${session.title || session.id}${showOwner ? ` · ${agent.name}` : ''}${date ? ` · ${date.toLocaleString()}` : ''}`;
            item.innerHTML = `<span class="sub-session-icon">${workspaceUI.sessionIcon(session.source)}</span>
              <span class="session-label"><span class="sub-session-title">${escapeHtml(session.title || session.id)}</span>${showOwner ? `<span class="session-owner">${escapeHtml(agent.name)}</span>` : ''}</span>
              ${date ? `<time class="sub-session-time" datetime="${date.toISOString()}">${escapeHtml(formatTimestamp(date))}</time>` : ''}`;
            item.onclick = (e) => {
              e.stopPropagation();
              activeAgentId = agent.id;
              selectedPersonaId = agent.id;
              selectItem(isHermes ? 'session' : 'persona', session.id);
            };
            section.appendChild(item);
          }
          container.appendChild(section);
        }
      }
    }

    function parseSessionTimestamp(value) {
      if (value === null || value === undefined || typeof value === 'boolean') return null;
      const raw = typeof value === 'string' ? value.trim() : value;
      if (raw === '') return null;
      let date;
      if (typeof raw === 'number' || (typeof raw === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(raw))) {
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) return null;
        date = new Date(Math.abs(numeric) < 100000000000 ? numeric * 1000 : numeric);
      } else if (typeof raw === 'string') {
        const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ].*)?$/.exec(raw);
        if (!iso) return null;
        const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3]);
        if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
        date = new Date(raw);
      } else return null;
      return Number.isFinite(date.getTime()) ? date : null;
    }

    function sessionDate(session) {
      for (const value of [session.last_activity_at, session.last_active, session.updated_at, session.created_at]) {
        const date = parseSessionTimestamp(value);
        if (date) return date;
      }
      return null;
    }

    function sortDatedEntries(entries) {
      return entries.sort((a, b) => {
        if (!a.date) return b.date ? 1 : a.index - b.index;
        if (!b.date) return -1;
        return b.date.getTime() - a.date.getTime() || a.index - b.index;
      });
    }

    function datedEntries(sessions, agent) {
      return sortDatedEntries(sessions.map((session, index) => ({ session, agent, date: sessionDate(session), index })));
    }

    function formatTimestamp(date) {
      const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSec >= 0 && diffSec < 60) return 'just now';
      if (diffSec >= 0 && diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec >= 0 && diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function hermesIdentity() {
      return { id: 'hermes', name: 'Hermes (Personal Agent)', avatar: '⚡', title: 'Personal Agent' };
    }

    function conversationOwner(mode, id) {
      if (!id) return null;
      if (mode === 'session') {
        const session = hermesSessions.find(item => item.id === id);
        return session ? { persona: hermesIdentity(), session, isHermes: true } : null;
      }
      if (mode !== 'persona') return null;
      for (const [collectionOwner, sessions] of Object.entries(agentSessionsMap)) {
        const session = sessions.find(item => item.id === id);
        if (!session) continue;
        const ownerId = session.agent_id || collectionOwner;
        const storedPersona = personas.find(item => item.id === ownerId);
        const persona = storedPersona || (ownerId === 'hermes' ? hermesIdentity() : null);
        return persona ? { persona, session, isHermes: !storedPersona && ownerId === 'hermes' } : null;
      }
      // Real Persona IDs remain compatible with existing legacy single-chat selection.
      const persona = personas.find(item => item.id === id);
      return persona ? { persona, session: null } : null;
    }

    function updateConversationIdentity(owner, mode) {
      const persona = owner?.persona;
      activePersonaAvatarEl.innerHTML = workspaceUI.avatar(persona);
      activePersonaNameEl.textContent = persona?.name || 'Select a Persona';
      activePersonaNameEl.title = activePersonaNameEl.textContent;
      activePersonaTitleEl.textContent = mode === 'session' && owner?.session
        ? `${owner.session.title || owner.session.id} · ${owner.session.source || 'cli'} · ${owner.session.model || 'hermes'}`
        : persona?.title || persona?.description || 'Choose an Agent or Personal Agent to start';
      activePersonaTitleEl.title = activePersonaTitleEl.textContent;
      btnEditPersonaEl.style.display = mode === 'persona' && persona && !owner.isHermes ? 'flex' : 'none';
      btnClearChatEl.style.display = mode === 'persona' && activeId ? 'flex' : 'none';
    }

    function showEmptyConversation(persona) {
      window.AxionMotion.cancelConversation();
      window.AxionConferenceUI?.leave();
      ++historyLoadEpoch;
      activeMode = 'persona';
      activeId = null;
      activeAgentId = persona?.id || null;
      selectedPersonaId = activeAgentId;
      updateConversationIdentity(persona ? { persona, session: null } : null, 'persona');
      refreshSendControl();
      renderMessages([], 'persona', null);
      refreshThinkingControl();
      renderUnifiedSidebar();
    }

    async function reconcileConversationSelection() {
      if (activeMode === 'conference') return;
      const owner = conversationOwner(activeMode, activeId);
      if (owner) {
        updateConversationIdentity(owner, activeMode);
        refreshSendControl();
      }
      else if (activeMode === 'persona') {
        const persona = personas.find(item => item.id === activeAgentId || item.id === selectedPersonaId) || personas[0];
        if (persona) await activatePersona(persona);
        else showEmptyConversation(null);
      }
    }

    async function activatePersona(persona) {
      if (!persona) return;
      selectedPersonaId = persona.id;
      expandedAgents.add(persona.id);
      const latest = datedEntries(agentSessionsMap[persona.id] || [], persona)
        .find(entry => conversationOwner('persona', entry.session.id)?.persona.id === persona.id);
      if (latest) await selectItem('persona', latest.session.id);
      else showEmptyConversation(persona);
    }

    // Navigation never relabels an old transcript while the next history is loading.
    async function selectItem(mode, id) {
      const owner = conversationOwner(mode, id);
      if (!owner) return;
      window.AxionMotion.cancelConversation();
      window.AxionConferenceUI?.leave();
      const changed = activeMode !== mode || activeId !== id;
      activeMode = mode;
      activeId = id;
      activeAgentId = owner.persona.id;
      selectedPersonaId = owner.persona.id;
      expandedAgents.add(owner.persona.id);
      activeSidebarTab = owner.isHermes ? 'hermes' : 'personas';
      document.getElementById('tabPersonas').classList.toggle('active', activeSidebarTab === 'personas');
      document.getElementById('tabHermes').classList.toggle('active', activeSidebarTab === 'hermes');
      if (changed) {
        ++historyLoadEpoch;
        messagesContainerEl.innerHTML = '<div class="empty-state" role="status"><p>Loading conversation…</p></div>';
      }
      updateConversationIdentity(owner, mode);
      refreshSendControl();
      refreshThinkingControl();
      renderUnifiedSidebar();
      await loadMessages(id, mode);
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
        if (epoch === historyLoadEpoch && activeId === id && activeMode === mode) {
          messagesContainerEl.innerHTML = '<div class="empty-state" role="alert"><h3>Conversation unavailable</h3><p>Unable to load this conversation. Select it again to retry.</p></div>';
          restoreLiveRequest(mode, id);
        }
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
      const persona = mode === 'persona' ? (conversationOwner(mode, id)?.persona || (!id ? personas.find(p => p.id === activeAgentId) : null)) : null;
      const session = mode === 'session' ? hermesSessions.find(s => s.id === id) : null;

      if (!messages || messages.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state conversation-welcome';
        if (mode === 'persona') {
          emptyDiv.classList.add('persona-welcome');
          emptyDiv.innerHTML = `
            <div class="big-emoji">${workspaceUI.avatar(persona)}</div>
            <h3>${escapeHtml(persona?.name || 'Choose a Persona')}</h3>
            <p>${escapeHtml(persona?.description || (persona ? 'Create a new session to start a conversation.' : 'Select an Agent or Personal Agent to view its conversations.'))}</p>
          `;
        } else {
          emptyDiv.innerHTML = `
            <div class="big-emoji">${workspaceUI.sessionIcon(session?.source)}</div>
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
      const row = document.createElement('div');
      row.className = `message-row ${role}`;
      row.dataset.conversationKey = JSON.stringify([mode, activeId]);
      if (animate) row.classList.add('motion-new');

      const contentBox = document.createElement('div');
      contentBox.className = 'message-content';

      // If structured tools are present, render a single DeepSeek-style collapsible thinking accordion
      if (tools && tools.length > 0) {
        const accordion = document.createElement('div');
        accordion.className = 'thinking-accordion';

        const toolCount = tools.length;
        const banner = document.createElement('div');
        banner.className = 'thinking-header';
        banner.setAttribute('role', 'button');
        banner.tabIndex = 0;
        banner.setAttribute('aria-expanded', 'false');
        banner.onclick = () => accordion.classList.toggle('open');
        banner.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); banner.click(); }
        };
        banner.innerHTML = `
          <div class="thinking-badge">
            <span class="thinking-icon">${workspaceUI.icon('reasoning')}</span>
            <span>Thought (${toolCount} action${toolCount > 1 ? 's' : ''} executed)</span>
          </div>
          <span class="thinking-toggle">${workspaceUI.icon('chevron')}</span>
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
          
          let icon = workspaceUI.icon('bolt');
          if (t.name.includes('code') || t.name.includes('terminal')) icon = workspaceUI.icon('terminal');
          else if (t.name.includes('file') || t.name.includes('patch')) icon = workspaceUI.icon('folder');
          else if (t.name.includes('search')) icon = workspaceUI.icon('search');
          else if (t.name.includes('vision')) icon = workspaceUI.icon('eye');

          card.innerHTML = `
            <div class="tool-card-header" data-action="toggleKnowledge">
              <span class="tool-card-title">${icon} <span>${escapeHtml(t.name)}</span></span>
              <span class="tool-card-toggle">${workspaceUI.icon('chevron')}</span>
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

      row.appendChild(contentBox);
      messagesContainerEl.appendChild(row);
      if (animate && role === 'user') window.AxionMotion.enter(row, { kind: 'message', distance: 8, duration: 200 });

      row.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });

      scrollToBottom();
      return contentBox;
    }

    function scrollToBottom() {
      messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
    }

    // Reflect the existing send guards without owning the request lifecycle.
    function refreshSendControl() {
      const validContext = Boolean(activeId && (activeMode === 'persona' || activeMode === 'session') && conversationOwner(activeMode, activeId));
      const unsavedResponse = [...pendingChatSaves.values()].some(request =>
        request.origin.id === activeId && request.origin.mode === activeMode);
      btnSendEl.disabled = !chatInputEl.value.trim() || !validContext || isStreaming || unsavedResponse;
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
      const composerTransition = window.AxionMotion.captureComposer(messagesContainerEl);
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
      btnSendEl.style.display = 'none'; refreshSendControl();
      btnStopEl.style.display = 'flex'; btnStopEl.disabled = false;
      refreshThinkingControl();
      window.AxionMotion.settleComposer(composerTransition);
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
          if (isOriginVisible() && !scrollTracker.userHasScrolledUp) scrollTracker.scrollToBottom(messagesContainerEl);
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
          if (isFirstToken && preparedMarkdown.length > 0) {
            isFirstToken = false; clearInterval(timerInterval); statusEl.remove();
            if (isOriginVisible()) window.AxionMotion.enter(responseTextEl, { kind: 'response', distance: 4, duration: 180 });
          }
          let html = marked.parse(preparedMarkdown);
          if (meta.active) html += '<span class="streaming-cursor"></span>';
          else if (request.stopped) html += `<div class="stream-stopped-badge">${workspaceUI.icon('stop')} Stopped by user</div>`;
          responseTextEl.innerHTML = html;
          if (isOriginVisible()) {
            if (!scrollTracker.userHasScrolledUp) scrollTracker.scrollToBottom(messagesContainerEl);
            btnScrollBottomEl?.classList.toggle('visible', scrollTracker.userHasScrolledUp);
          }
        },
        onDone: (finalRawText, interrupted) => {
          clearInterval(timerInterval); thinkingCtrl.complete(); statusEl.remove();
          responseTextEl.querySelectorAll('pre code').forEach(block => window.hljs?.highlightElement(block));
          attachCodeCopyButtons();
          if (isOriginVisible() && !scrollTracker.userHasScrolledUp) scrollTracker.scrollToBottom(messagesContainerEl);
          request.savePromise = persist(finalRawText);
          // Attach a handler immediately; finally awaits the original promise and reports errors.
          request.savePromise.catch(() => {});
        }
      });
      request.controller = streamCtrl; activeStreamController = streamCtrl; abortController = request.abort;
      request.stop = async () => {
        if (request.stopped || !streamCtrl.isActive()) return;
        window.AxionMotion.cancelConversation();
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
          retry.onclick=async()=>{retry.disabled=true;try {await persist(streamCtrl.getText());el.remove();}catch(e){retry.disabled=false;retry.textContent='Retry saving (still unavailable)';}finally {refreshSendControl();}};
          el.appendChild(retry);assistantContentBox.appendChild(el);
        }
        if (activeChatRequest === request) {
          const restoreFocus = shouldRestoreFocus();
          activeChatRequest = null; isStreaming = false; activeStreamController = null; abortController = null;
          btnSendEl.style.display='flex'; refreshSendControl();btnStopEl.style.display='none';btnStopEl.disabled=false;
          if (restoreFocus) chatInputEl.focus({preventScroll:true});
          settleRequest();
        }
      }
    }

    function sendQuickPrompt(promptText) {
      chatInputEl.value = promptText;
      refreshSendControl();
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

      const title = `${agentName || 'Axion Mind'} finished`;
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
          copyBtn.className = 'btn-copy-code btn-ghost btn-compact';
          copyBtn.innerHTML = workspaceUI.icon('copy') + '<span>Copy</span>';
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(codeBlock.innerText);
            copyBtn.innerHTML = workspaceUI.icon('check') + '<span>Copied!</span>';
            copyBtn.style.color = 'var(--ax-success)';
            setTimeout(() => {
              copyBtn.innerHTML = workspaceUI.icon('copy') + '<span>Copy</span>';
              copyBtn.style.color = 'var(--ax-text-secondary)';
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

    function syncAvatarPresets() {
      const value = document.getElementById('modalPersonaEmoji').value;
      document.querySelectorAll('#personaModal .emoji-btn').forEach(button => {
        const selected = button.dataset.value === value;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }
    document.getElementById('modalPersonaEmoji').addEventListener('input', syncAvatarPresets);

    // Modal logic
    function setModalEmoji(emoji) {
      document.getElementById('modalPersonaEmoji').value = emoji;
      syncAvatarPresets();
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
      syncAvatarPresets();
      personaModalEl.classList.add('open');
    };

    btnEditPersonaEl.onclick = () => {
      if (activeMode !== 'persona') return;
      const persona = conversationOwner(activeMode, activeId)?.persona || personas.find(item => item.id === activeAgentId);
      if (!persona) return;

      document.getElementById('modalTitle').textContent = 'Edit Persona';
      document.getElementById('modalPersonaId').value = persona.id;
      document.getElementById('modalPersonaName').value = persona.name;
      document.getElementById('modalPersonaTitle').value = persona.title || '';
      document.getElementById('modalPersonaDesc').value = persona.description || '';
      document.getElementById('modalPersonaEmoji').value = persona.avatar || persona.emoji || '🤖';
      document.getElementById('modalPersonaSystemPrompt').value = persona.system_prompt || '';
      btnDeletePersonaEl.style.display = 'block';
      syncAvatarPresets();
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
          optgroup.label = providerName;
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
        customGroup.label = 'Custom / Other';
        const customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = 'Enter Custom Model...';
        customGroup.appendChild(customOpt);
        hermesModelSelectEl.appendChild(customGroup);

        if (!foundActive && activeModel) {
          const currentOpt = document.createElement('option');
          currentOpt.value = activeModel;
          currentOpt.textContent = `${activeModel} (Current Active)`;
          currentOpt.selected = true;
          hermesModelSelectEl.insertBefore(currentOpt, hermesModelSelectEl.firstChild);
        }

        hermesManualModelContainer.style.display = hermesModelSelectEl.value === '__custom__' ? 'block' : 'none';
        if (hermesModelSelectEl.value !== '__custom__') {
          hermesModelInputEl.value = hermesModelSelectEl.value;
        }

        hermesModelStatusBadgeEl.textContent = `${modelList.length} AIs Connected`;
        hermesModelStatusBadgeEl.style.color = 'var(--ax-success)';
      } catch (e) {
        hermesModelStatusBadgeEl.textContent = 'Detection error';
        hermesModelStatusBadgeEl.style.color = 'var(--ax-danger)';
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
    // Keep this viewport-anchored menu outside the composer's temporary FLIP transform.
    document.body.appendChild(chatModelDropdownMenu);
    const chatModelPickerLabel = document.getElementById('chatModelPickerLabel');
    const chatModelPickerIcon = document.getElementById('chatModelPickerIcon');

    // Keep the existing menu beside its trigger without clipping in a scroll region.
    function positionChatModelMenu() {
      if (chatModelDropdownMenu.style.display !== 'block') return;
      const triggerBounds = btnChatModelPicker.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const menuWidth = Math.max(0, Math.min(384, viewportWidth - 32));
      const triggerTop = Math.max(16, Math.min(triggerBounds.top, viewportHeight - 16));
      const triggerBottom = Math.max(16, Math.min(triggerBounds.bottom, viewportHeight - 16));
      const spaceAbove = Math.max(0, triggerTop - 24);
      const spaceBelow = Math.max(0, viewportHeight - triggerBottom - 24);
      const opensAbove = spaceAbove >= spaceBelow;
      chatModelDropdownMenu.style.inlineSize = `${menuWidth}px`;
      chatModelDropdownMenu.style.left = `${Math.max(16, Math.min(triggerBounds.left, viewportWidth - menuWidth - 16))}px`;
      chatModelDropdownMenu.style.top = opensAbove ? 'auto' : `${triggerBottom + 8}px`;
      chatModelDropdownMenu.style.bottom = opensAbove ? `${viewportHeight - triggerTop + 8}px` : 'auto';
      chatModelDropdownMenu.style.maxBlockSize = `${Math.min(440, opensAbove ? spaceAbove : spaceBelow)}px`;
    }
    window.addEventListener('resize', positionChatModelMenu, { passive: true });
    window.addEventListener('scroll', positionChatModelMenu, { capture: true, passive: true });

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
      if (!modelId) return workspaceUI.icon('model');
      const lower = modelId.toLowerCase();
      if (lower.includes('claude') || lower.includes('sonnet') || lower.includes('opus')) return workspaceUI.icon('reasoning');
      if (lower.includes('gemini') || lower.includes('argon') || lower.includes('flash')) return workspaceUI.icon('bolt');
      if (lower.includes('deepseek') || lower.includes('reasoner')) return workspaceUI.icon('bolt');
      return workspaceUI.icon('model');
    }

    function setChatModel(modelId, displayName) {
      currentChatModel = modelId;
      const formatted = displayName || formatModelName(modelId);
      chatModelPickerLabel.textContent = formatted;
      chatModelPickerIcon.innerHTML = getModelIcon(modelId);

      document.querySelectorAll('.chat-model-menu-item').forEach(el => {
        const isMatch = el.getAttribute('data-model') === modelId;
        el.style.background = isMatch ? 'var(--ax-selected)' : 'transparent';
        const check = el.querySelector('.model-check');
        if (check) check.style.opacity = isMatch ? '1' : '0';
      });

      document.querySelectorAll('.quick-model-btn').forEach(btn => {
        const isActive = btn.dataset.value === modelId;
        btn.style.borderColor = isActive ? 'var(--ax-primary)' : 'var(--ax-border)';
        btn.style.color = isActive ? 'var(--ax-primary)' : 'var(--ax-text-muted)';
      });

      const restoreModelFocus = chatModelDropdownMenu.contains(document.activeElement);
      chatModelDropdownMenu.inert = true;
      chatModelDropdownMenu.style.display = 'none';
      if (restoreModelFocus) btnChatModelPicker.focus({ preventScroll: true });

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
        searchBox.className = 'menu-search';
        searchBox.innerHTML = `
          <input type="text" id="modelFilterInput" aria-label="Search models" placeholder="Search models..." value="${escapeHtml(modelSearchQuery)}" class="form-input">
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
        listContainer.className = 'menu-list';
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
            listContainer.innerHTML = '<div class="menu-empty">No models match your search.</div>';
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
              groupHeader.className = 'menu-heading';
              groupHeader.textContent = groupName;
              listContainer.appendChild(groupHeader);

              items.forEach(m => {
                const item = document.createElement('div');
                item.className = 'chat-model-menu-item';
                item.setAttribute('data-model', m.id);

                const isSelected = m.id === currentChatModel;
                if (isSelected) {
                  item.style.background = 'var(--ax-selected)';
                  item.style.border = '1px solid var(--ax-control-border)';
                } else {
                  item.style.border = '1px solid transparent';
                }

                const friendlyName = formatModelName(m.id);
                item.innerHTML = `
                  <div class="model-menu-identity">
                    <span class="model-menu-icon">${getModelIcon(m.id)}</span>
                    <div class="model-menu-details">
                      <span class="model-menu-name" style="font-weight: ${isSelected ? '600' : '500'};">${escapeHtml(friendlyName)}</span>
                      <span class="model-menu-meta">${escapeHtml(m.id)}</span>
                    </div>
                  </div>
                  <span class="model-check" style="opacity: ${isSelected ? '1' : '0'};">${workspaceUI.icon('check')}</span>
                `;

                item.onmouseenter = () => {
                  if (item.getAttribute('data-model') !== currentChatModel) {
                    item.style.background = 'var(--ax-hover)';
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
        customContainer.className = 'menu-custom';
        customContainer.innerHTML = `
          <label class="menu-heading" for="customModelDirectInput">Use Custom Model ID</label>
          <div class="model-custom-controls">
            <input type="text" id="customModelDirectInput" placeholder="e.g. claude-3-7-sonnet" class="form-input">
            <button type="button" id="btnApplyCustomDirectModel" class="btn-primary">Set</button>
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
        window.AxionMotion.cancelConversation();
        chatModelDropdownMenu.inert = false;
        chatModelDropdownMenu.style.display = 'block';
        positionChatModelMenu();
      } else {
        chatModelDropdownMenu.inert = true;
        chatModelDropdownMenu.style.display = 'none';
      }
    };

    chatModelDropdownMenu.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      chatModelDropdownMenu.inert = true;
      chatModelDropdownMenu.style.display = 'none';
      btnChatModelPicker.focus({ preventScroll: true });
    }, true);

    document.addEventListener('click', (e) => {
      if (!chatModelDropdownMenu.contains(e.target) && e.target !== btnChatModelPicker) {
        chatModelDropdownMenu.inert = true;
        chatModelDropdownMenu.style.display = 'none';
      }
    });

    window.runHermesQuickCommand = async (cmd) => {
      hermesConsoleOutputEl.textContent = `Running: hermes ${cmd}...\n(Executing live diagnostics, please wait a moment...)\n`;
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
      btnModeLocalHermes.setAttribute('aria-pressed', String(mode === 'hermes_local'));
      btnModeDirectCloud.setAttribute('aria-pressed', String(mode === 'direct_cloud'));
      btnModeCustomGateway.setAttribute('aria-pressed', String(mode === 'custom_gateway'));
      btnModeLocalHermes.style.setProperty('--control-fill', mode === 'hermes_local' ? 'var(--ax-primary)' : 'var(--ax-surface)');
      btnModeLocalHermes.style.setProperty('--control-ink', mode === 'hermes_local' ? 'var(--ax-on-action)' : 'var(--ax-text)');
      btnModeDirectCloud.style.setProperty('--control-fill', mode === 'direct_cloud' ? 'var(--ax-primary)' : 'var(--ax-surface)');
      btnModeDirectCloud.style.setProperty('--control-ink', mode === 'direct_cloud' ? 'var(--ax-on-action)' : 'var(--ax-text)');
      btnModeCustomGateway.style.setProperty('--control-fill', mode === 'custom_gateway' ? 'var(--ax-primary)' : 'var(--ax-surface)');
      btnModeCustomGateway.style.setProperty('--control-ink', mode === 'custom_gateway' ? 'var(--ax-on-action)' : 'var(--ax-text)');

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
        dot.style.background = 'var(--ax-success)';
      } else if (currentConfig.mode === 'custom_gateway') {
        modeText.textContent = 'Custom Server';
        dot.style.background = 'var(--ax-text-secondary)';
      } else {
        modeText.textContent = 'Local Hermes';
        dot.style.background = 'var(--ax-text-secondary)';
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

      setControlBusy(btnSaveSettingsEl, true);
      try {
        await invoke('save_connection_config', { config: currentConfig });
        updateSidebarConnIndicator();
        closeSettingsModal();
        await fetchPersonas();
        await reconcileConversationSelection();
        renderUnifiedSidebar();
      } catch (err) {
        alert('Failed to save settings: ' + err);
      } finally { setControlBusy(btnSaveSettingsEl, false); }
    };

    // Browse Folder for Cloud / Persistent Storage
    document.getElementById('btnPickStorageDir').onclick = async () => {
      const button = document.getElementById('btnPickStorageDir');
      setControlBusy(button, true);
      try {
        const folder = await invoke('pick_folder');
        if (folder) {
          document.getElementById('cfgStorageDir').value = folder;
        }
      } catch (e) {
        console.error('Error picking folder:', e);
      } finally { setControlBusy(button, false); }
    };

    btnTestConnEl.onclick = async () => {
      cfgTestStatusEl.style.display = 'block';
      cfgTestStatusEl.style.color = 'var(--ax-info)';
      cfgTestStatusEl.style.border = '1px solid var(--ax-control-border)';
      setInterfaceFeedback(cfgTestStatusEl, 'activity', 'Testing connection ping...');

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

      setControlBusy(btnTestConnEl, true);
      try {
        const res = await invoke('test_connection', { config: probeConfig });
        cfgTestStatusEl.style.color = 'var(--ax-success)';
        cfgTestStatusEl.style.border = '1px solid var(--ax-control-border)';
        setInterfaceFeedback(cfgTestStatusEl, 'check', res);
      } catch (err) {
        cfgTestStatusEl.style.color = 'var(--ax-danger)';
        cfgTestStatusEl.style.border = '1px solid var(--ax-control-border)';
        setInterfaceFeedback(cfgTestStatusEl, 'alert', String(err));
      } finally { setControlBusy(btnTestConnEl, false); }
    };

    // 1-Click Backup Export & Restore Logic
    const btnExportBackupEl = document.getElementById('btnExportBackup');
    const btnRestoreBackupEl = document.getElementById('btnRestoreBackup');
    const backupFeedbackEl = document.getElementById('backupFeedback');

    btnExportBackupEl.onclick = async () => {
      backupFeedbackEl.style.display = 'block';
      backupFeedbackEl.style.color = 'var(--ax-info)';
      setInterfaceFeedback(backupFeedbackEl, 'activity', 'Creating compressed backup zip archive...');
      setControlBusy(btnExportBackupEl, true);
      try {
        const zipFile = await invoke('export_customer_backup');
        backupFeedbackEl.style.color = 'var(--ax-success)';
        setInterfaceFeedback(backupFeedbackEl, 'check', 'Backup saved to: ' + zipFile);
      } catch (err) {
        backupFeedbackEl.style.color = 'var(--ax-danger)';
        setInterfaceFeedback(backupFeedbackEl, 'alert', 'Backup failed: ' + err);
      } finally { setControlBusy(btnExportBackupEl, false); }
    };

    btnRestoreBackupEl.onclick = async () => {
      setControlBusy(btnRestoreBackupEl, true);
      try {
        const selectedZip = await invoke('pick_backup_zip_file');
        if (!selectedZip) return;

        if (!confirm(`Are you sure you want to restore data from:\n${selectedZip}\n\nThis replaces matching personas, chats, and conference room files. Unlisted files are kept.`)) {
          return;
        }

        backupFeedbackEl.style.display = 'block';
        backupFeedbackEl.style.color = 'var(--ax-info)';
        setInterfaceFeedback(backupFeedbackEl, 'activity', 'Restoring backup archive...');

        const restoredCount = await invoke('restore_customer_backup', { zipPath: selectedZip });
        backupFeedbackEl.style.color = 'var(--ax-success)';
        setInterfaceFeedback(backupFeedbackEl, 'check', `Successfully restored ${restoredCount} files! Refreshing...`);

        setTimeout(async () => {
          await fetchPersonas();
          await reconcileConversationSelection();
          renderUnifiedSidebar();
          closeSettingsModal();
        }, 1500);
      } catch (err) {
        backupFeedbackEl.style.display = 'block';
        backupFeedbackEl.style.color = 'var(--ax-danger)';
        setInterfaceFeedback(backupFeedbackEl, 'alert', 'Restore failed: ' + err);
      } finally { setControlBusy(btnRestoreBackupEl, false); }
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
    const railSignOutEl = document.getElementById('btnRailSignOut');
    document.getElementById('btnSidebarSignIn').onclick = openAuthModal;
    railSignOutEl.onclick = () => btnLogoutEl.click();
    new MutationObserver(() => { railSignOutEl.disabled = btnLogoutEl.disabled; })
      .observe(btnLogoutEl, { attributes: true, attributeFilter: ['disabled'] });
    railSignOutEl.disabled = btnLogoutEl.disabled;

    function updateRailAccountSummary() {
      const summary = accountUserEmailEl.textContent;
      btnOpenAuthModalEl.title = `User menu · ${summary}`;
      btnOpenAuthModalEl.setAttribute('aria-label', `User menu: ${summary}`);
    }


    let currentAuthMode = 'login'; // 'login' or 'register'
    let cloudAccountSession = null; // Tokens stay in memory; persistence is backend DPAPI only.
    let cloudAutoBackup = null, cloudJobBusy = false;

    function renderAccountSession(userObj) {
      cloudAccountSession = userObj || null;
      const signedIn = Boolean(userObj && userObj.email && userObj.id && userObj.token);
      document.getElementById('sidebarSignedOut').hidden = signedIn;
      railSignOutEl.hidden = !signedIn;
      document.getElementById('btnSidebarSignIn').hidden = signedIn;
      authLoggedInViewEl.style.display = signedIn ? 'block' : 'none';
      authLoggedOutViewEl.style.display = signedIn ? 'none' : 'block';
      loggedInUserEmailEl.textContent = signedIn ? userObj.email : '';
      accountUserEmailEl.textContent = signedIn ? userObj.email : 'Local / Sign In';
      accountUserEmailEl.title = accountUserEmailEl.textContent;
      document.getElementById('accountStorageMode').textContent = signedIn ? 'Local workspace · Cloud account verified' : 'Local workspace · Not signed in';
      updateRailAccountSummary();
      accountAvatarDotEl.style.background = signedIn ? 'var(--ax-success)' : 'var(--ax-text-muted)';
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
        document.getElementById('diagOverviewStatus').textContent = 'Unable to refresh diagnostics. Previously displayed values may be out of date.';
      }
    }

    function renderDiagnosticsStatus(s) {
      if (!s) return;
      document.getElementById('diagOverviewStatus').textContent = `Last received: ${s.timestamp} · Axion Mind ${s.app_version} · ${s.os_info}`;
      document.getElementById('diagModelPorts').textContent = 'Local bridge availability';
      setInterfaceFeedback(document.getElementById('diagStorageStatus'), s.storage_writable ? 'check' : 'alert', s.storage_writable ? 'ONLINE (R/W OK)' : 'ERROR (Blocked)');
      document.getElementById('diagStorageStatus').style.color = s.storage_writable ? 'var(--ax-success)' : 'var(--ax-danger)';
      document.getElementById('diagStoragePath').textContent = s.storage_dir;
      document.getElementById('diagStoragePath').title = s.storage_dir;

      document.getElementById('diagRagStatus').textContent = `${s.frameworks_count + s.anecdotes_count} Knowledge Cards`;
      document.getElementById('diagRagDetails').textContent = `${s.frameworks_count} FW · ${s.anecdotes_count} Anecdotes · ${s.personas_count} Persona(s)`;

      const activeBridges = [];
      if (s.hermes_reachable) activeBridges.push('Hermes (8642)');
      if (s.antigravity_reachable) activeBridges.push('Antigravity (8766)');
      if (s.gemini_web_reachable) activeBridges.push('Argon (8768)');
      if (s.deepseek_reachable) activeBridges.push('DeepSeek (8769)');
      setInterfaceFeedback(document.getElementById('diagModelStatus'), activeBridges.length > 0 ? 'model' : 'alert', activeBridges.length > 0 ? activeBridges.join(', ') : 'No Local Bridge');
      document.getElementById('diagModelStatus').style.color = activeBridges.length > 0 ? 'var(--ax-info)' : 'var(--ax-danger)';

      document.getElementById('diagCloudStatus').textContent = s.supabase_reachable ? 'Supabase reachable · backup status is separate' : 'Cloud unreachable · local files retained';
      document.getElementById('diagCloudStatus').style.color = s.supabase_reachable ? 'var(--ax-success)' : 'var(--ax-danger)';
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
        diagTerminalConsoleEl.innerHTML = '<p class="diagnostic-log-empty">No diagnostic events match the current filter.</p>';
        return;
      }

      let html = '';
      for (const log of filtered) {
        let levelClass = '';
        const lvl = (log.level || '').toUpperCase();
        if (lvl.includes('ERROR') || lvl.includes('FATAL')) levelClass = 'is-error';
        else if (lvl.includes('WARN')) levelClass = 'is-warning';
        else if (lvl.includes('DEBUG') || lvl.includes('TRACE')) levelClass = 'is-muted';

        html += `<div class="diagnostic-log-row">`;
        html += `<span class="diagnostic-log-time">[${escapeHtml(log.timestamp)}]</span> `;
        html += `<span class="diagnostic-log-level ${levelClass}">[${escapeHtml(log.level)}]</span> `;
        html += `<span class="diagnostic-log-tag">[${escapeHtml(log.tag)}]</span> `;
        html += `<span class="diagnostic-log-message">${escapeHtml(log.message)}</span>`;
        if (log.details) {
          html += `<div class="diagnostic-log-details">└─ ${escapeHtml(log.details)}</div>`;
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
        document.querySelectorAll('.diag-filter-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        currentDiagFilter = btn.dataset.filter;
        renderDiagnosticsLogs();
      };
    });

    inputFilterDiagLogsEl.oninput = renderDiagnosticsLogs;
    btnOpenDiagnosticsEl.onclick = openDiagnosticsModal;
    btnCloseDiagnosticsModalEl.onclick = closeDiagnosticsModal;

    btnRunDeepHealthCheckEl.onclick = async () => {
      setControlBusy(btnRunDeepHealthCheckEl, true);
      btnRunDeepHealthCheckEl.innerHTML = workspaceUI.icon('activity') + '<span>Scanning...</span>';
      try {
        const report = await invoke('run_system_diagnostics');
        renderDiagnosticsStatus(report);
        await refreshDiagnosticsData();
        const issuesCount = report.issues_detected ? report.issues_detected.length : 0;
        setInterfaceFeedback(document.getElementById('diagExportStatusFeedback'), issuesCount === 0 ? 'check' : 'alert', issuesCount === 0 ? 'Health scan passed! 0 issues found.' : `Scan flagged ${issuesCount} item(s).`);
      } catch (err) {
        document.getElementById('diagExportStatusFeedback').textContent = 'Scan error: ' + err;
      } finally {
        setControlBusy(btnRunDeepHealthCheckEl, false);
        btnRunDeepHealthCheckEl.innerHTML = workspaceUI.icon('bolt') + '<span>Run Full Health Check</span>';
      }
    };

    btnExportDiagnosticReportEl.onclick = async () => {
      setControlBusy(btnExportDiagnosticReportEl, true);
      btnExportDiagnosticReportEl.innerHTML = workspaceUI.icon('activity') + '<span>Writing...</span>';
      try {
        const exportPath = await invoke('export_diagnostic_report');
        setInterfaceFeedback(document.getElementById('diagExportStatusFeedback'), 'check', `Saved: ${exportPath}`);
      } catch (err) {
        document.getElementById('diagExportStatusFeedback').textContent = `Export failed: ${err}`;
      } finally {
        setControlBusy(btnExportDiagnosticReportEl, false);
        btnExportDiagnosticReportEl.innerHTML = workspaceUI.icon('download') + '<span>Export Report (.md)</span>';
      }
    };

    btnRefreshDiagnosticLogsEl.onclick = refreshDiagnosticsData;
    btnClearDiagnosticLogsEl.onclick = async () => {
      await invoke('clear_system_logs');
      await refreshDiagnosticsData();
    };

    document.getElementById('btnAccountCloudBackup').onclick = openAuthModal;
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
        authFeedbackEl.style.color = kind === 'error' ? 'var(--ax-danger)' : 'var(--ax-success)';
        authFeedbackEl.textContent = message === 'Signed in with Google. Cloud sync is available; use Sync Now to synchronize your data.'
          ? 'Signed in with Google. Cloud backup is available; signing in does not verify a backup.' : message;
      },
      onBusy: busy => {
        btnGoogleSignInEl.disabled = busy;
        btnGoogleSignInEl.setAttribute('aria-busy', String(busy));
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
      tabLoginEl.setAttribute('aria-pressed', 'true');
      tabRegisterEl.setAttribute('aria-pressed', 'false');
      btnSubmitAuthEl.textContent = 'Sign In';
    };

    tabRegisterEl.onclick = () => {
      currentAuthMode = 'register';
      tabRegisterEl.setAttribute('aria-pressed', 'true');
      tabLoginEl.setAttribute('aria-pressed', 'false');
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
        authFeedbackEl.style.color = 'var(--ax-danger)';
        authFeedbackEl.textContent = 'Please enter both email and password.';
        return;
      }

      btnSubmitAuthEl.setAttribute('aria-busy', 'true');
      try {
        authFeedbackEl.style.display = 'block';
        authFeedbackEl.style.color = 'var(--ax-info)';
        setInterfaceFeedback(authFeedbackEl, 'activity', currentAuthMode === 'login' ? 'Connecting & Authenticating...' : 'Creating account on Cloud Vault...');

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

            authFeedbackEl.style.color = 'var(--ax-success)';
            authFeedbackEl.textContent = 'Signed in. Cloud backup is available; no backup has been verified by signing in.';
            updateAccountUI();
            setTimeout(closeAuthModal, 1200);
            return;
          } catch (sbError) {
            authFeedbackEl.style.color = 'var(--ax-danger)';
            authFeedbackEl.textContent = 'Supabase: ' + (sbError.message || sbError);
            return;
          }
        }

        authFeedbackEl.textContent = 'Cloud authentication is not configured. Local mode does not require sign-in.';
      } finally { btnSubmitAuthEl.setAttribute('aria-busy', 'false'); }
    };

    btnLogoutEl.onclick = async () => {
      localStorage.removeItem('axion_mind_user');
      try {
        await invoke('clear_user_cloud_session');
      } catch (_) {}
      await updateAccountUI();
      authFeedbackEl.style.display = 'block';
      authFeedbackEl.style.color = 'var(--ax-warning)';
      authFeedbackEl.textContent = 'Signed out. Operating in offline/local-only mode.';
    };

    // Verified manual cloud backup. Authentication and backup are separate states.
    const recoveryButtonEl = document.getElementById('btnRecoverCloudBackup');
    const cancelBackupEl = document.getElementById('btnCancelCloudBackup');
    function cloudBackupStatus(message, kind = 'info') {
      authFeedbackEl.style.display = 'block';
      authFeedbackEl.style.whiteSpace = 'pre-wrap';
      authFeedbackEl.style.overflowWrap = 'anywhere';
      authFeedbackEl.style.color = kind === 'error' ? 'var(--ax-danger)' : kind === 'success' ? 'var(--ax-success)' : 'var(--ax-info)';
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
      updateRailAccountSummary();
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
      setInterfaceFeedback(statusEl, 'activity', 'Distilling Knowledge Bank via Hermes Mind... (Extracting rules, math & style)');
      document.getElementById('btnAutoCloneMind').style.opacity = '0.5';
      const finishBrandActivity = workspaceUI.beginActivity();

      try {
        const result = await invoke('clone_persona_from_source', { name: name, source: source });
        statusEl.style.color = 'var(--ax-success)';
        setInterfaceFeedback(statusEl, 'check', 'Knowledge Bank extracted! Review details below and click Save Persona.');
        
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
          syncAvatarPresets();
        }
      } catch (err) {
        statusEl.style.color = 'var(--ax-danger)';
        setInterfaceFeedback(statusEl, 'alert', 'Cloning error: ' + err);
      } finally {
        document.getElementById('btnAutoCloneMind').style.opacity = '1';
        finishBrandActivity();
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

        const keepConversation = existingIdx >= 0 && activeMode === 'persona'
          && conversationOwner(activeMode, activeId)?.persona.id === personaId;
        closeModal();
        await fetchPersonas();
        if (keepConversation && conversationOwner(activeMode, activeId)) {
          updateConversationIdentity(conversationOwner(activeMode, activeId), activeMode);
          renderUnifiedSidebar();
        } else await activatePersona(personas.find(persona => persona.id === personaId));
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
          await activatePersona(nextPersona);
        } else {
          showEmptyConversation(null);
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
        refreshSendControl();
      };

      // Enter to send
      chatInputEl.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      };

      btnSendEl.onclick = sendMessage;
      refreshSendControl();

      // Smart Floating Jump to Bottom Button
      if (btnScrollBottomEl) {
        btnScrollBottomEl.onclick = () => {
          if (activeScrollTracker) {
            activeScrollTracker.scrollToBottom(messagesContainerEl, !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
          } else {
            messagesContainerEl.scrollTo({ top: messagesContainerEl.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
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

      // Sidebar Tab Switching
      const tabPersonas = document.getElementById('tabPersonas');
      const tabHermes = document.getElementById('tabHermes');
      if (tabPersonas && tabHermes) {
        tabPersonas.onclick = () => {
          activeSidebarTab = 'personas';
          tabPersonas.className = 'sidebar-tab-btn active';
          tabHermes.className = 'sidebar-tab-btn';
          renderUnifiedSidebar();
        };

        tabHermes.onclick = () => {
          activeSidebarTab = 'hermes';
          tabHermes.className = 'sidebar-tab-btn active';
          tabPersonas.className = 'sidebar-tab-btn';
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

    // Real session selection happens after the native collections have loaded.
    renderUnifiedSidebar();
    showEmptyConversation(null);

    // Start
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
