(function () {
  var counts = {};

  var cwdEl = document.createElement('p');
  cwdEl.style.cssText = 'color:#555;font-size:10px;padding:0 0 6px 0;word-break:break-all;border-bottom:1px solid #242424;margin-bottom:6px;';
  cwdEl.textContent = 'Loading context…';
  document.body.appendChild(cwdEl);

  window.WidgetAPI.getContext().then(function (cwd) {
    cwdEl.textContent = cwd || '(no folder selected)';
    cwdEl.style.color = '#4ec94e';
  });

  var list = document.createElement('ul');
  list.style.cssText = 'list-style:none;padding:0;margin:0;';
  document.body.appendChild(list);

  var empty = document.createElement('p');
  empty.style.cssText = 'color:#555;font-size:11px;padding:4px 0;';
  empty.textContent = 'No tools invoked yet.';
  document.body.appendChild(empty);

  // Write capability demo
  var writeBtn = document.createElement('button');
  writeBtn.textContent = 'Send "hello" to terminal';
  writeBtn.style.cssText = [
    'margin-top:8px;padding:4px 8px;font-size:11px;cursor:pointer;',
    'background:#1e3a1e;color:#4ec94e;border:1px solid #2d5a2d;border-radius:3px;',
    'width:100%;',
  ].join('');
  writeBtn.addEventListener('click', function () {
    writeBtn.disabled = true;
    writeBtn.textContent = 'Waiting…';
    window.WidgetAPI.sendTerminalInput('hello').then(function () {
      writeBtn.textContent = 'Sent!';
      setTimeout(function () {
        writeBtn.disabled = false;
        writeBtn.textContent = 'Send "hello" to terminal';
      }, 1500);
    }).catch(function (err) {
      writeBtn.textContent = err.message || 'Denied';
      writeBtn.style.color = '#e05555';
      setTimeout(function () {
        writeBtn.disabled = false;
        writeBtn.textContent = 'Send "hello" to terminal';
        writeBtn.style.color = '#4ec94e';
      }, 2000);
    });
  });
  document.body.appendChild(writeBtn);

  // Dialog demo
  var dialogBtn = document.createElement('button');
  dialogBtn.textContent = 'Open test dialog';
  dialogBtn.style.cssText = [
    'margin-top:8px;padding:4px 8px;font-size:11px;cursor:pointer;',
    'background:#1a2a3a;color:#5aafef;border:1px solid #1e3a5a;border-radius:3px;',
    'width:100%;',
  ].join('');
  dialogBtn.addEventListener('click', function () {
    dialogBtn.disabled = true;
    dialogBtn.textContent = 'Dialog open…';
    var dialogScript = [
      '(function(){',
      '  var t = window.DialogAPI.getTheme();',
      '  var h = document.createElement("h2");',
      '  h.textContent = "Test Dialog";',
      '  h.style.cssText = "font-size:14px;font-weight:600;color:"+t.textPrimary+";margin-bottom:12px;";',
      '  document.body.appendChild(h);',
      '  var p = document.createElement("p");',
      '  p.textContent = "This dialog renders in the main window, not inside the widget panel.";',
      '  p.style.cssText = "font-size:12px;color:"+t.textMuted+";margin-bottom:16px;line-height:1.5;";',
      '  document.body.appendChild(p);',
      '  var btn = document.createElement("button");',
      '  btn.textContent = "Close and return value";',
      '  btn.style.cssText = "padding:5px 14px;font-size:12px;cursor:pointer;background:#1e2e1e;color:"+t.accent+";border:1px solid #2d472d;border-radius:3px;";',
      '  btn.addEventListener("click", function(){ window.DialogAPI.close({ demo: true }); });',
      '  document.body.appendChild(btn);',
      '})();',
    ].join('\n');
    window.WidgetAPI.openDialog(dialogScript).then(function (result) {
      dialogBtn.disabled = false;
      dialogBtn.textContent = result ? 'Got: ' + JSON.stringify(result) : 'Dismissed';
      setTimeout(function () { dialogBtn.textContent = 'Open test dialog'; }, 3000);
    });
  });
  document.body.appendChild(dialogBtn);

  window.WidgetAPI.setTitle('Test Widget');

  window.WidgetAPI.on('hook:tool-event', function (event) {
    if (event.event !== 'PreToolUse') return;
    counts[event.toolName] = (counts[event.toolName] || 0) + 1;
    render();
  });

  function render() {
    list.innerHTML = '';
    empty.style.display = 'none';

    var sorted = Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a];
    });

    for (var i = 0; i < sorted.length; i++) {
      var name = sorted[i];
      var li = document.createElement('li');
      li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:5px 2px;border-bottom:1px solid #242424;';

      var nameEl = document.createElement('span');
      nameEl.style.cssText = 'color:#aaa;font-size:12px;';
      nameEl.textContent = name;

      var countEl = document.createElement('span');
      countEl.style.cssText = "font-family:'Cascadia Code',Consolas,monospace;font-size:12px;color:#4ec94e;font-weight:600;";
      countEl.textContent = String(counts[name]);

      li.appendChild(nameEl);
      li.appendChild(countEl);
      list.appendChild(li);
    }
  }
})();
