/* Local editor. Only runs when the page is served by serve.py on this computer.
   On the live site this file does nothing. */
(async function () {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return;
  try { const r = await fetch('/__ping', { cache: 'no-store' }); if (!r.ok) return; } catch { return; }

  const inner = document.querySelector('.inner');
  const body = document.body;
  let editing = false, dirty = false, current = null, loadedMtime = null;
  try { const st = await (await fetch('/__stat?path=' + encodeURIComponent(location.pathname), { cache: 'no-store' })).json(); if (st.ok) loadedMtime = st.mtime; } catch {}

  /* ---------- editor chrome styles ---------- */
  const css = document.createElement('style');
  css.className = 'ed-ui';
  css.textContent = `
    .ed-ui{font:13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .ed-bar{position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;gap:6px;align-items:center;
      background:#111;color:#fff;padding:8px 10px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25)}
    .ed-bar button,.ed-panel button{font:inherit;background:#333;color:#fff;border:0;border-radius:6px;padding:6px 10px;cursor:pointer}
    .ed-bar button:hover,.ed-panel button:hover{background:#444}
    .ed-bar button.primary{background:#fff;color:#111;font-weight:600}
    .ed-bar button.primary:disabled{opacity:.4;cursor:default}
    .ed-bar .ed-status{opacity:.7;min-width:60px}
    .ed-bar select{font:inherit;background:#333;color:#fff;border:0;border-radius:6px;padding:6px 8px}
    .ed-hint,.ed-panel{position:fixed;right:16px;bottom:66px;z-index:9999;max-width:min(560px,calc(100vw - 32px));display:none;
      background:#111;color:#fff;padding:8px 10px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25)}
    .ed-hint{font-size:12px;line-height:1.5;color:#ccc;text-align:right}
    body.ed-editing .ed-hint.show,body.ed-editing .ed-panel.show{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center}
    .ed-panel .ed-group{display:flex;gap:3px;align-items:center}
    .ed-panel .ed-label{color:#aaa;font-size:11px;margin-right:2px}
    .ed-panel .ed-kind{font-weight:600;margin-right:6px}
    .ed-panel button{padding:5px 8px;min-width:28px}
    .ed-panel button.on{background:#fff;color:#111}
    .ed-panel .ed-val{color:#ccc;min-width:46px;text-align:center;font-variant-numeric:tabular-nums}
    body.ed-editing .inner > *{outline:1px dashed #e2e2e2;outline-offset:6px;transition:outline-color .15s}
    body.ed-editing .inner > *:hover{outline-color:#bbb}
    body.ed-editing .inner > .ed-sel{outline:2px solid #3B5DAD}
    body.ed-editing [contenteditable]:focus{outline:none}
    body.ed-editing .image img,body.ed-editing .photos img{cursor:pointer}
    body.ed-editing a{cursor:text}
    .ed-handle{position:absolute;z-index:9998;display:none;flex-direction:column;gap:2px}
    body.ed-editing .ed-handle.show{display:flex}
    .ed-handle button{width:22px;height:22px;border:0;border-radius:5px;background:#eee;color:#333;cursor:pointer;font:12px/1 sans-serif}
    .ed-handle button:hover{background:#ddd}
    .ed-handle button.del:hover{background:#f3c2c2}
    .inner{position:relative}
  `;
  document.head.appendChild(css);

  /* ---------- bottom bar ---------- */
  const bar = el('div', 'ed-bar ed-ui');
  const editBtn = el('button', '', 'Edit');
  const addSel = el('select');
  addSel.innerHTML = `<option value="">+ Add block…</option>
    <option value="heading">Heading</option>
    <option value="body">Paragraph</option>
    <option value="list">Bullet list</option>
    <option value="links">Link row</option>
    <option value="image">Image</option>
    <option value="photos">Photo row (thumbnails)</option>`;
  addSel.style.display = 'none';
  const saveBtn = el('button', 'primary', 'Save'); saveBtn.disabled = true;
  const status = el('span', 'ed-status', '');
  bar.append(editBtn, addSel, saveBtn, status);
  body.appendChild(bar);

  const hint = el('div', 'ed-hint ed-ui show');
  hint.innerHTML = 'Click a block to select it and get layout controls · click text to edit · <b>⌘K</b> link · <b>⌘B</b> bold · <b>⌘S</b> save · <b>Enter</b> new line / bullet · click a photo to replace · <b>⌥-click</b> a thumbnail to remove';
  body.appendChild(hint);

  /* ---------- block panel (layout controls for the selected block) ---------- */
  const panel = el('div', 'ed-panel ed-ui');
  const kindLbl = el('span', 'ed-kind', '');
  const gAlign = group('Align', [
    ['⇤', 'Align left', () => setAlign('left')],
    ['≡', 'Center', () => setAlign('center')],
    ['⇥', 'Align right', () => setAlign('right')],
  ]);
  const gWrap = group('Wrap text', [
    ['◧', 'Float left, text wraps on the right', () => setWrap('left')],
    ['none', 'No wrapping (own line)', () => setWrap('')],
    ['◨', 'Float right, text wraps on the left', () => setWrap('right')],
  ]);
  const sizeVal = el('span', 'ed-val', '');
  const gSize = group('Size', [
    ['−', 'Smaller', () => stepSize(-1)],
    [null, null, sizeVal],
    ['+', 'Larger', () => stepSize(1)],
  ]);
  const gPhotos = group('Photos', [
    ['+ photo', 'Add a photo to this row', () => { pickerMode = 'add'; targetImg = null; picker.click(); }],
  ]);
  const clearBtn = el('button', '', 'Start below any wrapped image');
  clearBtn.title = 'Force this block to start below a floated image (clear)';
  clearBtn.onclick = () => { if (current) { current.classList.toggle('clear'); refreshPanel(); markDirty(); } };
  const gClear = group('', [[null, null, clearBtn]]);
  panel.append(kindLbl, gAlign, gWrap, gSize, gPhotos, gClear);
  body.appendChild(panel);

  function group(label, items) {
    const g = el('span', 'ed-group');
    if (label) g.appendChild(el('span', 'ed-label', label));
    items.forEach(([txt, title, fnOrEl]) => {
      if (txt === null) { g.appendChild(fnOrEl); return; }
      const b = el('button', '', txt); b.title = title; b.onclick = fnOrEl; g.appendChild(b);
    });
    return g;
  }

  /* per-block floating handle (move / delete) */
  const handle = el('div', 'ed-handle ed-ui');
  const upBtn = el('button', '', '↑'), downBtn = el('button', '', '↓'), delBtn = el('button', 'del', '✕');
  upBtn.title = 'Move up'; downBtn.title = 'Move down'; delBtn.title = 'Delete block';
  handle.append(upBtn, downBtn, delBtn);
  inner.appendChild(handle);

  /* ---------- edit mode ---------- */
  editBtn.onclick = () => setEditing(!editing);
  function setEditing(on) {
    editing = on;
    body.classList.toggle('ed-editing', on);
    editBtn.textContent = on ? 'Done' : 'Edit';
    addSel.style.display = on ? '' : 'none';
    blocks().forEach(b => {
      if (isMedia(b)) return;
      if (on) b.contentEditable = 'true'; else b.removeAttribute('contenteditable');
    });
    if (!on) select(null);
  }
  function blocks() { return [...inner.children].filter(c => !c.classList.contains('ed-ui')); }
  function isMedia(b) { return b.classList.contains('image') || b.classList.contains('photos'); }
  function kindOf(b) {
    if (b.classList.contains('image')) return 'Image';
    if (b.classList.contains('photos')) return 'Photo row';
    if (b.classList.contains('links')) return 'Link row';
    if (b.classList.contains('list')) return 'Bullet list';
    if (b.classList.contains('name')) return 'Name';
    if (b.classList.contains('heading')) return 'Heading';
    return 'Text';
  }

  inner.addEventListener('input', markDirty);
  function markDirty() { dirty = true; saveBtn.disabled = false; status.textContent = 'Unsaved'; }

  /* select a block by clicking it */
  inner.addEventListener('mousedown', e => {
    if (!editing) return;
    const b = e.target.closest('.inner > *');
    if (b && !b.classList.contains('ed-ui')) select(b);
  });
  function select(b) {
    current = b;
    blocks().forEach(x => x.classList.toggle('ed-sel', x === b));
    if (!b) { handle.classList.remove('show'); panel.classList.remove('show'); hint.classList.add('show'); return; }
    handle.classList.add('show'); panel.classList.add('show'); hint.classList.remove('show');
    positionHandle(); refreshPanel();
  }
  function positionHandle() {
    if (!current) return;
    handle.style.top = current.offsetTop + 'px';
    // beside a right-floated block, sit on its right edge; otherwise in the left gutter
    const right = current.classList.contains('wrap-right');
    handle.style.left = (right ? current.offsetLeft + current.offsetWidth + 12 : current.offsetLeft - 34) + 'px';
  }
  function refreshPanel() {
    const b = current; if (!b) return;
    kindLbl.textContent = kindOf(b);
    const media = isMedia(b);
    const align = ['left', 'center', 'right'].find(a => b.classList.contains('align-' + a)) || (b.classList.contains('image') ? 'right' : 'left');
    [...gAlign.querySelectorAll('button')].forEach((btn, i) => btn.classList.toggle('on', ['left', 'center', 'right'][i] === align));
    const wrap = b.classList.contains('wrap-left') ? 'left' : b.classList.contains('wrap-right') ? 'right' : '';
    [...gWrap.querySelectorAll('button')].forEach((btn, i) => btn.classList.toggle('on', ['left', '', 'right'][i] === wrap));
    gWrap.style.display = media ? '' : 'none';
    gAlign.style.display = wrap ? 'none' : '';
    gPhotos.style.display = b.classList.contains('photos') ? '' : 'none';
    clearBtn.classList.toggle('on', b.classList.contains('clear'));
    sizeVal.textContent = media ? widthRem(b).toFixed(2) + 'rem' : fontEm(b).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + 'em';
  }

  /* ---------- layout operations ---------- */
  function setAlign(a) {
    if (!current) return;
    current.classList.remove('align-left', 'align-center', 'align-right');
    const def = current.classList.contains('image') ? 'right' : 'left';
    if (a !== def) current.classList.add('align-' + a);
    done();
  }
  function setWrap(side) {
    if (!current) return;
    current.classList.remove('wrap-left', 'wrap-right', 'align-left', 'align-center', 'align-right');
    if (side) current.classList.add('wrap-' + side);
    done();
  }
  function widthRem(b) {
    const v = b.style.getPropertyValue('--w');
    return v ? parseFloat(v) : 4.125;
  }
  function fontEm(b) {
    const px = parseFloat(getComputedStyle(b).fontSize), ppx = parseFloat(getComputedStyle(b.parentNode).fontSize);
    return px / ppx;
  }
  function stepSize(dir) {
    if (!current) return;
    if (isMedia(current)) {
      const w = Math.max(1, Math.round((widthRem(current) + dir * 0.5) * 1000) / 1000);
      current.style.setProperty('--w', w + 'rem');
    } else {
      const em = Math.max(0.3, Math.round((fontEm(current) + dir * 0.0625) * 10000) / 10000);
      current.style.fontSize = em + 'em';
    }
    done();
  }
  function done() { refreshPanel(); positionHandle(); markDirty(); }

  upBtn.onclick = () => { if (current && current.previousElementSibling) { current.parentNode.insertBefore(current, current.previousElementSibling); done(); } };
  downBtn.onclick = () => { const n = current && current.nextElementSibling; if (n && !n.classList.contains('ed-ui')) { current.parentNode.insertBefore(n, current); done(); } };
  delBtn.onclick = () => { if (current && confirm('Delete this block?')) { current.remove(); select(null); markDirty(); } };

  /* ---------- add blocks ---------- */
  addSel.onchange = () => {
    const t = addSel.value; addSel.value = '';
    if (!t) return;
    const n = makeBlock(t);
    const after = current && current.parentNode === inner ? current : blocks().at(-1);
    after ? after.after(n) : inner.insertBefore(n, handle);
    if (!isMedia(n)) { n.contentEditable = 'true'; placeCaret(n); }
    select(n); markDirty();
  };
  function makeBlock(t) {
    let n;
    if (t === 'heading') { n = el('h2', 'text heading'); n.innerHTML = '<strong>New heading</strong>'; }
    else if (t === 'body') { n = el('p', 'text body', 'New paragraph.'); }
    else if (t === 'list') { n = el('ul', 'list'); n.innerHTML = '<li>First item</li>'; }
    else if (t === 'links') { n = el('ul', 'links'); n.innerHTML = '<li><a href="https://example.com">Link</a></li>'; }
    else if (t === 'image') { n = el('div', 'image'); n.innerHTML = '<span class="frame"><img src="images/rebecca.jpg" alt=""></span>'; }
    else if (t === 'photos') { n = el('ul', 'photos'); n.innerHTML = '<li><a href="images/rebecca.jpg" target="_blank"><img src="images/rebecca.jpg" alt=""></a></li>'; }
    return n;
  }

  /* ---------- keyboard: links, bold, save, plain paste ---------- */
  document.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) save(); return; }
    if (!editing) return;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); editLink(); }
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); markDirty(); }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); document.execCommand('italic'); markDirty(); }
    if (e.key === 'Enter' && !e.shiftKey) {
      const blk = e.target.closest && e.target.closest('.inner > *');
      if (blk && blk.matches('p, h2')) { e.preventDefault(); document.execCommand('insertLineBreak'); markDirty(); }
    }
  });
  inner.addEventListener('paste', e => {
    if (!editing) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  function editLink() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const a = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('a');
    const url = prompt('Link URL (leave empty to remove link):', a ? a.getAttribute('href') : 'https://');
    if (url === null) return;
    if (a) { if (url.trim()) a.setAttribute('href', url.trim()); else a.replaceWith(...a.childNodes); }
    else if (url.trim()) {
      if (sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${esc(url.trim())}">${esc(url.trim())}</a>`);
      else document.execCommand('createLink', false, url.trim());
    }
    markDirty();
  }

  /* ---------- images: replace / add / remove ---------- */
  const picker = el('input'); picker.type = 'file'; picker.accept = 'image/*'; picker.className = 'ed-ui'; picker.style.display = 'none';
  body.appendChild(picker);
  let targetImg = null, pickerMode = 'replace';
  inner.addEventListener('click', e => {
    if (!editing) return;
    if (e.target.closest('a')) e.preventDefault();   // don't navigate while editing
    const img = e.target.closest('.image img, .photos img');
    if (!img) return;
    if (e.altKey && img.closest('.photos li')) {
      const li = img.closest('li'), row = li.parentNode; li.remove();
      if (!row.children.length) { row.remove(); select(null); }
      markDirty(); return;
    }
    targetImg = img; pickerMode = 'replace'; picker.click();
  });
  picker.onchange = async () => {
    const f = picker.files[0]; if (!f || (pickerMode === 'replace' && !targetImg)) return;
    status.textContent = 'Uploading…';
    const r = await fetch('/__upload', { method: 'POST', headers: { 'X-Filename': encodeURIComponent(f.name), 'Content-Type': f.type || 'application/octet-stream' }, body: f });
    const j = await r.json();
    if (j.ok) {
      if (pickerMode === 'add' && current) {
        const li = document.createElement('li');
        li.innerHTML = `<a href="${j.path}" target="_blank"><img src="${j.path}?v=${Date.now()}" alt=""></a>`;
        current.appendChild(li);
      } else {
        targetImg.src = j.path + '?v=' + Date.now();
        const a = targetImg.closest('a'); if (a && a.closest('.photos')) a.setAttribute('href', j.path);
      }
      done(); status.textContent = 'Unsaved';
    } else status.textContent = 'Upload failed: ' + (j.error || '');
    picker.value = '';
  };

  /* ---------- save ---------- */
  saveBtn.onclick = save;
  async function save(force) {
    status.textContent = 'Saving…';
    const doc = document.documentElement.cloneNode(true);
    doc.querySelectorAll('.ed-ui').forEach(n => n.remove());
    // browser extensions inject <style>/<script>/<link>/<div> nodes; keep only what the site owns
    doc.querySelectorAll('style').forEach(n => n.remove());
    doc.querySelectorAll('script').forEach(n => { if (n.getAttribute('src') !== 'editor.js') n.remove(); });
    doc.querySelectorAll('link').forEach(n => { if (n.getAttribute('href') !== 'styles.css') n.remove(); });
    [...doc.querySelector('body').children].forEach(n => { if (!(n.matches('main.site-main') || (n.tagName === 'SCRIPT' && n.getAttribute('src') === 'editor.js'))) n.remove(); });
    doc.querySelectorAll('[data-litepicker], [id^="__"], [class*="extension"]').forEach(n => n.remove());
    doc.querySelectorAll('[contenteditable]').forEach(n => n.removeAttribute('contenteditable'));
    doc.querySelectorAll('.ed-sel').forEach(n => n.classList.remove('ed-sel'));
    doc.querySelector('body').classList.remove('ed-editing');
    doc.querySelectorAll('[class=""]').forEach(n => n.removeAttribute('class'));
    doc.querySelectorAll('[style=""]').forEach(n => n.removeAttribute('style'));
    doc.querySelectorAll('img[src*="?v="]').forEach(n => n.setAttribute('src', n.getAttribute('src').split('?')[0]));
    const html = '<!doctype html>\n' + doc.outerHTML + '\n';
    try {
      const r = await fetch('/__save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html, path: location.pathname, mtime: loadedMtime, force: !!force }) });
      const j = await r.json();
      if (j.ok) { loadedMtime = j.mtime; dirty = false; saveBtn.disabled = true; status.textContent = 'Saved ✓'; setTimeout(() => { if (!dirty) status.textContent = ''; }, 2000); }
      else if (j.stale) {
        status.textContent = 'Not saved';
        if (confirm('This page was changed on disk after you opened it (for example in another tab or by Claude).\n\nOK = overwrite it with what you see here.\nCancel = keep the disk version (reload the page to see it; your unsaved edits here will be lost).')) return save(true);
      }
      else status.textContent = 'Error: ' + (j.error || 'save failed');
    } catch (err) { status.textContent = 'Error: server not running'; }
  }
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('resize', positionHandle);

  /* ---------- helpers ---------- */
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function placeCaret(n) { const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); n.focus(); }
})();
