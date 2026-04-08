(function () {
  var counts = {};

  var list = document.createElement('ul');
  list.style.cssText = 'list-style:none;padding:0;margin:0;';
  document.body.appendChild(list);

  var empty = document.createElement('p');
  empty.style.cssText = 'color:#555;font-size:11px;padding:4px 0;';
  empty.textContent = 'No tools invoked yet.';
  document.body.appendChild(empty);

  window.PanelAPI.setTitle('Tool Count');

  window.PanelAPI.on('hook:tool-event', function (event) {
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
