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

  // Render existing update results without changing download/install/restart decisions.
  function showUpdateStatus(state, title, message, retry = false) {
    const modal = document.getElementById('updateModal');
    if (!modal) return;
    modal.dataset.updateState = state;
    document.getElementById('updateDialogTitle').textContent = title;
    document.getElementById('updateDialogDescription').textContent = message;
    document.getElementById('updateVersionComparison').hidden = true;
    document.getElementById('updateNotesSection').style.display = 'none';
    document.getElementById('updateProgressSection').style.display = 'none';
    document.getElementById('updateStatusMsg').style.display = 'none';
    document.getElementById('btnPerformUpdate').hidden = true;
    document.getElementById('btnRetryUpdateCheck').hidden = !retry;
    document.getElementById('btnCloseUpdateModal').disabled = false;
    document.getElementById('btnLaterUpdate').disabled = false;
    document.getElementById('btnLaterUpdate').textContent = 'Close';
    modal.querySelector('.modal-body').setAttribute('aria-busy', String(state === 'checking'));
    modal.classList.add('open');
  }

  function showUpdateModal(update) {
    currentPendingUpdate = update;
    const modal = document.getElementById('updateModal');
    if (!modal) return;
    modal.dataset.updateState = 'available';
    document.getElementById('updateDialogTitle').textContent = 'Update available';
    document.getElementById('updateDialogDescription').textContent = 'Review the release, then update and restart Axion Mind.';
    document.getElementById('updateVersionComparison').hidden = false;
    document.getElementById('btnRetryUpdateCheck').hidden = true;
    document.getElementById('btnCloseUpdateModal').disabled = false;
    modal.querySelector('.modal-body').setAttribute('aria-busy', 'false');

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
      btnPerform.hidden = false;
      btnPerform.disabled = false;
      btnPerform.textContent = 'Update & Restart';
    }
    if (btnLater) {
      btnLater.disabled = false;
      btnLater.textContent = 'Remind Me Later';
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
    if (manual) showUpdateStatus('checking', 'Checking for updates', 'Contacting the configured update service…');

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
        showUpdateStatus('current', 'No update available', update?.current_version
          ? `You are running Axion Mind ${update.current_version}.` : 'The update service reports no available update.');
      }
    } catch (err) {
      console.warn('Update check status:', err);
      if (manual) {
        showUpdateStatus('check-error', 'Update check unavailable', 'Could not verify updates at this time: ' + (err?.message || err), true);
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
    const updateModal = document.getElementById('updateModal');
    updateModal.dataset.updateState = 'downloading';
    updateModal.querySelector('.modal-body').setAttribute('aria-busy', 'true');
    document.getElementById('btnCloseUpdateModal').disabled = true;
    const progressTrack = document.getElementById('updateProgressTrack');
    progressTrack.dataset.indeterminate = 'true';
    progressTrack.removeAttribute('aria-valuenow');
    progressTrack.setAttribute('aria-valuetext', 'Downloading; total size not yet reported');

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
    }
    if (btnLater) {
      btnLater.disabled = true;
    }
    if (progSec) progSec.style.display = 'flex';
    if (progBar) progBar.style.width = '0%';
    if (progPct) progPct.textContent = '—';
    if (statusMsg) statusMsg.style.display = 'none';

    try {
      await invoke('download_and_install_update');
      updateModal.dataset.updateState = 'restarting';
      progressTrack.dataset.indeterminate = 'false';
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
      updateModal.dataset.updateState = 'install-error';
      updateModal.querySelector('.modal-body').setAttribute('aria-busy', 'false');
      document.getElementById('btnCloseUpdateModal').disabled = false;
      progressTrack.dataset.indeterminate = 'false';
      if (btnPerform) {
        btnPerform.disabled = false;
        btnPerform.textContent = 'Retry Update';
      }
      if (btnLater) {
        btnLater.disabled = false;
      }
      if (statusMsg) {
        statusMsg.style.display = 'block';
        statusMsg.style.background = 'var(--ax-danger-subtle)';
        statusMsg.style.color = 'var(--ax-danger)';
        statusMsg.style.border = '1px solid var(--ax-control-border)';
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

        const track = document.getElementById('updateProgressTrack');
        if (payload.percentage !== null && payload.percentage !== undefined) {
          track.dataset.indeterminate = 'false';
          track.setAttribute('aria-valuenow', String(payload.percentage));
          track.setAttribute('aria-valuetext', payload.percentage + '% downloaded');
          if (progBar) progBar.style.width = payload.percentage + '%';
          if (progPct) progPct.textContent = payload.percentage + '%';
          if (progLabel) progLabel.textContent = 'Downloading update (' + payload.percentage + '%)...';
        } else if (payload.downloaded_bytes) {
          track.dataset.indeterminate = 'true';
          track.removeAttribute('aria-valuenow');
          if (progPct) progPct.textContent = '—';
          const mb = (payload.downloaded_bytes / (1024 * 1024)).toFixed(1);
          if (progLabel) progLabel.textContent = 'Downloaded ' + mb + ' MB...';
          track.setAttribute('aria-valuetext', 'Downloaded ' + mb + ' MB; total size not reported');
        }
      });

      window.__TAURI__.event.listen('updater-downloaded', () => {
        document.getElementById('updateModal').dataset.updateState = 'installing';
        const track = document.getElementById('updateProgressTrack');
        track.dataset.indeterminate = 'false';
        track.setAttribute('aria-valuenow', '100');
        track.setAttribute('aria-valuetext', 'Download complete. Installing.');
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
    document.getElementById('btnRetryUpdateCheck')?.addEventListener('click', () => document.getElementById('btnCheckAppUpdate')?.click());
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
