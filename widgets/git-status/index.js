(function () {
  var theme = window.WidgetAPI.getTheme();

  // ── Layout ────────────────────────────────────────────────────────────────

  var root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  document.body.appendChild(root);

  // Refresh button row
  var toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;justify-content:flex-end;';
  root.appendChild(toolbar);

  var refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Refresh';
  refreshBtn.style.cssText = [
    'padding:3px 8px;font-size:11px;cursor:pointer;',
    'background:#1e2e1e;color:' + theme.accent + ';',
    'border:1px solid #2d472d;border-radius:3px;',
  ].join('');
  toolbar.appendChild(refreshBtn);

  // Status section
  var statusSection = document.createElement('div');
  root.appendChild(statusSection);

  var statusLabel = document.createElement('div');
  statusLabel.textContent = 'Changes';
  statusLabel.style.cssText = 'font-size:10px;color:' + theme.textMuted + ';text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;';
  statusSection.appendChild(statusLabel);

  var statusBox = document.createElement('pre');
  statusBox.style.cssText = [
    'margin:0;padding:6px;',
    'background:' + theme.backgroundSecondary + ';',
    'border:1px solid #242424;border-radius:3px;',
    'font-family:' + theme.fontMono + ';font-size:11px;',
    'color:' + theme.textPrimary + ';',
    'white-space:pre-wrap;word-break:break-all;',
    'min-height:20px;',
  ].join('');
  statusSection.appendChild(statusBox);

  // Log section
  var logSection = document.createElement('div');
  root.appendChild(logSection);

  var logLabel = document.createElement('div');
  logLabel.textContent = 'Recent commits';
  logLabel.style.cssText = 'font-size:10px;color:' + theme.textMuted + ';text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;';
  logSection.appendChild(logLabel);

  var logBox = document.createElement('pre');
  logBox.style.cssText = statusBox.style.cssText;
  logSection.appendChild(logBox);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setLoading() {
    statusBox.style.color = theme.textMuted;
    statusBox.textContent = 'Loading\u2026';
    logBox.style.color = theme.textMuted;
    logBox.textContent = 'Loading\u2026';
    refreshBtn.disabled = true;
  }

  function renderResult(box, result, emptyMessage) {
    box.style.color = theme.textPrimary;
    if (result.exitCode !== 0) {
      box.style.color = '#e05555';
      box.textContent = (result.stderr || result.stdout || 'git exited with code ' + result.exitCode).trim();
      return;
    }
    var text = result.stdout.trim();
    if (!text) {
      box.style.color = theme.textMuted;
      box.textContent = emptyMessage;
    } else {
      box.textContent = text;
    }
  }

  function renderError(err) {
    var msg = (err && err.message) ? err.message : String(err);
    statusBox.style.color = '#e05555';
    statusBox.textContent = msg;
    logBox.style.color = '#e05555';
    logBox.textContent = msg;
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  var cachedCwd = null;

  function fetchGit(cwd) {
    setLoading();
    var statusCmd = window.WidgetAPI.spawnProcess('git', ['-C', cwd, 'status', '--short']);
    var logCmd = window.WidgetAPI.spawnProcess('git', ['-C', cwd, 'log', '--oneline', '-5']);

    Promise.all([statusCmd, logCmd])
      .then(function (results) {
        renderResult(statusBox, results[0], 'Working tree clean');
        renderResult(logBox, results[1], 'No commits yet');
        refreshBtn.disabled = false;
      })
      .catch(function (err) {
        renderError(err);
        refreshBtn.disabled = false;
      });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  window.WidgetAPI.getContext().then(function (cwd) {
    cachedCwd = cwd;
    fetchGit(cwd);
  });

  refreshBtn.addEventListener('click', function () {
    if (cachedCwd) fetchGit(cachedCwd);
  });
})();
