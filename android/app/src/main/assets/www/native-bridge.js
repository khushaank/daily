(() => {
  const api = window.DailyNative;
  if (!api) return;

  const key = 'my-daily-brief-v1';
  try {
    const saved = api.read();
    if (saved) localStorage.setItem(key, saved);
  } catch (_) {
    // The existing browser copy remains available if the private file cannot be read.
  }

  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (name, value) {
    if (name === key && !api.save(String(value))) throw new Error('Could not save the private data file');
    return setItem.call(this, name, value);
  };

  function showToast(message) {
    const toast = document.querySelector('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 3500);
  }

  function addNativeControls() {
    const exportButton = document.querySelector('[data-action="export"]');
    if (!exportButton || exportButton.dataset.nativeReady) return;
    exportButton.dataset.nativeReady = 'true';
    exportButton.querySelector('small').textContent = 'Choose where to save a JSON file';

    const restore = document.createElement('button');
    restore.type = 'button';
    restore.className = 'menu-row';
    restore.dataset.nativeAction = 'restore';
    restore.innerHTML = '<svg aria-hidden="true"><use href="#i-upload"></use></svg><span class="menu-copy"><strong>Restore a backup</strong><small>Choose a saved My Daily Brief file</small></span><span class="chevron">›</span>';
    exportButton.after(restore);

    const reminders = document.createElement('button');
    reminders.type = 'button';
    reminders.className = 'menu-row';
    reminders.dataset.nativeAction = 'reminders';
    reminders.setAttribute('role', 'switch');
    reminders.innerHTML = '<svg aria-hidden="true"><use href="#i-clock"></use></svg><span class="menu-copy"><strong>Task reminders</strong><small>Notify me when a timed task begins</small></span><span class="switch"></span>';
    document.querySelectorAll('.menu-card')[1].append(reminders);
    window.dailyNativeRemindersChanged(api.remindersEnabled(), false);

    document.querySelector('.local-note').textContent =
      'Your plan is saved in a private file on this phone. Save a backup to a location you choose before changing phones or uninstalling. Nothing is automatically uploaded or synced.';
  }

  window.dailyNativeRemindersChanged = (enabled, denied) => {
    const row = document.querySelector('[data-native-action="reminders"]');
    if (row) {
      row.setAttribute('aria-checked', String(enabled));
      row.querySelector('.switch').classList.toggle('on', enabled);
    }
    if (denied) showToast('Allow notifications in Android settings to receive reminders.');
  };

  new MutationObserver(addNativeControls).observe(document.querySelector('#app'), {childList: true});
  document.addEventListener('click', event => {
    const own = event.target.closest('[data-native-action]');
    if (own) {
      event.preventDefault();
      event.stopImmediatePropagation();
      api.haptic('tap');
      if (own.dataset.nativeAction === 'restore') api.restoreBackup();
      else api.setReminders(!api.remindersEnabled());
      return;
    }
    const exportButton = event.target.closest('[data-action="export"]');
    if (exportButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      api.haptic('tap');
      api.exportBackup();
      return;
    }
    const button = event.target.closest('[data-action]');
    if (button && !button.disabled) {
      api.haptic(button.dataset.action === 'complete' && button.getAttribute('aria-pressed') === 'false' ? 'success' : 'tap');
    }
  }, true);
})();
