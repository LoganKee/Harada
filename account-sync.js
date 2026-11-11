(() => {
  'use strict';

  const app = () => window.HaradaApp;
  const account = () => window.HaradaFriends?.getSyncAccount();
  const linkKey = 'harada-account-link-v1';
  const fields = ['categories', 'goals', 'entries', 'charts', 'sharedGoalIds'];
  let running = false;
  let manualCheck = false;
  let timer;
  let status = 'Sign in under Friends to sync your goals and check-ins.';
  let canStart = false;
  let confirmedOwner = null;

  function snapshot(state = app().getState()) {
    return JSON.parse(JSON.stringify({
      categories: state.categories,
      goals: state.goals,
      entries: state.entries,
      charts: state.charts,
      sharedGoalIds: state.sharedGoalIds || []
    }));
  }

  function fingerprint(value) {
    if (Array.isArray(value)) return '[' + value.map(fingerprint).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(key =>
        JSON.stringify(key) + ':' + fingerprint(value[key])
      ).join(',') + '}';
    }
    return JSON.stringify(value);
  }

  function hasHistory(state) {
    return state.goals.length > 0 ||
      Object.values(state.entries).some(entries => Object.keys(entries).length > 0);
  }

  function valid(state) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    return object(state) && Array.isArray(state.categories) && state.categories.length === 8 &&
      Array.isArray(state.goals) && object(state.entries) && object(state.charts) &&
      Array.isArray(state.sharedGoalIds) && fields.every(key => Object.hasOwn(state, key));
  }

  function show(message, start = false) {
    status = message;
    canStart = start;
    draw();
  }

  function draw() {
    const panel = document.querySelector('#harada-account-sync');
    if (!panel) return;
    const message = panel.querySelector('[data-sync-status]');
    const button = panel.querySelector('[data-sync-now]');
    message.textContent = manualCheck && running ? 'Checking account sync…' : status;
    button.hidden = !account();
    button.textContent = manualCheck && running ? 'Syncing…' : canStart ? 'Start sync from this device' : 'Sync now';
    button.disabled = manualCheck && running;
    button.onclick = () => {
      const owner = account();
      if (!owner) return;
      if (running) {
        manualCheck = true;
        draw();
        return;
      }
      if (canStart && confirm('Use the goals and check-ins on this device to start account sync?')) {
        confirmedOwner = owner.id;
      } else if (canStart) {
        return;
      }
      return sync(true);
    };
  }

  function remember(id, state) {
    localStorage.setItem(linkKey, JSON.stringify({ id, baseline: fingerprint(state) }));
  }

  function backUp(id) {
    const key = 'harada-before-account-sync-' + id;
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify(app().getState()));
    }
  }

  async function sync(manual = false) {
    if (running) return;
    const owner = account();
    if (!owner) {
      show('Sign in under Friends to sync your goals and check-ins.');
      return;
    }

    running = true;
    manualCheck = manual;
    if (manual) draw();
    const { id, db } = owner;
    try {
      const link = JSON.parse(localStorage.getItem(linkKey) || 'null');
      if (link && link.id !== id) {
        show('Sync paused. The data on this device is linked to a different account.');
        return;
      }

      const table = () => db.from('harada_account_state');
      const { data: remote, error } = await table().select('state,revision').eq('user_id', id).maybeSingle();
      if (error) throw error;
      if (account()?.id !== id) return;

      const local = snapshot();
      const localVersion = fingerprint(local);
      const persisted = JSON.parse(localStorage.getItem('gbb-v2') || 'null');
      if (persisted && localVersion !== fingerprint(snapshot(persisted))) {
        show('Sync paused. Another tab changed this device’s data. Reopen Harada to sync the latest copy.');
        return;
      }
      if (!remote) {
        if (link) {
          show('Sync paused. The account copy is missing. Your device data is still here.');
          return;
        }
        if (confirmedOwner !== id || !hasHistory(local)) {
          show(hasHistory(local)
            ? 'Start sync on the device that has your goals and check-ins.'
            : 'No account history yet. Start sync on the device that already has your goals.', hasHistory(local));
          return;
        }
        backUp(id);
        const result = await table().insert({ user_id: id, state: local });
        if (result.error) throw result.error;
        if (account()?.id !== id) return;
        remember(id, local);
      } else {
        if (!valid(remote.state)) throw new Error('Invalid account data');
        const remoteVersion = fingerprint(remote.state);
        if (localVersion === remoteVersion) {
          if (link?.baseline !== localVersion) remember(id, local);
        } else if (link ? localVersion === link.baseline : !hasHistory(local)) {
          if (!app().canApplySync()) {
            show('Account data is ready. Finish your current edit, then sync again.');
            return;
          }
          backUp(id);
          app().applySync(remote.state);
          remember(id, remote.state);
        } else if (link && remoteVersion === link.baseline) {
          const result = await table().update({ state: local, revision: remote.revision + 1 })
            .eq('user_id', id).eq('revision', remote.revision).select('revision').maybeSingle();
          if (result.error) throw result.error;
          if (account()?.id !== id) return;
          if (!result.data) {
            show('Sync paused. Another device updated the account. Tap Sync now to check again.');
            return;
          }
          remember(id, local);
        } else {
          show('Sync paused. This device and your account have different changes. Both copies are preserved. Export a backup before resolving.');
          return;
        }
      }
      if (manualCheck || !status.startsWith('Goals and check-ins are synced.')) {
        const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
        show('Goals and check-ins are synced. Checked at ' + time + '.');
      }
      if (!link || link.baseline !== fingerprint(snapshot())) window.HaradaFriends?.scheduleSync();
    } catch {
      show('Sync unavailable. Your local goals and check-ins are still saved. Tap Sync now to retry.');
    } finally {
      confirmedOwner = null;
      running = false;
      manualCheck = false;
      draw();
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(sync, 500);
  }

  function canRemoveMissingSharedGoals(id) {
    try {
      const link = JSON.parse(localStorage.getItem(linkKey) || 'null');
      return link?.id === id && link.baseline === fingerprint(snapshot());
    } catch {
      return false;
    }
  }

  window.HaradaAccountSync = { draw, schedule, canRemoveMissingSharedGoals };
  window.addEventListener('online', schedule);
  window.addEventListener('focus', schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') sync();
  }, 15000);
  schedule();
})();
