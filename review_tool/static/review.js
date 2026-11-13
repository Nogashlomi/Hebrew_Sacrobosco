/* Illustration review: extraction (per manuscript, per page). Clusters and groups are in groups.js. Talks to server.py. */
const $ = id => document.getElementById(id);
const esc = s => (s === null || s === undefined) ? "" : String(s).replace(/[&<>"']/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
const clsSlug = c => "cls-" + String(c).replace(/[^A-Za-z]+/g, "_").replace(/_$/, "");
const thumbUrl = (p, w = 220) => `/thumb?p=${encodeURIComponent(p)}&w=${w}`;
const cardImg = (c, w = 220) => c.crop ? thumbUrl(c.crop, w)
  : `/crop?p=${encodeURIComponent(c.page_file)}&box=${c.box.join(",")}&w=${w}`;

async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body) } : {});
  const data = await r.json();
  if (!r.ok || data.error) { toast(data.error || r.statusText, true); throw new Error(data.error); }
  if (body) $("saved").textContent = "Saved " + new Date().toLocaleTimeString();
  return data;
}
let toastTimer = null;
function toast(msg, err) {
  const t = $("toast");
  t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, err ? 6000 : 2200);
}

// ---------------------------------------------------------------- views
let view = "extraction";
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
function setView(v) {
  view = v;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  $("view-extraction").hidden = v !== "extraction";
  $("view-clusters").hidden = v !== "clusters";
  $("view-groups").hidden = v !== "groups";
  $("view-board").hidden = v !== "board";
  $("view-assign").hidden = v !== "assign";
  if (v === "clusters") loadClusters(); else if (v === "groups") loadGroups(); else if (v === "board") loadBoard();
  else if (v === "assign") loadAssign(); else loadManuscripts();
}

// ---------------------------------------------------------------- catalogue record (date, place, script, texts)
// read from the visualizer's data file, which the server already serves under /data/
let CATALOG = null;
async function loadCatalog() {
  if (CATALOG) return CATALOG;
  try {
    const d = await (await fetch("/data/metadata/clean/visualizer_data.json")).json();
    const codexById = Object.fromEntries((d.codices || []).map(c => [c.codex_id, c]));
    const byFolder = {};
    d.manuscripts.forEach(m => {
      if (!m.image_folder) return;
      const f = m.image_folder.split("/").pop();
      (byFolder[f] = byFolder[f] || []).push(m);
    });
    CATALOG = { byFolder, codexById };
  } catch (e) { CATALOG = { byFolder: {}, codexById: {} }; }
  return CATALOG;
}

function recordHtml(folder) {
  const recs = (CATALOG && CATALOG.byFolder[folder]) || [];
  if (!recs.length) return "";
  const main = recs.find(r => r.codex_id === r.mms_id) || recs[0];
  const c = CATALOG.codexById[main.codex_id] || {};
  const pick = k => (recs.map(r => r[k]).find(v => v && v !== "Not Specified" && v !== "Unknown Era") || "");
  const date = [pick("date_place"), (c.century && c.century !== "Unknown Era") ? c.century : ""].filter(Boolean).join(" · ");
  const items = (c.contents || "").split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean).map(x => {
    const m = /^(\d+)\)\s*(?:(דף[^:]*|דפים[^:]*):\s*)?(.*)$/.exec(x);
    return m ? { folios: (m[2] || "").trim(), text: m[3].replace(/\.$/, "") } : { folios: "", text: x };
  });
  const texts = items.length
    ? `<ol class="rec-list">${items.map(it => `<li>${esc(it.text)}${it.folios ? ` <span class="muted">${esc(it.folios)}</span>` : ""}</li>`).join("")}</ol>`
    : (c.texts || []).length ? `<div class="rec-chips">${c.texts.map(t => `<span>${esc(t)}</span>`).join("")}</div>` : `<span class="muted">not recorded</span>`;
  const ktiv = main.ktiv_link ? `<a href="${esc(main.ktiv_link)}" target="_blank" rel="noopener">Ktiv ↗</a>` : "";
  return `<div class="record">
    <div class="rec-grid">
      <div><span class="rec-l">Date</span><span dir="auto">${esc(date) || '<span class="muted">not recorded</span>'}</span></div>
      <div><span class="rec-l">Place of writing</span><span>${esc(c.place_writing || pick("place_writing")) || '<span class="muted">not recorded</span>'}</span></div>
      <div><span class="rec-l">Script</span><span dir="auto">${esc(c.script || pick("script")) || '<span class="muted">not recorded</span>'}</span></div>
      <div><span class="rec-l">Library</span><span>${esc(c.library || main.library)} ${ktiv}</span></div>
    </div>
    <details class="rec-texts" open><summary><span class="rec-l">Texts in this manuscript (${items.length || (c.texts || []).length})</span>
      <span class="muted">${items.length ? "catalogue contents list" : "from the record's titles"}</span></summary>${texts}</details>
  </div>`;
}

// ================================================================ 1. EXTRACTION
const X = { list: [], ms: null, showClass: "all", pageFilter: "all", pageSize: 180, zoom: "fit", editor: null };

async function loadManuscripts() {
  X.list = (await api("/api/manuscripts")).manuscripts;
  renderMsList();
}

function renderMsList() {
  const q = $("ms-search").value.trim().toLowerCase(), f = $("ms-filter").value;
  const rows = X.list.filter(m => (!q || m.shelfmark.toLowerCase().includes(q) || m.folder.toLowerCase().includes(q))
    && (!f || (f === "done" ? m.done : !m.done)));
  const done = X.list.filter(m => m.done).length;
  $("ms-progress").innerHTML = `${done} of ${X.list.length} manuscripts done ·
    ${X.list.reduce((n, m) => n + m.wrong, 0)} marked wrong · ${X.list.reduce((n, m) => n + m.drawn, 0)} drawn
    <div class="bar"><span style="width:${X.list.length ? 100 * done / X.list.length : 0}%"></span></div>`;
  $("ms-list").innerHTML = rows.map(m => `
    <div class="item ${X.ms && X.ms.folder === m.folder ? "active" : ""}" data-folder="${esc(m.folder)}">
      <div class="grow"><div class="t">${esc(m.shelfmark)}</div>
        <div class="s">${m.detected} detected${m.wrong ? ` · ${m.wrong} wrong` : ""}${m.drawn ? ` · ${m.drawn} drawn` : ""} · ${m.pages_checked}/${m.pages} pages checked</div></div>
      ${m.done ? `<span class="badge done">done</span>` : (m.wrong || m.drawn || m.pages_checked) ? `<span class="badge part">started</span>` : ""}
    </div>`).join("") || `<p class="empty" style="padding:10px">No manuscripts.</p>`;
  $("ms-list").querySelectorAll(".item").forEach(el => el.addEventListener("click", () => openMs(el.dataset.folder)));
}
$("ms-search").addEventListener("input", renderMsList);
$("ms-filter").addEventListener("change", renderMsList);

async function openMs(folder, keepScroll) {
  const top = $("ms-main").scrollTop;
  await loadCatalog();
  const isNew = !X.ms || X.ms.folder !== folder;
  X.ms = await api(`/api/manuscript?folder=${encodeURIComponent(folder)}`);
  if (isNew) {      // a new manuscript opens on its first unchecked page
    const first = firstUnchecked(X.ms);
    X.editor = { index: first ? X.ms.pages.indexOf(first) : 0, selected: null, adding: false };
    $("ed-new-class").innerHTML = X.ms.classes.map(c => `<option>${esc(c)}</option>`).join("");
  }
  renderMs();
  renderMsList();
  if (keepScroll) $("ms-main").scrollTop = top;
}

async function refreshMs() {
  await openMs(X.ms.folder, true);
  X.list = (await api("/api/manuscripts")).manuscripts;
  renderMsList();
}

function boxesOnPage(p) { return X.ms.boxes.filter(b => +b.page_number === +p); }

function renderMs() {
  const m = X.ms, checked = new Set(m.pages_checked);
  const boxes = m.boxes.filter(b => X.showClass === "all" || (X.showClass === "diag" ? b.class === "Content Illustration" : b.class !== "Content Illustration"));
  const nWrong = m.boxes.filter(b => b.wrong).length, nDrawn = m.boxes.filter(b => b.drawn).length;
  const withBoxes = new Set(m.boxes.map(b => +b.page_number));
  const pages = m.pages.filter(p => X.pageFilter === "all" || (X.pageFilter === "has" ? withBoxes.has(+p.page_number)
    : X.pageFilter === "none" ? !withBoxes.has(+p.page_number) : !checked.has(+p.page_number)));
  document.body.appendChild($("editor"));            // keep the page viewer while the screen is redrawn
  $("ms-main").innerHTML = `
    <div class="head"><h2>${esc(m.shelfmark)}</h2>
      <span class="muted">${checked.size} of ${m.pages.length} pages checked</span>
      <div class="bar" style="width:160px;margin:0"><span style="width:${m.pages.length ? 100 * checked.size / m.pages.length : 0}%"></span></div>
      <button class="btn ${m.done ? "" : "good"}" id="ms-done">${m.done ? "Done ✓ (click to reopen)" : "Mark manuscript as done ✓"}</button></div>
    ${recordHtml(m.folder)}
    <div class="stats">${m.pages.length} pages · ${m.boxes.length - nDrawn} detected · ${nWrong} marked wrong · ${nDrawn} drawn by you
      <span class="muted">· ${esc(m.folder)}</span></div>
    <div id="editor-slot"></div>
    <h3 class="sec">Extracted from this page</h3>
    <div id="page-crops" class="grid"></div>

    <h3 class="sec">All extracted illustrations in this manuscript (${boxes.length})
      <select id="show-class"><option value="all">all classes</option><option value="diag">diagrams only</option><option value="other">tables, initials, decorations</option></select></h3>
    <p class="note">Click an image to mark it <strong>wrong</strong> (click again to restore). Change the class in the menu.
      "page" opens the page, where you can also draw boxes the detector missed.</p>
    <div class="grid" id="all-crops">${boxes.map(boxCard).join("") || `<p class="empty">No detections.</p>`}</div>

    <h3 class="sec">Pages (${pages.length})
      <select id="page-filter"><option value="all">all pages</option><option value="unchecked">not checked yet</option><option value="has">pages with boxes</option><option value="none">pages without boxes</option></select>
      <select id="page-size"><option value="120">small</option><option value="180">medium</option><option value="300">large</option><option value="460">very large</option></select></h3>
    <p class="note">Click a page to show it above. Gold = detected, blue = drawn, red dashed = wrong; ✓ = checked.</p>
    <div class="pages" style="grid-template-columns: repeat(auto-fill, minmax(${X.pageSize}px, 1fr))">${pages.map(p => {
      const bs = boxesOnPage(p.page_number);
      return `<div class="pg ${bs.length ? "has" : ""} ${checked.has(+p.page_number) ? "checked" : ""}" data-page="${p.page_number}">
        <img loading="lazy" src="${thumbUrl(p.file, X.pageSize > 200 ? 600 : 300)}">
        ${bs.map(b => `<div class="mini ${b.wrong ? "wrong" : ""} ${b.drawn ? "drawn" : ""}" style="left:${100 * b.x / p.w}%;top:${100 * b.y / p.h}%;width:${100 * b.width / p.w}%;height:${100 * b.height / p.h}%"></div>`).join("")}
        <div class="n"><span>p. ${p.page_number}</span><span>${bs.length || ""}</span></div></div>`;
    }).join("")}</div>`;
  $("show-class").value = X.showClass;
  $("page-filter").value = X.pageFilter;
  $("page-size").value = X.pageSize;
  $("page-size").addEventListener("change", e => { X.pageSize = +e.target.value; renderMs(); });
  $("show-class").addEventListener("change", e => { X.showClass = e.target.value; renderMs(); });
  $("page-filter").addEventListener("change", e => { X.pageFilter = e.target.value; renderMs(); });
  $("ms-done").addEventListener("click", async () => {
    await api("/api/extraction", { op: "done", folder: m.folder, value: !m.done });
    refreshMs();
  });
  wireCards($("all-crops"));
  $("ms-main").querySelectorAll(".open-page").forEach(el => el.addEventListener("click", () => openEditor(+el.dataset.page)));
  $("ms-main").querySelectorAll(".pg").forEach(el => el.addEventListener("click", () => openEditor(+el.dataset.page)));
  $("editor-slot").appendChild($("editor"));
  $("editor").hidden = false;
  renderEditor();
}

function boxCard(b) {
  return `<div class="card ${b.wrong ? (b.replaced_by ? "replaced" : "wrong") : ""} ${b.drawn ? "drawn" : ""}" data-id="${esc(b.illustration_id)}">
    <div class="img" title="Click: wrong / restore"><img loading="lazy" src="${b.drawn ? cardImg({ page_file: b.page_file, box: [b.x, b.y, b.width, b.height] }) : thumbUrl(b.crop_file)}"></div>
    <div class="cap">
      <div class="row"><span>p. ${esc(b.page_number)}${b.score ? ` · ${(+b.score).toFixed(2)}` : ""}</span>
        <button class="linkish open-page" data-page="${esc(b.page_number)}">show page</button></div>
      <select class="cls">${X.ms.classes.map(c => `<option ${c === b.class ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    </div></div>`;
}

function wireCards(container) {
  if (!container) return;
  container.querySelectorAll(".card .img").forEach(el => el.addEventListener("click", async () => {
    const b = X.ms.boxes.find(x => x.illustration_id === el.closest(".card").dataset.id);
    if (b.replaced_by) return toast("This detection was replaced by your adjusted box; edit that one instead.");
    if (b.drawn && !confirm("Remove the box you drew?")) return;
    await api("/api/extraction", { op: "wrong", ids: [b.illustration_id], value: !b.wrong });
    refreshMs();
  }));
  container.querySelectorAll(".card .cls").forEach(el => el.addEventListener("change", async () => {
    await api("/api/extraction", { op: "class", id: el.closest(".card").dataset.id, class: el.value });
    refreshMs();
  }));
  container.querySelectorAll(".open-page").forEach(el => el.addEventListener("click", () => openEditor(+el.dataset.page)));
}

function firstUnchecked(m) {
  const checked = new Set(m.pages_checked);
  return m.pages.find(p => !checked.has(+p.page_number));
}

// ---------------------------------------------------------------- page editor
function openEditor(pageNumber) {
  const i = X.ms.pages.findIndex(p => +p.page_number === +pageNumber);
  Object.assign(X.editor, { index: Math.max(0, i), selected: null, adding: false });
  renderEditor();
  $("editor").scrollIntoView({ block: "start", behavior: "smooth" });
}

function renderEditor() {
  const e = X.editor, p = X.ms.pages[e.index];
  const checked = X.ms.pages_checked.includes(+p.page_number);
  $("ed-title").textContent = `Page ${p.page_number} (${e.index + 1} of ${X.ms.pages.length})`;
  $("ed-next").disabled = e.index >= X.ms.pages.length - 1;
  $("ed-prev").disabled = e.index <= 0;
  $("ed-check").classList.toggle("on", checked);
  $("ed-canvas").className = "ed-canvas zoom-" + X.zoom;
  $("ed-zoom").textContent = { fit: "Zoom: whole page", width: "Zoom: fit width", double: "Zoom: 2×" }[X.zoom];
  $("ed-check").textContent = checked ? "Page checked ✓" : "Mark page checked";
  $("ed-add").classList.toggle("on", e.adding);
  $("ed-add").textContent = e.adding ? "Adding… drag around the illustration (B / Esc to stop)" : "＋ Add missing illustration (B)";
  $("ed-canvas").classList.toggle("adding", e.adding);
  $("ed-hint").hidden = !e.adding;
  const img = $("ed-img");
  if (img.dataset.file !== p.file) { img.dataset.file = p.file; img.src = `/file?p=${encodeURIComponent(p.file)}`; }
  const draw = () => {
    const k = img.clientWidth / p.w;
    $("ed-boxes").innerHTML = boxesOnPage(p.page_number).filter(b => !b.replaced_by).map(b => {
      const sel = e.selected === b.illustration_id, editable = sel && !b.wrong;
      return `<div class="box ${clsSlug(b.class)} ${b.drawn ? "drawn" : ""} ${b.wrong ? "wrong" : ""} ${sel ? "sel" : ""} ${editable ? "editable" : ""}"
           data-id="${esc(b.illustration_id)}"
           style="left:${b.x * k}px;top:${b.y * k}px;width:${b.width * k}px;height:${b.height * k}px">
        <span class="lab">${esc(b.class)}${b.wrong ? " · wrong" : ""}${b.drawn ? (b.replaces ? " · adjusted" : " · drawn") : ""}</span>
        ${editable ? ["nw", "ne", "sw", "se"].map(h => `<span class="handle h-${h}" data-h="${h}"></span>`).join("") : ""}</div>`;
    }).join("");
    $("ed-boxes").querySelectorAll(".box").forEach(el => {
      el.addEventListener("mousedown", ev => startBoxDrag(ev, el));
      el.addEventListener("click", ev => {
        ev.stopPropagation();
        if (X.editor.justDragged) { X.editor.justDragged = false; return; }
        e.selected = el.dataset.id; renderEditor();
      });
    });
  };
  if (img.complete && img.naturalWidth) draw(); else img.onload = draw;
  const onPage = boxesOnPage(p.page_number).filter(b => !b.replaced_by);
  if ($("page-crops")) {
    $("page-crops").innerHTML = onPage.map(boxCard).join("") ||
      `<p class="empty">Nothing extracted from this page. If there is an illustration, press <strong>＋ Add missing illustration</strong> (B).</p>`;
    wireCards($("page-crops"));
  }
  const sel = X.ms.boxes.find(b => b.illustration_id === e.selected);
  $("ed-sel").innerHTML = sel ? `Selected:
    <select id="ed-sel-class">${X.ms.classes.map(c => `<option ${c === sel.class ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    <button class="btn ${sel.wrong ? "" : "bad"}" id="ed-wrong">${sel.drawn ? "Remove box (X)" : sel.wrong ? "Restore (X)" : "Wrong (X)"}</button>
    ${sel.wrong ? "" : `<span class="muted" style="font-size:11.5px">drag the box to move it, a corner to resize</span>`}` : "";
  if (sel) {
    $("ed-sel-class").addEventListener("change", ev => setClass(sel, ev.target.value));
    $("ed-wrong").addEventListener("click", () => toggleWrong(sel));
  }
}
async function toggleWrong(b) {
  await api("/api/extraction", { op: "wrong", ids: [b.illustration_id], value: !b.wrong });
  if (b.drawn) X.editor.selected = null;
  refreshMs();
}
async function setClass(b, cls) {
  await api("/api/extraction", { op: "class", id: b.illustration_id, class: cls });
  refreshMs();
}
async function togglePageChecked(next) {
  const p = X.ms.pages[X.editor.index];
  const checked = X.ms.pages_checked.includes(+p.page_number);
  await api("/api/extraction", { op: "page_checked", folder: X.ms.folder, page_number: p.page_number, value: next ? true : !checked });
  if (next && X.editor.index < X.ms.pages.length - 1) { X.editor.index++; X.editor.selected = null; X.editor.adding = false; $("ed-stage").scrollTop = 0; }
  else if (next) toast("That was the last page. Mark the manuscript as done when you're finished.");
  refreshMs();
}
function step(d) {
  const e = X.editor;
  e.index = Math.min(X.ms.pages.length - 1, Math.max(0, e.index + d));
  e.selected = null; e.adding = false;
  $("ed-stage").scrollTop = 0;
  renderEditor();
}
function nextUnchecked() {
  const checked = new Set(X.ms.pages_checked);
  const i = X.ms.pages.findIndex((p, j) => j > X.editor.index && !checked.has(+p.page_number));
  if (i < 0) return toast("No unchecked pages after this one.");
  X.editor.index = i; X.editor.selected = null; X.editor.adding = false;
  $("ed-stage").scrollTop = 0;
  renderEditor();
}
$("ed-next-unchecked").addEventListener("click", nextUnchecked);
$("ed-prev").addEventListener("click", () => step(-1));
$("ed-next").addEventListener("click", () => step(1));
$("ed-check").addEventListener("click", () => togglePageChecked(false));
function cycleZoom() {
  X.zoom = { fit: "width", width: "double", double: "fit" }[X.zoom];
  renderEditor();
  setTimeout(renderEditor, 50);        // boxes follow the new image size
}
$("ed-zoom").addEventListener("click", cycleZoom);

function toggleAdding(on) {
  X.editor.adding = on === undefined ? !X.editor.adding : on;
  if (X.editor.adding) X.editor.selected = null;
  renderEditor();
}
$("ed-add").addEventListener("click", () => toggleAdding());

const canvasPos = ev => { const r = $("ed-canvas").getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };

// moving / resizing the selected box: drag its body or a corner
function startBoxDrag(ev, el) {
  ev.stopPropagation();
  const b = X.ms.boxes.find(x => x.illustration_id === el.dataset.id);
  if (ev.button !== 0 || X.editor.selected !== b.illustration_id || b.wrong) return;   // first click only selects
  ev.preventDefault();
  const handle = ev.target.dataset.h || "move";
  const s0 = canvasPos(ev), r0 = { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  let moved = false, cur = { ...r0 };
  const onMove = e2 => {
    const [x, y] = canvasPos(e2), dx = x - s0[0], dy = y - s0[1];
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    cur = { ...r0 };
    if (handle === "move") { cur.l += dx; cur.t += dy; }
    if (handle.includes("w")) { cur.l += dx; cur.w -= dx; }
    if (handle.includes("e")) { cur.w += dx; }
    if (handle.includes("n")) { cur.t += dy; cur.h -= dy; }
    if (handle.includes("s")) { cur.h += dy; }
    if (cur.w < 0) { cur.l += cur.w; cur.w = -cur.w; }
    if (cur.h < 0) { cur.t += cur.h; cur.h = -cur.h; }
    Object.assign(el.style, { left: cur.l + "px", top: cur.t + "px", width: cur.w + "px", height: cur.h + "px" });
  };
  const onUp = async () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (!moved || cur.w < 6 || cur.h < 6) return renderEditor();
    X.editor.justDragged = true;
    const p = X.ms.pages[X.editor.index], k = p.w / $("ed-img").clientWidth;
    const x = Math.max(0, cur.l * k), y = Math.max(0, cur.t * k);
    const res = await api("/api/extraction", { op: "adjust", id: b.illustration_id, x, y,
      width: Math.min(cur.w * k, p.w - x), height: Math.min(cur.h * k, p.h - y) });
    X.editor.selected = res.id;
    toast(b.drawn ? "Box adjusted" : "Box adjusted (saved as your corrected box; the detector's box is replaced)");
    refreshMs();
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

// adding a missing illustration: in add mode, drag on the page
(() => {
  const canvas = $("ed-canvas"), rubber = $("ed-rubber");
  let start = null;
  canvas.addEventListener("mousedown", ev => {
    if (ev.button !== 0) return;
    if (!X.editor.adding) { X.editor.selected = null; renderEditor(); return; }   // click on the page: deselect
    start = canvasPos(ev);
    Object.assign(rubber.style, { left: start[0] + "px", top: start[1] + "px", width: "0px", height: "0px" });
    rubber.hidden = false;
    ev.preventDefault();
  });
  window.addEventListener("mousemove", ev => {
    if (!start) return;
    const [x, y] = canvasPos(ev);
    Object.assign(rubber.style, { left: Math.min(x, start[0]) + "px", top: Math.min(y, start[1]) + "px",
      width: Math.abs(x - start[0]) + "px", height: Math.abs(y - start[1]) + "px" });
  });
  window.addEventListener("mouseup", async ev => {
    if (!start) return;
    const [x, y] = canvasPos(ev), s = start;
    start = null; rubber.hidden = true;
    const w = Math.abs(x - s[0]), h = Math.abs(y - s[1]);
    if (w < 8 || h < 8) return;
    const p = X.ms.pages[X.editor.index], k = p.w / $("ed-img").clientWidth;
    const bx = Math.max(0, Math.min(x, s[0]) * k), by = Math.max(0, Math.min(y, s[1]) * k);
    const res = await api("/api/extraction", { op: "draw", folder: X.ms.folder, page_number: p.page_number, page_file: p.file,
      class: $("ed-new-class").value, x: bx, y: by, width: Math.min(w * k, p.w - bx), height: Math.min(h * k, p.h - by) });
    X.editor.selected = res.id;
    X.editor.adding = false;
    toast("Illustration added. Press B to add another.");
    refreshMs();
  });
})();

// ================================================================ undo, rebuild, keys
$("btn-undo").addEventListener("click", doUndo);
async function doUndo() {
  const r = await api("/api/undo", {});
  toast(r.undone ? `Undid the last change (${r.undone})` : "Nothing to undo");
  if (view === "clusters") loadClusters(); else if (view === "groups") loadGroups(); else if (view === "board") loadBoard(); else if (view === "assign") loadAssign(); else if (X.ms) refreshMs(); else loadManuscripts();
}

$("btn-rebuild").addEventListener("click", async () => {
  $("rebuild").hidden = false; $("rebuild-open").hidden = true; $("rebuild-log").textContent = "Starting…";
  await api("/api/rebuild", {});
  const poll = async () => {
    const r = await api("/api/rebuild");
    $("rebuild-log").textContent = r.log.join("\n") + (r.running ? "\n…" : r.ok ? "\n\nDone: the visualizer is up to date." : "\n\nStopped with an error.");
    if (r.running) setTimeout(poll, 1200);
    else { $("rebuild-open").hidden = !r.ok; if (view === "clusters") loadClusters(); if (view === "groups") loadGroups(); if (view === "board") loadBoard(); if (view === "assign") loadAssign(); }
  };
  poll();
});
$("rebuild-close").addEventListener("click", () => { $("rebuild").hidden = true; });

document.addEventListener("keydown", ev => {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "z") { ev.preventDefault(); return doUndo(); }
  if (view !== "extraction" || !X.ms || !X.editor || ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  const sel = X.ms.boxes.find(b => b.illustration_id === X.editor.selected);
  if (ev.key === "ArrowRight") step(1);
  else if (ev.key === "ArrowLeft") step(-1);
  else if (ev.key === "Escape") { X.editor.adding = false; X.editor.selected = null; renderEditor(); }
  else if (ev.key.toLowerCase() === "u") nextUnchecked();
  else if (ev.key.toLowerCase() === "b") toggleAdding();
  else if (ev.key.toLowerCase() === "c") togglePageChecked(false);
  else if (ev.key.toLowerCase() === "n") togglePageChecked(true);
  else if (ev.key.toLowerCase() === "z") cycleZoom();
  else if ((ev.key.toLowerCase() === "x" || ev.key === "Delete" || ev.key === "Backspace") && sel) toggleWrong(sel);
  else if (/^[1-5]$/.test(ev.key) && sel) setClass(sel, X.ms.classes[+ev.key - 1]);
  else return;
  ev.preventDefault();
});

loadManuscripts();
