/* Clusters (computed by step 5) and Groups (yours, named). Every diagram has one place: one of your groups,
   or else its cluster; adding a diagram to a group moves it there.
   Also the inspector: one diagram large, the groups it is in and the most similar diagrams anywhere.
   Uses $, esc, api, toast, cardImg and `view` from review.js. Talks to /api/clusters (GET), /api/groups (POST)
   and /api/suggestions. */
const G = { data: null, cluster: null, group: null, sel: new Set(), sugg: null, page: 200 };

async function loadGroupsData() {
  G.data = await api("/api/clusters");
  G.groupOf = {};
  G.data.groups.forEach(g => g.members.forEach(i => (G.groupOf[i] = G.groupOf[i] || []).push(g.key)));
  G.clusterOf = {};
  G.data.clusters.forEach(c => c.members.forEach(i => { G.clusterOf[i] = c.number; }));
  $("group-names").innerHTML = G.data.groups.map(g =>
    `<option value="${esc(g.name || g.key)}">${esc(g.name ? `${g.key} · ${g.size} diagrams` : `unnamed · ${g.size} diagrams`)}</option>`).join("");
}
const groupLabel = g => g.name || `Unnamed group ${g.key}`;
const groupByKey = k => G.data.groups.find(g => g.key === k);
// a group by the name you typed, or by its key (G3)
function findGroup(ref) {
  ref = String(ref || "").trim().toLowerCase();
  if (!ref) return null;
  return G.data.groups.find(g => g.name.toLowerCase() === ref) || G.data.groups.find(g => g.key.toLowerCase() === ref);
}

async function groupsOp(body, msg) {
  const r = await api("/api/groups", body);
  if (msg) toast(msg);
  G.sel.clear();
  await loadGroupsData();
  return r;
}

// add ids to the group named in `ref`; a name that is no group yet makes a new group with that name
async function addToNamed(ref, ids) {
  ref = String(ref || "").trim();
  if (!ref) return toast("Type a group name", true);
  const g = findGroup(ref);
  if (g) return groupsOp({ op: "add", key: g.key, ids }, `Moved ${ids.length} to ${groupLabel(g)}`);
  if (!confirm(`There is no group "${ref}". Make a new group with this name?`)) return;
  return groupsOp({ op: "new", name: ref, ids }, `New group "${ref}" with ${ids.length} diagram${ids.length === 1 ? "" : "s"}`);
}

function card(id, opts = {}) {
  const c = G.data.cards[id];
  if (!c) return "";
  const gs = (G.groupOf[id] || []).map(groupByKey).filter(Boolean);
  const cl = G.clusterOf[id];
  return `<div class="card ${G.sel.has(id) ? "selected" : ""}" data-id="${esc(id)}">
    ${zoomBtn(id)}
    ${opts.add ? `<button class="btn add" title="Add to this group" data-add="${esc(id)}">+</button>` : ""}
    <div class="img"><img loading="lazy" src="${cardImg(c)}"></div>
    <div class="cap"><div class="row"><strong>${esc(c.shelfmark)}</strong>${opts.sim !== undefined ? `<span class="sim">${opts.sim.toFixed(2)}</span>` : ""}</div>
      <div class="row"><span>p. ${esc(c.page)}${opts.showCluster && cl ? ` · cluster ${cl}` : ""}</span></div>
      ${gs.length ? `<div class="gtags">${gs.map(g => `<span class="gtag ${gs.length > 1 ? "warn" : ""}" title="${esc(groupLabel(g))}">${esc(g.name || g.key)}</span>`).join("")}</div>` : ""}</div>
  </div>`;
}

// toolbar for the selected diagrams; `inGroup` = the group being shown (allows removing from it)
function selBar(inGroup) {
  const n = G.sel.size;
  return `<div class="toolbar" id="selbar">
    <span class="lbl"><strong>${n}</strong> selected</span>
    <button class="btn" data-act="all">Select all</button>
    <button class="btn" data-act="none" ${n ? "" : "disabled"}>Clear</button>
    ${inGroup ? `<button class="btn bad" data-act="remove" ${n ? "" : "disabled"}>Remove from this group</button>` : ""}
    <span class="lbl">Move to group</span>
    <input type="text" id="add-to" list="group-names" placeholder="group name (new or existing)" style="width:220px">
    <button class="btn primary" data-act="add" ${n ? "" : "disabled"}>Move</button>
    <button class="btn" data-act="similar" ${n ? "" : "disabled"} title="Diagrams anywhere that look like the selected ones">Find similar</button>
  </div>`;
}

function wireGrid(main, ids, inGroup, rerender) {
  main.querySelectorAll(".grid.members > .card").forEach(el => el.addEventListener("click", ev => {
    if (ev.target.closest("[data-add]")) return;
    const id = el.dataset.id;
    G.sel.has(id) ? G.sel.delete(id) : G.sel.add(id);
    el.classList.toggle("selected");
    $("selbar").outerHTML = selBar(inGroup);
    wireBar(main, ids, inGroup, rerender);
  }));
  wireBar(main, ids, inGroup, rerender);
}

function wireBar(main, ids, inGroup, rerender) {
  main.querySelectorAll("#selbar [data-act]").forEach(b => b.addEventListener("click", async () => {
    const sel = [...G.sel], act = b.dataset.act;
    if (act === "all") { ids.forEach(i => G.sel.add(i)); return rerender(); }
    if (act === "none") { G.sel.clear(); return rerender(); }
    if (act === "remove") { await groupsOp({ op: "remove", key: inGroup.key, ids: sel }, `Took ${sel.length} out of ${groupLabel(inGroup)} (back to their cluster)`); return rerender(); }
    if (act === "add") { await addToNamed($("add-to").value, sel); return rerender(); }
    if (act === "similar") {
      G.sugg = { ids: sel, ...(await api(`/api/suggestions?ids=${encodeURIComponent(sel.join(","))}`)) };
      return rerender();
    }
  }));
}

// similar diagrams (and similar groups/clusters) for the selection or for a group
function suggHtml(forGroup) {
  const s = G.sugg;
  if (!s) return "";
  const items = s.items.filter(it => !forGroup || !forGroup.members.includes(it.id));
  const units = forGroup ? s.units.filter(u => u.uid !== `G:${forGroup.key}`).slice(0, 8) : [];
  const unitsHtml = units.length ? `<h3 class="sec">Similar groups and clusters</h3>
    <p class="note">Merge one into this group if it is the same kind of diagram.</p>
    <div class="sugg-groups">${units.map(u => `<div class="sg">
      <div class="row"><strong>${esc(u.uid.startsWith("G:") ? (u.name || `Unnamed group ${u.uid.slice(2)}`) : `Cluster ${u.uid.slice(2)}`)}</strong>
        <span class="sim">${u.similarity.toFixed(2)} · ${u.size} items</span></div>
      <div class="imgs">${u.members.map(id => G.data.cards[id] ? `<img loading="lazy" src="${cardImg(G.data.cards[id], 110)}">` : "").join("")}</div>
      <div class="row"><span class="muted">${u.uid.startsWith("G:") ? "your group" : "computed"}</span>
        <button class="btn" data-merge-unit="${esc(u.uid)}">Merge into this group</button></div></div>`).join("")}</div>` : "";
  return `<div class="sugg-block">${unitsHtml}
    <h3 class="sec">Similar diagrams${forGroup ? " not in this group" : " to your selection"}</h3>
    <p class="note">${forGroup ? "Press + to move one into this group. A tag shows the group a diagram is in now." :
      "Click to select them too, then move everything to a group above."}</p>
    <div class="grid small sugg">${items.map(it => card(it.id, { sim: it.similarity, add: !!forGroup, showCluster: true })).join("")}</div></div>`;
}

function wireSugg(main, forGroup, rerender) {
  main.querySelectorAll(".grid.sugg > .card").forEach(el => el.addEventListener("click", async ev => {
    if (ev.target.closest("[data-add]")) {
      ev.stopPropagation();
      await groupsOp({ op: "add", key: forGroup.key, ids: [el.dataset.id] }, `Moved to ${groupLabel(forGroup)}`);
      G.sugg = null;
      return rerender();
    }
    if (forGroup) return;
    G.sel.add(el.dataset.id);
    rerender();
  }));
  main.querySelectorAll("[data-merge-unit]").forEach(b => b.addEventListener("click", async () => {
    const uid = b.dataset.mergeUnit;
    if (uid.startsWith("G:")) {
      const o = groupByKey(uid.slice(2));
      if (!confirm(`Merge "${groupLabel(o)}" into "${groupLabel(forGroup)}"? "${groupLabel(o)}" is then deleted.`)) return;
      await groupsOp({ op: "merge", key: forGroup.key, other: o.key }, `Merged ${groupLabel(o)} into ${groupLabel(forGroup)}`);
    } else {
      const c = G.data.clusters.find(x => x.number === +uid.slice(2));
      await groupsOp({ op: "add", key: forGroup.key, ids: c.members }, `Cluster ${c.number} joined ${groupLabel(forGroup)}`);
    }
    G.sugg = null;
    rerender();
  }));
}

// ================================================================ 2. CLUSTERS (computational, read only)
async function loadClusters() {
  await loadGroupsData();
  renderClusterList();
  renderCluster();
}

function renderClusterList() {
  const d = G.data, q = $("cl-search").value.trim().toLowerCase(), f = $("cl-filter").value;
  let cs = d.clusters.slice();
  if (q) cs = cs.filter(c => String(c.number) === q.replace(/^#/, "")
    || c.members.some(i => d.cards[i].shelfmark.toLowerCase().includes(q)));
  if (f === "across") cs = cs.filter(c => c.n_manuscripts > 1);
  if (f === "within") cs = cs.filter(c => c.n_manuscripts <= 1);
  if ($("cl-sort").value === "mss") cs.sort((a, b) => b.n_manuscripts - a.n_manuscripts || b.size - a.size);
  else cs.sort((a, b) => b.size - a.size || a.number - b.number);
  $("cl-progress").innerHTML = `${d.clusters.length} clusters (similarity ≥ ${d.last_run.threshold ?? "?"}) ·
    ${d.other.length} diagrams in no cluster · ${d.n_in_groups} diagrams in your groups (not shown here)`;
  $("cl-list").innerHTML =
    `<div class="item special ${G.cluster === "other" ? "active" : ""}" data-c="other"><div class="grow">
      <div class="t">In no cluster (${d.other.length})</div><div class="s">no close match found by step 5</div></div></div>` +
    cs.map(c => `<div class="item ${G.cluster === c.number ? "active" : ""}" data-c="${c.number}">
        <img class="thumb" loading="lazy" src="${cardImg(d.cards[c.members[0]], 90)}">
        <div class="grow"><div class="t">Cluster ${c.number}</div>
          <div class="s">${c.size} diagrams · ${c.n_manuscripts} manuscript${c.n_manuscripts === 1 ? "" : "s"}</div></div></div>`).join("");
  $("cl-list").querySelectorAll(".item").forEach(el => el.addEventListener("click", () => {
    G.cluster = el.dataset.c === "other" ? "other" : +el.dataset.c;
    G.sel.clear(); G.sugg = null; G.page = 200;
    renderClusterList(); renderCluster(); $("cl-main").scrollTop = 0;
  }));
}
["cl-search", "cl-filter", "cl-sort"].forEach(id => $(id).addEventListener(id === "cl-search" ? "input" : "change", renderClusterList));

function renderCluster() {
  const d = G.data, main = $("cl-main");
  if (G.cluster === null) { main.innerHTML = `<p class="empty">Choose a cluster on the left.</p>`; return; }
  const c = G.cluster === "other" ? null : d.clusters.find(x => x.number === G.cluster);
  if (G.cluster !== "other" && !c) { main.innerHTML = `<p class="empty">This cluster is empty now: all its diagrams are in your groups. Choose another.</p>`; return; }
  const ids = c ? c.members : d.other;
  const shown = ids.slice(0, G.page);
  main.innerHTML = `
    <div class="head"><h2>${c ? `Cluster ${c.number}` : "In no cluster"}</h2></div>
    <div class="stats">${ids.length} diagrams${c ? ` · ${c.n_manuscripts} manuscripts` : ""}</div>
    <p class="note">Computed by step 5, for the diagrams that are in none of your groups. Select diagrams and move them to one of
      <strong>your groups</strong> (type a new name to start a group); they then leave the cluster.</p>
    ${c ? `<button class="btn" id="cl-make-group">Make this whole cluster a group…</button>` : ""}
    ${selBar(null)}
    <div class="grid members">${shown.map(id => card(id)).join("")}</div>
    ${ids.length > shown.length ? `<button class="btn" id="cl-more">Show ${Math.min(200, ids.length - shown.length)} more</button>` : ""}
    ${suggHtml(null)}`;
  const rerender = () => { renderCluster(); renderClusterList(); };
  wireGrid(main, ids, null, rerender);
  wireSugg(main, null, rerender);
  if ($("cl-more")) $("cl-more").addEventListener("click", () => { G.page += 200; renderCluster(); });
  if ($("cl-make-group")) $("cl-make-group").addEventListener("click", async () => {
    const name = prompt(`Name for the new group made from cluster ${c.number} (an existing group's name adds the cluster to it):`);
    if (name === null) return;
    if (name.trim()) await addToNamed(name, c.members);
    else await groupsOp({ op: "new", name: "", ids: c.members }, `Cluster ${c.number} is now a group`);
    G.cluster = null; rerender();
  });
}

// ================================================================ 3. GROUPS (yours)
async function loadGroups() {
  await loadGroupsData();
  renderGroupList();
  renderGroup();
}

function renderGroupList() {
  const d = G.data, q = $("gr-search").value.trim().toLowerCase();
  let gs = d.groups;
  if (q) gs = gs.filter(g => g.name.toLowerCase().includes(q) || g.key.toLowerCase() === q || g.description.toLowerCase().includes(q));
  if ($("gr-sort").value === "size") gs = gs.slice().sort((a, b) => b.size - a.size);
  if ($("gr-sort").value === "mss") gs = gs.slice().sort((a, b) => b.n_manuscripts - a.n_manuscripts || b.size - a.size);
  const notGrouped = Object.keys(d.cards).length - d.n_in_groups;
  const named = d.groups.filter(g => g.name).length;
  $("gr-progress").innerHTML = `${d.groups.length} groups (${named} named) · ${d.n_in_groups} diagrams grouped · ${notGrouped} not grouped`;
  $("gr-list").innerHTML =
    (d.several.length ? `<div class="item special warn ${G.group === "several" ? "active" : ""}" data-g="several"><div class="grow">
      <div class="t">In two groups (${d.several.length})</div><div class="s">from before: choose one group for each</div></div></div>` : "") +
    `<div class="item special ${G.group === "rest" ? "active" : ""}" data-g="rest"><div class="grow">
      <div class="t">Not grouped (${notGrouped})</div><div class="s">diagrams in none of your groups (they are in clusters)</div></div></div>` +
    gs.map(g => `<div class="item ${G.group === g.key ? "active" : ""}" data-g="${esc(g.key)}">
      ${g.members.length ? `<img class="thumb" loading="lazy" src="${cardImg(d.cards[g.members[0]], 90)}">` : `<div class="thumb"></div>`}
      <div class="grow"><div class="t">${esc(groupLabel(g))}</div>
        <div class="s">${g.key} · ${g.size} diagrams · ${g.n_manuscripts} manuscript${g.n_manuscripts === 1 ? "" : "s"}</div></div></div>`).join("");
  $("gr-list").querySelectorAll(".item").forEach(el => el.addEventListener("click", () => {
    G.group = el.dataset.g; G.sel.clear(); G.sugg = null; G.page = 200;
    renderGroupList(); renderGroup(); $("gr-main").scrollTop = 0;
  }));
}
$("gr-search").addEventListener("input", renderGroupList);
$("gr-sort").addEventListener("change", renderGroupList);
$("gr-new").addEventListener("click", async () => {
  const name = prompt("Name of the new group:");
  if (name === null) return;
  const r = await groupsOp({ op: "new", name, ids: [] }, `New group${name.trim() ? ` "${name.trim()}"` : ""}`);
  G.group = r.key; renderGroupList(); renderGroup();
});

function renderGroup() {
  const d = G.data, main = $("gr-main");
  const rerender = () => { renderGroup(); renderGroupList(); };
  if (G.group === null) { main.innerHTML = `<p class="empty">Choose a group on the left, or make a new one.</p>`; return; }
  if (G.group === "several") {
    const ids = d.several;
    main.innerHTML = `<div class="head"><h2>In two groups (${ids.length})</h2></div>
      <p class="note">These diagrams were put in two groups before the rule "one group per diagram". The tags show both groups.
        Select some and move them to the right group (that takes them out of the other one), or open one with ⤢ and take it out of a group.</p>
      ${selBar(null)}
      <div class="grid members">${ids.map(id => card(id)).join("")}</div>`;
    wireGrid(main, ids, null, rerender);
    return;
  }
  if (G.group === "rest") {
    const ids = Object.keys(d.cards).filter(i => !G.groupOf[i]);
    main.innerHTML = `<div class="head"><h2>Not grouped (${ids.length})</h2></div>
      <p class="note">Diagrams in none of your groups. Select some and add them to a group (type a new name to start one).</p>
      ${selBar(null)}
      <div class="grid small members">${ids.slice(0, G.page).map(id => card(id, { showCluster: true })).join("")}</div>
      ${ids.length > G.page ? `<button class="btn" id="gr-more">Show ${Math.min(200, ids.length - G.page)} more</button>` : ""}
      ${suggHtml(null)}`;
    wireGrid(main, ids, null, rerender);
    wireSugg(main, null, rerender);
    if ($("gr-more")) $("gr-more").addEventListener("click", () => { G.page += 200; renderGroup(); });
    return;
  }
  const g = groupByKey(G.group);
  if (!g) { main.innerHTML = `<p class="empty">This group no longer exists (merged or deleted). Choose another.</p>`; return; }
  main.innerHTML = `
    <div class="head"><h2>${esc(groupLabel(g))}</h2><span class="muted">${g.key}</span>
      <span class="sp"></span><button class="btn bad" id="g-delete">Delete group</button></div>
    <div class="group-form">
      <label>Name <input type="text" id="g-name" value="${esc(g.name)}" placeholder="name this group"></label>
      <label>Description <textarea id="g-desc" rows="2" placeholder="what these diagrams show, why they belong together">${esc(g.description)}</textarea></label>
    </div>
    <div class="stats">${g.size} diagrams · ${g.n_manuscripts} manuscripts</div>
    ${selBar(g)}
    <div class="grid members">${g.members.map(id => card(id, { showCluster: true })).join("")}</div>
    ${g.members.length ? "" : `<p class="note">Empty. Add diagrams from the Clusters screen, from "Not grouped", or with the suggestions below.</p>`}
    <div class="toolbar" style="position:static;border:none">
      <span class="lbl">Merge another group into this one</span>
      <select id="g-merge-with"><option value="">choose a group…</option>${d.groups.filter(o => o.key !== g.key)
        .map(o => `<option value="${esc(o.key)}">${esc(groupLabel(o))} (${o.size})</option>`).join("")}</select>
      <button class="btn" id="g-merge">Merge</button></div>
    <details id="g-sugg-wrap" class="sugg-wrap" ${G.sugg ? "open" : ""}><summary>Suggestions: similar groups, clusters and diagrams</summary>
      <div id="g-sugg">${G.sugg ? suggHtml(g) : `<p class="note">Looking for similar diagrams…</p>`}</div></details>`;
  wireGrid(main, g.members, g, rerender);
  wireSugg(main, g, rerender);
  $("g-name").addEventListener("change", async e => { await groupsOp({ op: "rename", key: g.key, name: e.target.value }, "Renamed"); rerender(); });
  $("g-desc").addEventListener("change", async e => { await groupsOp({ op: "describe", key: g.key, description: e.target.value }, "Description saved"); });
  $("g-delete").addEventListener("click", async () => {
    if (!confirm(`Delete the group "${groupLabel(g)}"? Its diagrams go back to their clusters (Undo brings the group back).`)) return;
    await groupsOp({ op: "delete", key: g.key }, "Group deleted");
    G.group = null; rerender();
  });
  $("g-merge").addEventListener("click", async () => {
    const o = groupByKey($("g-merge-with").value);
    if (!o || o.key === g.key) return toast("No such group", true);
    if (!confirm(`Merge "${groupLabel(o)}" into "${groupLabel(g)}"? "${groupLabel(o)}" is then deleted.`)) return;
    await groupsOp({ op: "merge", key: g.key, other: o.key }, `Merged ${groupLabel(o)} into ${groupLabel(g)}`);
    rerender();
  });
  $("g-sugg-wrap").addEventListener("toggle", async e => {
    if (!e.target.open || G.sugg || !g.members.length) return;
    G.sugg = { ids: g.members, ...(await api(`/api/suggestions?ids=${encodeURIComponent(g.members.join(","))}`)) };
    if (G.group === g.key) renderGroup();
  });
}

// ================================================================ inspector: one diagram
const I = { id: null, sugg: null, sel: new Set(), history: [] };
const zoomBtn = id => `<button class="zoom" data-inspect="${esc(id)}" title="Open this diagram: its groups and similar diagrams">⤢</button>`;

document.addEventListener("click", ev => {          // capture phase: before the card's own select handler
  const b = ev.target.closest("[data-inspect]");
  if (!b) return;
  ev.stopPropagation(); ev.preventDefault();
  openInspect(b.dataset.inspect, !!b.closest("#inspect"));
}, true);
document.addEventListener("keydown", ev => {
  if (!$("inspect").hidden && ev.key === "Escape") { ev.stopPropagation(); closeInspect(); }
}, true);
$("inspect").addEventListener("click", ev => { if (ev.target.id === "inspect") closeInspect(); });

async function openInspect(id, fromInside) {
  if (fromInside && I.id && I.id !== id) I.history.push(I.id); else if (!fromInside) I.history = [];
  I.id = id; I.sel.clear(); I.sugg = null;
  $("inspect").hidden = false;
  if (!G.data) await loadGroupsData();
  renderInspect();
  I.sugg = await api(`/api/suggestions?ids=${encodeURIComponent(id)}`);
  if (I.id === id) renderInspect();
}
function closeInspect() { $("inspect").hidden = true; I.id = null; refreshView(); }

function renderInspect() {
  const d = G.data, c = d.cards[I.id];
  if (!c) { $("inspect-box").innerHTML = `<p class="empty">This diagram is no longer in the review (marked wrong or not a diagram).</p>`; return; }
  const gs = (G.groupOf[I.id] || []).map(groupByKey).filter(Boolean);
  const cl = G.clusterOf[I.id];
  const items = (I.sugg ? I.sugg.items : []).slice(0, 40).map(it => {
    const cc = d.cards[it.id];
    if (!cc) return "";
    const tags = (G.groupOf[it.id] || []).map(groupByKey).filter(Boolean);
    return `<div class="ii ${I.sel.has(it.id) ? "sel" : ""}" data-i="pick" data-id="${esc(it.id)}">
      ${zoomBtn(it.id)}
      <div class="img"><img loading="lazy" src="${cardImg(cc, 220)}"></div>
      <div class="cap"><strong>${esc(cc.shelfmark)}</strong> p. ${esc(cc.page)} <span class="sim">${it.similarity.toFixed(2)}</span><br>
        ${tags.length ? tags.map(g => `<span class="tag">${esc(g.name || g.key)}</span>`).join(" ")
          : `<span class="tag free">${G.clusterOf[it.id] ? `cluster ${G.clusterOf[it.id]}` : "in no cluster"}</span>`}</div>
    </div>`;
  }).join("");
  const n = I.sel.size;
  $("inspect-box").innerHTML = `
    <div class="ins-head">
      ${I.history.length ? `<button class="btn" data-i="back">← Back</button>` : ""}
      <h3>${esc(c.shelfmark)} · p. ${esc(c.page)}</h3>
      <span class="muted">${gs.length ? `in ${esc(gs.map(groupLabel).join(" and "))}` : cl ? `cluster ${cl}` : "in no cluster"}</span>
      <span class="sp"></span><button class="btn" data-i="close">Close (Esc)</button>
    </div>
    <div class="ins-body">
      <div class="ins-left">
        <div class="ins-img"><img src="${cardImg(c, 700)}"></div>
        <a class="linkish" href="/file?p=${encodeURIComponent(c.page_file)}" target="_blank" rel="noopener">Open the full page ↗</a>
        <h4>Its group</h4>
        <div class="ins-groups">${gs.length ? gs.map(g => `<div class="ig"><div class="ig-txt"><strong>${esc(groupLabel(g))}</strong>
            <span class="muted">${g.key} · ${g.size} diagrams</span></div>
            <button class="btn" data-i="open" data-key="${esc(g.key)}">open</button>
            <button class="btn bad" data-i="out" data-key="${esc(g.key)}">take out</button></div>`).join("")
          : `<p class="note">In no group: it is ${cl ? `in cluster ${cl}` : "in no cluster"}.</p>`}</div>
        <div class="ins-actions">
          <input type="text" id="ins-add-to" list="group-names" placeholder="group name (new or existing)">
          <button class="btn primary" data-i="add">Move to group</button>
        </div>
      </div>
      <div class="ins-right">
        <h4>Most similar diagrams, anywhere</h4>
        <p class="note">Click diagrams to select them; they move together with this one. ⤢ opens a diagram here.</p>
        <div class="ins-bar"><strong>${n}</strong>&nbsp;selected — "Move to group" moves this diagram ${n ? `and the ${n} selected` : ""}</div>
        <div class="ins-items">${items || `<p class="note">${I.sugg ? "No other similar diagrams." : "Looking for similar diagrams…"}</p>`}</div>
      </div>
    </div>`;
}

$("inspect-box").addEventListener("click", async ev => {
  const el = ev.target.closest("[data-i]");
  if (!el) return;
  const act = el.dataset.i;
  if (act === "close") return closeInspect();
  if (act === "back") { I.id = I.history.pop(); I.sel.clear(); I.sugg = null; renderInspect(); I.sugg = await api(`/api/suggestions?ids=${encodeURIComponent(I.id)}`); return renderInspect(); }
  if (act === "pick") { I.sel.has(el.dataset.id) ? I.sel.delete(el.dataset.id) : I.sel.add(el.dataset.id); return renderInspect(); }
  if (act === "open") { closeInspect(); G.group = el.dataset.key; G.sugg = null; return setView("groups"); }
  if (act === "out") { await groupsOp({ op: "remove", key: el.dataset.key, ids: [I.id] }, "Taken out of the group"); return renderInspect(); }
  if (act === "add") {
    await addToNamed($("ins-add-to").value, [I.id, ...I.sel]);
    I.sel.clear();
    return renderInspect();
  }
});

function refreshView() {
  if (view === "clusters") { renderClusterList(); renderCluster(); }
  else if (view === "groups") { renderGroupList(); renderGroup(); }
  else if (view === "board" && G.data) renderBoard();
  else if (view === "assign" && G.data) { renderAssignBar(); renderAssign(true); }
}
