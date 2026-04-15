(function () {
  var theme = window.WidgetAPI.getTheme();

  // ── Config (persisted) ────────────────────────────────────────────────────

  var workMins          = 25;
  var shortBreakMins    = 5;
  var longBreakMins     = 15;
  var roundsPerSession  = 4;
  var autoStartBreak    = false;
  var autoStartWork     = false;

  // ── Session state (not persisted) ─────────────────────────────────────────

  // phase: 'work' | 'short-break' | 'long-break'
  var phase              = 'work';
  var roundsCompleted    = 0;   // work rounds completed in the current cycle
  var remaining          = workMins * 60;
  var running            = false;
  var intervalId         = null;
  var pomodoroCount      = 0;
  var totalFocusedSecs   = 0;

  // ── Audio ─────────────────────────────────────────────────────────────────

  function beep(freq, duration, gain) {
    try {
      var ctx = new AudioContext();
      var osc = ctx.createOscillator();
      var vol = ctx.createGain();
      osc.connect(vol);
      vol.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      vol.gain.setValueAtTime(gain || 0.25, ctx.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
      osc.onended = function () { ctx.close(); };
    } catch (e) {}
  }

  function notifyWorkDone() {
    // Two ascending tones — "done, take a break"
    beep(660, 0.15);
    setTimeout(function () { beep(880, 0.25); }, 180);
  }

  function notifyBreakDone() {
    // Single lower tone — "back to work"
    beep(440, 0.3);
  }

  // ── Visual flash ──────────────────────────────────────────────────────────

  function flashCountdown() {
    var original = countdownEl.style.color;
    var flash = '#ffffff';
    countdownEl.style.transition = 'color 0.08s';
    countdownEl.style.color = flash;
    setTimeout(function () {
      countdownEl.style.color = original;
      setTimeout(function () {
        countdownEl.style.color = flash;
        setTimeout(function () { countdownEl.style.color = original; }, 120);
      }, 120);
    }, 120);
  }

  // ── DOM ───────────────────────────────────────────────────────────────────

  var root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  document.body.appendChild(root);

  // Phase label
  var phaseEl = document.createElement('div');
  phaseEl.style.cssText = [
    'font-size:11px;font-weight:700;text-transform:uppercase;',
    'letter-spacing:0.08em;text-align:center;',
  ].join('');
  root.appendChild(phaseEl);

  // Round indicator
  var roundEl = document.createElement('div');
  roundEl.style.cssText = 'font-size:10px;text-align:center;color:' + theme.textMuted + ';min-height:14px;';
  root.appendChild(roundEl);

  // Countdown
  var countdownEl = document.createElement('div');
  countdownEl.style.cssText = [
    'font-size:38px;font-weight:700;text-align:center;',
    'letter-spacing:0.04em;color:' + theme.textPrimary + ';',
    'font-family:monospace;font-variant-numeric:tabular-nums;line-height:1.1;',
  ].join('');
  root.appendChild(countdownEl);

  // Controls
  var controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:6px;justify-content:center;';
  root.appendChild(controls);

  var startBtn = document.createElement('button');
  startBtn.style.cssText = [
    'padding:4px 20px;font-size:12px;cursor:pointer;',
    'background:#1e2e1e;color:' + theme.accent + ';',
    'border:1px solid #2d472d;border-radius:3px;',
  ].join('');
  controls.appendChild(startBtn);

  var skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip';
  skipBtn.style.cssText = [
    'padding:4px 10px;font-size:12px;cursor:pointer;',
    'background:none;color:' + theme.textMuted + ';',
    'border:1px solid #2e2e2e;border-radius:3px;',
  ].join('');
  controls.appendChild(skipBtn);

  var resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset';
  resetBtn.style.cssText = [
    'padding:4px 10px;font-size:12px;cursor:pointer;',
    'background:none;color:' + theme.textMuted + ';',
    'border:1px solid #2e2e2e;border-radius:3px;',
  ].join('');
  controls.appendChild(resetBtn);

  // Session stats
  var statsEl = document.createElement('div');
  statsEl.style.cssText = 'font-size:11px;text-align:center;color:' + theme.textMuted + ';';
  root.appendChild(statsEl);

  // Settings button
  var settingsBar = document.createElement('div');
  settingsBar.style.cssText = 'display:flex;justify-content:flex-end;';
  root.appendChild(settingsBar);

  var gearBtn = document.createElement('button');
  gearBtn.textContent = '\u2699';
  gearBtn.title = 'Settings';
  gearBtn.style.cssText = [
    'padding:2px 6px;font-size:12px;cursor:pointer;',
    'background:none;color:' + theme.textMuted + ';',
    'border:1px solid #2e2e2e;border-radius:3px;',
  ].join('');
  settingsBar.appendChild(gearBtn);

  // ── Render ────────────────────────────────────────────────────────────────

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  var PHASE_COLORS = {
    'work':        theme.accent,
    'short-break': '#5aafef',
    'long-break':  '#b07fe0',
  };

  var PHASE_LABELS = {
    'work':        'Work',
    'short-break': 'Short Break',
    'long-break':  'Long Break',
  };

  function renderDisplay() {
    var color = PHASE_COLORS[phase] || theme.accent;
    phaseEl.textContent = PHASE_LABELS[phase] || phase;
    phaseEl.style.color = color;

    // Round indicator: only meaningful during work and short-break phases
    if (phase === 'long-break') {
      roundEl.textContent = 'Session complete';
    } else {
      var displayRound = roundsCompleted + 1;
      roundEl.textContent = 'Round ' + displayRound + ' / ' + roundsPerSession;
    }

    countdownEl.textContent = pad(Math.floor(remaining / 60)) + ':' + pad(remaining % 60);
    countdownEl.style.color = theme.textPrimary; // reset in case flash changed it
    startBtn.textContent = running ? 'Pause' : 'Start';

    var focusedMins = Math.floor(totalFocusedSecs / 60);
    statsEl.textContent = pomodoroCount + ' pomodoro' + (pomodoroCount !== 1 ? 's' : '') +
      ' \u00b7 ' + focusedMins + ' min focused';
  }

  // ── Timer logic ───────────────────────────────────────────────────────────

  function startTimer() {
    if (running) return;
    running = true;
    intervalId = setInterval(tick, 1000);
    renderDisplay();
  }

  function pauseTimer() {
    if (!running) return;
    running = false;
    clearInterval(intervalId);
    intervalId = null;
    renderDisplay();
  }

  function reset() {
    pauseTimer();
    phase = 'work';
    roundsCompleted = 0;
    remaining = workMins * 60;
    renderDisplay();
  }

  function skipPhase() {
    var wasRunning = running;
    pauseTimer();

    if (phase === 'work') {
      pomodoroCount += 1;
      roundsCompleted += 1;
      if (roundsCompleted >= roundsPerSession) {
        phase = 'long-break';
        remaining = longBreakMins * 60;
        roundsCompleted = 0;
      } else {
        phase = 'short-break';
        remaining = shortBreakMins * 60;
      }
      if (wasRunning || autoStartBreak) startTimer();
    } else {
      phase = 'work';
      remaining = workMins * 60;
      if (wasRunning || autoStartWork) startTimer();
    }

    renderDisplay();
  }

  function tick() {
    remaining -= 1;
    if (phase === 'work') totalFocusedSecs += 1;

    if (remaining > 0) {
      renderDisplay();
      return;
    }

    // Interval complete — switch phase
    if (phase === 'work') {
      pomodoroCount += 1;
      roundsCompleted += 1;

      if (roundsCompleted >= roundsPerSession) {
        phase = 'long-break';
        remaining = longBreakMins * 60;
        roundsCompleted = 0; // reset for next cycle
      } else {
        phase = 'short-break';
        remaining = shortBreakMins * 60;
      }

      notifyWorkDone();
      flashCountdown();
      renderDisplay();

      if (!autoStartBreak) pauseTimer();

    } else {
      // short-break or long-break ended
      phase = 'work';
      remaining = workMins * 60;

      notifyBreakDone();
      flashCountdown();
      renderDisplay();

      if (!autoStartWork) pauseTimer();
    }
  }

  startBtn.addEventListener('click', function () {
    if (running) pauseTimer(); else startTimer();
  });

  skipBtn.addEventListener('click', skipPhase);

  resetBtn.addEventListener('click', reset);

  // ── Settings dialog ───────────────────────────────────────────────────────

  function buildSettingsScript(cfg) {
    var data = 'var __d=' + JSON.stringify(cfg) + ';';
    return [
      '(function(){',
      data,
      'var t=window.DialogAPI.getTheme();',
      'document.body.style.cssText="margin:0;padding:0;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;";',
      'document.documentElement.style.height="100%";',

      // Card
      'var card=document.createElement("div");',
      'card.style.cssText="display:flex;flex-direction:column;gap:12px;padding:20px 24px;background:"+t.backgroundSecondary+";border:1px solid #2a2a2a;border-radius:6px;min-width:260px;";',
      'document.body.appendChild(card);',

      // Title
      'var ttl=document.createElement("div");ttl.textContent="Timer Settings";',
      'ttl.style.cssText="font-size:13px;font-weight:600;color:"+t.textPrimary+";margin-bottom:2px;";',
      'card.appendChild(ttl);',

      // Number field helper
      'function numRow(label,val,min,max){',
      '  var row=document.createElement("div");',
      '  row.style.cssText="display:flex;align-items:center;justify-content:space-between;gap:16px;";',
      '  var lbl=document.createElement("label");lbl.textContent=label;',
      '  lbl.style.cssText="font-size:12px;color:"+t.textPrimary+";";',
      '  var inp=document.createElement("input");inp.type="number";inp.min=String(min);inp.max=String(max);inp.value=String(val);',
      '  inp.style.cssText="width:58px;background:#141414;color:#e0e0e0;border:1px solid #2a2a2a;border-radius:3px;padding:3px 5px;font-size:12px;text-align:right;outline:none;";',
      '  row.appendChild(lbl);row.appendChild(inp);card.appendChild(row);return inp;',
      '}',

      // Checkbox field helper
      'function chkRow(label,checked){',
      '  var row=document.createElement("div");',
      '  row.style.cssText="display:flex;align-items:center;justify-content:space-between;gap:16px;";',
      '  var lbl=document.createElement("label");lbl.textContent=label;',
      '  lbl.style.cssText="font-size:12px;color:"+t.textPrimary+";";',
      '  var inp=document.createElement("input");inp.type="checkbox";inp.checked=checked;',
      '  inp.style.cssText="width:14px;height:14px;accent-color:"+t.accent+";cursor:pointer;";',
      '  row.appendChild(lbl);row.appendChild(inp);card.appendChild(row);return inp;',
      '}',

      'var wi  = numRow("Work (min)",         __d.workMins,         1, 120);',
      'var sbi = numRow("Short break (min)",   __d.shortBreakMins,   1,  60);',
      'var lbi = numRow("Long break (min)",    __d.longBreakMins,    1, 120);',
      'var rpi = numRow("Rounds per session",  __d.roundsPerSession, 1,  20);',

      // Divider
      'var div=document.createElement("div");div.style.cssText="border-top:1px solid #2a2a2a;margin:2px 0;";card.appendChild(div);',

      'var asi = chkRow("Auto-start break", __d.autoStartBreak);',
      'var awi = chkRow("Auto-start work",  __d.autoStartWork);',

      // Buttons
      'var btns=document.createElement("div");btns.style.cssText="display:flex;gap:8px;justify-content:flex-end;margin-top:2px;";card.appendChild(btns);',

      'var cancelBtn=document.createElement("button");cancelBtn.textContent="Cancel";',
      'cancelBtn.style.cssText="padding:4px 12px;font-size:11px;cursor:pointer;background:none;color:"+t.textMuted+";border:1px solid #2e2e2e;border-radius:3px;";',
      'cancelBtn.addEventListener("click",function(){window.DialogAPI.close(null);});',
      'btns.appendChild(cancelBtn);',

      'var saveBtn=document.createElement("button");saveBtn.textContent="Save";',
      'saveBtn.style.cssText="padding:4px 14px;font-size:11px;cursor:pointer;background:#1e2e1e;color:"+t.accent+";border:1px solid #2d472d;border-radius:3px;";',
      'saveBtn.addEventListener("click",function(){',
      '  var w=parseInt(wi.value,10),sb=parseInt(sbi.value,10),lb=parseInt(lbi.value,10),rp=parseInt(rpi.value,10);',
      '  if(!w||w<1||!sb||sb<1||!lb||lb<1||!rp||rp<1)return;',
      '  window.DialogAPI.close({workMins:w,shortBreakMins:sb,longBreakMins:lb,roundsPerSession:rp,autoStartBreak:asi.checked,autoStartWork:awi.checked});',
      '});',
      'btns.appendChild(saveBtn);',
      '})();',
    ].join('\n');
  }

  gearBtn.addEventListener('click', function () {
    var script = buildSettingsScript({
      workMins:        workMins,
      shortBreakMins:  shortBreakMins,
      longBreakMins:   longBreakMins,
      roundsPerSession: roundsPerSession,
      autoStartBreak:  autoStartBreak,
      autoStartWork:   autoStartWork,
    });
    window.WidgetAPI.openDialog(script, { width: 320, height: 370 }).then(function (result) {
      if (!result) return;
      workMins         = result.workMins;
      shortBreakMins   = result.shortBreakMins;
      longBreakMins    = result.longBreakMins;
      roundsPerSession = result.roundsPerSession;
      autoStartBreak   = result.autoStartBreak;
      autoStartWork    = result.autoStartWork;
      window.WidgetAPI.storage.set('workMins',         String(workMins));
      window.WidgetAPI.storage.set('shortBreakMins',   String(shortBreakMins));
      window.WidgetAPI.storage.set('longBreakMins',    String(longBreakMins));
      window.WidgetAPI.storage.set('roundsPerSession', String(roundsPerSession));
      window.WidgetAPI.storage.set('autoStartBreak',   autoStartBreak ? '1' : '0');
      window.WidgetAPI.storage.set('autoStartWork',    autoStartWork  ? '1' : '0');
      reset();
    });
  });

  // ── Init — load persisted config ──────────────────────────────────────────

  Promise.all([
    window.WidgetAPI.storage.get('workMins'),
    window.WidgetAPI.storage.get('shortBreakMins'),
    window.WidgetAPI.storage.get('longBreakMins'),
    window.WidgetAPI.storage.get('roundsPerSession'),
    window.WidgetAPI.storage.get('autoStartBreak'),
    window.WidgetAPI.storage.get('autoStartWork'),
  ]).then(function (vals) {
    var w  = parseInt(vals[0], 10);
    var sb = parseInt(vals[1], 10);
    var lb = parseInt(vals[2], 10);
    var rp = parseInt(vals[3], 10);
    if (w  >= 1) workMins         = w;
    if (sb >= 1) shortBreakMins   = sb;
    if (lb >= 1) longBreakMins    = lb;
    if (rp >= 1) roundsPerSession = rp;
    if (vals[4] !== null) autoStartBreak = vals[4] === '1';
    if (vals[5] !== null) autoStartWork  = vals[5] === '1';
    remaining = workMins * 60;
    renderDisplay();
  });
})();
