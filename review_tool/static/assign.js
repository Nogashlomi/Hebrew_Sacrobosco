/* 5 · All diagrams: scroll through every diagram and assign it to a group.
   Click to select (shift-click selects a range), then press a group in the bar at the top to move the selection there.
   Uses G (data), card(), groupsOp(), groupLabel() and zoomBtn() from groups.js. */
const A = { sel: new Set(), shown: 0, list: [], last: null, CHUNK: 150 };

async function loadAssign() {
  const y = $("as-scroll").scrollTop;
  await loadGroupsData();
  renderAssignBar();
  renderAssign(true);
  $("as-scroll").scrollTop = y;
}

// the diagrams to show, in order
function assignList() {
  const d = G.data, f = $("as-filter").value, q = $("as-search").value.trim().toLowerCase();
  let ids = Object.keys(d.cards);
  if (f === "free") ids = ids.filter(i => !G.groupOf[i]);
  else if (f.startsWith("G:")) ids = ids.filter(i => (G.groupOf[i] || []).includes(f.slice(2)));
  if (q) ids = ids.filter(i => d.cards[i].shelfmark.toLowerCase().includes(q));
  const byMs = (a, b) => {
    const x = d.cards[a], y = d.cards[b];
    return x.shelfmark.localeCompare(y.shelfmark) || (+x.page - +y.page) || a.localeCompare(b);
  };
  if ($("as-sort").value === "cluster") {
    // similar diagrams side by side: largest clusters first, then diagrams in no cluster
    const rank = {};
    d.clusters.slice().sort((a, b) => b.size - a.size).forEach((c, n) => { rank[c.number] = n; });
    const r = i => G.clusterOf[i] !== undefined ? rank[G.clusterOf[i]] : 1e9;
    ids.sort((a, b) => r(a) - r(b) || byMs(a, b));
  } else ids.sort(byMs);
  return ids;
}

function assignCard(id) {
  const c = G.data.cards[id];
  const g = (G.groupOf[id] || []).map(groupByKey).filter(Boolean)[0];
  const cl = G.clusterOf[id];
  return `<div class="card as-card ${A.sel.has(id) ? "selected" : ""}" data-id="${esc(id)}">
    ${zoomBtn(id)}
    <div class="img"><img loading="lazy" src="${cardImg(c)}"></div>
    <div class="cap"><div class="row"><strong>${esc(c.shelfmark)}</strong><span>p. ${esc(c.page)}</span></div>
      <div class="row">${g ? `<span class="gtag" title="${esc(groupLabel(g))}">${esc(g.name || g.key)}</span>`
        : `<span class="muted">${cl !== undefined ? `cluster ${cl}` : "no cluster"}</span>`}</div></div>
  </div>`;
}

function renderAssign(keepCount) {
  A.list = assignList();
  const n = keepCount ? Math.max(A.shown, A.CHUNK) : A.CHUNK;
  A.shown = Math.min(n, A.list.length);
  $("as-grid").innerHTML = A.list.slice(0, A.shown).map(assignCard).join("");
  $("as-count").textContent = `${A.list.length} diagrams`;
  $("as-more").hidden = A.shown >= A.list.length;
  updateAssignSel();
}

function showMore() {
  if (A.shown >= A.list.length) return;
  const next = A.list.slice(A.shown, A.shown + A.CHUNK);
  $("as-grid").insertAdjacentHTML("beforeend", next.map(assignCard).join(""));
  A.shown += next.length;
  $("as-more").hidden = A.shown >= A.list.length;
}
// load the next diagrams when the end of the list comes into view
new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && view === "assign") showMore(); },
  { root: $("as-scroll"), rootMargin: "600px" }).observe($("as-more"));

// the bar: selection count and one button per group
function renderAssignBar() {
  const gs = G.data.groups;
  $("as-filter").innerHTML = `<option value="free">Not grouped</option><option value="all">All diagrams</option>` +
    gs.map(g => `<option value="G:${esc(g.key)}">In: ${esc(groupLabel(g))} (${g.size})</option>`).join("");
  $("as-filter").value = A.filter || "free";
  $("as-groups").innerHTML =
    `<button class="as-group new" data-new="1" title="Make a new named group (from the selected diagrams, if any)">＋ New group…</button>` +
    gs.map(g => `<button class="as-group" data-key="${esc(g.key)}" title="Move the selected diagrams to ${esc(groupLabel(g))}">
      ${esc(groupLabel(g))} <span class="muted">${g.size}</span></button>`).join("") +
    `<button class="as-group out" data-out="1" title="Take the selected diagrams out of their group (back to their cluster)">Not grouped</button>`;
}

function updateAssignSel() {
  const n = A.sel.size;
  $("as-seln").textContent = n ? `${n} selected` : "Click diagrams to select them (shift-click for a range), then a group:";
  $("as-clear").disabled = !n;
  // "New group" works without a selection too (an empty group, filled later)
  document.querySelectorAll("#as-groups .as-group:not(.new)").forEach(b => { b.disabled = !n; });
}

$("as-grid").addEventListener("click", ev => {
  const el = ev.target.closest(".as-card");
  if (!el) return;
  const id = el.dataset.id;
  if (ev.shiftKey && A.last && A.list.includes(A.last)) {
    const [a, b] = [A.list.indexOf(A.last), A.list.indexOf(id)].sort((x, y) => x - y);
    A.list.slice(a, b + 1).forEach(i => A.sel.add(i));
    document.querySelectorAll("#as-grid .as-card").forEach(c => c.classList.toggle("selected", A.sel.has(c.dataset.id)));
  } else {
    A.sel.has(id) ? A.sel.delete(id) : A.sel.add(id);
    el.classList.toggle("selected");
  }
  A.last = id;
  updateAssignSel();
});

$("as-groups").addEventListener("click", async ev => {
  const b = ev.target.closest(".as-group");
  if (!b || (!A.sel.size && !b.dataset.new)) return;
  const ids = [...A.sel];
  if (b.dataset.new) {
    const name = prompt(ids.length ? `Name of the new group for these ${ids.length} diagrams:`
      : "Name of the new group (it starts empty: then select diagrams and press its button):");
    if (name === null) return;
    if (!name.trim() && !ids.length) return toast("An empty group needs a name", true);
    if (name.trim() && findGroup(name)) return toast(`There is already a group called "${name.trim()}"`, true);
    await groupsOp({ op: "new", name, ids }, `New group${name.trim() ? ` "${name.trim()}"` : ""}${ids.length ? ` with ${ids.length} diagrams` : ""}`);
  } else if (b.dataset.out) {
    for (const g of G.data.groups) {
      const mine = ids.filter(i => g.members.includes(i));
      if (mine.length) await api("/api/groups", { op: "remove", key: g.key, ids: mine });
    }
    toast(`Took ${ids.length} out of their group`);
  } else {
    const g = groupByKey(b.dataset.key);
    await groupsOp({ op: "add", key: g.key, ids }, `Moved ${ids.length} to ${groupLabel(g)}`);
  }
  A.sel.clear();
  await loadAssign();
});

$("as-clear").addEventListener("click", () => { A.sel.clear(); renderAssign(true); });
$("as-all").addEventListener("click", () => {
  A.list.slice(0, A.shown).forEach(i => A.sel.add(i));
  renderAssign(true);
});
$("as-filter").addEventListener("change", e => { A.filter = e.target.value; A.sel.clear(); renderAssign(false); $("as-scroll").scrollTop = 0; });
$("as-sort").addEventListener("change", () => { renderAssign(false); $("as-scroll").scrollTop = 0; });
$("as-search").addEventListener("input", () => renderAssign(false));
$("as-size").addEventListener("input", e => { $("as-grid").style.setProperty("--as-w", e.target.value + "px"); });
document.addEventListener("keydown", ev => {
  if (view === "assign" && ev.key === "Escape" && $("inspect").hidden) { A.sel.clear(); renderAssign(true); }
});
