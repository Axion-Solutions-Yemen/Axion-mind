(() => {
  'use strict';
  const invoke = (name, args) => {
    const fn = window.__TAURI__?.core?.invoke;
    if (!fn) return Promise.reject(new Error('يتطلب تطبيق سطح المكتب / Desktop application required'));
    return fn(name, args);
  };
  const el = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
  const mount = () => {
    const sidebar = document.querySelector('.sidebar-search'); if (!sidebar) return;
    const open = el('button', 'معرفتي / My Knowledge'); open.type = 'button'; sidebar.after(open);
    const dialog = el('dialog'); dialog.dir = 'rtl'; dialog.setAttribute('aria-label', 'معرفتي');
    dialog.style.cssText = 'margin:auto;padding:24px;max-width:680px;width:90%;max-height:85vh;overflow:auto;background:#171923;color:white;border:1px solid #555';
    dialog.append(el('h2', 'معرفتي / My Knowledge'), el('p', 'نسخة محلية تجريبية. لا تُشارك تلقائياً مع المستشارين ولا تُضمّن في النسخ الاحتياطية الحالية. Local pilot: not yet injected into chats or included in existing backups.'));
    const scope = el('input'); scope.value = 'personal'; scope.setAttribute('aria-label', 'نطاق المعرفة / Knowledge scope');
    const fact = el('textarea'); fact.setAttribute('aria-label', 'المعلومة / Fact'); fact.placeholder = 'ماذا تريد أن أتذكر؟';
    const source = el('input'); source.setAttribute('aria-label', 'المصدر / Source'); source.placeholder = 'مصدر المعلومة / Source';
    const status = el('p'); status.setAttribute('role', 'status');
    const list = el('div'); const save = el('button', 'مراجعة وحفظ / Review and save'); const refresh = el('button', 'عرض / Refresh'); const close = el('button', 'إغلاق / Close');
    dialog.append(scope, fact, source, save, refresh, status, list, close); document.body.append(dialog);
    let busy = false;
    const run = async (fn) => { if (busy) return; busy = true; save.disabled = refresh.disabled = true; try { await fn(); } catch (e) { status.textContent = e.message || String(e); } finally { busy = false; save.disabled = refresh.disabled = false; } };
    const load = async () => {
      const rows = await invoke('knowledge_list', { scope: scope.value }); list.replaceChildren();
      for (const row of rows) {
        const item = el('section'); item.append(el('p', row.fact), el('small', row.source));
        const edit = el('button', 'تصحيح / Correct'); const forget = el('button', 'نسيان / Forget');
        edit.addEventListener('click', () => run(async () => {
          const value = prompt('المعلومة الصحيحة / Correct fact', row.fact); if (value === null) return;
          const origin = prompt('مصدر التصحيح / Correction source'); if (!origin || !confirm(value)) return;
          await invoke('knowledge_correct', { id: row.id, fact: value, source: origin }); await load();
        }));
        forget.addEventListener('click', () => run(async () => { if (!confirm('نسيان هذه المعلومة؟ / Forget this fact?')) return; await invoke('knowledge_forget', { id: row.id }); await load(); }));
        item.append(edit, forget); list.append(item);
      }
      status.textContent = `${rows.length} معلومة معتمدة / approved facts`;
    };
    save.addEventListener('click', () => run(async () => {
      if (!fact.value.trim() || !source.value.trim()) throw new Error('المعلومة والمصدر مطلوبان / Fact and source required');
      if (!confirm(`${scope.value}\n${fact.value}\n${source.value}\nحفظ محلي؟ / Save locally?`)) return;
      const id = await invoke('knowledge_propose', { scope: scope.value, fact: fact.value, source: source.value });
      await invoke('knowledge_approve', { id }); fact.value = ''; await load();
    }));
    refresh.addEventListener('click', () => run(load)); close.addEventListener('click', () => dialog.close());
    open.addEventListener('click', () => { dialog.showModal(); run(load); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
