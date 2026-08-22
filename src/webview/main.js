// main.js — Script Runner webview UI
(function () {
  'use strict';

  var vscode = acquireVsCodeApi();

  // ===== State =====
  var scripts = [];
  var scriptStates = {};
  var searchQuery = '';
  var currentEnv = 'all';
  var prodWarningShown = false; // transient per webview load — gates the tab switch only
  var pendingProd = null; // { kind: 'tab' } | { kind: 'run', scriptId, scriptName, command }

  // ===== DOM =====
  var searchInput = document.getElementById('search-input');
  var scriptCardsContainer = document.getElementById('script-cards');
  var loadingState = document.getElementById('loading-state');
  var emptyState = document.getElementById('empty-state');
  var noResultsState = document.getElementById('no-results-state');
  var refreshBtn = document.getElementById('refresh-btn');
  var envFilterBar = document.getElementById('env-filter-bar');
  var prodBanner = document.getElementById('prod-banner');
  var prodModal = document.getElementById('prod-modal');
  var prodModalTitle = document.getElementById('prod-modal-title');
  var prodModalBody = document.getElementById('prod-modal-body');
  var prodModalCommand = document.getElementById('prod-modal-command');
  var prodModalConfirm = document.getElementById('prod-modal-confirm');
  var prodModalCancel = document.getElementById('prod-modal-cancel');

  // ===== Init =====
  var previousState = vscode.getState();
  if (previousState) {
    scripts = previousState.scripts || [];
    scriptStates = previousState.scriptStates || {};
    searchQuery = previousState.searchQuery || '';
    currentEnv = previousState.currentEnv || 'all';
    searchInput.value = searchQuery;

    // Reset stale "running" states — processes don't survive VS Code restart
    var ids = Object.keys(scriptStates);
    for (var i = 0; i < ids.length; i++) {
      if (scriptStates[ids[i]].status === 'running') {
        scriptStates[ids[i]].status = 'stopped';
      }
    }
  }
  updateEnvTabUi();

  vscode.postMessage({ type: 'ready' });

  // ===== Events =====
  searchInput.addEventListener('input', function (e) {
    searchQuery = e.target.value.toLowerCase();
    saveState();
    renderCards();
  });

  refreshBtn.addEventListener('click', function () {
    vscode.postMessage({ type: 'refreshScripts' });
  });

  envFilterBar.addEventListener('click', function (e) {
    var tab = e.target.closest('.env-tab');
    if (!tab) { return; }
    var targetEnv = tab.dataset.env;
    if (targetEnv === currentEnv) { return; }

    if (targetEnv === 'prod' && !prodWarningShown) {
      openProdModal({ kind: 'tab' });
      return;
    }
    applyEnvChange(targetEnv);
  });

  prodModal.addEventListener('click', function (e) {
    var target = e.target.closest('[data-action]');
    if (target) {
      var action = target.dataset.action;
      if (action === 'confirm-prod') {
        var pending = pendingProd;
        closeProdModal();
        if (!pending) { return; }
        if (pending.kind === 'run') {
          vscode.postMessage({ type: 'runScript', scriptId: pending.scriptId });
        } else {
          prodWarningShown = true;
          applyEnvChange('prod');
        }
      } else if (action === 'cancel-prod') {
        closeProdModal();
      }
      return;
    }
    // Click on the overlay background (not inside .modal-content) closes it
    if (e.target === prodModal) {
      closeProdModal();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !prodModal.classList.contains('hidden')) {
      closeProdModal();
    }
  });

  // ===== Prod confirmation modal =====
  // Two entry points: switching to the Prod tab (once per webview load) and
  // running a prod-tagged script (every time — it can hit live systems).
  function openProdModal(pending) {
    pendingProd = pending;

    if (pending.kind === 'run') {
      prodModalTitle.textContent = 'Run a production script?';
      prodModalBody.textContent =
        '"' + pending.scriptName + '" targets production. Running it may affect live systems and real users.';
      prodModalCommand.textContent = pending.command;
      prodModalCommand.classList.remove('hidden');
      prodModalConfirm.textContent = 'Run in Prod';
    } else {
      prodModalTitle.textContent = 'Production Environment';
      prodModalBody.textContent =
        'You are about to view production scripts. Running these may affect live systems and real users. Please proceed with caution.';
      prodModalCommand.textContent = '';
      prodModalCommand.classList.add('hidden');
      prodModalConfirm.textContent = 'Continue to Prod';
    }

    prodModal.classList.remove('hidden');
    // Focus Cancel, not Confirm — a stray Enter must never fire a prod deploy
    prodModalCancel.focus();
  }

  function closeProdModal() {
    pendingProd = null;
    prodModal.classList.add('hidden');
  }

  function applyEnvChange(newEnv) {
    currentEnv = newEnv;
    updateEnvTabUi();
    saveState();
    renderCards();
  }

  function updateEnvTabUi() {
    var tabs = envFilterBar.querySelectorAll('.env-tab');
    for (var i = 0; i < tabs.length; i++) {
      var isActive = tabs[i].dataset.env === currentEnv;
      tabs[i].classList.toggle('active', isActive);
      tabs[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    prodBanner.classList.toggle('hidden', currentEnv !== 'prod');
  }

  // ===== Messages from Extension =====
  window.addEventListener('message', function (event) {
    var message = event.data;
    switch (message.type) {
      case 'scriptsLoaded':
        handleScriptsLoaded(message.scripts);
        break;
      case 'scriptStatusChanged':
        handleStatusChanged(message.scriptId, message.status, message.exitCode);
        break;
      case 'scriptOutput':
        handleOutput(message.scriptId, message.data);
        break;
      case 'scriptOutputCleared':
        handleOutputCleared(message.scriptId);
        break;
    }
  });

  // ===== Handlers =====
  function handleScriptsLoaded(newScripts) {
    scripts = newScripts;

    var newStates = {};
    for (var i = 0; i < scripts.length; i++) {
      var id = getScriptId(scripts[i]);
      newStates[id] = scriptStates[id] || {
        status: 'idle',
        output: [],
        expanded: false,
      };
    }
    scriptStates = newStates;

    loadingState.classList.add('hidden');
    saveState();
    renderCards();
  }

  function handleStatusChanged(scriptId, status, exitCode) {
    if (!scriptStates[scriptId]) {
      scriptStates[scriptId] = { status: 'idle', output: [], expanded: false };
    }
    scriptStates[scriptId].status = status;
    if (exitCode !== undefined) {
      scriptStates[scriptId].exitCode = exitCode;
    }

    if (status === 'running') {
      scriptStates[scriptId].expanded = true;
    }

    saveState();
    updateCardStatus(scriptId);
  }

  function handleOutput(scriptId, data) {
    if (!scriptStates[scriptId]) { return; }

    scriptStates[scriptId].output.push(data);

    if (scriptStates[scriptId].output.length > 1000) {
      scriptStates[scriptId].output = scriptStates[scriptId].output.slice(-800);
    }

    // Detect URLs — strip ANSI escape codes first so URLs aren't mangled
    var cleanData = data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    var urlMatch = cleanData.match(/https?:\/\/[^\s"')\]]+/g);
    if (urlMatch) {
      var detectedUrl = urlMatch[urlMatch.length - 1];
      if (!scriptStates[scriptId].detectedUrl || scriptStates[scriptId].detectedUrl !== detectedUrl) {
        scriptStates[scriptId].detectedUrl = detectedUrl;
        showOpenButton(scriptId, detectedUrl);
      }
    }

    saveState();
    appendOutput(scriptId, data);
  }

  function handleOutputCleared(scriptId) {
    if (!scriptStates[scriptId]) { return; }
    scriptStates[scriptId].output = [];
    scriptStates[scriptId].detectedUrl = null;
    saveState();
    var card = document.querySelector('[data-script-id="' + CSS.escape(scriptId) + '"]');
    if (card) {
      var outputEl = card.querySelector('.output-console');
      if (outputEl) { outputEl.innerHTML = ''; }
      var openBar = card.querySelector('.open-url-bar');
      if (openBar) { openBar.remove(); }
    }
  }

  function showOpenButton(scriptId, url) {
    var card = document.querySelector('[data-script-id="' + CSS.escape(scriptId) + '"]');
    if (!card) { return; }
    // Remove existing bar if any
    var existing = card.querySelector('.open-url-bar');
    if (existing) { existing.remove(); }
    // Insert inside the card-output, before the output-console
    var outputPanel = card.querySelector('.card-output');
    if (!outputPanel) { return; }
    var outputConsole = outputPanel.querySelector('.output-console');
    var bar = document.createElement('div');
    bar.className = 'open-url-bar';
    bar.innerHTML = '<a class="open-url-btn" href="#" data-action="openUrl" data-url="' + escapeHtml(url) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
      ' Open ' + escapeHtml(url) +
      '</a>';
    outputPanel.insertBefore(bar, outputConsole);
  }

  // ===== Rendering =====
  function renderCards() {
    var filtered = getFilteredScripts();
    scriptCardsContainer.innerHTML = '';

    if (scripts.length === 0) {
      emptyState.classList.remove('hidden');
      noResultsState.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');

    if (filtered.length === 0) {
      noResultsState.classList.remove('hidden');
      return;
    }

    noResultsState.classList.add('hidden');

    // Show workspace badges only when scripts span multiple workspaces
    var uniqueWorkspaces = {};
    for (var i = 0; i < scripts.length; i++) {
      uniqueWorkspaces[scripts[i].workspaceName] = true;
    }
    var showWorkspaceBadge = Object.keys(uniqueWorkspaces).length > 1;

    // Flat list, sorted naturally by script name (discovery already sorted by ws then name)
    for (var k = 0; k < filtered.length; k++) {
      var script = filtered[k];
      var id = getScriptId(script);
      var state = scriptStates[id] || { status: 'idle', output: [], expanded: false };
      scriptCardsContainer.appendChild(createCard(script, id, state, showWorkspaceBadge));
    }
  }

  function createCard(script, id, state, showWorkspaceBadge) {
    var card = document.createElement('div');
    card.className = 'script-card ' + state.status;
    card.dataset.scriptId = id;

    var isRunning = state.status === 'running';
    var workspaceBadgeHtml = showWorkspaceBadge
      ? '<span class="workspace-badge" title="' + escapeHtml(script.workspaceName) + '">' + escapeHtml(script.workspaceName) + '</span>'
      : '';

    var outputHtml = '';
    for (var i = 0; i < state.output.length; i++) {
      outputHtml += window.parseAnsi(state.output[i]);
    }

    var statusLabel = '';
    if (state.status === 'running') { statusLabel = '<span class="status-label running">Running</span>'; }
    else if (state.status === 'success') { statusLabel = '<span class="status-label success">Completed</span>'; }
    else if (state.status === 'error') { statusLabel = '<span class="status-label error">Failed</span>'; }
    else if (state.status === 'stopped') { statusLabel = '<span class="status-label stopped">Stopped</span>'; }

    var tags = getScriptTags(script.name);
    var envBadgeHtml = '';
    for (var t = 0; t < tags.length; t++) {
      envBadgeHtml += '<span class="env-tag ' + tags[t].cls + '">' + tags[t].icon + ' ' + tags[t].label + '</span>';
    }

    card.innerHTML =
      '<div class="card-header" data-action="toggle">' +
        '<div class="card-info">' +
          '<div class="card-title-row">' +
            '<span class="chevron ' + (state.expanded ? 'expanded' : '') + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>' +
            '</span>' +
            '<span class="script-name">' + escapeHtml(script.name) + '</span>' +
            envBadgeHtml +
            workspaceBadgeHtml +
            '<span class="pm-badge">' + escapeHtml(script.packageManager) + '</span>' +
            statusLabel +
          '</div>' +
          '<div class="card-command">' + escapeHtml(script.command) + '</div>' +
        '</div>' +
        '<div class="card-actions">' +
          (state.output.length > 0 ? '<button class="btn-ghost" data-action="clear" title="Clear output"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '') +
          (isRunning
            ? '<button class="btn-danger" data-action="stop"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><rect x="4" y="4" width="16" height="16" rx="2"/></svg> Stop</button>'
            : '<button class="btn-primary" data-action="run"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run</button>') +
        '</div>' +
      '</div>' +
      '<div class="card-output ' + (state.expanded ? 'expanded' : '') + '">' +
        (state.detectedUrl && state.status === 'running'
          ? '<div class="open-url-bar"><a class="open-url-btn" href="#" data-action="openUrl" data-url="' + escapeHtml(state.detectedUrl) + '">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
              ' Open ' + escapeHtml(state.detectedUrl) + '</a></div>'
          : '') +
        '<div class="output-console">' + outputHtml + '</div>' +
        (isRunning
          ? '<div class="stdin-bar">' +
              '<span class="stdin-prompt">&gt;</span>' +
              '<input type="text" class="stdin-input" placeholder="Type input and press Enter..." data-script-id="' + escapeHtml(id) + '" />' +
            '</div>'
          : '') +
      '</div>';

    // Wire up stdin input
    var stdinInput = card.querySelector('.stdin-input');
    if (stdinInput) {
      stdinInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          var value = stdinInput.value;
          vscode.postMessage({ type: 'sendInput', scriptId: id, data: value + '\n' });
          stdinInput.value = '';
        }
      });
      // Prevent toggle when clicking inside the input
      stdinInput.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }

    card.addEventListener('click', function (e) {
      // Handle ctrl+click on output links
      var link = e.target.closest('.output-link');
      if (link) {
        e.preventDefault();
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
          vscode.postMessage({ type: 'openUrl', url: link.dataset.href });
        }
        return;
      }

      var target = e.target.closest('[data-action]');
      if (!target) { return; }

      var action = target.dataset.action;
      switch (action) {
        case 'toggle':
          state.expanded = !state.expanded;
          card.querySelector('.card-output').classList.toggle('expanded');
          card.querySelector('.chevron').classList.toggle('expanded');
          saveState();
          break;
        case 'run':
          e.stopPropagation();
          if (getScriptEnv(script) === 'prod') {
            openProdModal({
              kind: 'run',
              scriptId: id,
              scriptName: script.name,
              command: script.command,
            });
            break;
          }
          vscode.postMessage({ type: 'runScript', scriptId: id });
          break;
        case 'stop':
          e.stopPropagation();
          vscode.postMessage({ type: 'stopScript', scriptId: id });
          break;
        case 'clear':
          e.stopPropagation();
          vscode.postMessage({ type: 'clearOutput', scriptId: id });
          break;
        case 'openUrl':
          e.preventDefault();
          e.stopPropagation();
          vscode.postMessage({ type: 'openUrl', url: target.dataset.url });
          break;
      }
    });

    return card;
  }

  function updateCardStatus(scriptId) {
    var card = document.querySelector('[data-script-id="' + CSS.escape(scriptId) + '"]');
    if (!card) {
      renderCards();
      return;
    }

    var state = scriptStates[scriptId];
    var isRunning = state.status === 'running';
    card.className = 'script-card ' + state.status;

    // Update expansion
    var outputPanel = card.querySelector('.card-output');
    var chevron = card.querySelector('.chevron');
    if (state.expanded) {
      outputPanel.classList.add('expanded');
      chevron.classList.add('expanded');
    }

    // Re-render status label
    var titleRow = card.querySelector('.card-title-row');
    var existingLabel = titleRow.querySelector('.status-label');
    if (existingLabel) { existingLabel.remove(); }

    if (state.status === 'running') {
      titleRow.insertAdjacentHTML('beforeend', '<span class="status-label running">Running</span>');
    } else if (state.status === 'success') {
      titleRow.insertAdjacentHTML('beforeend', '<span class="status-label success">Completed</span>');
    } else if (state.status === 'error') {
      titleRow.insertAdjacentHTML('beforeend', '<span class="status-label error">Failed</span>');
    } else if (state.status === 'stopped') {
      titleRow.insertAdjacentHTML('beforeend', '<span class="status-label stopped">Stopped</span>');
    }

    // Update stdin bar — add when running, remove when not
    var existingStdin = card.querySelector('.stdin-bar');
    if (isRunning && !existingStdin && outputPanel) {
      var stdinBar = document.createElement('div');
      stdinBar.className = 'stdin-bar';
      stdinBar.innerHTML = '<span class="stdin-prompt">&gt;</span>' +
        '<input type="text" class="stdin-input" placeholder="Type input and press Enter..." data-script-id="' + CSS.escape(scriptId) + '" />';
      outputPanel.appendChild(stdinBar);
      var newInput = stdinBar.querySelector('.stdin-input');
      newInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.stopPropagation();
          vscode.postMessage({ type: 'sendInput', scriptId: scriptId, data: newInput.value + '\n' });
          newInput.value = '';
        }
      });
      newInput.addEventListener('click', function (ev) { ev.stopPropagation(); });
    } else if (!isRunning && existingStdin) {
      existingStdin.remove();
    }

    // Re-render actions
    var actionsEl = card.querySelector('.card-actions');
    actionsEl.innerHTML =
      (state.output.length > 0 ? '<button class="btn-ghost" data-action="clear" title="Clear output"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' : '') +
      (isRunning
        ? '<button class="btn-danger" data-action="stop"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><rect x="4" y="4" width="16" height="16" rx="2"/></svg> Stop</button>'
        : '<button class="btn-primary" data-action="run"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run</button>');
  }

  function appendOutput(scriptId, data) {
    var card = document.querySelector('[data-script-id="' + CSS.escape(scriptId) + '"]');
    if (!card) { return; }

    var outputConsole = card.querySelector('.output-console');
    var html = window.parseAnsi(data);
    outputConsole.insertAdjacentHTML('beforeend', html);
    outputConsole.scrollTop = outputConsole.scrollHeight;
  }

  // ===== Filtering =====
  function getFilteredScripts() {
    return scripts.filter(function (s) {
      var matchesSearch = !searchQuery ||
        s.name.toLowerCase().includes(searchQuery) ||
        s.command.toLowerCase().includes(searchQuery);
      if (!matchesSearch) { return false; }
      if (currentEnv === 'all') { return true; }
      return getScriptEnv(s) === currentEnv;
    });
  }

  // ===== Env bucket classification =====
  // Maps a script to one of: 'dev' | 'staging' | 'prod' | 'other'
  // Mirrors the keyword sets in ENV_TAGS so the filter matches the card badge.
  var ENV_BUCKETS = [
    { env: 'prod', keys: ['prod', 'production'] },
    { env: 'staging', keys: ['staging', 'stage'] },
    { env: 'dev', keys: ['dev', 'start', 'serve', 'watch', 'emulator'] },
  ];

  function getScriptEnv(script) {
    var name = script.name.toLowerCase();
    for (var i = 0; i < ENV_BUCKETS.length; i++) {
      var bucket = ENV_BUCKETS[i];
      for (var j = 0; j < bucket.keys.length; j++) {
        if (name.includes(bucket.keys[j])) { return bucket.env; }
      }
    }
    return 'other';
  }

  // ===== Environment Tags =====
  // Two independent passes: a script can carry both an environment tag and an
  // action tag, and gets whichever of the two it matches.
  // e.g. "ship:all:prod" → PROD + DEPLOY, "build:staging" → STAGING + BUILD,
  //      "ship:functions" → DEPLOY only, "serve:admin" → DEV only.
  // The environment tag is always rendered first — the env is what matters most.

  // Pass 1: Environment (which system the script targets)
  var ENV_TAGS = [
    { keys: ['prod', 'production'], label: 'prod', cls: 'env-prod',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>' },
    { keys: ['staging', 'stage'], label: 'staging', cls: 'env-staging',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' },
    { keys: ['dev', 'start', 'serve', 'watch', 'emulator'], label: 'dev', cls: 'env-dev',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>' },
  ];

  // Pass 2: Action type (what the script does, independent of which env it targets)
  var ACTION_TAGS = [
    { keys: ['deploy', 'release', 'ship', 'publish'], label: 'deploy', cls: 'env-deploy',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>' },
    { keys: ['build', 'compile', 'bundle'], label: 'build', cls: 'env-build',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>' },
    { keys: ['test', 'spec', 'e2e', 'coverage'], label: 'test', cls: 'env-test',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M14.5 2v6.5L18 13v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6l3.5-4.5V2"/><path d="M8.5 2h7"/><path d="M8 15h8"/></svg>' },
    { keys: ['lint', 'format', 'prettier', 'eslint'], label: 'lint', cls: 'env-lint',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
    { keys: ['seed', 'migrate', 'generate'], label: 'seed', cls: 'env-seed',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>' },
    { keys: ['preview'], label: 'preview', cls: 'env-staging',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' },
  ];

  function matchTags(name, tags) {
    for (var i = 0; i < tags.length; i++) {
      for (var j = 0; j < tags[i].keys.length; j++) {
        if (name.includes(tags[i].keys[j])) { return tags[i]; }
      }
    }
    return null;
  }

  function getScriptTags(scriptName) {
    var name = scriptName.toLowerCase();
    var tags = [];
    var envTag = matchTags(name, ENV_TAGS);
    var actionTag = matchTags(name, ACTION_TAGS);
    // Environment first so it reads left-to-right as "where, then what"
    if (envTag) { tags.push(envTag); }
    if (actionTag && actionTag.cls !== (envTag && envTag.cls)) { tags.push(actionTag); }
    return tags;
  }

  // ===== Utilities =====
  function getScriptId(script) {
    return script.workspaceFolder + '::' + script.name;
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function saveState() {
    vscode.setState({
      scripts: scripts,
      scriptStates: scriptStates,
      searchQuery: searchQuery,
      currentEnv: currentEnv,
    });
  }
})();
