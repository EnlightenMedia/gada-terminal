(function () {
  var theme = window.WidgetAPI.getTheme();
  var STORAGE_KEY = 'open-terminal:selected';

  var availableTerminals = [];
  var selectedTerminal = null;
  var currentCwd = null;

  // ── Root ──────────────────────────────────────────────────────────────────

  var root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  document.body.appendChild(root);

  // ── Toolbar ───────────────────────────────────────────────────────────────

  var toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;gap:6px;align-items:center;';
  root.appendChild(toolbar);

  var launchBtn = document.createElement('button');
  launchBtn.textContent = 'Open Terminal';
  launchBtn.style.cssText = [
    'flex:1;padding:6px 10px;font-size:12px;cursor:pointer;',
    'background:' + theme.accent + ';color:#000;',
    'border:none;border-radius:3px;font-weight:600;',
  ].join('');
  toolbar.appendChild(launchBtn);

  var settingsBtn = document.createElement('button');
  settingsBtn.textContent = '\u2699';
  settingsBtn.title = 'Choose terminal';
  settingsBtn.style.cssText = [
    'padding:4px 7px;font-size:13px;cursor:pointer;',
    'background:#1e2e1e;color:' + theme.accent + ';',
    'border:1px solid #2d472d;border-radius:3px;line-height:1;',
  ].join('');
  toolbar.appendChild(settingsBtn);

  // ── Status line ───────────────────────────────────────────────────────────

  var statusEl = document.createElement('div');
  statusEl.style.cssText = 'font-size:11px;color:' + theme.textMuted + ';min-height:16px;';
  root.appendChild(statusEl);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#e05555' : theme.textMuted;
  }

  function setLaunchEnabled(enabled) {
    launchBtn.disabled = !enabled;
    launchBtn.style.opacity = enabled ? '1' : '0.4';
    launchBtn.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }

  function selectedLabel() {
    var t = availableTerminals.find(function (t) { return t.id === selectedTerminal; });
    return t ? t.label : '';
  }

  // ── Settings dialog ───────────────────────────────────────────────────────

  function buildSettingsScript(terminals, currentId) {
    var embedded = 'var __d=' + JSON.stringify({ terminals: terminals, currentId: currentId }) + ';';
    return [
      '(function(){',
      embedded,
      'var t=window.DialogAPI.getTheme();',
      'var terminals=__d.terminals;',
      'var selected=__d.currentId;',

      'document.body.style.cssText="margin:0;padding:0;height:100%;overflow:hidden;display:flex;flex-direction:column;";',
      'document.documentElement.style.height="100%";',

      // Header
      'var hdr=document.createElement("div");',
      'hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #2a2a2a;flex-shrink:0;";',
      'var ttl=document.createElement("span");ttl.textContent="Choose Terminal";',
      'ttl.style.cssText="font-size:13px;font-weight:600;color:"+t.textPrimary+";";',
      'var doneBtn=document.createElement("button");doneBtn.textContent="Done";',
      'doneBtn.style.cssText="padding:4px 14px;font-size:11px;cursor:pointer;background:#1e2e1e;color:"+t.accent+";border:1px solid #2d472d;border-radius:3px;";',
      'doneBtn.addEventListener("click",function(){window.DialogAPI.close(selected);});',
      'hdr.appendChild(ttl);hdr.appendChild(doneBtn);document.body.appendChild(hdr);',

      // Radio list
      'var bd=document.createElement("div");',
      'bd.style.cssText="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;";',
      'document.body.appendChild(bd);',

      'terminals.forEach(function(term){',
      '  var row=document.createElement("label");',
      '  row.style.cssText="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 10px;border-radius:4px;border:1px solid #2a2a2a;background:#1a1a1a;";',
      '  var radio=document.createElement("input");radio.type="radio";radio.name="term";radio.value=term.id;',
      '  radio.checked=(term.id===selected);radio.style.accentColor=t.accent;',
      '  radio.addEventListener("change",function(){if(radio.checked)selected=term.id;});',
      '  var lbl=document.createElement("span");lbl.textContent=term.label;',
      '  lbl.style.cssText="font-size:12px;color:"+t.textPrimary+";";',
      '  row.appendChild(radio);row.appendChild(lbl);bd.appendChild(row);',
      '  row.addEventListener("click",function(){radio.checked=true;selected=term.id;});',
      '});',
      '})();',
    ].join('\n');
  }

  function openSettings() {
    if (!availableTerminals.length) return;
    var script = buildSettingsScript(availableTerminals, selectedTerminal);
    window.WidgetAPI.openDialog(script).then(function (result) {
      if (!result) return;
      selectedTerminal = result;
      window.WidgetAPI.storage.set(STORAGE_KEY, result);
      setStatus('Using: ' + selectedLabel(), false);
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  setLaunchEnabled(false);
  setStatus('Detecting terminals\u2026', false);

  Promise.all([
    window.WidgetAPI.storage.get(STORAGE_KEY),
    window.WidgetAPI.getContext(),
  ]).then(function (results) {
    var savedId = results[0];
    currentCwd = results[1];

    if (!currentCwd) setStatus('No active session', false);

    return window.WidgetAPI.shellLaunch({ mode: 'probe' }).then(function (terminals) {
      availableTerminals = terminals || [];

      if (!availableTerminals.length) {
        setStatus('No terminals found', true);
        return;
      }

      var match = availableTerminals.find(function (t) { return t.id === savedId; });
      selectedTerminal = match ? match.id : availableTerminals[0].id;

      setStatus('Using: ' + selectedLabel(), false);
      if (currentCwd) setLaunchEnabled(true);
    });
  }).catch(function (err) {
    setStatus((err && err.message) ? err.message : String(err), true);
  });

  // ── Launch ────────────────────────────────────────────────────────────────

  launchBtn.addEventListener('click', function () {
    if (!currentCwd || !selectedTerminal) return;
    setLaunchEnabled(false);
    window.WidgetAPI.shellLaunch({ mode: 'launch', terminal: selectedTerminal, cwd: currentCwd })
      .then(function () { setLaunchEnabled(true); })
      .catch(function (err) {
        setStatus((err && err.message) ? err.message : String(err), true);
        setLaunchEnabled(true);
      });
  });

  settingsBtn.addEventListener('click', openSettings);
})();
