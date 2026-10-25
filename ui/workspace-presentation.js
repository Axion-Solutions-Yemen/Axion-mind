/* Workspace identity and motion. Never owns navigation, requests, or stored data. */
(function (root) {
  'use strict';
  function icon(name) {
    const symbol = document.getElementById(`icon-${name}`) ? name : 'agent';
    return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><use href="#icon-${symbol}"></use></svg>`;
  }
  const builtInIdentities = Object.freeze({
    'alex-hormozi': ['Alex Hormozi', '💼', 'ah-monogram'],
    'tech-architect': ['Tech & AI Architect', '💻', 'terminal'],
    'marketing-explorer': ['Marketing Trends Explorer', '🔥', 'flame'],
    'research-analyst': ['Deep Research Analyst', '🔬', 'research'],
    hermes: ['Hermes (Personal Agent)', '⚡', 'bolt']
  });
  const alexDefaultAvatars = new Set(['💼', '🏋', '🏋️', '🏋‍♂', '🏋️‍♂', '🏋‍♂️', '🏋️‍♂️']);
  const presetIcons = Object.freeze({ '💼': 'briefcase', '💻': 'terminal', '🔥': 'flame', '🔬': 'research', '🚀': 'rocket', '🧠': 'reasoning', '📈': 'chart', '🛡️': 'shield', '🤖': 'agent' });
  function avatar(agent) {
    const value = agent?.avatar || agent?.emoji;
    const builtIn = builtInIdentities[agent?.id];
    if (agent?.id === 'alex-hormozi' && agent.name === 'Alex Hormozi' && (!value || alexDefaultAvatars.has(value))) return icon('ah-monogram');
    if (!value) return icon('agent');
    if (builtIn && agent.name === builtIn[0] && value === builtIn[1]) return icon(builtIn[2]);
    if (presetIcons[value]) return icon(presetIcons[value]);
    const text = document.createElement('span');
    text.textContent = value;
    return text.innerHTML;
  }
  function sessionIcon(source) {
    return icon(({ telegram: 'telegram', cli: 'terminal', api_server: 'globe', agent: 'bolt' })[source] || 'chat');
  }

  const mark = document.getElementById('axionBrandMark');
  const movingPiece = mark?.querySelector('.axion-mark-secondary');
  const reducedMotion = root.matchMedia('(prefers-reduced-motion: reduce)');
  let navigationAnimation;
  let activeOperations = 0;
  function animateNavigation() {
    if (!movingPiece || reducedMotion.matches) return;
    navigationAnimation?.cancel();
    navigationAnimation = movingPiece.animate([
      { transform: 'translate(0, 0)' },
      { transform: 'translate(2px, -1px)', offset: .4 },
      { transform: 'translate(0, 0)' }
    ], { duration: 280, easing: 'cubic-bezier(.2, .7, .2, 1)' });
  }
  document.addEventListener('click', event => {
    if (event.target.closest?.('#tabPersonas, #tabHermes, .agent-card-header, .sub-session-item, .btn-new-agent-chat, #conferenceRooms button')) animateNavigation();
  }, true);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) navigationAnimation?.cancel();
  });
  function beginActivity() {
    activeOperations += 1;
    mark?.classList.add('is-busy');
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      activeOperations -= 1;
      mark?.classList.toggle('is-busy', activeOperations > 0);
    };
  }
  root.AxionPresentation = Object.freeze({ icon, avatar, sessionIcon, beginActivity });
})(window);
