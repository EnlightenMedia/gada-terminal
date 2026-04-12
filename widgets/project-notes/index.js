(function () {
  var textarea = document.createElement('textarea');
  textarea.style.cssText = [
    'width:100%;height:200px;resize:vertical;',
    'background:#1a1a1a;color:#e0e0e0;',
    'border:1px solid #2a2a2a;border-radius:3px;',
    'padding:6px;font-size:12px;line-height:1.5;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
    'outline:none;',
  ].join('');
  textarea.placeholder = 'Notes for this project\u2026';
  document.body.appendChild(textarea);

  var saveTimer = null;

  window.WidgetAPI.getContext().then(function (cwd) {
    var storageKey = cwd || '__default__';

    window.WidgetAPI.storage.get(storageKey).then(function (value) {
      if (value) textarea.value = value;
    });

    textarea.addEventListener('input', function () {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        window.WidgetAPI.storage.set(storageKey, textarea.value);
      }, 500);
    });
  });
})();
