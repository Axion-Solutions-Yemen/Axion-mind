(function () {
  'use strict';

  let currentPendingUpdate = null;
  let isChecking = false;
  let isInstalling = false;

  async function invoke(cmd, args) {
    if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
      return window.__TAURI__.core.invoke(cmd, args);
    }
    if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
      return window.__TAURI_INTERNALS__.invoke(cmd, args);
    }
    throw new Error('Tauri IPC unavailable');
  }

  function showUpdateModal(update) {
    currentPendingUpdate = update;
    const modal = document.getElementById('updateModal');
    if (!modal) return;

    const targetVer = document.getElementById('updateTargetVersion');
    const currentVer = document.getElementById('updateCurrentVersion');
    const notesSec = document.getElementById('updateNotesSection');
    const notesEl = document.getElementById('updateReleaseNotes');
    const progSec = document.getElementById('updateProgressSection');
    const statusMsg = document.getElementById('updateStatusMsg');
    const btnPerform = document.getElementById('btnPerformUpdate');
    const btnLater = document.getElementById('btnLaterUpdate');

    if (targetVer) targetVer.textContent = 'v' + update.version.replace(/^v/, '');
    if (currentVer) currentVer.textContent = 'v' + update.current_version.replace(/^v/, '');

    if (notesSec && notesEl) {
      if (update.body && update.body.trim()) {
        notesEl.textContent = update.body.trim();
        notesSec.style.display = 'block';
      } else {
        notesSec.style.display = 'none';
      }
    }

    if (progSec) progSec.style.display = 'none';
    if (statusMsg) statusMsg.style.display = 'none';

    if (btnPerform) {
      btnPerform.disabled = false;
      btnPerform.textContent = 'Update & Restart';
      btnPerform.style.opacity = '1';
    }
    if (btnLater) {
      btnLater.disabled = false;
      btnLater.style.opacity = '1';
    }

    modal.classList.add('open');
  }

  function closeUpdateModal() {
    if (isInstalling) return;
    const modal = document.getElementById('updateModal');
    if (modal) modal.classList.remove('open');
  }

  async function checkForUpdates(manual = false) {
    if (isChecking) return;
    isChecking = true;

    const btnCheck = document.getElementById('btnCheckAppUpdate');
    const origText = btnCheck ? btnCheck.textContent : '';
    if (btnCheck && manual) {
      btnCheck.disabled = true;
      btnCheck.textContent = 'Checking...';
    }

    try {
      const update = await invoke('check_for_updates');
      if (update && update.available) {
        showUpdateModal(update);
      } else if (manual) {
        alert("You're running the latest version of Axion Mind (" + (update?.current_version || 'v0.2.0') + ").");
      }
    } catch (err) {
      console.warn('Update check status:', err);
      if (manual) {
        alert('Could not verify updates at this time: ' + (err?.message || err));
      }
    } finally {
      isChecking = false;
      if (btnCheck && manual) {
        btnCheck.disabled = false;
        btnCheck.textContent = origText;
      }
    }
  }

  async function performUpdate() {
    if (isInstalling) return;
    isInstalling = true;

    const btnPerform = document.getElementById('btnPerformUpdate');
    const btnLater = document.getElementById('btnLaterUpdate');
    const progSec = document.getElementById('updateProgressSection');
    const progBar = document.getElementById('updateProgressBar');
    const progLabel = document.getElementById('updateProgressLabel');
    const progPct = document.getElementById('updateProgressPercent');
    const statusMsg = document.getElementById('updateStatusMsg');

    if (btnPerform) {
      btnPerform.disabled = true;
      btnPerform.textContent = 'Downloading...';
      btnPerform.style.opacity = '0.7';
    }
    if (btnLater) {
      btnLater.disabled = true;
      btnLater.style.opacity = '0.5';
    }
    if (progSec) progSec.style.display = 'flex';
    if (progBar) progBar.style.width = '0%';
    if (progPct) progPct.textContent = '0%';
    if (statusMsg) statusMsg.style.display = 'none';

    try {
      await invoke('download_and_install_update');
      if (progLabel) progLabel.textContent = 'Installing & relaunching...';
      if (btnPerform) btnPerform.textContent = 'Restarting...';
      setTimeout(async () => {
        try {
          await invoke('restart_app');
        } catch (_) {
          window.location.reload();
        }
      }, 800);
    } catch (err) {
      isInstalling = false;
      if (btnPerform) {
        btnPerform.disabled = false;
        btnPerform.textContent = 'Retry Update';
        btnPerform.style.opacity = '1';
      }
      if (btnLater) {
        btnLater.disabled = false;
        btnLater.style.opacity = '1';
      }
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
        statusMsg.style.color = '#fca5a5';
        statusMsg.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        statusMsg.textContent = 'Update failed: ' + (err?.message || err);
      }
    }
  }

  function initListeners() {
    if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function') {
      window.__TAURI__.event.listen('updater-progress', (event) => {
        const payload = event.payload;
        if (!payload) return;
        const progBar = document.getElementById('updateProgressBar');
        const progPct = document.getElementById('updateProgressPercent');
        const progLabel = document.getElementById('updateProgressLabel');

        if (payload.percentage !== null && payload.percentage !== undefined) {
          if (progBar) progBar.style.width = payload.percentage + '%';
          if (progPct) progPct.textContent = payload.percentage + '%';
          if (progLabel) progLabel.textContent = 'Downloading update (' + payload.percentage + '%)...';
        } else if (payload.downloaded_bytes) {
          const mb = (payload.downloaded_bytes / (1024 * 1024)).toFixed(1);
          if (progLabel) progLabel.textContent = 'Downloaded ' + mb + ' MB...';
        }
      });

      window.__TAURI__.event.listen('updater-downloaded', () => {
        const progLabel = document.getElementById('updateProgressLabel');
        const progPct = document.getElementById('updateProgressPercent');
        const progBar = document.getElementById('updateProgressBar');
        if (progBar) progBar.style.width = '100%';
        if (progPct) progPct.textContent = '100%';
        if (progLabel) progLabel.textContent = 'Download complete. Installing...';
      });
    }

    document.getElementById('btnCloseUpdateModal')?.addEventListener('click', closeUpdateModal);
    document.getElementById('btnLaterUpdate')?.addEventListener('click', closeUpdateModal);
    document.getElementById('btnPerformUpdate')?.addEventListener('click', performUpdate);
    document.getElementById('btnCheckAppUpdate')?.addEventListener('click', () => checkForUpdates(true));

    window.axionCheckForUpdates = checkForUpdates;
    window.__testShowUpdateModal = showUpdateModal;

    setTimeout(() => {
      checkForUpdates(false);
    }, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initListeners);
  } else {
    initListeners();
  }
})();
