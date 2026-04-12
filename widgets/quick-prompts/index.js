(function () {
  var theme = window.WidgetAPI.getTheme();
  var cachedCwd = null;
  var userPrompts = [];
  var projectPrompts = [];

  var USER_KEY = '__user-prompts__';

  function projectKey(cwd) { return 'project:' + cwd; }
  function genId() { return Math.random().toString(36).slice(2) + Date.now(); }

  // ── Storage ───────────────────────────────────────────────────────────────

  function loadPrompts() {
    var projectLoad = cachedCwd
      ? window.WidgetAPI.storage.get(projectKey(cachedCwd))
      : Promise.resolve(null);
    return Promise.all([
      window.WidgetAPI.storage.get(USER_KEY),
      projectLoad,
    ]).then(function (r) {
      try { userPrompts = JSON.parse(r[0] || '[]'); } catch (e) { userPrompts = []; }
      try { projectPrompts = JSON.parse(r[1] || '[]'); } catch (e) { projectPrompts = []; }
    });
  }

  function saveAll() {
    var ops = [window.WidgetAPI.storage.set(USER_KEY, JSON.stringify(userPrompts))];
    if (cachedCwd) ops.push(window.WidgetAPI.storage.set(projectKey(cachedCwd), JSON.stringify(projectPrompts)));
    return Promise.all(ops);
  }

  // ── Main list view ────────────────────────────────────────────────────────

  var root = document.createElement('div');
  root.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  document.body.appendChild(root);

  var toolbar = document.createElement('div');
  toolbar.style.cssText = 'display:flex;justify-content:flex-end;';
  root.appendChild(toolbar);

  var manageBtn = document.createElement('button');
  manageBtn.textContent = 'Manage';
  manageBtn.style.cssText = [
    'padding:3px 8px;font-size:11px;cursor:pointer;',
    'background:#1e2e1e;color:' + theme.accent + ';',
    'border:1px solid #2d472d;border-radius:3px;',
  ].join('');
  toolbar.appendChild(manageBtn);

  var listEl = document.createElement('div');
  listEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  root.appendChild(listEl);

  var emptyEl = document.createElement('p');
  emptyEl.textContent = 'No prompts yet — click Manage to add one.';
  emptyEl.style.cssText = 'color:' + theme.textMuted + ';font-size:11px;margin:0;padding:2px 0;';
  root.appendChild(emptyEl);

  function renderList() {
    listEl.innerHTML = '';
    var all = userPrompts.map(function (p) { return { prompt: p, scope: 'user' }; })
      .concat(projectPrompts.map(function (p) { return { prompt: p, scope: 'project' }; }));
    emptyEl.style.display = all.length ? 'none' : 'block';

    all.forEach(function (item) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';

      var badge = document.createElement('span');
      badge.textContent = item.scope === 'user' ? 'U' : 'P';
      badge.title = item.scope === 'user' ? 'User — all projects' : 'Project — this folder';
      badge.style.cssText = [
        'flex-shrink:0;width:16px;height:16px;border-radius:3px;',
        'font-size:9px;font-weight:700;line-height:1;',
        'display:inline-flex;align-items:center;justify-content:center;',
        item.scope === 'user'
          ? 'background:#1a2a3a;color:#5aafef;border:1px solid #1e3a5a;'
          : 'background:#1e2a1e;color:' + theme.accent + ';border:1px solid #2a3a2a;',
      ].join('');

      var label = document.createElement('span');
      label.textContent = item.prompt.label;
      label.title = item.prompt.body;
      label.style.cssText = [
        'flex:1;font-size:12px;color:' + theme.textPrimary + ';',
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
      ].join('');

      var sendBtn = document.createElement('button');
      sendBtn.textContent = 'Send';
      sendBtn.style.cssText = [
        'flex-shrink:0;padding:2px 8px;font-size:11px;cursor:pointer;',
        'background:#1e2e1e;color:' + theme.accent + ';',
        'border:1px solid #2d472d;border-radius:3px;',
      ].join('');

      sendBtn.addEventListener('click', function () {
        sendBtn.disabled = true;
        sendBtn.textContent = '\u2026';
        window.WidgetAPI.sendClaudeMessage(item.prompt.body)
          .then(function () {
            sendBtn.textContent = 'Sent!';
            setTimeout(function () { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }, 1500);
          })
          .catch(function () {
            sendBtn.textContent = 'Denied';
            sendBtn.style.color = '#e05555';
            setTimeout(function () {
              sendBtn.disabled = false;
              sendBtn.textContent = 'Send';
              sendBtn.style.color = theme.accent;
            }, 2000);
          });
      });

      row.appendChild(badge);
      row.appendChild(label);
      row.appendChild(sendBtn);
      listEl.appendChild(row);
    });
  }

  // ── Manage dialog ─────────────────────────────────────────────────────────

  function buildManageScript(uPrompts, pPrompts, hasCwd) {
    var embedded = 'var __d=' + JSON.stringify({ u: uPrompts, p: pPrompts, hasCwd: hasCwd }) + ';';
    return [
      '(function(){',
      embedded,
      'var userPrompts=__d.u.slice();',
      'var projectPrompts=__d.p.slice();',
      'var hasCwd=__d.hasCwd;',
      'var t=window.DialogAPI.getTheme();',

      // Reset body for full-height flex layout
      'document.body.style.cssText="margin:0;padding:0;height:100%;overflow:hidden;display:flex;flex-direction:column;";',
      'document.documentElement.style.height="100%";',

      // Style helpers
      'function iSt(x){return "width:100%;box-sizing:border-box;background:#141414;color:#e0e0e0;border:1px solid #2a2a2a;border-radius:3px;padding:4px 6px;font-size:11px;outline:none;"+(x||"");}',
      'function sBt(c,b){return "flex-shrink:0;padding:2px 7px;font-size:10px;cursor:pointer;background:none;color:"+c+";border:1px solid "+b+";border-radius:3px;";}',
      'function bSt(s){return "flex-shrink:0;width:16px;height:16px;border-radius:3px;font-size:9px;font-weight:700;line-height:1;display:inline-flex;align-items:center;justify-content:center;"+(s==="user"?"background:#1a2a3a;color:#5aafef;border:1px solid #1e3a5a;":"background:#1e2a1e;color:"+t.accent+";border:1px solid #2a3a2a;");}',

      // Header
      'var hdr=document.createElement("div");',
      'hdr.style.cssText="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #2a2a2a;flex-shrink:0;";',
      'var ttl=document.createElement("span");',
      'ttl.textContent="Manage Prompts";',
      'ttl.style.cssText="font-size:13px;font-weight:600;color:"+t.textPrimary+";";',
      'var doneBtn=document.createElement("button");',
      'doneBtn.textContent="Done";',
      'doneBtn.style.cssText="padding:4px 14px;font-size:11px;cursor:pointer;background:#1e2e1e;color:"+t.accent+";border:1px solid #2d472d;border-radius:3px;";',
      'doneBtn.addEventListener("click",function(){window.DialogAPI.close({u:userPrompts,p:projectPrompts});});',
      'hdr.appendChild(ttl);hdr.appendChild(doneBtn);document.body.appendChild(hdr);',

      // Scrollable body
      'var bd=document.createElement("div");',
      'bd.style.cssText="flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px;";',
      'document.body.appendChild(bd);',

      // Add-prompt section
      'var asc=document.createElement("div");',
      'asc.style.cssText="display:flex;flex-direction:column;gap:6px;padding:8px;background:"+t.backgroundSecondary+";border:1px solid #2a2a2a;border-radius:4px;flex-shrink:0;";',
      'var ahd=document.createElement("div");ahd.textContent="New prompt";',
      'ahd.style.cssText="font-size:10px;font-weight:700;color:"+t.textMuted+";text-transform:uppercase;letter-spacing:0.06em;";',
      'asc.appendChild(ahd);',
      'var ali=document.createElement("input");ali.type="text";ali.placeholder="Label";ali.style.cssText=iSt();asc.appendChild(ali);',
      'var abi=document.createElement("textarea");abi.placeholder="Message body";abi.rows=3;abi.style.cssText=iSt("resize:vertical;");asc.appendChild(abi);',

      // Scope radios
      'var sr=document.createElement("div");sr.style.cssText="display:flex;gap:14px;align-items:center;";',
      '["user","project"].forEach(function(s){',
      '  var lbl=document.createElement("label");',
      '  lbl.style.cssText="display:flex;align-items:center;gap:4px;font-size:11px;color:"+t.textPrimary+";cursor:pointer;";',
      '  var r=document.createElement("input");r.type="radio";r.name="ns";r.value=s;',
      '  if(s==="user")r.checked=true;',
      '  if(s==="project"&&!hasCwd){r.disabled=true;lbl.style.opacity="0.4";}',
      '  lbl.appendChild(r);',
      '  lbl.appendChild(document.createTextNode(s==="user"?"User (all projects)":"Project (this folder)"));',
      '  sr.appendChild(lbl);',
      '});',
      'asc.appendChild(sr);',

      // Add button
      'var abtn=document.createElement("button");abtn.textContent="Add";',
      'abtn.style.cssText="align-self:flex-end;padding:3px 14px;font-size:11px;cursor:pointer;background:#1e2e1e;color:"+t.accent+";border:1px solid #2d472d;border-radius:3px;";',
      'abtn.addEventListener("click",function(){',
      '  var lv=ali.value.trim(),bv=abi.value.trim();if(!lv||!bv)return;',
      '  var sc=asc.querySelector("input[name=ns]:checked");',
      '  var scope=sc?sc.value:"user";',
      '  var entry={id:Math.random().toString(36).slice(2)+Date.now(),label:lv,body:bv};',
      '  if(scope==="user")userPrompts.push(entry);else projectPrompts.push(entry);',
      '  ali.value="";abi.value="";renderList();',
      '});',
      'asc.appendChild(abtn);bd.appendChild(asc);',

      // Existing prompts list
      'var lst=document.createElement("div");lst.style.cssText="display:flex;flex-direction:column;gap:6px;";bd.appendChild(lst);',

      // renderList
      'function renderList(){',
      '  lst.innerHTML="";',
      '  var all=userPrompts.map(function(p){return{p:p,s:"user"};}).concat(projectPrompts.map(function(p){return{p:p,s:"project"};}));',
      '  if(!all.length){var none=document.createElement("p");none.textContent="No prompts yet.";none.style.cssText="color:"+t.textMuted+";font-size:11px;margin:0;";lst.appendChild(none);return;}',
      '  all.forEach(function(item){',
      '    var card=document.createElement("div");',
      '    card.style.cssText="display:flex;flex-direction:column;background:"+t.backgroundSecondary+";border:1px solid #2a2a2a;border-radius:4px;overflow:hidden;";',
      '    var vr=document.createElement("div");vr.style.cssText="display:flex;align-items:center;gap:6px;padding:6px 8px;";',
      '    var bdg=document.createElement("span");bdg.textContent=item.s==="user"?"U":"P";bdg.title=item.s==="user"?"User":"Project";bdg.style.cssText=bSt(item.s);',
      '    var ls=document.createElement("span");ls.textContent=item.p.label;ls.style.cssText="flex:1;font-size:12px;color:"+t.textPrimary+";font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";',
      '    var eb=document.createElement("button");eb.textContent="Edit";eb.style.cssText=sBt(t.textMuted,"#2e2e2e");',
      '    var db=document.createElement("button");db.textContent="Delete";db.style.cssText=sBt("#e05555","#3a1e1e");',
      '    vr.appendChild(bdg);vr.appendChild(ls);vr.appendChild(eb);vr.appendChild(db);card.appendChild(vr);',
      '    var ef=document.createElement("div");ef.style.cssText="display:none;flex-direction:column;gap:5px;padding:8px;border-top:1px solid #2a2a2a;";',
      '    var eli=document.createElement("input");eli.type="text";eli.value=item.p.label;eli.style.cssText=iSt();',
      '    var ebi=document.createElement("textarea");ebi.rows=3;ebi.value=item.p.body;ebi.style.cssText=iSt("resize:vertical;");',
      '    var ea=document.createElement("div");ea.style.cssText="display:flex;gap:6px;justify-content:flex-end;";',
      '    var cb=document.createElement("button");cb.textContent="Cancel";cb.style.cssText=sBt(t.textMuted,"#2e2e2e");',
      '    var sb=document.createElement("button");sb.textContent="Save";sb.style.cssText="padding:2px 10px;font-size:11px;cursor:pointer;background:#1e2e1e;color:"+t.accent+";border:1px solid #2d472d;border-radius:3px;";',
      '    ea.appendChild(cb);ea.appendChild(sb);ef.appendChild(eli);ef.appendChild(ebi);ef.appendChild(ea);card.appendChild(ef);',
      '    (function(item,eb,ef,eli,ebi,sb,cb,db){',
      '      eb.addEventListener("click",function(){var o=ef.style.display==="flex";ef.style.display=o?"none":"flex";eb.textContent=o?"Edit":"Cancel edit";});',
      '      cb.addEventListener("click",function(){eli.value=item.p.label;ebi.value=item.p.body;ef.style.display="none";eb.textContent="Edit";});',
      '      sb.addEventListener("click",function(){var nl=eli.value.trim(),nb=ebi.value.trim();if(!nl||!nb)return;item.p.label=nl;item.p.body=nb;renderList();});',
      '      db.addEventListener("click",function(){',
      '        if(item.s==="user")userPrompts=userPrompts.filter(function(x){return x.id!==item.p.id;});',
      '        else projectPrompts=projectPrompts.filter(function(x){return x.id!==item.p.id;});',
      '        renderList();',
      '      });',
      '    })(item,eb,ef,eli,ebi,sb,cb,db);',
      '    lst.appendChild(card);',
      '  });',
      '}',
      'renderList();',
      '})();',
    ].join('\n');
  }

  function openManageDialog() {
    var script = buildManageScript(userPrompts.slice(), projectPrompts.slice(), !!cachedCwd);
    window.WidgetAPI.openDialog(script).then(function (result) {
      if (!result) return;
      userPrompts = result.u || [];
      projectPrompts = result.p || [];
      saveAll().then(renderList);
    });
  }

  manageBtn.addEventListener('click', openManageDialog);

  // ── Init ──────────────────────────────────────────────────────────────────

  window.WidgetAPI.getContext().then(function (cwd) {
    cachedCwd = cwd;
    loadPrompts().then(renderList);
  });
})();
