/* Inspector: open one diagram large, with the groups it may belong to and the most similar diagrams anywhere.
   Opens from the ⤢ button on any diagram (Board, Clusters screen, inside the inspector itself) or by double-click on the Board. */
const I = { id: null, data: null, sugg: null, sel: new Set(), history: [], showSame: false };

document.addEventListener("click", ev => {          // capture phase: before the card's own select / drag handlers
  const b = ev.target.closest("[data-inspect]");
  if (!b) return;
  ev.stopPropagation(); ev.preventDefault();
  openInspect(b.dataset.inspect, !!b.closest("#inspect"));
}, true);
document.addEventListener("dblclick", ev => {
  const t = ev.target.closest("#view-board .bt");
  if (t) openInspect(t.dataset.id);
});
document.addEventListener("keydown", ev => {
  if (!$("inspect").hidden && ev.key === "Escape") { ev.stopPropagation(); closeInspect(); }
}, true);
$("inspect").addEventListener("click", ev => { if (ev.target.id === "inspect") closeInspect(); });

const zoomBtn = id => `<button class="zoom" data-inspect="${esc(id)}" title="Open this diagram: suggestions and similar diagrams">⤢</button>`;

async function openInspect(id, fromInside) {
  if (fromInside && I.id && I.id !== id) I.history.push(I.id); else if (!fromInside) I.history = [];
  I.id = id; I.sel.clear(); I.sugg = null;
  $("inspect").hidden = false;
  await refreshInspect();
}
function closeInspect() { $("inspect").hidden = true; I.id = null; }

async function refreshInspect() {
  I.data = await api("/api/clusters");
  const g = I.data.groups.find(x => x.members.includes(I.id));
  renderInspect(g);
  const q = `ids=${encodeURIComponent(I.id)}&all=1${g ? `&gid=${encodeURIComponent(g.gid)}` : ""}`;
  const id = I.id;
  I.sugg = await api(`/api/suggestions?${q}`);
  if (I.id === id) renderInspect(g);
}

const gLabel = g => g ? (g.note ? `"${g.note}" (${groupName(g)})` : groupName(g)) : "";

function renderInspect(g) {
  const d = I.data, c = d.cards[I.id];
  if (!c) { $("inspect-box").innerHTML = `<p class="empty">This diagram is no longer in the review (marked wrong or not a diagram).</p>`; return; }
  const isUnique = d.unique.includes(I.id);
  const where = g ? `in <strong>${esc(gLabel(g))}</strong> · ${g.size} diagrams` : isUnique ? "marked <strong>unique</strong>" : "<strong>unassigned</strong> (in no group)";
  const s = I.sugg;
  const groupsHtml = !s ? `<p class="note">Looking for groups…</p>` : s.groups.length ? s.groups.map(o => `
    <div class="ig">
      <div class="imgs">${o.members.map(m => d.cards[m] ? `<img loading="lazy" src="${cardImg(d.cards[m], 110)}">` : "").join("")}</div>
      <div class="ig-txt"><strong>${esc(o.note || (o.reviewed ? `Reviewed ${o.key}` : `Group ${o.number}`))}</strong>
        <span class="muted">${o.note ? esc(o.reviewed ? `Reviewed ${o.key}` : `Group ${o.number}`) + " · " : ""}${o.size} diagrams · ${o.n_manuscripts} ms</span>
        <span class="sim">similarity ${o.similarity.toFixed(2)}</span></div>
      <button class="btn good" data-i="addto" data-gid="${esc(o.gid)}">Put it here</button>
    </div>`).join("") : `<p class="note">No groups found.</p>`;
  const items = !s ? [] : s.items.filter(it => I.showSame || !g || it.gid !== g.gid).slice(0, 40);
  const itemsHtml = items.map(it => {
    const o = it.gid && d.groups.find(x => x.gid === it.gid);
    const cc = d.cards[it.id];
    if (!cc) return "";
    const same = g && it.gid === g.gid;
    return `<div class="ii ${I.sel.has(it.id) ? "sel" : ""}" data-i="pick" data-id="${esc(it.id)}">
      ${zoomBtn(it.id)}
      <div class="img"><img loading="lazy" src="${cardImg(cc, 220)}"></div>
      <div class="cap"><strong>${esc(cc.shelfmark)}</strong> p. ${esc(cc.page)} <span class="sim">${it.similarity.toFixed(2)}</span><br>
        <span class="tag ${o ? "" : it.unique ? "uq" : "free"}">${same ? "same group" : o ? esc(o.note || (o.reviewed ? o.key : `Group ${o.number}`)) : it.unique ? "unique" : "unassigned"}</span></div>
    </div>`;
  }).join("");
  const n = I.sel.size;
  $("inspect-box").innerHTML = `
    <div class="ins-head">
      ${I.history.length ? `<button class="btn" data-i="back">← Back</button>` : ""}
      <h3>${esc(c.shelfmark)} · p. ${esc(c.page)}</h3><span class="muted">${where}</span>
      <span class="sp"></span><button class="btn" data-i="close">Close (Esc)</button>
    </div>
    <div class="ins-body">
      <div class="ins-left">
        <div class="ins-img"><img src="${cardImg(c, 700)}"></div>
        <a class="linkish" href="/file?p=${encodeURIComponent(c.page_file)}" target="_blank" rel="noopener">Open the full page ↗</a>
        <div class="ins-actions">
          ${g ? `<button class="btn" data-i="unassign">Take out of its group</button>` : ""}
          ${isUnique ? `<button class="btn" data-i="ununique">Not unique: back to unassigned</button>`
                     : `<button class="btn" data-i="unique">Mark unique (no partner)</button>`}
        </div>
        <h4>Groups it may belong to</h4>
        <div class="ins-groups">${groupsHtml}</div>
      </div>
      <div class="ins-right">
        <h4>Most similar diagrams, anywhere</h4>
        <p class="note">Click diagrams to select them, then group them with this one. ⤢ opens a diagram here.</p>
        <div class="ins-bar">
          <strong>${n}</strong>&nbsp;selected
          <button class="btn primary" data-i="newgroup" ${n ? "" : "disabled"}>New group: this + selected</button>
          ${g ? `<button class="btn" data-i="addsel" ${n ? "" : "disabled"}>Add selected to its group</button>
                 <label class="lbl"><input type="checkbox" data-i="same" ${I.showSame ? "checked" : ""}> also show its own group</label>` : ""}
        </div>
        <div class="ins-items">${itemsHtml || `<p class="note">${s ? "No other similar diagrams." : "Looking for similar diagrams…"}</p>`}</div>
      </div>
    </div>`;
}

$("inspect-box").addEventListener("click", async ev => {
  const el = ev.target.closest("[data-i]");
  if (!el) return;
  const d = I.data, act = el.dataset.i, id = I.id;
  const g = d.groups.find(x => x.members.includes(id));
  const sel = [...I.sel];
  const run = async (body, msg) => { await api("/api/clusters", body); toast(msg); I.sel.clear(); await refreshInspect(); refreshView(); };
  if (act === "close") return closeInspect();
  if (act === "back") { I.id = I.history.pop(); I.sel.clear(); return refreshInspect(); }
  if (act === "same") { I.showSame = el.checked; return renderInspect(g); }
  if (act === "pick") {
    I.sel.has(el.dataset.id) ? I.sel.delete(el.dataset.id) : I.sel.add(el.dataset.id);
    return renderInspect(g);
  }
  if (act === "addto") {
    const t = d.groups.find(x => x.gid === el.dataset.gid);
    return run({ op: "add", gid: t.gid, members: t.members, ids: [id] }, `Put into ${gLabel(t)}`);
  }
  if (act === "unassign") return run({ op: "remove", gid: g.gid, members: g.members, ids: [id] }, "Taken out of its group");
  if (act === "unique") return run({ op: "unique", ids: [id], value: true }, "Marked unique");
  if (act === "ununique") return run({ op: "unique", ids: [id], value: false }, "Back to unassigned");
  if (act === "newgroup") return run({ op: "new_group", ids: [id, ...sel] }, `New group with ${sel.length + 1} diagrams`);
  if (act === "addsel") return run({ op: "add", gid: g.gid, members: g.members, ids: sel }, `Added ${sel.length} to ${gLabel(g)}`);
});

function refreshView() {
  if (view === "board") loadBoard(); else if (view === "clusters") loadClusters(true);
}
