/* 3 · Board: every cluster as a card with 4 representatives. Drag a card onto another to merge,
   open a card to drag single diagrams between groups. Uses the same /api/clusters operations as the Clusters screen. */
const B = { data: null, open: new Set(), sel: new Set(), focus: null, drag: null, size: 110 };

async function loadBoard() {
  const y = $("bd-grid").scrollTop;
  B.data = await api("/api/clusters");
  renderBoard();
  $("bd-grid").scrollTop = y;
}

const bdGroup = gid => B.data.groups.find(g => g.gid === gid);

function representatives(g) {
  // up to 4 members from different manuscripts first, so the card shows the spread of the group
  const seen = new Set(), first = [], rest = [];
  for (const id of g.members) {
    const c = B.data.cards[id];
    if (!c) continue;
    if (!seen.has(c.folder)) { seen.add(c.folder); first.push(id); } else rest.push(id);
  }
  return first.concat(rest).slice(0, 4);
}

function boardGroups() {
  const d = B.data, q = $("bd-search").value.trim().toUpperCase(), f = $("bd-filter").value;
  if (B.focus) {
    const g = bdGroup(B.focus.gid);
    const near = B.focus.near.map(bdGroup).filter(Boolean);
    return g ? [g, ...near] : near;
  }
  let gs = d.groups.filter(g => f === "all" || (f === "todo" ? !g.reviewed : f === "reviewed" ? g.reviewed : !g.confirmed));
  if (q) gs = gs.filter(g => (g.key || "").toUpperCase() === q || String(g.number) === q.replace(/^#/, "") ||
    (g.note || "").toUpperCase().includes(q) ||
    g.members.some(id => (d.cards[id]?.shelfmark || "").toUpperCase().includes(q)));
  const s = $("bd-sort").value;
  if (s === "mss") gs = gs.slice().sort((a, b) => b.n_manuscripts - a.n_manuscripts || b.size - a.size);
  if (s === "small") gs = gs.slice().sort((a, b) => a.size - b.size);
  if (s === "named") gs = namedFirst(gs);
  return gs;
}

function thumbHtml(id, w) {
  const c = B.data.cards[id];
  if (!c) return "";
  return `<div class="bt ${B.sel.has(id) ? "sel" : ""}" draggable="true" data-id="${esc(id)}"
      title="${esc(c.shelfmark)} · p. ${esc(c.page)} · double-click to open">${zoomBtn(id)}<img loading="lazy" draggable="false" src="${cardImg(c, w * 2)}"></div>`;
}

function groupCardHtml(g, isFocus) {
  const open = B.open.has(g.gid), w = B.size;
  const imgs = open ? g.members : representatives(g);
  return `<div class="gc ${open ? "open" : ""} ${g.confirmed ? "confirmed" : g.reviewed ? "reviewed" : ""} ${isFocus ? "focus" : ""}"
      data-gid="${esc(g.gid)}" style="--w:${w}px">
    <div class="gc-head" draggable="true" title="Drag this whole group onto another group to merge them">
      <span class="grip">⠿</span>
      ${g.note ? `<strong class="gname" title="${esc(g.note)}">${esc(g.note)}</strong><span class="muted">${esc(groupName(g))}</span>`
               : `<strong>${esc(groupName(g))}</strong>`}
      <span class="muted">${g.size} · ${g.n_manuscripts} ms</span>
      <span class="sp"></span>
      <button class="ic" data-a="name" title="Name this group">✎</button>
      <button class="ic" data-a="mergeto" title="Merge this group into another one, chosen by name or number">⇢</button>
      <button class="ic ${g.confirmed ? "on" : ""}" data-a="confirm" title="${g.confirmed ? "Confirmed: click to undo" : "Confirm this group"}">✓</button>
      <button class="ic" data-a="similar" title="Show the most similar groups next to this one">≈</button>
      <button class="ic" data-a="detail" title="Open in the Clusters screen">↗</button>
      <button class="ic" data-a="open" title="${open ? "Close" : "Show all diagrams, to move single ones"}">${open ? "▴" : "▾"}</button>
    </div>
    <div class="gc-imgs">${imgs.map(id => thumbHtml(id, open ? Math.round(w * .8) : w)).join("")}
      ${!open && g.size > 4 ? `<button class="more" data-a="open">+${g.size - 4}</button>` : ""}</div>
  </div>`;
}

function renderBoard() {
  const d = B.data, gs = boardGroups();
  const reviewed = d.groups.filter(g => g.reviewed).length, confirmed = d.groups.filter(g => g.confirmed).length;
  $("bd-count").textContent = `${gs.length} shown · ${d.groups.length} groups · ${reviewed} reviewed · ${confirmed} confirmed`;
  $("bd-focus").hidden = !B.focus;
  if (B.focus) $("bd-focus").innerHTML = `Showing ${esc(groupName(bdGroup(B.focus.gid) || { number: "?" }))} and its most similar groups
    <button class="btn" id="bd-unfocus">Back to all groups</button>`;
  $("bd-grid").innerHTML = gs.map((g, i) => groupCardHtml(g, B.focus && i === 0)).join("") ||
    `<p class="empty">No groups match.</p>`;
  $("bd-pool-n").textContent = `(${d.pool.length})`;
  $("bd-pool").innerHTML = d.pool.map(id => thumbHtml(id, 70)).join("");
  if ($("bd-unfocus")) $("bd-unfocus").onclick = () => { B.focus = null; renderBoard(); };
  $("bd-names").innerHTML = groupOptions(d.groups);
  selBox();
}

// every group as a choice: its name if it has one, else its number / R-key
function namedFirst(gs) {
  // named groups A–Z, then the rest largest first
  return gs.slice().sort((a, b) => (!a.note - !b.note) || (a.note && b.note ? a.note.localeCompare(b.note) : b.size - a.size));
}
function groupOptions(groups) {
  const named = groups.filter(g => g.note).sort((a, b) => a.note.localeCompare(b.note));
  return named.concat(groups.filter(g => !g.note)).map(g => `<option value="${esc(g.note || g.key || g.number)}">${
    esc(g.note ? groupName(g) : "")} · ${g.size} diagrams</option>`).join("");
}
function selBox() {
  $("bd-selbox").hidden = !B.sel.size;
  $("bd-seln").textContent = `${B.sel.size} diagram${B.sel.size === 1 ? "" : "s"} selected`;
}

// inline text box in a card header (for the name, or for choosing a group to merge into)
function headerInput(card, value, placeholder, onDone) {
  const head = card.querySelector(".gc-head");
  head.draggable = false;
  const box = document.createElement("div");
  box.className = "head-input";
  box.innerHTML = `<input type="text" list="${onDone.list || ""}" placeholder="${esc(placeholder)}">
    <button class="btn">OK</button><button class="btn">Cancel</button>`;
  head.after(box);
  const inp = box.querySelector("input");
  inp.value = value || ""; inp.focus(); inp.select();
  const close = () => { box.remove(); head.draggable = true; };
  const ok = () => { const v = inp.value.trim(); close(); onDone(v); };
  inp.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") ok(); if (e.key === "Escape") close(); });
  box.querySelectorAll("button")[0].onclick = ok;
  box.querySelectorAll("button")[1].onclick = close;
}

// ---------------------------------------------------------------- clicks
$("view-board").addEventListener("click", async ev => {
  const btn = ev.target.closest("[data-a]"), card = ev.target.closest(".gc"), t = ev.target.closest(".bt");
  if (btn && card) {
    const g = bdGroup(card.dataset.gid), a = btn.dataset.a;
    if (a === "open") { B.open.has(g.gid) ? B.open.delete(g.gid) : B.open.add(g.gid); return renderBoard(); }
    if (a === "confirm") return boardOp({ op: "confirm", gid: g.gid, members: g.members, value: !g.confirmed }, g.gid);
    if (a === "name") {
      return headerInput(card, g.note, "Name for this group, e.g. Eclipse of the moon", v => {
        if (v !== g.note) boardOp({ op: "note", gid: g.gid, members: g.members, note: v }, g.gid, v ? `Named: ${v}` : "Name removed");
      });
    }
    if (a === "mergeto") {
      const done = v => {
        if (!v) return;
        const t = findGroup(B.data.groups, v);
        if (!t) return toast(`No group called "${v}"`, true);
        if (t.gid === g.gid) return toast("That is this group", true);
        mergeGroups(g, t);
      };
      done.list = "bd-names";
      return headerInput(card, "", "Merge into… type a name or number", done);
    }
    if (a === "detail") { C.gid = g.gid; C.special = null; C.selected.clear(); setView("clusters"); return; }
    if (a === "similar") {
      if (B.focus && B.focus.gid === g.gid) { B.focus = null; return renderBoard(); }
      const s = await api(`/api/suggestions?gid=${encodeURIComponent(g.gid)}`);
      B.focus = { gid: g.gid, near: s.groups.map(o => o.gid) };
      renderBoard(); $("bd-grid").scrollTop = 0;
      return;
    }
  }
  if (t) {                                   // click a diagram: select / unselect (drag then moves all selected)
    const id = t.dataset.id;
    B.sel.has(id) ? B.sel.delete(id) : B.sel.add(id);
    t.classList.toggle("sel");
    selNote();
  }
});
function selNote() { selBox(); }
document.addEventListener("keydown", ev => {
  if (view === "board" && ev.key === "Escape") { B.sel.clear(); B.focus = null; renderBoard(); }
});
["bd-search", "bd-filter", "bd-sort"].forEach(id => $(id).addEventListener(id === "bd-search" ? "input" : "change",
  () => { B.focus = null; renderBoard(); }));
$("bd-size").addEventListener("input", e => { B.size = +e.target.value; renderBoard(); });

// ---------------------------------------------------------------- drag & drop
function sourceGroupOf(id) { return B.data.groups.find(g => g.members.includes(id)); }

$("view-board").addEventListener("dragstart", ev => {
  const t = ev.target.closest(".bt"), head = ev.target.closest(".gc-head");
  if (t) {
    const id = t.dataset.id;
    const ids = B.sel.has(id) ? [...B.sel] : [id];
    B.drag = { kind: "items", ids };
    if (ids.length > 1) { const n = document.createElement("div"); n.className = "drag-n"; n.textContent = `${ids.length} diagrams`;
      document.body.appendChild(n); ev.dataTransfer.setDragImage(n, 10, 10); setTimeout(() => n.remove(), 0); }
  } else if (head) {
    B.drag = { kind: "group", gid: head.parentElement.dataset.gid };
    ev.dataTransfer.setDragImage(head.parentElement, 20, 20);
  } else return;
  ev.dataTransfer.effectAllowed = "move";
  ev.dataTransfer.setData("text/plain", "x");
  document.body.classList.add("dragging", B.drag.kind === "group" ? "drag-group" : "drag-items");
});
$("view-board").addEventListener("dragend", () => {
  B.drag = null;
  document.body.classList.remove("dragging", "drag-group", "drag-items");
  document.querySelectorAll(".over").forEach(e => e.classList.remove("over"));
});

function dropTarget(ev) {
  const card = ev.target.closest(".gc"), zone = ev.target.closest(".dz, .board-side");
  if (card) return { card };
  if (zone && B.drag && B.drag.kind === "items") return { zone: zone.dataset.zone || "pool", el: zone.closest(".dz") || $("bd-pool") };
  return null;
}
$("view-board").addEventListener("dragover", ev => {
  if (!B.drag) return;
  const tg = dropTarget(ev);
  if (!tg) return;
  if (tg.card && B.drag.kind === "group" && tg.card.dataset.gid === B.drag.gid) return;
  ev.preventDefault();
  document.querySelectorAll(".over").forEach(e => e.classList.remove("over"));
  (tg.card || tg.el).classList.add("over");
});
$("view-board").addEventListener("drop", async ev => {
  const drag = B.drag, tg = dropTarget(ev);
  if (!drag || !tg) return;
  ev.preventDefault();
  document.querySelectorAll(".over").forEach(e => e.classList.remove("over"));
  if (tg.card) {
    const target = bdGroup(tg.card.dataset.gid);
    if (drag.kind === "group") {
      if (drag.gid === target.gid) return;
      return mergeGroups(bdGroup(drag.gid), target);
    }
    const ids = drag.ids.filter(id => !target.members.includes(id));
    if (!ids.length) return;
    return boardOp({ op: "add", gid: target.gid, members: target.members, ids }, target.gid,
      `Moved ${ids.length} diagram${ids.length > 1 ? "s" : ""} to ${groupName(target)}`);
  }
  const ids = drag.ids;
  if (tg.zone === "new") {
    if (ids.length < 2) return toast("A new group needs at least 2 diagrams: click to select several, then drag them here", true);
    return boardOp({ op: "new_group", ids }, null, `New group with ${ids.length} diagrams`);
  }
  if (tg.zone === "unique") return boardOp({ op: "unique", ids, value: true }, null, `Marked ${ids.length} as unique`);
  // back to unassigned: take each out of its group
  const bySource = new Map();
  ids.forEach(id => { const g = sourceGroupOf(id); if (g) (bySource.get(g) || bySource.set(g, []).get(g)).push(id); });
  if (!bySource.size) return;
  for (const [g, gids] of bySource) await api("/api/clusters", { op: "remove", gid: g.gid, members: g.members, ids: gids });
  B.sel.clear(); toast(`Took ${ids.length} out of their group`); await loadBoard();
});

const label = g => g.note ? `"${g.note}"` : groupName(g);

async function mergeGroups(source, target) {
  // source goes into target; if only the source had a name, the merged group keeps it
  const body = { op: "merge", gid: target.gid, members: target.members, other_gid: source.gid, other_members: source.members };
  const keepName = !target.note && source.note ? source.note : null;
  if (keepName) {
    const res = await api("/api/clusters", body);
    body.op = "note"; body.gid = res.gid; body.members = target.members.concat(source.members); body.note = keepName;
    delete body.other_gid; delete body.other_members;
  }
  return boardOp(body, target.gid, `Merged ${label(source)} into ${label(target)} (${target.size + source.size} diagrams)`, source.gid);
}

async function moveSelected() {
  const v = $("bd-move-to").value.trim(), t = findGroup(B.data.groups, v);
  if (!t) return toast(v ? `No group called "${v}"` : "Choose a group", true);
  const ids = [...B.sel].filter(id => !t.members.includes(id));
  $("bd-move-to").value = "";
  if (ids.length) boardOp({ op: "add", gid: t.gid, members: t.members, ids }, t.gid, `Moved ${ids.length} to ${label(t)}`);
}
$("bd-move").addEventListener("click", moveSelected);
$("bd-move-to").addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") moveSelected(); });
$("bd-clear").addEventListener("click", () => { B.sel.clear(); renderBoard(); });

async function boardOp(body, keepOpenGid, msg, goneGid) {
  const res = await api("/api/clusters", body);
  // the group may have a new id now (automatic -> reviewed): keep it open / focused under the new id
  const wasOpen = keepOpenGid && B.open.has(keepOpenGid);
  if (goneGid && B.open.has(goneGid)) { B.open.delete(goneGid); if (res.gid) B.open.add(res.gid); }
  if (res.gid && keepOpenGid && res.gid !== keepOpenGid) {
    if (wasOpen) { B.open.delete(keepOpenGid); B.open.add(res.gid); }
    if (B.focus) {
      if (B.focus.gid === keepOpenGid) B.focus.gid = res.gid;
      B.focus.near = B.focus.near.map(x => x === keepOpenGid ? res.gid : x);
    }
  }
  if (B.focus && goneGid) B.focus.near = B.focus.near.filter(x => x !== goneGid);
  B.sel.clear();
  toast(msg || "Saved");
  await loadBoard();
}
