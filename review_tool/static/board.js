/* 4 · Board: your groups and the computed clusters as cards. Every diagram has one place: one of your groups,
   or else its cluster. Drag to merge and move:
     group  -> group     merge (the dragged group joins the target)
     cluster -> group    the cluster's diagrams join the group     (and group -> cluster: the same, the other way)
     cluster -> cluster  a new group with both
     diagrams -> group   move them there;  diagrams -> cluster: a new group of the cluster + those diagrams
     drop zones          "New group" (from the dragged diagrams) and "Not grouped" (take them out of their group)
   Uses G (data) and the /api/groups operations from groups.js. */
const B = { open: new Set(), sel: new Set(), focus: null, drag: null, size: 110 };

async function loadBoard() {
  const y = $("bd-grid").scrollTop;
  await loadGroupsData();
  renderBoard();
  $("bd-grid").scrollTop = y;
}

function boardUnits() {
  const d = G.data;
  return [
    ...d.groups.map(g => ({ uid: `G:${g.key}`, kind: "G", key: g.key, name: g.name, members: g.members, size: g.size, n_manuscripts: g.n_manuscripts })),
    ...d.clusters.map(c => ({ uid: `C:${c.number}`, kind: "C", number: c.number, name: "", members: c.members, size: c.size, n_manuscripts: c.n_manuscripts })),
  ];
}
const unitById = uid => boardUnits().find(u => u.uid === uid);
const unitLabel = u => u.kind === "G" ? (u.name || `Unnamed group ${u.key}`) : `Cluster ${u.number}`;

function representatives(u) {
  // up to 4 members from different manuscripts first, so the card shows the spread
  const seen = new Set(), first = [], rest = [];
  for (const id of u.members) {
    const c = G.data.cards[id];
    if (!c) continue;
    if (!seen.has(c.folder)) { seen.add(c.folder); first.push(id); } else rest.push(id);
  }
  return first.concat(rest).slice(0, 4);
}

function boardList() {
  const d = G.data, q = $("bd-search").value.trim().toLowerCase(), f = $("bd-filter").value;
  if (B.focus) {
    const u = unitById(B.focus.uid);
    const near = B.focus.near.map(unitById).filter(Boolean);
    return u ? [u, ...near] : near;
  }
  let us = boardUnits().filter(u => f === "all" || u.kind === f);
  if (q) us = us.filter(u => (u.name || "").toLowerCase().includes(q) || (u.key || "").toLowerCase() === q ||
    String(u.number) === q.replace(/^#/, "") || u.members.some(id => (d.cards[id]?.shelfmark || "").toLowerCase().includes(q)));
  const s = $("bd-sort").value;
  const mineFirst = (a, b) => (a.kind === "G" ? 0 : 1) - (b.kind === "G" ? 0 : 1);
  if (s === "size") us.sort((a, b) => mineFirst(a, b) || b.size - a.size);
  if (s === "mss") us.sort((a, b) => mineFirst(a, b) || b.n_manuscripts - a.n_manuscripts || b.size - a.size);
  if (s === "small") us.sort((a, b) => mineFirst(a, b) || a.size - b.size);
  if (s === "named") us.sort((a, b) => mineFirst(a, b) || (!a.name - !b.name) || (a.name || "").localeCompare(b.name || "") || b.size - a.size);
  return us;
}

function thumbHtml(id, w) {
  const c = G.data.cards[id];
  if (!c) return "";
  return `<div class="bt ${B.sel.has(id) ? "sel" : ""}" draggable="true" data-id="${esc(id)}"
      title="${esc(c.shelfmark)} · p. ${esc(c.page)} · double-click to open">${zoomBtn(id)}<img loading="lazy" draggable="false" src="${cardImg(c, w * 2)}"></div>`;
}

function unitCardHtml(u, isFocus) {
  const open = B.open.has(u.uid), w = B.size;
  const imgs = open ? u.members : representatives(u);
  return `<div class="gc ${u.kind === "G" ? "mine" : ""} ${open ? "open" : ""} ${isFocus ? "focus" : ""}" data-uid="${esc(u.uid)}" style="--w:${w}px">
    <div class="gc-head" draggable="true" title="Drag onto another card to merge">
      <span class="grip">⠿</span>
      ${u.kind === "G" ? `<strong class="gname" title="${esc(unitLabel(u))}">${esc(unitLabel(u))}</strong><span class="muted">${esc(u.key)}</span>`
                      : `<strong>${esc(unitLabel(u))}</strong><span class="muted">computed</span>`}
      <span class="muted">${u.size} · ${u.n_manuscripts} ms</span>
      <span class="sp"></span>
      <button class="ic" data-a="name" title="${u.kind === "G" ? "Rename this group" : "Make this cluster a group and name it"}">✎</button>
      <button class="ic" data-a="mergeto" title="Put everything into a group chosen by name">⇢</button>
      <button class="ic" data-a="similar" title="Show the most similar groups and clusters next to this one">≈</button>
      <button class="ic" data-a="detail" title="Open in its screen">↗</button>
      <button class="ic" data-a="open" title="${open ? "Close" : "Show all diagrams, to move single ones"}">${open ? "▴" : "▾"}</button>
    </div>
    <div class="gc-imgs">${imgs.map(id => thumbHtml(id, open ? Math.round(w * .8) : w)).join("")}
      ${!open && u.size > 4 ? `<button class="more" data-a="open">+${u.size - 4}</button>` : ""}</div>
  </div>`;
}

function renderBoard() {
  const d = G.data, us = boardList();
  $("bd-count").textContent = `${us.length} shown · ${d.groups.length} groups · ${d.clusters.length} clusters`;
  $("bd-focus").hidden = !B.focus;
  if (B.focus) {
    const u = unitById(B.focus.uid);
    $("bd-focus").innerHTML = `Showing ${esc(u ? unitLabel(u) : "?")} and the most similar groups and clusters
      <button class="btn" id="bd-unfocus">Back to all</button>`;
  }
  $("bd-grid").innerHTML = us.map((u, i) => unitCardHtml(u, B.focus && i === 0)).join("") || `<p class="empty">Nothing matches.</p>`;
  $("bd-pool-n").textContent = `(${d.other.length})`;
  $("bd-pool").innerHTML = d.other.slice(0, 400).map(id => thumbHtml(id, 70)).join("") +
    (d.other.length > 400 ? `<p class="note">${d.other.length - 400} more: see "In no cluster" on the Clusters screen.</p>` : "");
  if ($("bd-unfocus")) $("bd-unfocus").onclick = () => { B.focus = null; renderBoard(); };
  selBox();
}

function selBox() {
  $("bd-selbox").hidden = !B.sel.size;
  $("bd-seln").textContent = `${B.sel.size} diagram${B.sel.size === 1 ? "" : "s"} selected`;
}

// inline text box in a card header (a name, or the group to put everything into)
function headerInput(card, value, placeholder, onDone, list) {
  const head = card.querySelector(".gc-head");
  head.draggable = false;
  const box = document.createElement("div");
  box.className = "head-input";
  box.innerHTML = `<input type="text" ${list ? `list="${list}"` : ""} placeholder="${esc(placeholder)}">
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

// ---------------------------------------------------------------- operations on cards
async function boardOp(body, msg) {
  const r = await api("/api/groups", body);
  B.sel.clear();
  toast(msg || "Saved");
  await loadBoard();
  return r;
}

// put everything of `source` into `target` (a group, or a cluster that becomes a new group)
async function combine(source, target) {
  if (source.uid === target.uid) return;
  if (target.kind === "G" && source.kind === "G")
    return boardOp({ op: "merge", key: target.key, other: source.key }, `Merged ${unitLabel(source)} into ${unitLabel(target)}`);
  if (target.kind === "G")
    return boardOp({ op: "add", key: target.key, ids: source.members }, `${unitLabel(source)} joined ${unitLabel(target)}`);
  if (source.kind === "G")      // a group dropped on a cluster: the group takes the cluster's diagrams
    return boardOp({ op: "add", key: source.key, ids: target.members }, `${unitLabel(target)} joined ${unitLabel(source)}`);
  return boardOp({ op: "new", name: "", ids: [...target.members, ...source.members] },
    `New group from ${unitLabel(target)} and ${unitLabel(source)}`);
}

// move single diagrams onto a card
async function dropItems(ids, target) {
  if (target.kind === "G") {
    ids = ids.filter(id => !target.members.includes(id));
    if (!ids.length) return;
    return boardOp({ op: "add", key: target.key, ids }, `Moved ${ids.length} diagram${ids.length > 1 ? "s" : ""} to ${unitLabel(target)}`);
  }
  return boardOp({ op: "new", name: "", ids: [...new Set([...target.members, ...ids])] },
    `New group: ${unitLabel(target)} + ${ids.length} diagram${ids.length > 1 ? "s" : ""}`);
}

async function intoNamedGroup(ids, ref, what) {
  const g = findGroup(ref);
  if (g) return boardOp({ op: "add", key: g.key, ids }, `${what} moved to ${groupLabel(g)}`);
  if (!confirm(`There is no group "${ref}". Make a new group with this name?`)) return;
  return boardOp({ op: "new", name: ref, ids }, `New group "${ref}"`);
}

// ---------------------------------------------------------------- clicks
$("view-board").addEventListener("click", async ev => {
  const btn = ev.target.closest("[data-a]"), card = ev.target.closest(".gc"), t = ev.target.closest(".bt");
  if (btn && card) {
    const u = unitById(card.dataset.uid), a = btn.dataset.a;
    if (a === "open") { B.open.has(u.uid) ? B.open.delete(u.uid) : B.open.add(u.uid); return renderBoard(); }
    if (a === "name") {
      return headerInput(card, u.name, u.kind === "G" ? "Name of this group" : "Name for the new group", v => {
        if (u.kind === "G") { if (v !== u.name) boardOp({ op: "rename", key: u.key, name: v }, v ? `Named: ${v}` : "Name removed"); }
        else if (v) boardOp({ op: "new", name: v, ids: u.members }, `${unitLabel(u)} is now the group "${v}"`);
      });
    }
    if (a === "mergeto") {
      return headerInput(card, "", "Into which group? type its name", v => {
        if (!v) return;
        const g = findGroup(v);
        if (g && u.kind === "G" && g.key === u.key) return toast("That is this group", true);
        if (g && u.kind === "G") return combine(u, unitById(`G:${g.key}`));
        intoNamedGroup(u.members, v, unitLabel(u));
      }, "group-names");
    }
    if (a === "detail") {
      if (u.kind === "G") { G.group = u.key; G.sugg = null; G.sel.clear(); return setView("groups"); }
      G.cluster = u.number; G.sugg = null; G.sel.clear(); return setView("clusters");
    }
    if (a === "similar") {
      if (B.focus && B.focus.uid === u.uid) { B.focus = null; return renderBoard(); }
      const s = await api(`/api/suggestions?ids=${encodeURIComponent(u.members.join(","))}`);
      B.focus = { uid: u.uid, near: s.units.map(x => x.uid) };
      renderBoard(); $("bd-grid").scrollTop = 0;
      return;
    }
  }
  if (t) {                                   // click a diagram: select / unselect (dragging then moves all selected)
    const id = t.dataset.id;
    B.sel.has(id) ? B.sel.delete(id) : B.sel.add(id);
    t.classList.toggle("sel");
    selBox();
  }
});
document.addEventListener("dblclick", ev => {
  const t = ev.target.closest("#view-board .bt");
  if (t) openInspect(t.dataset.id);
});
document.addEventListener("keydown", ev => {
  if (view === "board" && ev.key === "Escape" && $("inspect").hidden) { B.sel.clear(); B.focus = null; renderBoard(); }
});
["bd-search", "bd-filter", "bd-sort"].forEach(id => $(id).addEventListener(id === "bd-search" ? "input" : "change",
  () => { B.focus = null; renderBoard(); }));
$("bd-size").addEventListener("input", e => { B.size = +e.target.value; renderBoard(); });

// ---------------------------------------------------------------- drag & drop
$("view-board").addEventListener("dragstart", ev => {
  const t = ev.target.closest(".bt"), head = ev.target.closest(".gc-head");
  if (t) {
    const id = t.dataset.id;
    const ids = B.sel.has(id) ? [...B.sel] : [id];
    B.drag = { kind: "items", ids };
    if (ids.length > 1) {
      const n = document.createElement("div"); n.className = "drag-n"; n.textContent = `${ids.length} diagrams`;
      document.body.appendChild(n); ev.dataTransfer.setDragImage(n, 10, 10); setTimeout(() => n.remove(), 0);
    }
  } else if (head) {
    B.drag = { kind: "unit", uid: head.parentElement.dataset.uid };
    ev.dataTransfer.setDragImage(head.parentElement, 20, 20);
  } else return;
  ev.dataTransfer.effectAllowed = "move";
  ev.dataTransfer.setData("text/plain", "x");
  document.body.classList.add("dragging", B.drag.kind === "unit" ? "drag-group" : "drag-items");
});
$("view-board").addEventListener("dragend", () => {
  B.drag = null;
  document.body.classList.remove("dragging", "drag-group", "drag-items");
  document.querySelectorAll(".over").forEach(e => e.classList.remove("over"));
});

function dropTarget(ev) {
  const card = ev.target.closest(".gc"), zone = ev.target.closest(".dz");
  if (card) return { card };
  if (zone && B.drag && B.drag.kind === "items") return { zone: zone.dataset.zone, el: zone };
  return null;
}
$("view-board").addEventListener("dragover", ev => {
  if (!B.drag) return;
  const tg = dropTarget(ev);
  if (!tg) return;
  if (tg.card && B.drag.kind === "unit" && tg.card.dataset.uid === B.drag.uid) return;
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
    const target = unitById(tg.card.dataset.uid);
    if (drag.kind === "unit") return combine(unitById(drag.uid), target);
    return dropItems(drag.ids, target);
  }
  if (tg.zone === "new") return boardOp({ op: "new", name: "", ids: drag.ids }, `New group with ${drag.ids.length} diagram${drag.ids.length > 1 ? "s" : ""}`);
  if (tg.zone === "ungroup") {
    let n = 0;
    for (const g of G.data.groups) {
      const ids = drag.ids.filter(id => g.members.includes(id));
      if (ids.length) { await api("/api/groups", { op: "remove", key: g.key, ids }); n += ids.length; }
    }
    B.sel.clear();
    toast(n ? `Took ${n} out of their group` : "Those diagrams are in no group");
    return loadBoard();
  }
});

async function moveSelected() {
  const v = $("bd-move-to").value.trim();
  if (!v) return toast("Type a group name", true);
  $("bd-move-to").value = "";
  return intoNamedGroup([...B.sel], v, `${B.sel.size} diagram${B.sel.size > 1 ? "s" : ""}`);
}
$("bd-move").addEventListener("click", moveSelected);
$("bd-move-to").addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") moveSelected(); });
$("bd-clear").addEventListener("click", () => { B.sel.clear(); renderBoard(); });
