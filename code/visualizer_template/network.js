/**
 * Network tab: printed editions and manuscripts as nodes, linked when they share illustrations.
 *
 * Data: window.SPHAERA_DATA.network (code/08_build_network.py)
 *   nodes        books: node_id P_<bid> (printed edition) | M_<codex_id> (manuscript), place, lat/lon, year, ...
 *   clusters     print image clusters (SAC_SIL_...): image_file, keywords, n_print_books
 *   memberships  [node_id, unit_id, n_images, tier]: a book contains a visual unit
 *                unit = a print cluster (for a manuscript: one of its illustrations matched it, step 7, with tier)
 *                       or MSG_<n>, a computed cluster among manuscript illustrations (step 5),
 *                       or MSH_<key>, one of your named groups (review tool)
 * Links are recomputed here from the memberships whenever a filter changes:
 * two books are linked by every unit they both contain; line width = number of shared units.
 */
document.addEventListener("DOMContentLoaded", () => {
  const data = window.SPHAERA_DATA;
  const net = data && data.network;
  const $ = id => document.getElementById(id);
  const statusBox = $("net-status");
  if (!net) {
    statusBox.innerHTML = `<p class="empty-note">No network yet. Run code/08_build_network.py and rebuild.</p>`;
    return;
  }

  const esc = s => (s === null || s === undefined) ? "" : String(s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
  const app = () => window.SPHAERA_APP || {};
  const TIER = { strong: 3, probable: 2, possible: 1 };
  const COLOUR = { print: "#b07d2b", manuscript: "#8e283b" };
  const EDGE_COLOUR = { "print-print": "176,125,43", "print-ms": "142,40,59", "ms-ms": "84,64,140" };

  // ---------- data ----------
  const nodes = net.nodes.map(n => ({ ...n, year: n.year === null ? null : Math.round(n.year) }));
  const nodeById = new Map(nodes.map(n => [n.node_id, n]));
  const clusterById = new Map(net.clusters.map(c => [c.cluster_id, c]));
  const unitMembers = new Map();           // unit -> [{node, n, rank}]
  const nodeUnits = new Map();             // node -> Set(unit)
  net.memberships.forEach(([nid, uid, n, tier]) => {
    const node = nodeById.get(nid);
    if (!node) return;
    if (!unitMembers.has(uid)) unitMembers.set(uid, []);
    unitMembers.get(uid).push({ node, n, rank: tier ? TIER[tier] : 3 });
    if (!nodeUnits.has(nid)) nodeUnits.set(nid, new Set());
    nodeUnits.get(nid).add(uid);
  });

  // manuscript illustrations behind each (codex, unit): for showing what two books share
  const codexOfMms = {};
  (data.codices || []).forEach(c => c.records.forEach(r => { codexOfMms[r] = c.codex_id; }));
  const illCodex = il => codexOfMms[il.mms_id] || il.mms_id;
  const msIllustrations = new Map();      // "M_<codex>|<unit>" -> [illustration]
  const addIll = (unit, il) => {
    if (!il) return;
    const key = `M_${illCodex(il)}|${unit}`;
    if (!msIllustrations.has(key)) msIllustrations.set(key, []);
    msIllustrations.get(key).push(il);
  };
  const illById = Object.fromEntries((data.illustrations || []).map(il => [il.illustration_id, il]));
  ((data.print_matches && data.print_matches.print_clusters) || []).forEach(p =>
    p.matches.forEach(m => addIll(p.print_id, illById[m.illustration_id])));
  ((data.clusters && data.clusters.clusters) || []).filter(c => c.label.startsWith("repeating"))
    .forEach(c => c.illustration_ids.forEach(id => addIll(`MSG_${c.cluster_id}`, illById[id])));
  (data.groups || []).forEach(g => g.illustration_ids.forEach(id => addIll(`MSH_${g.key}`, illById[id])));
  const handGroupName = Object.fromEntries((data.groups || []).map(g => [`MSH_${g.key}`, g.name || `Unnamed group ${g.key}`]));
  const msGroupExample = Object.fromEntries(((data.clusters && data.clusters.clusters) || [])
    .map(c => [`MSG_${c.cluster_id}`, illById[c.example_id] || illById[c.illustration_ids[0]]]));

  // ---------- filters ----------
  const places = [...new Set(nodes.map(n => n.place).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const placeCount = p => nodes.filter(n => n.place === p).length;
  places.forEach(p => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = `${p} (${placeCount(p)})`;
    $("net-place").appendChild(o);
  });

  function readFilters() {
    return {
      print: $("net-show-print").checked, ms: $("net-show-ms").checked,
      from: +$("net-year-from").value || -Infinity, to: +$("net-year-to").value || Infinity,
      undated: $("net-undated").checked,
      place: $("net-place").value, placeCat: $("net-place-cat").value, placeMode: $("net-place-mode").value,
      pp: $("net-e-pp").checked, pm: $("net-e-pm").checked, mm: $("net-e-mm").checked,
      minPP: Math.max(1, +$("net-min-pp").value || 1), tier: +$("net-tier").value,
      hideIsolated: $("net-hide-isolated").checked, colour: $("net-colour").value
    };
  }

  function computeEdges(allowed, f) {
    const pairs = new Map();
    unitMembers.forEach((members, unit) => {
      const isGroup = unit.startsWith("MSG_") || unit.startsWith("MSH_");
      const ms = members.filter(m => allowed.has(m.node.node_id) && m.rank >= f.tier);
      for (let i = 0; i < ms.length; i++) {
        for (let j = i + 1; j < ms.length; j++) {
          let a = ms[i].node, b = ms[j].node;
          if (a.node_id > b.node_id) [a, b] = [b, a];
          const kind = a.kind === "print" && b.kind === "print" ? "print-print"
            : a.kind === "manuscript" && b.kind === "manuscript" ? "ms-ms" : "print-ms";
          if ((kind === "print-print" && !f.pp) || (kind === "print-ms" && !f.pm) || (kind === "ms-ms" && !f.mm)) continue;
          if (isGroup && kind !== "ms-ms") continue;
          const key = a.node_id + "|" + b.node_id;
          let e = pairs.get(key);
          if (!e) pairs.set(key, e = { source: a, target: b, kind, units: [] });
          e.units.push(unit);
        }
      }
    });
    return [...pairs.values()].filter(e => e.kind !== "print-print" || e.units.length >= f.minPP);
  }

  let current = { nodes: [], edges: [], seeds: new Set() };
  let selected = null;

  function applyFilters() {
    const f = readFilters();
    const base = nodes.filter(n => {
      if (n.kind === "print" ? !f.print : !f.ms) return false;
      if (n.year === null) { if (!f.undated) return false; }
      else if (n.year < f.from || n.year > f.to) return false;
      if (f.placeCat && n.kind === "print" && n.place_category !== f.placeCat) return false;
      return true;
    });
    const allowed = new Set(base.map(n => n.node_id));
    let edges = computeEdges(allowed, f);
    let shown = base;
    const seeds = new Set();
    if (f.place) {
      base.filter(n => n.place === f.place).forEach(n => seeds.add(n.node_id));
      if (f.placeMode === "only") {
        edges = edges.filter(e => seeds.has(e.source.node_id) && seeds.has(e.target.node_id));
      } else {
        edges = edges.filter(e => seeds.has(e.source.node_id) || seeds.has(e.target.node_id));
      }
      const keep = new Set(seeds);
      edges.forEach(e => { keep.add(e.source.node_id); keep.add(e.target.node_id); });
      shown = base.filter(n => keep.has(n.node_id));
    }
    if (f.hideIsolated) {
      const linked = new Set();
      edges.forEach(e => { linked.add(e.source.node_id); linked.add(e.target.node_id); });
      shown = shown.filter(n => linked.has(n.node_id) || seeds.has(n.node_id));
    }
    current = { nodes: shown, edges, seeds, filters: f };
    if (selected && !shown.includes(selected)) selected = null;

    const count = k => shown.filter(n => n.kind === k).length;
    const ek = k => edges.filter(e => e.kind === k).length;
    const noPlace = view === "map" ? shown.filter(n => n.lat === null).length : 0;
    statusBox.innerHTML = `<strong>${count("print")}</strong> printed editions · <strong>${count("manuscript")}</strong> manuscripts ·
      links: ${ek("print-print").toLocaleString()} print–print, ${ek("print-ms")} print–manuscript, ${ek("ms-ms")} manuscript–manuscript
      ${noPlace ? `<span class="muted"> · ${noPlace} books without a known place are not on the map</span>` : ""}`;
    renderLegend(f);
    if (view === "graph") updateGraph(); else updateMap();
    renderDetail();
  }

  // ---------- colours ----------
  const periodScale = d3.scaleSequential(d3.interpolateViridis).domain([1350, 1850]);
  function colourOf(n) {
    if (current.filters && current.filters.colour === "period") return n.year === null ? "#9aa1ab" : periodScale(n.year);
    return COLOUR[n.kind];
  }
  const radiusOf = n => 3 + Math.sqrt(n.n_images || 1) * (n.kind === "manuscript" ? 0.9 : 0.55);

  function renderLegend(f) {
    const legend = $("net-legend");
    if (f.colour === "period") {
      const stops = [1400, 1500, 1600, 1700, 1800].map(y => `<span><i style="background:${periodScale(y)}"></i>${y}</span>`).join("");
      legend.innerHTML = `${stops}<span><i style="background:#9aa1ab"></i>undated</span><span class="muted">● print ◆ manuscript</span>`;
    } else {
      legend.innerHTML = `<span><i style="background:${COLOUR.print}"></i>Printed edition</span>
        <span><i class="diamond" style="background:${COLOUR.manuscript}"></i>Manuscript</span>`;
    }
  }

  // ---------- network view (canvas + d3-force) ----------
  const canvas = $("net-canvas");
  const ctx = canvas.getContext("2d");
  let width = 800, height = 640, transform = d3.zoomIdentity, simulation = null, view = "graph";

  function resizeCanvas() {
    const stage = canvas.parentElement;
    width = stage.clientWidth;
    height = Math.max(480, Math.min(760, window.innerHeight - 260));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = width + "px"; canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    $("net-map").style.height = height + "px";
  }

  function updateGraph() {
    const { nodes: ns, edges } = current;
    ns.forEach(n => { if (n.x === undefined) { n.x = width / 2 + (Math.random() - 0.5) * 300; n.y = height / 2 + (Math.random() - 0.5) * 300; } });
    const maxW = Math.max(1, ...edges.map(e => e.units.length));
    if (!simulation) {
      simulation = d3.forceSimulation().on("tick", draw);
    }
    simulation.nodes(ns)
      .force("link", d3.forceLink(edges).id(n => n.node_id)
        .distance(e => 30 + 60 * (1 - Math.log1p(e.units.length) / Math.log1p(maxW)))
        .strength(e => e.kind === "print-print" ? 0.05 + 0.25 * e.units.length / maxW : 0.4))
      .force("charge", d3.forceManyBody().strength(-40).distanceMax(400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.03))
      .force("y", d3.forceY(height / 2).strength(0.03))
      .force("collide", d3.forceCollide(n => radiusOf(n) + 1.5))
      .alpha(0.9).restart();
  }

  function neighbours(n) {
    const s = new Set();
    current.edges.forEach(e => {
      if (e.source === n) s.add(e.target);
      if (e.target === n) s.add(e.source);
    });
    return s;
  }

  function nodeShape(n, r) {
    ctx.beginPath();
    if (n.kind === "manuscript") {
      ctx.moveTo(n.x, n.y - r * 1.25); ctx.lineTo(n.x + r * 1.25, n.y);
      ctx.lineTo(n.x, n.y + r * 1.25); ctx.lineTo(n.x - r * 1.25, n.y); ctx.closePath();
    } else {
      ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
    }
  }

  function draw() {
    if (view !== "graph") return;
    const { nodes: ns, edges, seeds } = current;
    const near = selected ? neighbours(selected) : null;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    edges.forEach(e => {
      const on = !selected || e.source === selected || e.target === selected;
      const w = e.units.length;
      ctx.strokeStyle = `rgba(${EDGE_COLOUR[e.kind]},${on ? (e.kind === "print-print" ? 0.22 : 0.65) * (selected ? 2 : 1) : 0.03})`;
      ctx.lineWidth = Math.min(8, 0.4 + Math.log2(1 + w) * (e.kind === "print-print" ? 0.45 : 1)) / Math.sqrt(transform.k);
      ctx.beginPath(); ctx.moveTo(e.source.x, e.source.y); ctx.lineTo(e.target.x, e.target.y); ctx.stroke();
    });
    ns.forEach(n => {
      const on = !selected || n === selected || near.has(n);
      ctx.globalAlpha = on ? 1 : 0.15;
      nodeShape(n, radiusOf(n));
      ctx.fillStyle = colourOf(n); ctx.fill();
      ctx.lineWidth = (n === selected ? 2.5 : seeds.has(n.node_id) ? 2 : 0.7) / Math.sqrt(transform.k);
      ctx.strokeStyle = n === selected ? "#111" : seeds.has(n.node_id) ? "#111" : "#fff";
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // labels: manuscripts always (there are few), prints when zoomed in or selected/neighbours
    ctx.font = `${11 / transform.k}px sans-serif`;
    ctx.fillStyle = "#222";
    ns.forEach(n => {
      const on = !selected || n === selected || near.has(n);
      if (!on) return;
      if (n.kind === "manuscript" || transform.k > 2.2 || (selected && (n === selected || near.has(n)))) {
        ctx.fillText(n.kind === "manuscript" ? n.short_label : `${n.place} ${n.year}`, n.x + radiusOf(n) + 2, n.y + 3);
      }
    });
    ctx.restore();
  }

  function nodeAt(px, py) {
    const [x, y] = transform.invert([px, py]);
    let best = null, bestD = Infinity;
    current.nodes.forEach(n => {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < radiusOf(n) + 4 / transform.k && d < bestD) { best = n; bestD = d; }
    });
    return best;
  }

  const zoom = d3.zoom().scaleExtent([0.2, 12]).on("zoom", e => { transform = e.transform; draw(); });
  d3.select(canvas)
    .call(d3.drag()
      .subject(e => { const n = nodeAt(e.x, e.y); if (n) { const p = transform.apply([n.x, n.y]); n.x0 = p[0]; } return n; })
      .on("start", e => { if (!e.active) simulation.alphaTarget(0.2).restart(); e.subject.fx = e.subject.x; e.subject.fy = e.subject.y; })
      .on("drag", e => { const [x, y] = transform.invert([e.x, e.y]); e.subject.fx = x; e.subject.fy = y; })
      .on("end", e => { if (!e.active) simulation.alphaTarget(0); e.subject.fx = null; e.subject.fy = null; }))
    .call(zoom)
    .on("click", e => { const [px, py] = d3.pointer(e); select(nodeAt(px, py)); })
    .on("mousemove", e => {
      const [px, py] = d3.pointer(e);
      const n = nodeAt(px, py);
      const tip = $("net-tooltip");
      canvas.style.cursor = n ? "pointer" : "grab";
      if (!n) { tip.hidden = true; return; }
      tip.hidden = false;
      tip.style.left = (px + 14) + "px"; tip.style.top = (py + 10) + "px";
      tip.innerHTML = tooltipHtml(n);
    })
    .on("mouseleave", () => { $("net-tooltip").hidden = true; });

  const yearText = n => n.year === null ? "undated" : `${n.year}${n.year_source === "century" ? " (century)" : ""}`;
  const nameOf = n => n.kind === "manuscript" ? n.short_label : `${n.place || "?"} ${n.year}`;
  function tooltipHtml(n) {
    return `<strong>${esc(nameOf(n))}</strong><br>${esc(n.kind === "manuscript" ? n.library : n.label)}<br>
      <span class="muted">${esc(n.place || "place unknown")} · ${esc(yearText(n))} · ${n.n_images} illustrations</span>`;
  }

  // ---------- map view (Leaflet) ----------
  let map = null, mapLayer = null;
  function mapPositions(ns) {
    // books at the same place are spread on a small spiral around it
    const perPlace = {};
    const pos = new Map();
    ns.filter(n => n.lat !== null).sort((a, b) => (a.year || 0) - (b.year || 0)).forEach(n => {
      const k = n.lat + "," + n.lon;
      const i = perPlace[k] = (perPlace[k] || 0) + 1;
      const a = i * 2.4, r = i === 1 ? 0 : 0.045 * Math.sqrt(i);
      pos.set(n, [n.lat + r * Math.sin(a), n.lon + r * Math.cos(a) * 1.4]);
    });
    return pos;
  }

  function updateMap() {
    if (!map) {
      map = L.map("net-map", { preferCanvas: true }).setView([46, 10], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 12, className: "net-tiles" }).addTo(map);
      map.on("click", () => select(null));
    }
    if (mapLayer) mapLayer.remove();
    mapLayer = L.layerGroup().addTo(map);
    const pos = mapPositions(current.nodes);
    const near = selected ? neighbours(selected) : null;
    current.edges.forEach(e => {
      const a = pos.get(e.source), b = pos.get(e.target);
      if (!a || !b) return;
      const on = !selected || e.source === selected || e.target === selected;
      L.polyline([a, b], { color: `rgb(${EDGE_COLOUR[e.kind]})`, interactive: false,
        opacity: on ? (e.kind === "print-print" ? 0.18 : 0.6) * (selected ? 2.5 : 1) : 0.03,
        weight: Math.min(7, 0.5 + Math.log2(1 + e.units.length) * (e.kind === "print-print" ? 0.5 : 1)) }).addTo(mapLayer);
    });
    current.nodes.forEach(n => {
      const p = pos.get(n);
      if (!p) return;
      const on = !selected || n === selected || near.has(n);
      const m = L.circleMarker(p, { radius: radiusOf(n) * 0.8, color: n === selected || current.seeds.has(n.node_id) ? "#111" : "#fff",
        weight: n.kind === "manuscript" ? 2 : 1, fillColor: colourOf(n), fillOpacity: on ? 0.95 : 0.15, opacity: on ? 1 : 0.2 });
      m.bindTooltip(tooltipHtml(n));
      m.on("click", ev => { L.DomEvent.stopPropagation(ev); select(n); });
      m.addTo(mapLayer);
    });
  }

  // ---------- selection & detail panel ----------
  let openPair = null;
  function select(n) {
    selected = n;
    openPair = null;
    if (view === "graph") draw(); else updateMap();
    renderDetail();
  }

  function unitHtml(unit, a, b) {
    const side = n => n.kind === "manuscript"
      ? (msIllustrations.get(`${n.node_id}|${unit}`) || []).map(il =>
          `<img class="net-ill" src="../${esc(il.crop_file)}" data-ill="${esc(il.illustration_id)}" title="${esc(n.short_label)}, p. ${esc(il.page_number)} — open in reader" loading="lazy">`).join("")
      : "";
    if (unit.startsWith("MSH_")) {
      return `<div class="net-unit"><div class="net-unit-head">Group: ${esc(handGroupName[unit] || unit.slice(4))}</div>
        <div class="net-unit-imgs">${side(a)}${side(b)}</div></div>`;
    }
    if (unit.startsWith("MSG_")) {
      return `<div class="net-unit"><div class="net-unit-head">Cluster ${unit.slice(4)}</div>
        <div class="net-unit-imgs">${side(a)}${side(b)}</div></div>`;
    }
    const c = clusterById.get(unit) || {};
    return `<div class="net-unit">
      <div class="net-unit-head"><span class="mono">${esc(unit)}</span> · in ${c.n_print_books || "?"} printed editions
        ${c.keywords ? `<div class="muted">${esc(c.keywords)}</div>` : ""}</div>
      <div class="net-unit-imgs">${c.image_file ? `<img class="net-print" src="../${esc(c.image_file)}" title="Print cluster ${esc(unit)}" loading="lazy">` : ""}${side(a)}${side(b)}</div>
    </div>`;
  }

  function renderDetail() {
    const box = $("net-detail");
    if (!selected) {
      box.innerHTML = `<p class="clusters-section-note">Click a book to see its links. Node size = number of illustrations;
        line width = number of shared image clusters. ● printed edition, ◆ manuscript.
        Drag to move a node, scroll to zoom.</p>`;
      return;
    }
    const n = selected;
    const links = current.edges.filter(e => e.source === n || e.target === n)
      .map(e => ({ other: e.source === n ? e.target : e.source, e }))
      .sort((a, b) => (b.other.kind === "manuscript") - (a.other.kind === "manuscript") || b.e.units.length - a.e.units.length);
    const meta = n.kind === "manuscript"
      ? `<div class="net-kind ms">Manuscript</div><h3>${esc(n.short_label)}</h3>
         <div>${esc(n.library)}</div><div class="muted">${esc(n.place || "place unknown")} · ${esc(yearText(n))}${n.makers ? ` · ${esc(n.makers)}` : ""}</div>
         <div class="muted">${n.n_images} illustrations</div>
         <button class="btn-quiet" id="net-open-reader">Open in reader</button>`
      : `<div class="net-kind print">Printed edition</div><h3>${esc(n.label)}</h3>
         <div>${esc(n.place)} · ${n.year}${n.place_category ? ` <span class="muted">(${esc(n.place_category)})</span>` : ""}</div>
         ${n.makers ? `<div class="muted">Printer: ${esc(n.makers)}</div>` : ""}
         ${n.authors ? `<div class="muted">Authors: ${esc(n.authors)}</div>` : ""}
         <div class="muted">${n.n_images} illustrations</div>
         ${n.link ? `<a class="link-btn" href="${esc(n.link)}" target="_blank" rel="noopener">Sphaera database ↗</a>` : ""}`;
    box.innerHTML = `${meta}
      <h4 class="net-links-title">${links.length} linked books</h4>
      <div class="net-links">${links.map(({ other, e }) => `
        <div class="net-link ${openPair === other ? "open" : ""}" data-id="${esc(other.node_id)}">
          <span class="net-dot ${other.kind}"></span>
          <span class="net-link-name">${esc(nameOf(other))}</span>
          <span class="net-link-w" title="shared image clusters">${e.units.length}</span>
        </div>
        ${openPair === other ? `<div class="net-shared">${e.units.slice(0, 40).map(u => unitHtml(u, n, other)).join("")}
          ${e.units.length > 40 ? `<p class="muted">… and ${e.units.length - 40} more</p>` : ""}</div>` : ""}`).join("")}
      </div>`;
    const btn = $("net-open-reader");
    if (btn) btn.addEventListener("click", () => app().openManuscriptInReader && app().openManuscriptInReader(String(n.link), 0));
    box.querySelectorAll(".net-link").forEach(el => el.addEventListener("click", () => {
      const other = nodeById.get(el.dataset.id);
      openPair = openPair === other ? null : other;
      renderDetail();
    }));
    box.querySelectorAll(".net-ill").forEach(img => img.addEventListener("click", () =>
      app().openIllustrationPage && app().openIllustrationPage(img.dataset.ill)));
  }

  // ---------- wiring ----------
  function setView(v) {
    view = v;
    document.querySelectorAll("#net-view .chip-btn").forEach(b => b.classList.toggle("active", b.dataset.view === v));
    canvas.style.display = v === "graph" ? "block" : "none";
    $("net-map").hidden = v !== "map";
    applyFilters();
    if (v === "map") setTimeout(() => map && map.invalidateSize(), 50);
  }
  document.querySelectorAll("#net-view .chip-btn").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  ["net-show-print", "net-show-ms", "net-undated", "net-place", "net-place-cat", "net-place-mode",
   "net-e-pp", "net-e-pm", "net-e-mm", "net-tier", "net-hide-isolated", "net-colour"]
    .forEach(id => $(id).addEventListener("change", applyFilters));
  ["net-year-from", "net-year-to", "net-min-pp"].forEach(id => $(id).addEventListener("change", applyFilters));

  let started = false;
  function start() {
    resizeCanvas();
    if (!started) { started = true; applyFilters(); }
    else if (view === "map" && map) map.invalidateSize();
    else draw();
  }
  document.querySelector('[data-tab="tab-network"]').addEventListener("click", () => setTimeout(start, 30));
  window.addEventListener("resize", () => { if (started) { resizeCanvas(); draw(); } });
});
