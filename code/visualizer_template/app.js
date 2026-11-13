/**
 * Sphaera Hebraica - Academic Visualizer & Facsimile Reader
 * English Interface with Scholarly Typography & Multilingual Support
 */

document.addEventListener("DOMContentLoaded", () => {
  const data = window.SPHAERA_DATA;
  if (!data) {
    console.error("SPHAERA_DATA dataset is not loaded!");
    return;
  }

  // Application State
  const state = {
    activeTab: "tab-catalogue",
    catalogueFilters: {
      search: "",
      century: "",
      script: "",
      library: "",
      downloadedOnly: false,
      queryTerm: ""
    },
    reader: {
      activeMmsId: null,
      activePageIndex: 0,
      zoomLevel: 1.0
    },
    map: {
      leafletInstance: null,
      layerType: "writing", // "writing" or "holding"
      activeCentury: "",
      markersLayer: null
    },
    personsSearch: "",
    personsRoleFilter: "",
    catalogueSort: { key: "", asc: true },
    personsSort: { key: "count", asc: false },
    personsOpen: null
  };

  // -----------------------------------------------------------
  // 0. Initialize Masthead Global Statistics
  // -----------------------------------------------------------
  // Home: from the searches to the page images, per physical manuscript (data.funnel, step 3)
  const f = data.funnel;
  const fmt = n => (n || 0).toLocaleString();
  const pct = (n, of) => of ? Math.round(100 * n / of) : 0;
  if (f) {
    document.getElementById("home-funnel").innerHTML = `
      <div class="funnel-steps">
        <div class="funnel-step"><span class="funnel-num">${f.search_terms}</span><span class="funnel-label">catalogue searches</span>
          <span class="funnel-note">in the National Library of Israel catalogue (Ktiv)</span></div>
        <div class="funnel-arrow">→</div>
        ${f.records_found ? `<div class="funnel-step"><span class="funnel-num">${fmt(f.records_found)}</span><span class="funnel-label">catalogue records found</span>
          <span class="funnel-note">all kinds, incl. printed books</span></div>
        <div class="funnel-arrow">→</div>` : ""}
        <div class="funnel-step"><span class="funnel-num">${fmt(f.manuscript_records)}</span><span class="funnel-label">manuscript records</span>
          <span class="funnel-note">one record per volume or per work inside a volume</span></div>
        <div class="funnel-arrow">→</div>
        <div class="funnel-step main"><span class="funnel-num">${fmt(f.physical_manuscripts)}</span><span class="funnel-label">physical manuscripts</span>
          <span class="funnel-note">records describing the same book merged</span></div>
      </div>

      <div class="funnel-split-title">Of the <strong>${fmt(f.physical_manuscripts)}</strong> physical manuscripts:</div>
      <div class="funnel-bar">
        <span class="seg open" style="flex: ${f.open}" title="${f.open} open">${f.open}</span>
        <span class="seg restricted" style="flex: ${f.restricted}" title="${f.restricted} restricted">${f.restricted}</span>
        <span class="seg none" style="flex: ${f.not_digitized}" title="${f.not_digitized} not digitized">${f.not_digitized}</span>
      </div>
      <div class="funnel-legend">
        <div><i class="open"></i><strong>${f.open} digitized and open</strong> (${pct(f.open, f.physical_manuscripts)}%) ·
          ${fmt(f.open_pages)} pages · <strong>all ${f.downloaded} downloaded</strong> into this project and readable in the Facsimile Reader</div>
        <div><i class="restricted"></i><strong>${f.restricted} digitized but restricted</strong> (${pct(f.restricted, f.physical_manuscripts)}%) ·
          ${fmt(f.restricted_pages)} pages · Ktiv has images but does not serve them openly, so they are not here</div>
        <div><i class="none"></i><strong>${f.not_digitized} not digitized</strong> (${pct(f.not_digitized, f.physical_manuscripts)}%) ·
          catalogue record only</div>
      </div>`;
  }
  const persons = data.persons || [];
  const roleCounts = {};
  persons.forEach(p => { roleCounts[p.role] = (roleCounts[p.role] || 0) + 1; });
  const roleShort = { "Author": "authors", "Translator": "translators", "Scribe": "scribes",
                      "Former owner": "former owners", "Censor": "censors" };
  const roleText = Object.keys(roleShort).filter(r => roleCounts[r])
    .map(r => `${roleCounts[r]} ${roleShort[r]}`).concat(
      persons.length - Object.keys(roleShort).reduce((n, r) => n + (roleCounts[r] || 0), 0) > 0
        ? [`${persons.length - Object.keys(roleShort).reduce((n, r) => n + (roleCounts[r] || 0), 0)} others`] : []).join(", ");
  document.getElementById("stat-persons").textContent = roleText ? `${persons.length} (${roleText})` : persons.length;
  const nWriting = (data.places || []).filter(p => p.type === "writing").length;
  document.getElementById("stat-places").textContent =
    `${nWriting} places of writing, ${(data.places || []).length - nWriting} cities of holding libraries`;
  const homeIllustrations = data.illustrations || [];
  const codexOfRecord = {};
  (data.codices || []).forEach(c => c.records.forEach(r => { codexOfRecord[r] = c.codex_id; }));
  const illustrationMss = new Set(homeIllustrations.map(r => codexOfRecord[r.mms_id] || r.mms_id)).size;
  document.getElementById("stat-illustrations").textContent =
    `${homeIllustrations.length.toLocaleString()} in ${illustrationMss} of the ${f ? f.downloaded : "downloaded"} downloaded manuscripts`;
  const repeatingGroups = ((data.clusters && data.clusters.clusters) || []).filter(c => c.label.startsWith("repeating"));
  const acrossGroups = repeatingGroups.filter(c => c.n_manuscripts > 1).length;
  document.getElementById("stat-clusters").textContent = data.clusters
    ? `${repeatingGroups.length} clusters (${acrossGroups} across manuscripts)`
    : "not computed yet";

  // -----------------------------------------------------------
  // 1. Navigation & Tab Switching
  // -----------------------------------------------------------
  const navTabs = document.querySelectorAll("#main-nav .nav-tab");
  const tabPanes = document.querySelectorAll(".tab-pane");

  function switchTab(targetId) {
    state.activeTab = targetId;
    navTabs.forEach(t => t.classList.toggle("active", t.dataset.tab === targetId));
    tabPanes.forEach(p => p.classList.toggle("active", p.id === targetId));

    // the map needs its size recomputed once its tab is visible
    if (targetId === "tab-map") {
      setTimeout(() => {
        if (state.map.leafletInstance) {
          state.map.leafletInstance.invalidateSize();
        } else {
          initMap();
        }
      }, 100);
    }
  }

  navTabs.forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // -----------------------------------------------------------
  // 2. Tab 1: Catalogue & Filtering
  // -----------------------------------------------------------
  const catalogueSearch = document.getElementById("catalogue-search");
  const filterCentury = document.getElementById("filter-century");
  const filterScript = document.getElementById("filter-script");
  const filterLibrary = document.getElementById("filter-library");
  const filterDownloaded = document.getElementById("filter-downloaded-only");
  const queryChipsContainer = document.getElementById("query-chips");
  const manuscriptsGrid = document.getElementById("catalogue-table-body");
  const countActive = document.getElementById("filter-count-active");
  const countTotal = document.getElementById("filter-count-total");
  const btnReset = document.getElementById("btn-reset-filters");

  // Populate Century Dropdown
  const centuryKeys = [
    "14th Century (1301–1400)",
    "15th Century (1401–1500)",
    "16th Century (1501–1600)",
    "17th Century (1601–1700)",
    "18th Century (1701–1800)",
    "19th Century (1801–1900)",
    "Unknown Era"
  ];
  centuryKeys.forEach(c => {
    if (data.centuries[c]) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = `${c} (${data.centuries[c]} MSS)`;
      filterCentury.appendChild(opt);
    }
  });

  // Populate Scripts Dropdown
  const scriptKeys = Object.keys(data.scripts).sort();
  scriptKeys.forEach(s => {
    if (s && s !== "Not Specified") {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = `${s} (${data.scripts[s]})`;
      filterScript.appendChild(opt);
    }
  });

  // Populate Libraries Dropdown
  const libraryNames = Array.from(new Set(data.manuscripts.map(m => m.library).filter(Boolean))).sort();
  libraryNames.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l;
    opt.textContent = l.length > 40 ? l.substring(0, 40) + "..." : l;
    filterLibrary.appendChild(opt);
  });

  // Query Term Chips
  const queryLabels = {
    "": "All Queries",
    "מראה האופנים": "Mar'eh ha-Ofanim (מראה האופנים)",
    "ספר הגלגל": "Sefer ha-Galgal (ספר הגלגל)",
    "בית אלהים": "Beit Elohim (בית אלהים)",
    "ספירה": "Sfeirah / Sphere (ספירה)",
    "מראה אופנים": "Mar'eh Ofanim (מראה אופנים)",
    "מראה האופנים ספר הגלגל": "Composite (מראה האופנים + ספר הגלגל)",
    "De sphaera": "De sphaera (Latin)",
    "Sacrobosco": "Sacrobosco (Name)",
    "סאקרובוסקו": "Sacrobosco (Hebrew)"
  };

  const queryAllChip = document.createElement("button");
  queryAllChip.className = "chip-btn active";
  queryAllChip.textContent = "All Queries";
  queryAllChip.onclick = () => {
    state.catalogueFilters.queryTerm = "";
    document.querySelectorAll("#query-chips .chip-btn").forEach(c => c.classList.remove("active"));
    queryAllChip.classList.add("active");
    renderCatalogue();
  };
  queryChipsContainer.appendChild(queryAllChip);

  Object.keys(data.query_terms).forEach(q => {
    const chip = document.createElement("button");
    chip.className = "chip-btn";
    chip.textContent = `${queryLabels[q] || q} (${data.query_terms[q]})`;
    chip.onclick = () => {
      state.catalogueFilters.queryTerm = q;
      document.querySelectorAll("#query-chips .chip-btn").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderCatalogue();
    };
    queryChipsContainer.appendChild(chip);
  });

  // Filtering Logic
  function textsOfRecord(mmsId) {
    const c = (data.codices || []).find(x => x.records.includes(mmsId));
    return c ? [c.contents || "", ...(c.texts || [])].join(" ") : "";
  }

  function getFilteredManuscripts() {
    return data.manuscripts.filter(m => {
      // Free text search
      if (state.catalogueFilters.search) {
        const q = state.catalogueFilters.search.toLowerCase();
        const haystack = [
          m.shelfmark,
          m.title,
          m.author,
          m.added_names,
          m.library,
          m.library_city,
          m.place_writing,
          m.colophon,
          m.notes,
          m.subjects,
          textsOfRecord(m.mms_id)
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Century
      if (state.catalogueFilters.century && m.century !== state.catalogueFilters.century) {
        return false;
      }

      // Script
      if (state.catalogueFilters.script && !m.script.includes(state.catalogueFilters.script)) {
        return false;
      }

      // Library
      if (state.catalogueFilters.library && m.library !== state.catalogueFilters.library) {
        return false;
      }

      // Downloaded only
      if (state.catalogueFilters.downloadedOnly && !m.has_local_images) {
        return false;
      }

      // Query term
      if (state.catalogueFilters.queryTerm && !m.query_terms.includes(state.catalogueFilters.queryTerm)) {
        return false;
      }

      return true;
    });
  }

  function renderCatalogue() {
    const filtered = getFilteredManuscripts();
    countActive.textContent = filtered.length;
    countTotal.textContent = data.manuscripts.length;

    if (filtered.length === 0) {
      manuscriptsGrid.innerHTML = `
        <tr><td colspan="8" class="table-empty">
          <h3>No manuscripts match your filter criteria</h3>
          <p>Try relaxing your search keywords or resetting the selected filters.</p>
          <button id="btn-empty-reset" class="btn-primary">Reset Filters</button>
        </td></tr>
      `;
      const btnEmptyReset = document.getElementById("btn-empty-reset");
      if (btnEmptyReset) btnEmptyReset.onclick = resetFilters;
      return;
    }

    sortRows(filtered, state.catalogueSort, catalogueSortValue);
    manuscriptsGrid.innerHTML = filtered.map(m => {
      // Images column: local facsimile > Ktiv IIIF > catalogue record only
      let statusHtml = "";
      if (m.has_local_images) {
        statusHtml = `<button class="status-pill downloaded btn-open-reader" data-mms="${m.mms_id}" title="Open the local facsimile in the reader">Read (${m.downloaded_pages_count} pp)</button>`;
      } else if (m.ktiv_link) {
        statusHtml = `<a class="status-pill open-iiif" href="${m.ktiv_link}" target="_blank" rel="noopener noreferrer" title="Open the record on the Ktiv portal">Ktiv ↗</a>`;
      } else {
        statusHtml = `<span class="status-pill catalog-only">Record only</span>`;
      }
      const nIll = illustrationCountByMs[m.mms_id] || 0;

      return `
        <tr class="clickable-row" data-mms="${m.mms_id}" title="Show the full record">
          <td class="cell-shelfmark">${escapeHtml(m.shelfmark || "—")}</td>
          <td class="cell-hebrew" dir="rtl">${escapeHtml(m.title || "")}</td>
          <td dir="auto">${escapeHtml(m.author || "")}</td>
          <td class="cell-nowrap">${escapeHtml(m.century.replace(/ \(.*\)/, ""))}</td>
          <td dir="auto">${escapeHtml(m.place_writing || "")}</td>
          <td>${escapeHtml(m.library_city ? `${m.library}, ${m.library_city}` : m.library)}</td>
          <td class="num">${nIll ? `<button class="link-btn btn-ms-illustrations" data-mms="${m.mms_id}" title="Show this manuscript's illustrations">${nIll}</button>` : ""}</td>
          <td>${statusHtml}</td>
        </tr>
      `;
    }).join("");

    manuscriptsGrid.querySelectorAll(".clickable-row").forEach(row => {
      row.addEventListener("click", () => openManuscriptModal(row.dataset.mms));
    });
    manuscriptsGrid.querySelectorAll(".btn-open-reader").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        openManuscriptInReader(btn.dataset.mms);
      });
    });
    manuscriptsGrid.querySelectorAll(".btn-ms-illustrations").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        illFilterMs.value = btn.dataset.mms;
        illFilterClass.value = "";
        renderIllustrations();
        switchTab("tab-illustrations");
      });
    });
    manuscriptsGrid.querySelectorAll("a.status-pill").forEach(a => {
      a.addEventListener("click", e => e.stopPropagation());
    });
  }

  // Sorting shared by the catalogue and persons tables: click a heading to sort, again to reverse
  function sortRows(rows, sort, valueOf) {
    if (!sort.key) return;
    const dir = sort.asc ? 1 : -1;
    rows.sort((a, b) => {
      const va = valueOf(a, sort.key), vb = valueOf(b, sort.key);
      if (typeof va === "number") return (va - vb) * dir;
      // empty values always last
      if (!va !== !vb) return va ? -1 : 1;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }

  function makeSortable(table, sort, render) {
    const headers = table.querySelectorAll("th[data-sort]");
    const mark = () => headers.forEach(th => {
      th.classList.toggle("sorted", th.dataset.sort === sort.key);
      th.dataset.dir = th.dataset.sort === sort.key ? (sort.asc ? "asc" : "desc") : "";
    });
    headers.forEach(th => th.addEventListener("click", () => {
      if (sort.key === th.dataset.sort) {
        sort.asc = !sort.asc;
      } else {
        sort.key = th.dataset.sort;
        sort.asc = !th.classList.contains("num");     // numbers start largest first
      }
      mark();
      render();
    }));
    mark();
  }

  const illustrationCountByMs = {};
  (data.illustrations || []).forEach(il => {
    illustrationCountByMs[il.mms_id] = (illustrationCountByMs[il.mms_id] || 0) + 1;
  });

  function catalogueSortValue(m, key) {
    switch (key) {
      case "illustrations": return illustrationCountByMs[m.mms_id] || 0;
      case "status": return m.has_local_images ? "1" : m.ktiv_link ? "2" : "3";
      case "place": return m.place_writing;
      default: return m[key];
    }
  }

  // Filter Event Listeners
  catalogueSearch.addEventListener("input", e => {
    state.catalogueFilters.search = e.target.value.trim();
    renderCatalogue();
  });

  filterCentury.addEventListener("change", e => {
    state.catalogueFilters.century = e.target.value;
    renderCatalogue();
  });

  filterScript.addEventListener("change", e => {
    state.catalogueFilters.script = e.target.value;
    renderCatalogue();
  });

  filterLibrary.addEventListener("change", e => {
    state.catalogueFilters.library = e.target.value;
    renderCatalogue();
  });

  filterDownloaded.addEventListener("change", e => {
    state.catalogueFilters.downloadedOnly = e.target.checked;
    renderCatalogue();
  });

  function resetFilters() {
    state.catalogueFilters.search = "";
    state.catalogueFilters.century = "";
    state.catalogueFilters.script = "";
    state.catalogueFilters.library = "";
    state.catalogueFilters.downloadedOnly = false;
    state.catalogueFilters.queryTerm = "";

    catalogueSearch.value = "";
    filterCentury.value = "";
    filterScript.value = "";
    filterLibrary.value = "";
    filterDownloaded.checked = false;

    document.querySelectorAll("#query-chips .chip-btn").forEach(c => c.classList.remove("active"));
    queryAllChip.classList.add("active");

    renderCatalogue();
  }

  btnReset.addEventListener("click", resetFilters);

  // -----------------------------------------------------------
  // 3. Tab 2: Facsimile Reader / Viewer
  // -----------------------------------------------------------
  const readerSelect = document.getElementById("reader-ms-select");
  const readerMetaBox = document.getElementById("reader-meta-box");
  const readerThumbnails = document.getElementById("reader-thumbnails");
  const readerActiveInfo = document.getElementById("reader-active-info");
  const readerCounter = document.getElementById("reader-page-counter");
  const readerMainImg = document.getElementById("reader-main-img");
  const btnPrev = document.getElementById("btn-prev-page");
  const btnNext = document.getElementById("btn-next-page");
  const btnZoomIn = document.getElementById("btn-zoom-in");
  const btnZoomOut = document.getElementById("btn-zoom-out");
  const btnZoomReset = document.getElementById("btn-zoom-reset");
  const btnViewToggle = document.getElementById("btn-view-toggle");
  const readerViewport = document.getElementById("reader-viewport");
  const readerGallery = document.getElementById("reader-gallery");
  const readerHeader = document.getElementById("reader-ms-header");
  const readerIllPanel = document.getElementById("reader-illustrations");
  readerMetaBox.style.display = "none";   // the full record is shown in readerHeader above the reader
  state.reader.illOnlyThisPage = false;

  // Lookups for the reader header and illustrations panel
  const readerPersonsByMs = {};
  (data.persons || []).forEach(p => p.manuscripts.forEach(id => {
    (readerPersonsByMs[id] = readerPersonsByMs[id] || []).push(p);
  }));
  // illustrations belong to a manuscript folder, which records sharing a codex have in common
  const readerIllByFolder = {};
  (data.illustrations || []).forEach(il => {
    (readerIllByFolder[il.manuscript_folder] = readerIllByFolder[il.manuscript_folder] || []).push(il);
  });
  const readerClusterOf = {};
  ((data.clusters && data.clusters.clusters) || []).forEach(c => c.illustration_ids.forEach(id => { readerClusterOf[id] = c; }));
  // your named groups (a diagram is in one group, or else in a computed cluster)
  const readerGroupOf = {};
  (data.groups || []).forEach(g => g.illustration_ids.forEach(id => { readerGroupOf[id] = g; }));
  const recordsByFolder = {};
  data.manuscripts.filter(m => m.image_folder).forEach(m => {
    (recordsByFolder[m.image_folder] = recordsByFolder[m.image_folder] || []).push(m);
  });
  const folderName = ms => (ms.image_folder || "").split("/").pop();

  state.reader.galleryMode = false;
  state.reader.gallerySize = 220;   // gallery thumbnail width in px, changed with + / -

  const downloadedManuscripts = data.manuscripts.filter(m => m.has_local_images && m.pages.length > 0);

  // Populate Reader Dropdown
  downloadedManuscripts.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.mms_id;
    opt.textContent = `${m.shelfmark} (${m.downloaded_pages_count} pp) — ${m.library}`;
    readerSelect.appendChild(opt);
  });

  function openManuscriptInReader(mmsId, targetPageIndex = 0) {
    switchTab("tab-reader");
    readerSelect.value = mmsId;
    loadManuscriptIntoReader(mmsId, targetPageIndex);
  }

  function loadManuscriptIntoReader(mmsId, initialPageIndex = 0) {
    const ms = downloadedManuscripts.find(m => m.mms_id === mmsId) || downloadedManuscripts[0];
    if (!ms) return;

    state.reader.activeMmsId = ms.mms_id;
    state.reader.activePageIndex = initialPageIndex;
    state.reader.zoomLevel = 1.0;

    renderReaderHeader(ms);
    renderReaderIllustrations(ms);

    // Render metadata summary card
    readerMetaBox.innerHTML = `
      <div style="font-family: var(--font-mono); font-size: 0.82rem; font-weight: 600; color: var(--accent-navy); margin-bottom: 0.25rem;">
        ${escapeHtml(ms.shelfmark)}
      </div>
      <div style="font-family: var(--font-hebrew); font-size: 1.05rem; font-weight: 700; direction: rtl; text-align: right; color: var(--ink-primary); margin-bottom: 0.35rem;">
        ${escapeHtml(ms.title || "")}
      </div>
      <div style="font-size: 0.78rem; color: var(--ink-secondary); line-height: 1.4;">
        <div><strong>Repository:</strong> ${escapeHtml(ms.library)}</div>
        <div><strong>Era:</strong> ${escapeHtml(ms.century)}</div>
        ${ms.place_writing ? `<div><strong>Origin:</strong> ${escapeHtml(ms.place_writing)}</div>` : ""}
        ${ms.colophon ? `<div style="margin-top: 0.35rem; color: var(--accent-crimson); font-style: italic;">Colophon Recorded</div>` : ""}
      </div>
    `;

    // Render thumbnails grid
    readerThumbnails.innerHTML = ms.pages.map((p, idx) => `
      <div class="thumb-item ${idx === initialPageIndex ? 'active' : ''}" data-index="${idx}">
        <img src="../${p.relative_path}" alt="Page ${p.page_number}" loading="lazy">
        <div class="thumb-label">${escapeHtml(p.canvas_label || `Page ${p.page_number}`)}</div>
      </div>
    `).join("");

    // Attach click handlers to thumbnails
    readerThumbnails.querySelectorAll(".thumb-item").forEach(item => {
      item.addEventListener("click", () => {
        const pageIdx = parseInt(item.dataset.index, 10);
        setReaderPage(pageIdx);
      });
    });

    // Render the gallery (all pages, uncropped); clicking a page opens it in single-page view
    readerGallery.innerHTML = ms.pages.map((p, idx) => `
      <div class="gallery-item" data-index="${idx}" title="Open this page">
        <img src="../${p.relative_path}" alt="Page ${p.page_number}" loading="lazy">
        <div class="gallery-label">${escapeHtml(p.canvas_label || `Page ${p.page_number}`)}</div>
      </div>
    `).join("");
    readerGallery.querySelectorAll(".gallery-item").forEach(item => {
      item.addEventListener("click", () => {
        setGalleryMode(false);
        setReaderPage(parseInt(item.dataset.index, 10));
      });
    });

    setReaderPage(initialPageIndex);
    if (state.reader.galleryMode) setGalleryMode(true);
  }

  // Catalogue record above the reader: time and place of production, script, people, illustrations
  function renderReaderHeader(ms) {
    const field = (label, value) => `
      <div class="rmh-field">
        <div class="rmh-label">${label}</div>
        <div class="rmh-value">${value || '<span class="muted">not recorded</span>'}</div>
      </div>`;
    const heb = s => s ? `<span class="hebrew">${escapeHtml(s)}</span>` : "";

    const date = [ms.date_place ? heb(ms.date_place) : "", ms.century && ms.century !== "Unknown Era" ? escapeHtml(ms.century) : ""]
      .filter(Boolean).join("<br>");
    const ills = readerIllByFolder[folderName(ms)] || [];
    const groups = new Set(ills.map(il => readerClusterOf[il.illustration_id])
      .filter(c => c && c.label.startsWith("repeating")));
    const sharedGroups = [...groups].filter(c => c.n_manuscripts > 1).length;
    const handGroups = new Set(ills.map(il => readerGroupOf[il.illustration_id]).filter(Boolean));
    const illText = ills.length
      ? `${ills.length} found on ${new Set(ills.map(il => il.page_number)).size} pages<br>
         ${handGroups.size ? `${handGroups.size} group${handGroups.size === 1 ? "" : "s"}, ` : ""}${groups.size} cluster${groups.size === 1 ? "" : "s"}${sharedGroups ? `, ${sharedGroups} shared with other manuscripts` : ""}`
      : "";

    const people = (readerPersonsByMs[ms.mms_id] || []);
    const peopleHtml = people.length ? `
      <div class="rmh-people rmh-field">
        <div class="rmh-label">People associated (${people.length})</div>
        <div class="rmh-chips">${people.map(p => `
          <span class="rmh-chip"><span class="name">${escapeHtml(p.name)}</span><span class="role">${escapeHtml(p.role)}</span></span>`).join("")}
        </div>
      </div>` : "";

    const siblings = (recordsByFolder[ms.image_folder] || []).filter(m => m.mms_id !== ms.mms_id);
    const siblingsHtml = siblings.length
      ? `<span>Same physical book as: ${siblings.map(m => `<span class="hebrew">${escapeHtml(m.title || m.mms_id)}</span>`).join(", ")}</span>` : "";

    readerHeader.innerHTML = `
      <div class="rmh-top">
        <div>
          <div class="rmh-shelfmark">${escapeHtml(ms.shelfmark)}</div>
          <div class="rmh-library">${escapeHtml(ms.library)}${ms.library_city ? `, ${escapeHtml(ms.library_city)}` : ""}</div>
        </div>
        <div>
          <div class="rmh-title">${escapeHtml(ms.title || "")}</div>
          ${ms.author ? `<div class="rmh-author">${escapeHtml(ms.author)}</div>` : ""}
        </div>
      </div>
      <div class="rmh-grid">
        ${field("Time of production", date)}
        ${field("Place of writing", heb(ms.place_writing))}
        ${field("Script", heb(ms.script))}
        ${field("Extent", heb(ms.extent) || (ms.downloaded_pages_count ? `${ms.downloaded_pages_count} images` : ""))}
        ${field("Illustrations", illText)}
        ${ms.colophon ? field("Colophon", heb(ms.colophon.length > 160 ? ms.colophon.slice(0, 160) + "…" : ms.colophon)) : ""}
      </div>
      ${codexTextsHtml(ms.mms_id, true)}
      ${peopleHtml}
      <div class="rmh-links">
        ${ms.ktiv_link ? `<a href="${escapeHtml(ms.ktiv_link)}" target="_blank" rel="noopener">Open in Ktiv ↗</a>` : ""}
        <span style="color: var(--ink-dim); font-family: var(--font-mono);">MMS ${escapeHtml(ms.mms_id)}</span>
        ${siblingsHtml}
      </div>
    `;
  }

  // Illustrations of this manuscript below the reader, each with its page and similarity group
  function renderReaderIllustrations(ms) {
    const all = (readerIllByFolder[folderName(ms)] || []).slice()
      .sort((a, b) => parseInt(a.page_number, 10) - parseInt(b.page_number, 10));
    if (!all.length) {
      readerIllPanel.innerHTML = `<div class="rip-head"><span class="rip-title">Illustrations</span></div>
        <p class="empty-note">No illustrations were detected in this manuscript.</p>`;
      return;
    }
    const currentPage = ms.pages[state.reader.activePageIndex];
    const shown = state.reader.illOnlyThisPage && currentPage
      ? all.filter(il => parseInt(il.page_number, 10) === parseInt(currentPage.page_number, 10))
      : all;

    const groupBadge = il => {
      const g = readerGroupOf[il.illustration_id];
      if (g) return `<button class="rip-group across" data-ugroup="${escapeHtml(g.key)}"
                  title="Show this group in the Groups tab">${escapeHtml(g.name || `Group ${g.key}`)}</button>`;
      const c = readerClusterOf[il.illustration_id];
      if (!c) return "";
      if (c.label.startsWith("repeating")) {
        const across = c.n_manuscripts > 1;
        return `<button class="rip-group ${across ? "across" : "within"}" data-cluster="${c.cluster_id}"
                  title="Show this cluster in the Clusters tab">Cluster ${c.cluster_id} · ${across ? `${c.n_manuscripts} mss` : "this ms only"}</button>`;
      }
      return `<span class="rip-group">${c.cluster_id === 0 ? "no close match" : "not compared"}</span>`;
    };

    readerIllPanel.innerHTML = `
      <div class="rip-head">
        <div>
          <span class="rip-title">Illustrations in this manuscript</span>
          <span class="rip-sub">&nbsp;${all.length} found · click one to open its page · click a group to see similar illustrations</span>
        </div>
        <label class="rip-toggle"><input type="checkbox" id="rip-only-page" ${state.reader.illOnlyThisPage ? "checked" : ""}> Only the current page</label>
      </div>
      <div class="rip-grid">
        ${shown.length ? shown.map(il => `
          <div class="rip-card" data-page="${parseInt(il.page_number, 10)}" title="Open page ${escapeHtml(il.page_number)}">
            <div class="ill-thumb"><img src="../${escapeHtml(il.crop_file)}" alt="${escapeHtml(il.class)}" loading="lazy"></div>
            <div class="rip-caption">
              <div><span class="rip-page">p. ${parseInt(il.page_number, 10)}</span> <span class="rip-class">· ${escapeHtml(il.class)}</span></div>
              ${groupBadge(il)}
            </div>
          </div>`).join("") : `<p class="empty-note">No illustrations on this page.</p>`}
      </div>
    `;

    document.getElementById("rip-only-page").addEventListener("change", e => {
      state.reader.illOnlyThisPage = e.target.checked;
      renderReaderIllustrations(ms);
    });
    readerIllPanel.querySelectorAll(".rip-card").forEach(card => {
      card.addEventListener("click", e => {
        if (e.target.closest(".rip-group")) return;
        const idx = ms.pages.findIndex(p => parseInt(p.page_number, 10) === parseInt(card.dataset.page, 10));
        if (idx < 0) return;
        if (state.reader.galleryMode) setGalleryMode(false);
        setReaderPage(idx);
        document.querySelector(".reader-main-stage").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    readerIllPanel.querySelectorAll("button.rip-group").forEach(btn => {
      btn.addEventListener("click", () => btn.dataset.ugroup ? openUserGroup(btn.dataset.ugroup) : goToCluster(btn.dataset.cluster));
    });
    markPageIllustrations();
  }

  function markPageIllustrations() {
    const ms = downloadedManuscripts.find(m => m.mms_id === state.reader.activeMmsId);
    const page = ms && ms.pages[state.reader.activePageIndex];
    readerIllPanel.querySelectorAll(".rip-card").forEach(card => {
      card.classList.toggle("on-page", !!page && parseInt(card.dataset.page, 10) === parseInt(page.page_number, 10));
    });
  }

  function goToCluster(clusterId) {
    openClusterDetail(clusterId);
  }

  // Zoom by resizing the image (not CSS scale), so the scrollbars can reach every part of a zoomed page
  function applyZoom() {
    const zoom = state.reader.zoomLevel;
    if (zoom === 1 || !readerMainImg.naturalWidth) {
      readerMainImg.classList.remove("zoomed");
      readerMainImg.style.width = "";
      return;
    }
    const style = getComputedStyle(readerViewport);
    const availW = readerViewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = readerViewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const fitWidth = Math.min(availW, availH * readerMainImg.naturalWidth / readerMainImg.naturalHeight,
                              readerMainImg.naturalWidth);
    readerMainImg.classList.add("zoomed");
    readerMainImg.style.width = `${Math.round(fitWidth * zoom)}px`;
  }
  readerMainImg.addEventListener("load", applyZoom);

  function setGalleryMode(on) {
    state.reader.galleryMode = on;
    readerGallery.hidden = !on;
    readerViewport.hidden = on;
    readerViewport.style.display = on ? "none" : "";
    btnViewToggle.textContent = on ? "Single page" : "Gallery view";
    btnViewToggle.title = on ? "Back to one page at a time (G)" : "Show all pages at once (G)";
    btnPrev.style.display = btnNext.style.display = on ? "none" : "";
    btnZoomIn.title = on ? "Bigger thumbnails" : "Zoom in";
    btnZoomOut.title = on ? "Smaller thumbnails" : "Zoom out";
    const ms = downloadedManuscripts.find(m => m.mms_id === state.reader.activeMmsId);
    if (on && ms) {
      readerActiveInfo.textContent = `All ${ms.pages.length} pages - click a page to open it`;
      readerGallery.style.setProperty("--gallery-size", `${state.reader.gallerySize}px`);
      const active = readerGallery.querySelector(`.gallery-item[data-index="${state.reader.activePageIndex}"]`);
      readerGallery.querySelectorAll(".gallery-item").forEach(g => g.classList.toggle("active", g === active));
      if (active) active.scrollIntoView({ block: "center" });
    } else {
      setReaderPage(state.reader.activePageIndex);
    }
  }

  btnViewToggle.addEventListener("click", () => setGalleryMode(!state.reader.galleryMode));

  // Drag the zoomed page with the mouse to move around it
  let drag = null;
  readerViewport.addEventListener("mousedown", e => {
    drag = { x: e.clientX, y: e.clientY, left: readerViewport.scrollLeft, top: readerViewport.scrollTop };
    readerViewport.classList.add("dragging");
    e.preventDefault();
  });
  window.addEventListener("mousemove", e => {
    if (!drag) return;
    readerViewport.scrollLeft = drag.left - (e.clientX - drag.x);
    readerViewport.scrollTop = drag.top - (e.clientY - drag.y);
  });
  window.addEventListener("mouseup", () => {
    drag = null;
    readerViewport.classList.remove("dragging");
  });

  function setReaderPage(index) {
    const ms = downloadedManuscripts.find(m => m.mms_id === state.reader.activeMmsId);
    if (!ms || !ms.pages[index]) return;

    state.reader.activePageIndex = index;
    const page = ms.pages[index];

    readerMainImg.src = `../${page.relative_path}`;
    applyZoom();
    if (state.reader.illOnlyThisPage) renderReaderIllustrations(ms);
    else markPageIllustrations();

    readerActiveInfo.textContent = `${page.canvas_label || `Page ${page.page_number}`} (${page.file_name})`;
    readerCounter.textContent = `${index + 1} / ${ms.pages.length}`;

    // Highlight thumbnail
    readerThumbnails.querySelectorAll(".thumb-item").forEach((thumb, idx) => {
      thumb.classList.toggle("active", idx === index);
      if (idx === index) {
        thumb.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    // Button states
    btnPrev.disabled = index <= 0;
    btnNext.disabled = index >= ms.pages.length - 1;
  }

  // Reader Controls
  readerSelect.addEventListener("change", e => {
    loadManuscriptIntoReader(e.target.value, 0);
  });

  btnPrev.addEventListener("click", () => {
    if (state.reader.activePageIndex > 0) {
      setReaderPage(state.reader.activePageIndex - 1);
    }
  });

  btnNext.addEventListener("click", () => {
    const ms = downloadedManuscripts.find(m => m.mms_id === state.reader.activeMmsId);
    if (ms && state.reader.activePageIndex < ms.pages.length - 1) {
      setReaderPage(state.reader.activePageIndex + 1);
    }
  });

  function setGallerySize(px) {
    state.reader.gallerySize = Math.max(120, Math.min(600, px));
    readerGallery.style.setProperty("--gallery-size", `${state.reader.gallerySize}px`);
  }

  btnZoomIn.addEventListener("click", () => {
    if (state.reader.galleryMode) return setGallerySize(state.reader.gallerySize + 60);
    state.reader.zoomLevel = Math.min(4, state.reader.zoomLevel + 0.25);
    applyZoom();
  });

  btnZoomOut.addEventListener("click", () => {
    if (state.reader.galleryMode) return setGallerySize(state.reader.gallerySize - 60);
    state.reader.zoomLevel = Math.max(0.5, state.reader.zoomLevel - 0.25);
    applyZoom();
  });

  btnZoomReset.addEventListener("click", () => {
    if (state.reader.galleryMode) return setGallerySize(220);
    state.reader.zoomLevel = 1.0;
    applyZoom();
  });

  window.addEventListener("resize", applyZoom);

  // Keyboard navigation for reader
  window.addEventListener("keydown", e => {
    if (state.activeTab === "tab-reader") {
      if (e.key === "ArrowLeft") {
        btnPrev.click();
      } else if (e.key === "ArrowRight") {
        btnNext.click();
      } else if (e.key === "+" || e.key === "=") {
        btnZoomIn.click();
      } else if (e.key === "-") {
        btnZoomOut.click();
      } else if (e.key === "0") {
        btnZoomReset.click();
      } else if ((e.key === "g" || e.key === "G") && !["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) {
        btnViewToggle.click();
      }
    }
  });

  // -----------------------------------------------------------
  // 4. Tab 3: Prosopography & Persons Directory
  // -----------------------------------------------------------
  const personsSearch = document.getElementById("persons-search");
  const personsCount = document.getElementById("persons-count");
  const personsRole = document.getElementById("persons-role");
  const personsBody = document.getElementById("persons-table-body");

  [...new Set(data.persons.map(p => p.role))].sort().forEach(role => {
    const opt = document.createElement("option");
    opt.value = role;
    opt.textContent = `${role} (${data.persons.filter(p => p.role === role).length})`;
    personsRole.appendChild(opt);
  });

  function renderPersons() {
    const q = state.personsSearch.toLowerCase();
    const filtered = data.persons.filter(p => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (state.personsRoleFilter && p.role !== state.personsRoleFilter) return false;
      return true;
    });

    personsCount.textContent = filtered.length;
    renderPersonsViz(filtered);
    sortRows(filtered, state.personsSort, (p, key) => p[key]);

    personsBody.innerHTML = filtered.length ? filtered.map(p => {
      const key = `${p.name}|${p.role}`;
      const open = state.personsOpen === key;
      return `
        <tr class="clickable-row ${open ? "open" : ""}" data-key="${escapeHtml(key)}" title="Show this person's manuscripts">
          <td class="cell-person" dir="auto">${escapeHtml(p.name)}</td>
          <td><span class="person-role-badge">${escapeHtml(p.role)}</span>${p.dates ? ` <span class="person-dates">${escapeHtml(p.dates)}</span>` : ""}</td>
          <td class="num">${p.count}</td>
          <td class="cell-toggle">${open ? "▾" : "▸"}</td>
        </tr>
        ${open ? `
        <tr class="detail-row"><td colspan="4">
          <ul class="person-ms-list">
            ${p.manuscripts.map(id => msById[id]).filter(Boolean).map(m => `
              <li>
                <button class="link-btn btn-person-ms" data-mms="${m.mms_id}">${escapeHtml(m.shelfmark || m.mms_id)}</button>
                <span class="person-ms-meta">${escapeHtml(m.library)} · ${escapeHtml(m.century.replace(/ \(.*\)/, ""))}</span>
                ${m.has_local_images ? `<span class="status-pill downloaded">facsimile</span>` : ""}
              </li>`).join("")}
          </ul>
          <button class="btn-secondary btn-person-filter" data-name="${escapeHtml(p.name)}">Show these in the Catalogue</button>
        </td></tr>` : ""}
      `;
    }).join("") : `<tr><td colspan="4" class="table-empty"><p>No persons match your search.</p></td></tr>`;

    personsBody.querySelectorAll(".clickable-row").forEach(row => {
      row.addEventListener("click", () => {
        state.personsOpen = state.personsOpen === row.dataset.key ? null : row.dataset.key;
        renderPersons();
      });
    });
    personsBody.querySelectorAll(".btn-person-ms").forEach(btn => {
      btn.addEventListener("click", () => openManuscriptModal(btn.dataset.mms));
    });
    personsBody.querySelectorAll(".btn-person-filter").forEach(btn => {
      btn.addEventListener("click", () => {
        state.catalogueFilters.search = btn.dataset.name;
        catalogueSearch.value = btn.dataset.name;
        switchTab("tab-catalogue");
        renderCatalogue();
      });
    });
  }

  // ---- When and where (timeline + map) for the persons that pass the search / role filter ----
  const ROLE_COLOUR = { "Author": "#8e283b", "Author (attributed)": "#8e283b", "Author of an included text": "#c0596b",
    "Translator": "#b07d2b", "Scribe": "#2f7a4b", "Annotator": "#4d8f6b", "Compiler": "#4d8f6b",
    "Former owner": "#3a5f9e", "Censor": "#6b4a9e", "Signatory": "#3a5f9e", "Addressee": "#3a5f9e" };
  const roleColour = r => ROLE_COLOUR[r] || "#8a8f98";
  // roles that put a person where the physical copy was: the place of writing says something about them.
  // Authors and translators are left out of that map: a copy of their work says where it was copied, not where they lived.
  const HANDS_ON = new Set(["Scribe", "Annotator", "Compiler", "Former owner", "Censor", "Signatory", "Addressee"]);
  let pvShown = [];
  let pvMapMode = "ms";
  let pvMap = null, pvLayer = null;

  function personSpan(p) {
    const ys = [];
    if (p.born !== null) ys.push(p.born);
    if (p.died !== null) ys.push(p.died);
    if (p.floruit_from !== null) ys.push(p.floruit_from, p.floruit_to);
    p.ms.forEach(m => { if (m.year) ys.push(m.year); });
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
  }

  function renderPersonsViz(filtered) {
    const from = +document.getElementById("pv-from").value || -500, to = +document.getElementById("pv-to").value || 2000;
    const limit = +document.getElementById("pv-limit").value;
    const inRange = p => { const s = personSpan(p); return s && s[1] >= from && s[0] <= to; };
    pvShown = filtered.filter(inRange).sort((a, b) => b.count - a.count).slice(0, limit)
      .sort((a, b) => personSpan(a)[0] - personSpan(b)[0]);
    renderPersonsTimeline(pvShown, from, to, filtered.filter(p => !personSpan(p)).length);
    renderPersonsMap();
  }

  function renderPersonsTimeline(list, from, to, undated) {
    const box = document.getElementById("persons-timeline");
    if (!list.length) { box.innerHTML = `<p class="empty-note">No dated persons match.</p>`; return; }
    const W = Math.max(640, box.clientWidth || 900), labelW = 230, rowH = 18, top = 26;
    const x = y => labelW + (Math.max(from, Math.min(to, y)) - from) / (to - from) * (W - labelW - 16);
    const H = top + list.length * rowH + 10;
    const step = (to - from) > 600 ? 100 : 50;
    let ticks = "";
    for (let y = Math.ceil(from / step) * step; y <= to; y += step) {
      ticks += `<line x1="${x(y)}" x2="${x(y)}" y1="${top - 6}" y2="${H}" class="pt-grid"/>
                <text x="${x(y)}" y="${top - 10}" class="pt-tick">${y}</text>`;
    }
    const rows = list.map((p, i) => {
      const y = top + i * rowH + rowH / 2, col = roleColour(p.role);
      let bars = "";
      if (p.born !== null && p.died !== null) {
        bars += `<rect x="${x(p.born)}" y="${y - 4}" width="${Math.max(2, x(p.died) - x(p.born))}" height="8" rx="2" fill="${col}"><title>${escapeHtml(p.dates)}</title></rect>`;
      } else if (p.floruit_from !== null) {
        bars += `<rect x="${x(p.floruit_from)}" y="${y - 4}" width="${Math.max(2, x(p.floruit_to) - x(p.floruit_from))}" height="8" rx="2" fill="${col}" opacity="0.3"><title>${escapeHtml(p.dates)}</title></rect>`;
      } else if (p.died !== null || p.born !== null) {
        const yr = p.died !== null ? p.died : p.born;
        bars += `<text x="${x(yr)}" y="${y + 4}" class="pt-mark" fill="${col}">${p.died !== null ? "†" : "*"}<title>${escapeHtml(p.dates)}</title></text>`;
      }
      const dots = p.ms.filter(m => m.year && m.year >= from && m.year <= to).map(m =>
        `<circle cx="${x(m.year)}" cy="${y}" r="3.3" fill="${m.year_approx ? "#fff" : col}" stroke="${col}" stroke-width="1.4">
           <title>${escapeHtml(m.shelfmark)} · ${m.year_approx ? "c. " : ""}${m.year}${m.place ? " · " + escapeHtml(m.place) : ""}</title></circle>`).join("");
      return `<g class="pt-row" data-name="${escapeHtml(p.name)}">
        <rect x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}" class="pt-hit"/>
        <text x="${labelW - 8}" y="${y + 4}" class="pt-label" text-anchor="end"><tspan>${escapeHtml(p.name.length > 34 ? p.name.slice(0, 33) + "…" : p.name)}</tspan><title>${escapeHtml(p.name)} · ${escapeHtml(p.role)} · ${p.count} manuscripts</title></text>
        ${bars}${dots}</g>`;
    }).join("");
    const roles = [...new Set(list.map(p => p.role))];
    box.innerHTML = `<div class="pt-legend">${roles.map(r => `<span><i style="background:${roleColour(r)}"></i>${escapeHtml(r)}</span>`).join("")}
        ${undated ? `<span class="muted">${undated} persons without any date are not shown</span>` : ""}</div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" class="pt-svg">${ticks}${rows}</svg>`;
    box.querySelectorAll(".pt-row").forEach(g => g.addEventListener("click", () => {
      personsSearch.value = g.dataset.name;
      state.personsSearch = g.dataset.name;
      renderPersons();
      personsBody.scrollIntoView({ block: "start", behavior: "smooth" });
    }));
  }

  function renderPersonsMap() {
    const el = document.getElementById("persons-map");
    if (!el.offsetParent || typeof L === "undefined") return;     // tab hidden: drawn when shown
    if (!pvMap) {
      pvMap = L.map(el).setView([46, 12], 4);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 12,
        className: "net-tiles" }).addTo(pvMap);
    }
    if (pvLayer) pvLayer.remove();
    pvLayer = L.layerGroup().addTo(pvMap);
    const byPlace = {};
    let missing = 0;
    pvShown.forEach(p => {
      const pts = pvMapMode === "known" ? p.known_places.map(k => ({ place: k.place, lat: k.lat, lon: k.lon, info: k.kind + (k.from ? ` ${k.from}–${k.to || ""}` : "") }))
        : p.ms.filter(m => m.lat !== null && m.roles.some(r => HANDS_ON.has(r))).map(m => ({ place: m.place, lat: m.lat, lon: m.lon, info: `${m.shelfmark}${m.year ? ", " + (m.year_approx ? "c. " : "") + m.year : ""}` }));
      if (!pts.length) { missing++; return; }
      pts.forEach(pt => {
        const k = pt.lat + "," + pt.lon;
        const e = byPlace[k] = byPlace[k] || { place: pt.place, lat: pt.lat, lon: pt.lon, persons: new Map() };
        if (!e.persons.has(p.name)) e.persons.set(p.name, { p, info: [] });
        e.persons.get(p.name).info.push(pt.info);
      });
    });
    const places = Object.values(byPlace);
    places.forEach(e => {
      const n = e.persons.size;
      const roles = {};
      e.persons.forEach(({ p }) => { roles[p.role] = (roles[p.role] || 0) + 1; });
      const main = Object.entries(roles).sort((a, b) => b[1] - a[1])[0][0];
      L.circleMarker([e.lat, e.lon], { radius: 5 + Math.sqrt(n) * 3.2, color: "#fff", weight: 1.5,
        fillColor: roleColour(main), fillOpacity: 0.85 })
        .bindTooltip(`<strong>${escapeHtml(e.place)}</strong>: ${n} person${n === 1 ? "" : "s"}`)
        .on("click", () => showPlacePersons(e)).addTo(pvLayer);
    });
    document.getElementById("pv-map-note").textContent = pvMapMode === "known"
      ? `${places.length} places · ${pvShown.length - missing} of the ${pvShown.length} persons shown are in the curated file`
      : `${places.length} places · ${pvShown.length - missing} of the ${pvShown.length} persons shown: scribes, owners, censors, annotators with a known place of writing (authors and translators are left out: a copy of their work does not say where they lived)`;
    document.getElementById("persons-map-list").innerHTML = `<p class="clusters-section-note">Click a circle to list its persons. Circle size = number of persons; colour = their most common role.</p>`;
  }

  function showPlacePersons(e) {
    const rows = [...e.persons.values()].sort((a, b) => b.p.count - a.p.count);
    document.getElementById("persons-map-list").innerHTML = `
      <h4 class="pml-title">${escapeHtml(e.place)} <span class="muted">(${rows.length})</span></h4>
      ${rows.map(({ p, info }) => `<div class="pml-row">
        <div dir="auto"><span class="net-dot" style="background:${roleColour(p.role)}"></span> <strong>${escapeHtml(p.name)}</strong></div>
        <div class="muted">${escapeHtml(p.role)}${p.dates ? " · " + escapeHtml(p.dates) : ""}</div>
        <div class="muted pml-info">${escapeHtml([...new Set(info)].join(" · "))}</div></div>`).join("")}`;
  }

  ["pv-from", "pv-to", "pv-limit"].forEach(id => document.getElementById(id).addEventListener("change", renderPersons));
  document.querySelectorAll("#pv-map-mode .chip-btn").forEach(b => b.addEventListener("click", () => {
    pvMapMode = b.dataset.mode;
    document.querySelectorAll("#pv-map-mode .chip-btn").forEach(x => x.classList.toggle("active", x === b));
    renderPersonsMap();
  }));
  document.querySelector('[data-tab="tab-persons"]').addEventListener("click", () => setTimeout(() => {
    renderPersons();
    if (pvMap) pvMap.invalidateSize();
  }, 60));

  personsSearch.addEventListener("input", e => {
    state.personsSearch = e.target.value.trim();
    renderPersons();
  });

  personsRole.addEventListener("change", e => {
    state.personsRoleFilter = e.target.value;
    renderPersons();
  });

  // -----------------------------------------------------------
  // 5. Tab 4: Geographic Map & Timeline (Leaflet)
  // -----------------------------------------------------------
  function initMap() {
    if (state.map.leafletInstance) return;

    // Center on Mediterranean / Europe
    const map = L.map("leaflet-map", {
      center: [45.0, 15.0],
      zoom: 4,
      zoomControl: true
    });

    // Academic OpenStreetMap Base Map
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(map);

    state.map.leafletInstance = map;
    state.map.markersLayer = L.layerGroup().addTo(map);

    renderMapMarkers();
  }

  function renderMapMarkers() {
    if (!state.map.leafletInstance) return;
    state.map.markersLayer.clearLayers();

    const layerType = state.map.layerType;
    const centuryFilter = state.map.activeCentury;

    // Filter places
    const matchingPlaces = data.places.filter(p => p.type === layerType);

    matchingPlaces.forEach(p => {
      // Find manuscripts matching century if active
      let msList = p.manuscripts.map(id => data.manuscripts.find(m => m.mms_id === id)).filter(Boolean);

      if (centuryFilter) {
        msList = msList.filter(m => m.century && m.century.includes(centuryFilter));
      }

      if (msList.length === 0) return;

      // Custom Academic Pin Icon
      const isHolding = layerType === "holding";
      const iconHtml = `<div class="custom-map-icon ${isHolding ? 'holding' : ''}" style="width: 28px; height: 28px;">${msList.length}</div>`;
      const icon = L.divIcon({
        className: "",
        html: iconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([p.lat, p.lon], { icon: icon });

      marker.bindTooltip(`<strong>${p.label}</strong><br>${msList.length} manuscript${msList.length > 1 ? 's' : ''}`, {
        direction: "top"
      });

      marker.on("click", () => {
        showPlaceDetails(p, msList);
      });

      state.map.markersLayer.addLayer(marker);
    });
  }

  function showPlaceDetails(place, msList) {
    const placeTitle = document.getElementById("map-place-title");
    const placeDesc = document.getElementById("map-place-desc");
    const placeMsList = document.getElementById("map-place-ms-list");

    placeTitle.textContent = place.label;
    placeDesc.innerHTML = `
      <strong>${msList.length}</strong> manuscript${msList.length > 1 ? 's' : ''} associated with this center as 
      <em>${place.type === 'writing' ? 'Place of Copying / Origin' : 'Modern Holding Repository'}</em>:
    `;

    placeMsList.innerHTML = msList.map(m => `
      <div style="background: var(--bg-subtle); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.75rem;">
        <div style="font-family: var(--font-mono); font-size: 0.78rem; font-weight: 600; color: var(--accent-navy);">
          ${escapeHtml(m.shelfmark)}
        </div>
        <div style="font-family: var(--font-hebrew); font-size: 0.95rem; font-weight: 700; direction: rtl; text-align: right; margin: 0.2rem 0;">
          ${escapeHtml(m.title || "ללא כותר")}
        </div>
        <div style="font-size: 0.76rem; color: var(--ink-secondary); margin-bottom: 0.4rem;">
          ${escapeHtml(m.century)} · ${escapeHtml(m.library)}
        </div>
        <div style="display: flex; gap: 0.4rem;">
          ${m.has_local_images ? `
            <button class="btn-primary btn-mini-reader" data-mms="${m.mms_id}" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;">
              Read
            </button>
          ` : ""}
          <button class="btn-secondary btn-mini-modal" data-mms="${m.mms_id}" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;">
            Details
          </button>
        </div>
      </div>
    `).join("");

    placeMsList.querySelectorAll(".btn-mini-reader").forEach(btn => {
      btn.onclick = () => openManuscriptInReader(btn.dataset.mms);
    });

    placeMsList.querySelectorAll(".btn-mini-modal").forEach(btn => {
      btn.onclick = () => openManuscriptModal(btn.dataset.mms);
    });
  }

  // Map Controls
  const btnMapWriting = document.getElementById("btn-map-writing");
  const btnMapHolding = document.getElementById("btn-map-holding");

  btnMapWriting.addEventListener("click", () => {
    state.map.layerType = "writing";
    btnMapWriting.classList.add("active");
    btnMapHolding.classList.remove("active");
    renderMapMarkers();
  });

  btnMapHolding.addEventListener("click", () => {
    state.map.layerType = "holding";
    btnMapHolding.classList.add("active");
    btnMapWriting.classList.remove("active");
    renderMapMarkers();
  });

  document.querySelectorAll("#map-timeline-buttons .chip-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#map-timeline-buttons .chip-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.map.activeCentury = btn.dataset.century;
      renderMapMarkers();
    });
  });

  // -----------------------------------------------------------
  // 6. Tab 5: Search Queries Matrix
  // -----------------------------------------------------------
  const queriesContainer = document.getElementById("queries-matrix-container");
  if (queriesContainer) {
    queriesContainer.innerHTML = Object.keys(data.query_terms).map(q => {
      const count = data.query_terms[q];
      const label = queryLabels[q] || q;
      return `
        <div class="query-card">
          <div>
            <h3>${escapeHtml(q)}</h3>
            <div style="font-family: var(--font-serif-text); font-style: italic; color: var(--ink-secondary); margin-bottom: 0.6rem;">
              ${escapeHtml(label)}
            </div>
            <div style="font-size: 0.88rem; color: var(--ink-muted); margin-bottom: 1rem;">
              Harvested <strong>${count}</strong> catalog records in Alma.
            </div>
          </div>
          <button class="btn-secondary btn-apply-query" data-query="${escapeHtml(q)}">
            Filter Catalogue by this Query (${count})
          </button>
        </div>
      `;
    }).join("");

    queriesContainer.querySelectorAll(".btn-apply-query").forEach(btn => {
      btn.addEventListener("click", () => {
        const q = btn.dataset.query;
        state.catalogueFilters.queryTerm = q;
        document.querySelectorAll("#query-chips .chip-btn").forEach(c => {
          c.classList.toggle("active", c.textContent.includes(q));
        });
        switchTab("tab-catalogue");
        renderCatalogue();
      });
    });
  }

  // -----------------------------------------------------------
  // 7. Modal: Detailed Scholarly Manuscript Record
  // -----------------------------------------------------------
  const modal = document.getElementById("ms-modal");
  const modalClose = document.getElementById("modal-close");
  const modalBody = document.getElementById("modal-body");

  // Texts in the physical manuscript, as the catalogue record gives them: the numbered contents list
  // (folios + author + title) when the record has one, else the titles of the record and its added titles (740).
  function codexTextsHtml(mmsId, compact) {
    const ms = msById[mmsId];
    const c = ms && (data.codices || []).find(x => x.records.includes(mmsId));
    if (!c) return "";
    const items = (c.contents || "").split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean).map(x => {
      const m = /^(\d+)\)\s*(?:(דף[^:]*|דפים[^:]*|f\.[^:]*|ff\.[^:]*):\s*)?(.*)$/.exec(x);
      return m ? { n: m[1], folios: (m[2] || "").trim(), text: m[3].replace(/\.$/, "") } : { n: "", folios: "", text: x };
    });
    const others = c.records.length > 1 ? `<div class="ct-note">One physical book described by ${c.records.length} catalogue records; texts of all of them are listed.</div>` : "";
    if (items.length) {
      return `<div class="codex-texts ${compact ? "compact" : ""}">
        <div class="ct-head">Texts in this manuscript (${items.length}) <span class="ct-src">from the catalogue's contents list</span></div>
        <ol class="ct-list">${items.map(it => `<li><span class="ct-text">${escapeHtml(it.text)}</span>${it.folios ? `<span class="ct-fol">${escapeHtml(it.folios)}</span>` : ""}</li>`).join("")}</ol>
        ${others}</div>`;
    }
    if (c.texts && c.texts.length) {
      return `<div class="codex-texts ${compact ? "compact" : ""}">
        <div class="ct-head">Texts in this manuscript (${c.texts.length}) <span class="ct-src">from the record's titles; no contents list in the catalogue</span></div>
        <div class="ct-chips">${c.texts.map(t => `<span class="ct-chip">${escapeHtml(t)}</span>`).join("")}</div>
        ${others}</div>`;
    }
    return "";
  }

  function openManuscriptModal(mmsId) {
    const ms = data.manuscripts.find(m => m.mms_id === mmsId);
    if (!ms) return;

    modalBody.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; gap: 1rem;">
        <div>
          <span class="ms-shelfmark-badge" style="font-size: 0.95rem;">${escapeHtml(ms.shelfmark)}</span>
          <h2 style="font-family: var(--font-hebrew); font-size: 1.6rem; font-weight: 700; direction: rtl; text-align: right; color: var(--ink-primary); margin-top: 0.5rem;">
            ${escapeHtml(ms.title || "ללא כותר עברי")}
          </h2>
          ${ms.author ? `<div style="font-family: var(--font-serif-text); font-size: 1.05rem; font-style: italic; color: var(--ink-secondary);">${escapeHtml(ms.author)}</div>` : ""}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; background: var(--bg-subtle); padding: 1rem 1.25rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem; border: 1px solid var(--border-color); font-size: 0.85rem;">
        <div><strong>Holding Library:</strong><br>${escapeHtml(ms.library)}</div>
        <div><strong>Current City:</strong><br>${escapeHtml(ms.library_city || "Not Recorded")}</div>
        <div><strong>Historical Era:</strong><br>${escapeHtml(ms.century)}</div>
        <div><strong>Place of Origin:</strong><br>${escapeHtml(ms.place_writing || "Unknown")}</div>
        <div><strong>Script & Hand:</strong><br>${escapeHtml(ms.script)}</div>
        <div><strong>Extent & Format:</strong><br>${escapeHtml(ms.extent || "Not Recorded")}</div>
      </div>

      ${codexTextsHtml(ms.mms_id)}

      ${ms.colophon ? `
        <div style="margin-bottom: 1.25rem;">
          <h4 style="font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent-crimson); margin-bottom: 0.4rem;">
            Scribe's Colophon (קולופון המעתיק):
          </h4>
          <div class="scholarly-blockquote">${escapeHtml(ms.colophon)}</div>
        </div>
      ` : ""}

      ${ms.added_names ? `
        <div style="margin-bottom: 1rem; font-size: 0.85rem;">
          <strong>Associated Persons, Scribes & Translators:</strong><br>
          <span style="color: var(--ink-secondary);">${escapeHtml(ms.added_names)}</span>
        </div>
      ` : ""}

      ${ms.notes ? `
        <div style="margin-bottom: 1rem; font-size: 0.85rem;">
          <strong>Cataloguer's Notes:</strong><br>
          <span style="color: var(--ink-secondary); line-height: 1.5;">${escapeHtml(ms.notes)}</span>
        </div>
      ` : ""}

      ${ms.subjects ? `
        <div style="margin-bottom: 1.25rem; font-size: 0.82rem;">
          <strong>Subject Headings:</strong><br>
          <span style="color: var(--ink-muted);">${escapeHtml(ms.subjects)}</span>
        </div>
      ` : ""}

      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 1.25rem; margin-top: 1.5rem; flex-wrap: wrap; gap: 0.75rem;">
        <div style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--ink-muted);">
          MMS ID: ${escapeHtml(ms.mms_id)}
        </div>
        <div style="display: flex; gap: 0.6rem;">
          ${ms.has_local_images ? `
            <button class="btn-primary" id="modal-btn-read" data-mms="${ms.mms_id}">
              Open in Facsimile Reader
            </button>
          ` : ""}
          ${ms.manifest_url ? `
            <a href="${ms.manifest_url}" target="_blank" rel="noopener noreferrer" class="btn-secondary" title="View IIIF v2.1 JSON Manifest">
              IIIF Manifest
            </a>
          ` : ""}
          ${ms.ktiv_link ? `
            <a href="${ms.ktiv_link}" target="_blank" rel="noopener noreferrer" class="btn-secondary">
              View on Ktiv Portal
            </a>
          ` : ""}
        </div>
      </div>
    `;

    const modalBtnRead = document.getElementById("modal-btn-read");
    if (modalBtnRead) {
      modalBtnRead.onclick = () => {
        closeManuscriptModal();
        openManuscriptInReader(ms.mms_id);
      };
    }

    modal.classList.add("open");
  }

  function closeManuscriptModal() {
    modal.classList.remove("open");
  }

  modalClose.addEventListener("click", closeManuscriptModal);
  modal.addEventListener("click", e => {
    if (e.target === modal) closeManuscriptModal();
  });
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      closeManuscriptModal();
    }
  });

  // -----------------------------------------------------------
  // 8. Tab 6: Illustrations (crops extracted in step 4)
  // -----------------------------------------------------------
  const illustrations = data.illustrations || [];
  const illById = Object.fromEntries(illustrations.map(il => [il.illustration_id, il]));
  const msById = Object.fromEntries(data.manuscripts.map(m => [m.mms_id, m]));
  const illFilterMs = document.getElementById("ill-filter-ms");
  const illFilterClass = document.getElementById("ill-filter-class");
  const illGrid = document.getElementById("ill-grid");

  // cluster id per illustration, and the groups themselves (step 5; may be absent)
  const clusterGroups = (data.clusters && data.clusters.clusters) || [];
  const clusterOf = {};
  clusterGroups.forEach(c => c.illustration_ids.forEach(id => { clusterOf[id] = c; }));

  function shelfmarkOf(mmsId) {
    const ms = msById[mmsId];
    return ms ? ms.shelfmark.split(" | ")[0] : mmsId;
  }

  function illustrationCard(il) {
    return `
      <div class="ill-card" data-id="${escapeHtml(il.illustration_id)}" title="Open page ${escapeHtml(il.page_number)} in the reader">
        <div class="ill-thumb"><img src="../${escapeHtml(il.crop_file)}" alt="${escapeHtml(il.class)}" loading="lazy"></div>
        <div class="ill-caption">
          <div class="ill-shelfmark">${escapeHtml(shelfmarkOf(il.mms_id))}</div>
          <div class="ill-meta">p. ${escapeHtml(il.page_number)} · ${escapeHtml(il.class)}</div>
        </div>
      </div>
    `;
  }

  function openIllustrationPage(id) {
    const il = illById[id];
    const ms = il && downloadedManuscripts.find(m => m.mms_id === il.mms_id);
    if (!ms) return;
    const pageIndex = ms.pages.findIndex(p => String(p.page_number) === String(parseInt(il.page_number, 10)));
    openManuscriptInReader(ms.mms_id, Math.max(pageIndex, 0));
  }

  function attachIllustrationClicks(container) {
    container.querySelectorAll(".ill-card").forEach(card => {
      card.addEventListener("click", () => openIllustrationPage(card.dataset.id));
    });
  }

  [...new Set(illustrations.map(il => il.mms_id))].forEach(mmsId => {
    const opt = document.createElement("option");
    opt.value = mmsId;
    opt.textContent = `${shelfmarkOf(mmsId)} (${illustrations.filter(il => il.mms_id === mmsId).length})`;
    illFilterMs.appendChild(opt);
  });
  [...new Set(illustrations.map(il => il.class))].sort().forEach(cls => {
    const opt = document.createElement("option");
    opt.value = cls;
    opt.textContent = `${cls} (${illustrations.filter(il => il.class === cls).length})`;
    illFilterClass.appendChild(opt);
  });

  function renderIllustrations() {
    const shown = illustrations.filter(il =>
      (!illFilterMs.value || il.mms_id === illFilterMs.value) &&
      (!illFilterClass.value || il.class === illFilterClass.value));
    document.getElementById("ill-count").textContent = shown.length;
    document.getElementById("ill-total").textContent = illustrations.length;
    illGrid.innerHTML = shown.length
      ? shown.map(illustrationCard).join("")
      : `<p class="empty-note">No illustrations yet. Run code/04_extract_illustrations.py and rebuild.</p>`;
    attachIllustrationClicks(illGrid);
  }

  illFilterMs.addEventListener("change", renderIllustrations);
  illFilterClass.addEventListener("change", () => { renderIllustrations(); renderIllOverview(); });

  // -----------------------------------------------------------
  // 9. Tab 7: Clusters (repeating illustrations from step 5)
  // -----------------------------------------------------------
  // Physical manuscripts (codices) from step 3: several catalogue records can describe one book
  const codices = data.codices || [];
  const codexById = Object.fromEntries(codices.map(c => [c.codex_id, c]));
  function codexOfMms(mmsId) {
    const ms = msById[mmsId];
    return ms && codexById[ms.codex_id] ? codexById[ms.codex_id]
      : { codex_id: mmsId, shelfmark: shelfmarkOf(mmsId), library: ms ? ms.library : "", library_city: "",
          century: ms ? ms.century : "", year: ms ? ms.year : null, place_writing: ms ? ms.place_writing : "",
          image_record: mmsId, has_images: true, texts: [], records: [mmsId] };
  }
  const codexOfIll = il => codexOfMms(il.mms_id);
  // a date for plotting: the catalogue year, else the middle of the recorded century
  function codexYear(c) {
    if (c.year) return c.year;
    const m = /\((\d{4})\D+(\d{4})\)/.exec(c.century || "");
    return m ? Math.round((+m[1] + +m[2]) / 2) : null;
  }
  const shortCentury = c => {
    const m = /^(\d+\w+) Century/.exec(c.century || "");
    return c.year ? String(c.year) : (m ? `${m[1]} c.` : "undated");
  };
  const codexLabel = c => c.shelfmark.split(" | ")[0];
  const codexPlace = c => (c.place_writing || "").split("|")[0].trim();

  // codices per repeating group
  const repGroups = clusterGroups.filter(c => c.label.startsWith("repeating"));
  const groupCodices = {};
  clusterGroups.forEach(c => {
    groupCodices[c.cluster_id] = [...new Set(c.illustration_ids.map(id => illById[id]).filter(Boolean)
      .map(il => codexOfIll(il).codex_id))];
  });
  const nCodices = c => (groupCodices[c.cluster_id] || []).length;
  const exampleOf = c => illById[c.example_id] || illById[c.illustration_ids[0]];

  function clusterTile(c) {
    const ex = exampleOf(c);
    const mss = (groupCodices[c.cluster_id] || []).map(id => codexLabel(codexById[id] || codexOfMms(id)));
    const name = c.label.startsWith("repeating") ? `Cluster ${c.cluster_id}` : c.label.replace(" (not compared)", "");
    return `
      <div class="cluster-tile" data-cluster="${c.cluster_id}" title="Open this group">
        <div class="ill-thumb">${ex ? `<img src="../${escapeHtml(ex.crop_file)}" alt="${escapeHtml(name)}" loading="lazy">` : ""}</div>
        <div class="cluster-tile-caption">
          <div class="cluster-tile-name">${escapeHtml(name)}</div>
          <div class="cluster-tile-counts">${c.illustration_ids.length} illustrations · ${mss.length} manuscript${mss.length === 1 ? "" : "s"}</div>
          <div class="cluster-tile-mss" title="${escapeHtml(mss.join(", "))}">${escapeHtml(mss.join(" · "))}</div>
        </div>
      </div>`;
  }

  function attachTileClicks(container) {
    container.querySelectorAll(".cluster-tile").forEach(t => {
      t.addEventListener("click", () => openClusterDetail(t.dataset.cluster));
    });
  }

  function msChip(c) {
    const place = codexPlace(c);
    return `<span class="ms-chip">${escapeHtml(codexLabel(c))} <span class="muted">· ${escapeHtml(shortCentury(c))}${place ? ` · ${escapeHtml(place)}` : ""}</span></span>`;
  }

  // One group in full: its manuscripts and every illustration in it
  function openClusterDetail(clusterId) {
    const c = clusterGroups.find(g => String(g.cluster_id) === String(clusterId));
    if (!c) return;
    switchTab("tab-clusters");
    const detail = document.getElementById("cluster-detail");
    const mss = (groupCodices[c.cluster_id] || []).map(id => codexById[id] || codexOfMms(id))
      .sort((a, b) => (codexYear(a) || 9999) - (codexYear(b) || 9999));
    const name = c.label.startsWith("repeating") ? `Cluster ${c.cluster_id}` : c.label;
    detail.innerHTML = `
      <div class="cluster-detail-head">
        <span class="cluster-detail-title">${escapeHtml(name)}</span>
        <span class="cluster-counts">${c.illustration_ids.length} illustrations · ${mss.length} manuscript${mss.length === 1 ? "" : "s"}</span>
        <button class="btn-quiet" id="cluster-detail-close">Close ✕</button>
      </div>
      <div class="cluster-ms-list">${mss.map(msChip).join("")}</div>
      ${clusterTimeAndPlace(mss)}
      <div class="ill-grid compact">${c.illustration_ids.map(id => illById[id]).filter(Boolean).map(illustrationCard).join("")}</div>
    `;
    detail.hidden = false;
    attachIllustrationClicks(detail);
    document.getElementById("cluster-detail-close").addEventListener("click", () => { detail.hidden = true; });
    requestAnimationFrame(() => requestAnimationFrame(() => detail.scrollIntoView({ block: "start" })));
  }

  function barRows(items, max, gold) {
    return items.map(([label, value, title]) => `
      <div class="bar-row" title="${escapeHtml(title || label)}">
        <span class="bar-label">${escapeHtml(label)}</span>
        <span class="bar-track"><span class="bar-fill ${gold ? "gold" : ""}" style="width: ${max ? Math.max(2, 100 * value / max) : 0}%; display: block;"></span></span>
        <span class="bar-value">${value}</span>
      </div>`).join("");
  }

  // clusters.json: id 0 = "other (no close match)", "repeating group N" = groups above the
  // similarity threshold, "... (not compared)" = classes left out of the comparison.
  function renderClusters() {
    const summary = document.getElementById("clusters-summary");
    const body = document.getElementById("clusters-body");
    if (!clusterGroups.length) {
      summary.innerHTML = `<p class="empty-note">No clusters yet. Run code/05_cluster_illustrations.py and rebuild.</p>`;
      return;
    }

    const other = clusterGroups.find(c => c.cluster_id === 0) || { illustration_ids: [] };
    const notCompared = clusterGroups.filter(c => c.label.endsWith("(not compared)"));
    const across = repGroups.filter(c => nCodices(c) > 1)
      .sort((a, b) => nCodices(b) - nCodices(a) || b.illustration_ids.length - a.illustration_ids.length);
    const within = repGroups.filter(c => nCodices(c) <= 1)
      .sort((a, b) => b.illustration_ids.length - a.illustration_ids.length);
    const nClustered = repGroups.reduce((n, c) => n + c.illustration_ids.length, 0);
    const nCompared = nClustered + other.illustration_ids.length;
    const pct = nCompared ? Math.round(100 * nClustered / nCompared) : 0;
    const threshold = data.clusters.similarity_threshold;

    // how many manuscripts each shared group spans
    const spread = {};
    across.forEach(c => { const k = Math.min(nCodices(c), 6); spread[k] = (spread[k] || 0) + 1; });
    const spreadRows = Object.keys(spread).sort((a, b) => a - b)
      .map(k => [`${k}${k === "6" ? "+" : ""} manuscripts`, spread[k]]);
    // manuscripts that take part in the most shared groups
    const perCodex = {};
    across.forEach(c => groupCodices[c.cluster_id].forEach(id => { perCodex[id] = (perCodex[id] || 0) + 1; }));
    const topCodices = Object.entries(perCodex).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([id, n]) => { const c = codexById[id] || codexOfMms(id); return [`${codexLabel(c)} · ${shortCentury(c)}`, n, `${codexLabel(c)}, ${c.library}`]; });

    summary.innerHTML = `
      <div class="clusters-headline">
        <span class="clusters-big">${nClustered}</span> of ${nCompared} diagrams (${pct}%) were found in clusters of similar diagrams
      </div>
      <div class="clusters-stats">
        <div class="stat-item"><span class="label">Clusters</span> <span class="value">${repGroups.length}</span></div>
        <div class="stat-item"><span class="label">Shared by 2+ manuscripts</span> <span class="value">${across.length}</span></div>
        <div class="stat-item"><span class="label">Within one manuscript</span> <span class="value">${within.length}</span></div>
        <div class="stat-item"><span class="label">No close match</span> <span class="value">${other.illustration_ids.length}</span></div>
      </div>
      <div class="overview-grid">
        <div class="overview-box">
          <h4>How many manuscripts share each cluster</h4>
          ${barRows(spreadRows, Math.max(...spreadRows.map(r => r[1]), 1), true)}
        </div>
        <div class="overview-box">
          <h4>Manuscripts in the most shared clusters</h4>
          ${barRows(topCodices, topCodices.length ? topCodices[0][1] : 1)}
        </div>
      </div>
      <p class="clusters-note">
        Clusters are computed, only for the diagrams that are in none of your named groups (those are in the Groups tab).
        A cluster is formed only when every two diagrams in it are at least
        ${threshold != null ? `<strong>${Math.round(threshold * 100)}%</strong>` : "the chosen level"} similar
        (${escapeHtml(data.clusters.method)}). Each tile shows the cluster's most typical illustration; click it to see the whole cluster.
      </p>
    `;

    const section = (title, note, inner) => `
      <h3 class="clusters-section-title">${title}</h3>
      <p class="clusters-section-note">${note}</p>
      ${inner}
    `;
    body.innerHTML =
      section(`Shared by several manuscripts (${across.length} clusters)`,
              "The same kind of diagram found in two or more manuscripts, most widely shared first.",
              `<div class="cluster-tiles">${across.map(clusterTile).join("")}</div>`) +
      section(`Repeating within one manuscript (${within.length} clusters)`,
              "Similar diagrams that recur inside a single manuscript.",
              `<div class="cluster-tiles">${within.map(clusterTile).join("")}</div>`) +
      (notCompared.length ? section(`Initials, decorations and tables`,
              "Collected by class, not compared for similarity.",
              `<div class="cluster-tiles">${notCompared.map(clusterTile).join("")}</div>`) : "") +
      section(`No close match (${other.illustration_ids.length})`,
              "Diagrams with no other diagram above the similarity level: these appear only once in the corpus.",
              `<button class="btn-quiet" id="show-unmatched">Show all ${other.illustration_ids.length}</button>
               <div id="unmatched-grid" class="ill-grid compact" style="margin-top: 0.8rem;"></div>`);
    attachTileClicks(body);
    document.getElementById("show-unmatched").addEventListener("click", e => {
      const grid = document.getElementById("unmatched-grid");
      grid.innerHTML = other.illustration_ids.map(id => illById[id]).filter(Boolean).map(illustrationCard).join("");
      attachIllustrationClicks(grid);
      e.target.remove();
    });
  }

  // -----------------------------------------------------------
  // Tab: Groups (your named groups from the review tool; an illustration can be in several)
  // -----------------------------------------------------------
  const userGroups = (data.groups || []).map(g => {
    const ills = g.illustration_ids.map(id => illById[id]).filter(Boolean);
    const mss = [...new Set(ills.map(il => codexOfIll(il).codex_id))].map(id => codexById[id] || codexOfMms(id))
      .sort((a, b) => (codexYear(a) || 9999) - (codexYear(b) || 9999));
    return { ...g, ills, mss, label: g.name || `Unnamed group ${g.key}` };
  }).filter(g => g.ills.length)
    .sort((a, b) => (!a.name - !b.name) || a.label.localeCompare(b.label));

  function userGroupTile(g) {
    const ex = g.ills[0];
    const names = g.mss.map(codexLabel);
    return `
      <div class="cluster-tile" data-ugroup="${escapeHtml(g.key)}" title="Open this group">
        <div class="ill-thumb">${ex ? `<img src="../${escapeHtml(ex.crop_file)}" alt="${escapeHtml(g.label)}" loading="lazy">` : ""}</div>
        <div class="cluster-tile-caption">
          <div class="cluster-tile-name">${escapeHtml(g.label)}</div>
          <div class="cluster-tile-counts">${g.ills.length} illustrations · ${g.mss.length} manuscript${g.mss.length === 1 ? "" : "s"}</div>
          <div class="cluster-tile-mss" title="${escapeHtml(names.join(", "))}">${escapeHtml(g.description || names.join(" · "))}</div>
        </div>
      </div>`;
  }

  function openUserGroup(key) {
    const g = userGroups.find(x => x.key === key);
    if (!g) return;
    switchTab("tab-groups");
    const detail = document.getElementById("group-detail");
    detail.innerHTML = `
      <div class="cluster-detail-head">
        <span class="cluster-detail-title">${escapeHtml(g.label)}</span>
        <span class="cluster-counts">${g.ills.length} illustrations · ${g.mss.length} manuscript${g.mss.length === 1 ? "" : "s"}</span>
        <button class="btn-quiet" id="group-detail-close">Close ✕</button>
      </div>
      ${g.description ? `<p class="group-description">${escapeHtml(g.description)}</p>` : ""}
      <div class="cluster-ms-list">${g.mss.map(msChip).join("")}</div>
      ${clusterTimeAndPlace(g.mss)}
      <div class="ill-grid compact">${g.ills.map(illustrationCard).join("")}</div>`;
    detail.hidden = false;
    attachIllustrationClicks(detail);
    document.getElementById("group-detail-close").addEventListener("click", () => { detail.hidden = true; });
    requestAnimationFrame(() => requestAnimationFrame(() => detail.scrollIntoView({ block: "start" })));
  }

  // comparison of the groups: their manuscripts over time (line graph), on a map, and by script (table)
  const groupCompare = { by: "time", pct: true, table: false, links: true, hidden: new Set(), hover: null, map: null };
  // place at country level: "Venice (Italy)" -> "Italy"; a place without a country in brackets stays as it is
  const countryOf = c => { const p = codexPlace(c); if (!p) return null; const m = /\(([^()]+)\)\s*$/.exec(p); return (m ? m[1] : p).split(",")[0].trim(); };
  // coordinates of places of writing (the same as the Geography tab)
  const placeCoords = {};
  (data.places || []).filter(p => p.type === "writing" && p.lat != null).forEach(p => { placeCoords[p.name] = p; });
  const GROUP_COLOURS = ["#4e79a7", "#e15759", "#59a14f", "#f28e2b", "#b07aa1", "#76b7b2", "#edc948", "#ff9da7", "#9c755f",
                         "#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#a6761d", "#17becf", "#bcbd22", "#8c564b", "#393b79", "#637939"];
  const compareGroups = () => userGroups.slice().sort((a, b) => b.mss.length - a.mss.length);
  const groupColour = g => GROUP_COLOURS[compareGroups().indexOf(g) % GROUP_COLOURS.length];
  const visibleGroups = () => compareGroups().filter(g => !groupCompare.hidden.has(g.key));

  // table: rows = groups, columns = categories of one dimension
  function groupComparisonTable(by) {
    const dims = {
      time: { of: c => centuryOf(c), none: "undated", cols: () => corpusCenturies, label: k => `${ordinal(k)}` },
      script: { of: c => scriptOf(c), none: "no script recorded" },
      place: { of: c => countryOf(c), none: "no place recorded" },
    };
    const d = dims[by];
    let cols = d.cols ? d.cols() : null;
    if (!cols) {                               // categories present in the groups, most frequent first
      const tot = {};
      userGroups.forEach(g => g.mss.forEach(c => { const k = d.of(c); if (k) tot[k] = (tot[k] || 0) + 1; }));
      cols = Object.keys(tot).sort((a, b) => tot[b] - tot[a] || a.localeCompare(b));
    }
    const shown = cols.slice(0, 10), rest = cols.slice(10);
    const rows = visibleGroups().map(g => {
      const n = {};
      let none = 0, other = 0;
      g.mss.forEach(c => {
        const k = d.of(c);
        if (!k) none++;
        else if (shown.includes(k)) n[k] = (n[k] || 0) + 1;
        else other++;
      });
      return { g, n, none, other, total: g.mss.length };
    });
    const cell = (v, total, extra) => {
      if (!v) return `<td class="gc-cell ${extra || ""}"></td>`;
      const share = v / total;
      const text = groupCompare.pct ? `${Math.round(100 * share)}%` : v;
      return `<td class="gc-cell ${extra || ""}" style="--share:${share.toFixed(3)}" title="${v} of ${total} manuscripts (${Math.round(100 * share)}%)">${text}</td>`;
    };
    return `
      <table class="group-compare">
        <thead><tr><th class="gc-name">Group</th><th class="gc-n">mss</th>
          ${shown.map(k => `<th>${escapeHtml(d.label ? d.label(k) : k)}</th>`).join("")}
          ${rest.length ? `<th title="${escapeHtml(rest.join(", "))}">other</th>` : ""}
          <th class="gc-none">${escapeHtml(d.none)}</th></tr></thead>
        <tbody>${rows.map(r => `<tr>
          <th class="gc-name"><span class="gc-swatch" style="background:${groupColour(r.g)}"></span><button class="link-btn" data-ugroup-row="${escapeHtml(r.g.key)}">${escapeHtml(r.g.label)}</button></th>
          <td class="gc-n">${r.total}</td>
          ${shown.map(k => cell(r.n[k] || 0, r.total)).join("")}
          ${rest.length ? cell(r.other, r.total) : ""}
          ${cell(r.none, r.total, "gc-none")}</tr>`).join("")}</tbody>
      </table>`;
  }

  // line graph: one line per group, manuscripts per century (% of the group, or number)
  function groupTimeChart() {
    const W = 900, H = 380, m = { l: 48, r: 20, t: 16, b: 36 };
    const xs = corpusCenturies;
    const gs = visibleGroups();
    const series = gs.map(g => {
      const n = {};
      let undated = 0;
      g.mss.forEach(c => { const k = centuryOf(c); if (k) n[k] = (n[k] || 0) + 1; else undated++; });
      return { g, undated, pts: xs.map(k => ({ k, v: n[k] || 0, share: (n[k] || 0) / g.mss.length })) };
    });
    const val = p => groupCompare.pct ? 100 * p.share : p.v;
    const maxY = groupCompare.pct ? Math.min(100, Math.ceil(Math.max(10, ...series.flatMap(s => s.pts.map(val))) / 10) * 10)
      : Math.max(2, ...series.flatMap(s => s.pts.map(val)));
    const x = d3.scalePoint().domain(xs).range([m.l, W - m.r]).padding(0.3);
    const y = d3.scaleLinear().domain([0, maxY]).nice().range([H - m.b, m.t]);
    const line = d3.line().x(p => x(p.k)).y(p => y(val(p)));
    const ticks = y.ticks(5);
    return `<svg class="gc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Manuscripts of each group per century">
      ${ticks.map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" class="gc-grid"/>
        <text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" class="gc-axis">${t}${groupCompare.pct ? "%" : ""}</text>`).join("")}
      ${xs.map(k => `<text x="${x(k)}" y="${H - m.b + 22}" text-anchor="middle" class="gc-axis">${ordinal(k)} c.</text>`).join("")}
      ${series.map(s => {
        const c = groupColour(s.g), dim = groupCompare.hover && groupCompare.hover !== s.g.key;
        return `<g class="gc-series ${dim ? "dim" : ""} ${groupCompare.hover === s.g.key ? "hi" : ""}" data-key="${escapeHtml(s.g.key)}">
          <path d="${line(s.pts)}" stroke="${c}" fill="none"/>
          <path d="${line(s.pts)}" class="gc-hit" stroke="transparent" fill="none"/>
          ${s.pts.map(p => `<circle cx="${x(p.k)}" cy="${y(val(p))}" r="${p.v ? 4 : 2.5}" fill="${c}">
            <desc>${escapeHtml(s.g.label)}, ${ordinal(p.k)} century: ${p.v} of ${s.g.mss.length} manuscripts (${Math.round(100 * p.share)}%)${s.undated ? `; ${s.undated} undated` : ""}</desc></circle>`).join("")}
        </g>`;
      }).join("")}
    </svg>`;
  }

  // map: one pie per place, slices = groups, size = number of manuscripts
  function drawGroupMap() {
    const el = document.getElementById("gc-map");
    if (!el || typeof L === "undefined") return;
    if (groupCompare.map) { groupCompare.map.remove(); groupCompare.map = null; }
    const map = L.map(el, { scrollWheelZoom: false }).setView([44, 15], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors", maxZoom: 12 }).addTo(map);
    groupCompare.map = map;
    const byPlace = {};
    let unplaced = 0, total = 0;
    visibleGroups().forEach(g => g.mss.forEach(c => {
      total++;
      const p = placeCoords[codexPlace(c)];
      if (!p) { unplaced++; return; }
      const e = byPlace[p.name] = byPlace[p.name] || { p, groups: new Map() };
      if (!e.groups.has(g)) e.groups.set(g, []);
      e.groups.get(g).push(c);
    }));
    // lines: two places are joined, in a group's colour, when that group has manuscripts in both
    let nLinks = 0;
    groupCompare.mapLines = [];
    if (groupCompare.links) {
      const pairGroups = new Map();          // "place|place" -> groups linking them
      visibleGroups().forEach(g => {
        const ps = Object.values(byPlace).filter(e => e.groups.has(g)).map(e => e.p).sort((a, b) => a.name.localeCompare(b.name));
        ps.forEach((a, i) => ps.slice(i + 1).forEach(b => {
          const k = `${a.name}|${b.name}`;
          if (!pairGroups.has(k)) pairGroups.set(k, { a, b, gs: [] });
          pairGroups.get(k).gs.push(g);
        }));
      });
      pairGroups.forEach(({ a, b, gs }) => {
        gs.forEach((g, i) => {
          // a gentle curve, bent a little differently for each group that links the same two places
          const bend = 0.12 + 0.1 * (i - (gs.length - 1) / 2);
          const mx = (a.lat + b.lat) / 2 - (b.lon - a.lon) * bend, my = (a.lon + b.lon) / 2 + (b.lat - a.lat) * bend;
          const pts = [];
          for (let t = 0; t <= 1.0001; t += 0.05) {
            pts.push([(1 - t) ** 2 * a.lat + 2 * (1 - t) * t * mx + t ** 2 * b.lat, (1 - t) ** 2 * a.lon + 2 * (1 - t) * t * my + t ** 2 * b.lon]);
          }
          const na = byPlace[a.name].groups.get(g).length, nb = byPlace[b.name].groups.get(g).length;
          const line = L.polyline(pts, { color: groupColour(g), weight: 2.5, opacity: 0.75 });
          groupCompare.mapLines.push({ key: g.key, line });
          line.addTo(map)
            .bindTooltip(`<span class="gc-swatch" style="background:${groupColour(g)}"></span><strong>${escapeHtml(g.label)}</strong><br>
              ${escapeHtml(a.name)} (${na} ms) — ${escapeHtml(b.name)} (${nb} ms)`, { sticky: true });
          nLinks++;
        });
      });
    }
    const bounds = [];
    Object.values(byPlace).forEach(e => {
      const parts = [...e.groups.entries()].map(([g, cs]) => ({ g, n: cs.length, cs }));
      const n = parts.reduce((s, q) => s + q.n, 0);
      const r = 9 + Math.sqrt(n) * 5;
      let a0 = -Math.PI / 2, paths = "";
      parts.forEach(q => {
        const a1 = a0 + 2 * Math.PI * q.n / n;
        if (parts.length === 1) paths += `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="${groupColour(q.g)}"/>`;
        else paths += `<path d="M${r},${r} L${r + (r - 1) * Math.cos(a0)},${r + (r - 1) * Math.sin(a0)} A${r - 1},${r - 1} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${r + (r - 1) * Math.cos(a1)},${r + (r - 1) * Math.sin(a1)} Z" fill="${groupColour(q.g)}"/>`;
        a0 = a1;
      });
      const icon = L.divIcon({ className: "gc-pie", iconSize: [2 * r, 2 * r], iconAnchor: [r, r],
        html: `<svg width="${2 * r}" height="${2 * r}">${paths}<circle cx="${r}" cy="${r}" r="${r - 1}" fill="none" stroke="#fff" stroke-width="1.5"/>
          <text x="${r}" y="${r + 4}" text-anchor="middle">${n}</text></svg>` });
      L.marker([e.p.lat, e.p.lon], { icon }).addTo(map).bindPopup(`<strong>${escapeHtml(e.p.label || e.p.name)}</strong><br>
        ${parts.sort((a, b) => b.n - a.n).map(q => `<span class="gc-swatch" style="background:${groupColour(q.g)}"></span>${escapeHtml(q.g.label)}: ${q.n}
          <span class="muted">(${q.cs.map(c => escapeHtml(codexLabel(c))).join(", ")})</span>`).join("<br>")}`);
      bounds.push([e.p.lat, e.p.lon]);
    });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });
    document.getElementById("gc-map-note").innerHTML = `${groupCompare.links ? `${nLinks} lines join places that share a group. ` : ""}${total - unplaced} of ${total} manuscripts of the shown groups have a place of writing on the map;
      <strong>${unplaced}</strong> have none recorded (or one without coordinates). A manuscript in two groups is counted in both.`;
    setTimeout(() => map.invalidateSize(), 50);
  }

  function renderGroupComparison() {
    const box = document.getElementById("groups-compare");
    if (!box) return;
    const by = groupCompare.by, asTable = by === "script" || groupCompare.table;
    const legend = compareGroups().map(g => `<button class="gc-key ${groupCompare.hidden.has(g.key) ? "off" : ""}" data-key="${escapeHtml(g.key)}"
        title="Click to show or hide this group"><span class="gc-swatch" style="background:${groupColour(g)}"></span>${escapeHtml(g.label)} <span class="muted">${g.mss.length}</span></button>`).join("");
    const note = by === "time" ? (asTable ? "Each cell: the group's manuscripts in that century; the darker, the larger its share of the group."
        : "One line per group: how its manuscripts spread over the centuries. Shown as a share of the group's manuscripts, so groups of different sizes can be compared; switch to \"Number\" for counts. Hover a point for details.")
        + " Dates are the catalogue year, else the recorded century."
      : by === "place" ? (asTable ? "Each cell: the group's manuscripts written in that country (\"Venice (Italy)\" and \"Italy, Northern\" count as Italy)."
        : "Each circle is a place of writing, divided by group; its size and number give the manuscripts. A line in a group's colour joins two places that both have manuscripts of that group; hover a line for its group, click a circle for the list. Hide groups in the legend to see one group's links.")
      : "Each cell: the group's manuscripts in that script (regional hand); the darker, the larger its share of the group.";
    box.innerHTML = `
      <div class="gc-head-row">
        <h3 class="clusters-section-title" style="margin: 0;">Compare the groups</h3>
        <div class="gc-controls">
          <div class="net-seg">${[["time", "Over time"], ["place", "On the map"], ["script", "By script"]].map(([k, t]) =>
            `<button class="chip-btn ${by === k ? "active" : ""}" data-by="${k}">${t}</button>`).join("")}</div>
          ${by !== "place" || asTable ? `<div class="net-seg">
            <button class="chip-btn ${groupCompare.pct ? "active" : ""}" data-pct="1">% of the group</button>
            <button class="chip-btn ${groupCompare.pct ? "" : "active"}" data-pct="0">Number</button></div>` : ""}
          ${by === "place" && !asTable ? `<label class="rip-toggle"><input type="checkbox" id="gc-links" ${groupCompare.links ? "checked" : ""}> connect places that share a group</label>` : ""}
          ${by !== "script" ? `<label class="rip-toggle"><input type="checkbox" id="gc-table" ${groupCompare.table ? "checked" : ""}> as a table</label>` : ""}
        </div>
      </div>
      <p class="clusters-section-note">${note}</p>
      <div class="gc-legend">${legend}
        <button class="link-btn" data-all="1">show all</button> <button class="link-btn" data-all="0">hide all</button></div>
      ${asTable ? `<div class="group-compare-wrap">${groupComparisonTable(by)}</div>`
        : by === "time" ? `<div class="gc-chart-wrap">${groupTimeChart()}</div><div class="gc-tip" hidden></div>`
        : `<div id="gc-map" class="gc-map"></div><p class="clusters-section-note" id="gc-map-note"></p>`}`;
    box.querySelectorAll("[data-by]").forEach(b => b.addEventListener("click", () => { groupCompare.by = b.dataset.by; renderGroupComparison(); }));
    box.querySelectorAll("[data-pct]").forEach(b => b.addEventListener("click", () => { groupCompare.pct = b.dataset.pct === "1"; renderGroupComparison(); }));
    if (box.querySelector("#gc-links")) box.querySelector("#gc-links").addEventListener("change", e => { groupCompare.links = e.target.checked; renderGroupComparison(); });
    if (box.querySelector("#gc-table")) box.querySelector("#gc-table").addEventListener("change", e => { groupCompare.table = e.target.checked; renderGroupComparison(); });
    box.querySelectorAll(".gc-key").forEach(b => {
      b.addEventListener("click", () => {
        const k = b.dataset.key;
        groupCompare.hidden.has(k) ? groupCompare.hidden.delete(k) : groupCompare.hidden.add(k);
        renderGroupComparison();
      });
      b.addEventListener("mouseenter", () => { groupCompare.hover = b.dataset.key; highlightSeries(box); });
      b.addEventListener("mouseleave", () => { groupCompare.hover = null; highlightSeries(box); });
    });
    box.querySelectorAll("[data-all]").forEach(b => b.addEventListener("click", () => {
      groupCompare.hidden = b.dataset.all === "1" ? new Set() : new Set(userGroups.map(g => g.key));
      renderGroupComparison();
    }));
    const tip = box.querySelector(".gc-tip");
    box.querySelectorAll(".gc-series").forEach(s => {
      const g = userGroups.find(x => x.key === s.dataset.key);
      s.addEventListener("mouseenter", () => { groupCompare.hover = s.dataset.key; highlightSeries(box); });
      s.addEventListener("mousemove", ev => {
        const pt = ev.target.closest("circle");
        const detail = pt ? pt.querySelector("desc").textContent.replace(/^.*?, /, "") : `${g.mss.length} manuscripts · click to open`;
        tip.innerHTML = `<span class="gc-swatch" style="background:${groupColour(g)}"></span><strong>${escapeHtml(g.label)}</strong><br><span>${escapeHtml(detail)}</span>`;
        const r = box.getBoundingClientRect();
        tip.style.left = `${ev.clientX - r.left + 14}px`;
        tip.style.top = `${ev.clientY - r.top + 14}px`;
        tip.hidden = false;
      });
      s.addEventListener("mouseleave", () => { groupCompare.hover = null; highlightSeries(box); tip.hidden = true; });
      s.addEventListener("click", () => openUserGroup(s.dataset.key));
    });
    box.querySelectorAll("[data-ugroup-row]").forEach(b => b.addEventListener("click", () => openUserGroup(b.dataset.ugroupRow)));
    if (!asTable && by === "place") drawGroupMap();
    else if (groupCompare.map) { groupCompare.map.remove(); groupCompare.map = null; }
  }

  // the map needs its size recomputed when the Groups tab becomes visible
  document.querySelector('[data-tab="tab-groups"]').addEventListener("click", () => {
    if (groupCompare.map) setTimeout(() => groupCompare.map.invalidateSize(), 100);
  });

  function highlightSeries(box) {
    (groupCompare.mapLines || []).forEach(({ key, line }) => {
      const on = !groupCompare.hover || key === groupCompare.hover;
      line.setStyle({ opacity: on ? 0.85 : 0.06, weight: groupCompare.hover && on ? 4 : 2.5 });
      if (on && groupCompare.hover) line.bringToFront();
    });
    box.querySelectorAll(".gc-series").forEach(s => {
      s.classList.toggle("dim", !!groupCompare.hover && s.dataset.key !== groupCompare.hover);
      s.classList.toggle("hi", s.dataset.key === groupCompare.hover);
    });
  }

  function renderUserGroups() {
    const summary = document.getElementById("groups-summary");
    const body = document.getElementById("groups-body");
    if (!userGroups.length) {
      summary.innerHTML = `<p class="empty-note">No groups yet. Make them in the review tool (review_tool/server.py, "My groups") and rebuild.</p>`;
      body.innerHTML = "";
      return;
    }
    const grouped = new Set(userGroups.flatMap(g => g.illustration_ids));
    const nDiagrams = illustrations.filter(il => il.class === "Content Illustration").length;
    const named = userGroups.filter(g => g.name);
    summary.innerHTML = `
      <div class="clusters-headline">
        <span class="clusters-big">${userGroups.length}</span> groups, made by hand: ${grouped.size} of ${nDiagrams} diagrams are in a group
      </div>
      <p class="clusters-note">Groups are made and named by hand in the review tool; each diagram is in one group at most.
        The diagrams in no group are in the computational <button class="link-btn" id="goto-clusters">Clusters</button>. Click a group to see its
        illustrations, manuscripts, dates, places and scripts.</p>`;
    document.getElementById("goto-clusters").addEventListener("click", () => switchTab("tab-clusters"));
    renderGroupComparison();
    const unnamed = userGroups.filter(g => !g.name);
    body.innerHTML =
      `<h3 class="clusters-section-title">Named groups (${named.length})</h3>
       <div class="cluster-tiles">${named.map(userGroupTile).join("")}</div>` +
      (unnamed.length ? `<h3 class="clusters-section-title">Not named yet (${unnamed.length})</h3>
       <div class="cluster-tiles">${unnamed.map(userGroupTile).join("")}</div>` : "");
    body.querySelectorAll("[data-ugroup]").forEach(t => t.addEventListener("click", () => openUserGroup(t.dataset.ugroup)));
  }

  // -----------------------------------------------------------
  // 10. Tab: Included Texts (works inside the manuscripts, from the catalogue)
  // -----------------------------------------------------------
  const texts = data.texts || [];
  const textsBody = document.getElementById("texts-body");
  const textsSearch = document.getElementById("texts-search");
  const textsMultiOnly = document.getElementById("texts-multi-only");
  let openText = null;

  function renderTextsSummary() {
    const s = data.stats || {};
    const shared = texts.filter(t => t.count > 1).length;
    document.getElementById("texts-summary").innerHTML = `
      <div class="clusters-headline">
        <span class="clusters-big">${codices.length}</span> physical manuscripts in the corpus
        <span style="color: var(--ink-muted); font-size: 0.95rem;">(${s.total_manuscripts || data.manuscripts.length} catalogue records)</span>
      </div>
      <div class="clusters-stats">
        <div class="stat-item"><span class="label">Distinct texts</span> <span class="value">${texts.length}</span></div>
        <div class="stat-item"><span class="label">Texts in 2+ manuscripts</span> <span class="value">${shared}</span></div>
        <div class="stat-item"><span class="label">With page images</span> <span class="value">${codices.filter(c => c.has_images).length} manuscripts</span></div>
      </div>
      <p class="clusters-note">One physical manuscript often has several catalogue records: one for the volume ("קובץ") and one per work in it.
        Texts are taken from the records' titles and their added titles (MARC 740); spelling variants are kept apart, and "(קטע)" marks a fragment.</p>
    `;
  }

  function renderTexts() {
    const q = textsSearch.value.trim();
    const shown = texts.filter(t => (!q || t.title.includes(q)) && (!textsMultiOnly.checked || t.count > 1));
    document.getElementById("texts-count").textContent = shown.length;
    const max = texts.length ? texts[0].count : 1;
    textsBody.innerHTML = shown.map(t => `
      <tr class="text-row ${openText === t.title ? "open" : ""}" data-title="${escapeHtml(t.title)}">
        <td><span class="text-title">${escapeHtml(t.title)}</span>
          ${t.fragment_in.length ? `<span style="font-size: 0.75rem; color: var(--ink-muted);"> · fragment in ${t.fragment_in.length}</span>` : ""}</td>
        <td><div class="text-count-cell">
          <span class="bar-track"><span class="bar-fill" style="width: ${Math.max(2, 100 * t.count / max)}%; display: block;"></span></span>
          <span class="text-count-num">${t.count}</span></div></td>
      </tr>
      ${openText === t.title ? `<tr class="text-detail"><td colspan="2">${textDetail(t)}</td></tr>` : ""}
    `).join("");
    textsBody.querySelectorAll(".text-row").forEach(row => {
      row.addEventListener("click", () => {
        openText = openText === row.dataset.title ? null : row.dataset.title;
        renderTexts();
      });
    });
    textsBody.querySelectorAll(".btn-read-codex").forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); openManuscriptInReader(btn.dataset.mms); });
    });
  }

  function textDetail(t) {
    const mss = t.codices.map(id => codexById[id]).filter(Boolean)
      .sort((a, b) => (codexYear(a) || 9999) - (codexYear(b) || 9999));
    const together = {};
    mss.forEach(c => c.texts.forEach(o => { if (o !== t.title) together[o] = (together[o] || 0) + 1; }));
    const top = Object.entries(together).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return `
      <table class="text-ms-table">
        <thead><tr><th>Manuscript</th><th>Library</th><th>Date</th><th>Place</th><th>Other texts in it</th><th>Ktiv subjects</th><th></th></tr></thead>
        <tbody>${mss.map(c => `
          <tr>
            <td style="font-family: var(--font-mono); white-space: nowrap;">${escapeHtml(codexLabel(c))}${t.fragment_in.includes(c.codex_id) ? " <em>(fragment)</em>" : ""}</td>
            <td>${escapeHtml(c.library)}</td>
            <td style="white-space: nowrap;">${escapeHtml(shortCentury(c))}</td>
            <td>${escapeHtml(codexPlace(c))}</td>
            <td class="text-others">${escapeHtml(c.texts.filter(o => o !== t.title).join(" · "))}</td>
            <td class="text-others">${escapeHtml((c.ktiv_subjects || []).filter(x => !(c.ktiv_subjects || []).some(y => y !== x && y.startsWith(x))).join(" · "))}</td>
            <td>${c.has_images ? `<button class="status-pill downloaded btn-read-codex" data-mms="${escapeHtml(c.image_record)}">Read</button>` : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      ${top.length ? `<div class="text-together"><strong>Often copied together with:</strong>
        ${top.map(([o, n]) => `<span class="text-others">${escapeHtml(o)}</span> (${n})`).join(" · ")}</div>` : ""}
    `;
  }

  // Subject tags (Ktiv 500 "נושא נוסף" headings + LC 650 subjects), counted per physical manuscript
  const subjectTags = data.subject_tags || [];
  let subjectSource = "Ktiv";
  let openSubject = null;

  function renderSubjects() {
    const list = document.getElementById("subjects-list");
    list.classList.toggle("rtl", subjectSource === "Ktiv");
    const tags = subjectTags.filter(t => t.source === subjectSource);
    const withTag = new Set(tags.flatMap(t => t.codices));
    document.getElementById("subjects-note").innerHTML = subjectSource === "Ktiv"
      ? `Ktiv subject headings (the catalogue's "נושא נוסף" note). A heading like "מדעים. אסטרונומיה" is also counted under its
         top level "מדעים", and dated censorship notes under "צנזורה". ${withTag.size} of ${codices.length} manuscripts have one;
         a manuscript is counted once even when several of its catalogue records carry the tag. Click a tag for its manuscripts.`
      : `Library of Congress subject headings (MARC 650). ${withTag.size} of ${codices.length} manuscripts have one.
         Click a tag for its manuscripts.`;
    if (!tags.length) { list.innerHTML = `<p class="empty-note">No subject tags. Re-run code/03_organize_metadata.py and rebuild.</p>`; return; }
    const tops = tags.filter(t => t.top).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    const childrenOf = p => tags.filter(t => t.parent === p).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    const max = Math.max(...tops.map(t => t.count), 1);
    const row = (t, child) => `
      <div class="subject-row ${child ? "child" : ""} ${openSubject === t.tag ? "open" : ""}" data-tag="${escapeHtml(t.tag)}"
           title="${t.count} manuscripts (${t.records.length} catalogue records)">
        <span class="subject-name" dir="auto">${escapeHtml(child ? t.tag.slice(t.parent.length).replace(/^[.\s]+/, "") : t.tag)}</span>
        <span class="bar-track"><span class="bar-fill ${child ? "gold" : ""}" style="width: ${Math.max(2, 100 * t.count / max)}%; display: block;"></span></span>
        <span class="text-count-num">${t.count}</span>
      </div>
      ${openSubject === t.tag ? `<div class="subject-detail">${subjectDetail(t)}</div>` : ""}`;
    // long sub-lists (e.g. censorship years) open when their parent tag is clicked
    const openParent = (tags.find(t => t.tag === openSubject) || {}).parent || openSubject;
    list.innerHTML = tops.map(t => {
      const kids = childrenOf(t.tag);
      const showKids = kids.length <= 7 || openParent === t.tag;
      return row(t, false) + (showKids ? kids.map(c => row(c, true)).join("")
        : `<div class="subject-row child subject-more" data-tag="${escapeHtml(t.tag)}">+ ${kids.length} sub-tags (click to show)</div>`);
    }).join("");
    list.querySelectorAll(".subject-row").forEach(r => r.addEventListener("click", () => {
      openSubject = openSubject === r.dataset.tag ? null : r.dataset.tag;
      renderSubjects();
    }));
    list.querySelectorAll(".btn-read-codex").forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); openManuscriptInReader(btn.dataset.mms); });
    });
  }

  function subjectDetail(t) {
    const mss = t.codices.map(id => codexById[id]).filter(Boolean)
      .sort((a, b) => (codexYear(a) || 9999) - (codexYear(b) || 9999));
    const key = t.source === "Ktiv" ? "ktiv_subjects" : "lc_subjects";
    const together = {};
    mss.forEach(c => (c[key] || []).forEach(o => {
      if (o !== t.tag && o !== t.parent && !o.startsWith(t.tag + ". ") && !(t.tag.startsWith(o) )) together[o] = (together[o] || 0) + 1;
    }));
    const top = Object.entries(together).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return `
      ${top.length ? `<div class="text-together"><strong>Other tags on these manuscripts:</strong>
        ${top.map(([o, n]) => `<span class="text-others" dir="auto">${escapeHtml(o)}</span> (${n})`).join(" · ")}</div>` : ""}
      <table class="text-ms-table">
        <thead><tr><th>Manuscript</th><th>Library</th><th>Date</th><th>Place</th><th>Texts</th><th></th></tr></thead>
        <tbody>${mss.map(c => `
          <tr>
            <td style="font-family: var(--font-mono); white-space: nowrap;">${escapeHtml(codexLabel(c))}</td>
            <td>${escapeHtml(c.library)}</td>
            <td style="white-space: nowrap;">${escapeHtml(shortCentury(c))}</td>
            <td>${escapeHtml(codexPlace(c))}</td>
            <td class="text-others">${escapeHtml(c.texts.join(" · "))}</td>
            <td>${c.has_images ? `<button class="status-pill downloaded btn-read-codex" data-mms="${escapeHtml(c.image_record)}">Read</button>` : ""}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
  }

  document.querySelectorAll("#subjects-source .chip-btn").forEach(b => b.addEventListener("click", () => {
    subjectSource = b.dataset.source;
    openSubject = null;
    document.querySelectorAll("#subjects-source .chip-btn").forEach(x => x.classList.toggle("active", x === b));
    renderSubjects();
  }));

  textsSearch.addEventListener("input", renderTexts);
  textsMultiOnly.addEventListener("change", renderTexts);

  // -----------------------------------------------------------
  // 11. Inside each cluster's detail: its manuscripts over time and by place
  // -----------------------------------------------------------
  // century of a manuscript: from the catalogue year, else from the recorded century
  const centuryOf = c => { const y = codexYear(c); return y ? Math.floor((y - 1) / 100) + 1 : null; };
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"));
  // the same century axis for every cluster (all illustrated manuscripts), so clusters can be compared
  const corpusCenturies = (() => {
    const cs = illustrations.map(il => centuryOf(codexOfIll(il))).filter(Boolean);
    const out = [];
    for (let k = Math.min(...cs); k <= Math.max(...cs); k++) out.push(k);
    return out;
  })();

  // script (regional hand), as recorded in the catalogue (Hebrew) -> English
  const SCRIPT_NAMES = {
    "אשכנזית": "Ashkenazi", "איטלקית": "Italian", "ספרדית": "Sephardi", "מזרחית": "Eastern", "ביזנטית": "Byzantine",
    "ספרדית-מזרחית": "Sephardi-Eastern", "ספרדית-פרובנצלית": "Sephardi-Provençal", "ספרדית-איטלקית": "Sephardi-Italian",
    "איטלקית-אשכנזית": "Italian-Ashkenazi", "פרובנצלית": "Provençal", "תימנית": "Yemenite",
  };
  const scriptOf = c => {
    const s = (c.script || "").split("|")[0].trim();
    return !s || s === "Not Specified" ? null : (SCRIPT_NAMES[s] || s);
  };

  function clusterTimeAndPlace(mss) {
    const perCentury = {};
    let undated = 0;
    mss.forEach(c => { const k = centuryOf(c); if (k) perCentury[k] = (perCentury[k] || 0) + 1; else undated++; });
    const max = Math.max(1, ...Object.values(perCentury));
    const cols = corpusCenturies.map(k => {
      const n = perCentury[k] || 0;
      const names = mss.filter(c => centuryOf(c) === k).map(codexLabel).join(", ");
      return `<div class="cl-col" title="${escapeHtml(`${ordinal(k)} century: ${n} manuscript${n === 1 ? "" : "s"}${names ? " (" + names + ")" : ""}`)}">
        <span class="cl-col-n">${n || ""}</span>
        <span class="cl-col-bar" style="height: ${n ? Math.max(4, 100 * n / max) : 0}%"></span>
        <span class="cl-col-label">${ordinal(k)}</span>
      </div>`;
    }).join("");

    const perPlace = {};
    let unplaced = 0;
    mss.forEach(c => { const p = codexPlace(c); if (p) perPlace[p] = (perPlace[p] || 0) + 1; else unplaced++; });
    const places = Object.entries(perPlace).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([p, n]) => [p, n, `${p}: ${mss.filter(c => codexPlace(c) === p).map(codexLabel).join(", ")}`]);

    const perScript = {};
    let noScript = 0;
    mss.forEach(c => { const sc = scriptOf(c); if (sc) perScript[sc] = (perScript[sc] || 0) + 1; else noScript++; });
    const scripts = Object.entries(perScript).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([sc, n]) => [sc, n, `${sc}: ${mss.filter(c => scriptOf(c) === sc).map(codexLabel).join(", ")}`]);

    return `
      <div class="cl-stats">
        <div class="overview-box">
          <h4>Manuscripts over time</h4>
          <div class="cl-timeline">${cols}</div>
          <p class="cl-stats-note">${undated ? `<strong>${undated}</strong> undated manuscript${undated === 1 ? "" : "s"} not shown` : "All manuscripts are dated"}
            · by catalogue year, else the recorded century</p>
        </div>
        <div class="overview-box">
          <h4>Manuscripts by place of writing</h4>
          ${places.length ? barRows(places, places[0][1], true) : `<p class="cl-stats-note">No place recorded for any of them.</p>`}
          ${places.length ? `<p class="cl-stats-note">${unplaced ? `<strong>${unplaced}</strong> manuscript${unplaced === 1 ? "" : "s"} with no place recorded` : "All manuscripts have a place"}</p>` : ""}
        </div>
        <div class="overview-box">
          <h4>Manuscripts by script</h4>
          ${scripts.length ? barRows(scripts, scripts[0][1]) : `<p class="cl-stats-note">No script recorded for any of them.</p>`}
          ${scripts.length ? `<p class="cl-stats-note">${noScript ? `<strong>${noScript}</strong> manuscript${noScript === 1 ? "" : "s"} with no script recorded` : "All manuscripts have a script recorded"} · regional hand, from the catalogue</p>` : ""}
        </div>
      </div>`;
  }

  // -----------------------------------------------------------
  // Tab: Print Parallels (step 7: print illustration clusters x manuscript illustrations)
  // -----------------------------------------------------------
  const printData = data.print_matches;
  const printClusters = (printData && printData.print_clusters) || [];
  const tierRank = { strong: 3, probable: 2, possible: 1 };
  const printFilterTier = document.getElementById("print-filter-tier");
  const printFilterMs = document.getElementById("print-filter-ms");
  const printSort = document.getElementById("print-sort");

  // print clusters linked to each manuscript illustration (shown in the reader too)
  const printsOfIll = {};
  printClusters.forEach(p => p.matches.forEach(m => {
    (printsOfIll[m.illustration_id] = printsOfIll[m.illustration_id] || []).push({ print: p, match: m });
  }));
  const strongPrints = printClusters.filter(p => p.matches.some(m => m.tier === "strong")).length;
  document.getElementById("stat-print").textContent = printData
    ? `${printClusters.length} printed-edition image clusters resemble manuscript illustrations (${strongPrints} with a strong match)`
    : "not computed yet";

  const codexOfIllId = id => illById[id] ? codexOfIll(illById[id]) : null;
  [...new Set(printClusters.flatMap(p => p.matches.map(m => (codexOfIllId(m.illustration_id) || {}).codex_id)))]
    .filter(Boolean).map(id => codexById[id] || codexOfMms(id))
    .sort((a, b) => codexLabel(a).localeCompare(codexLabel(b)))
    .forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.codex_id;
      opt.textContent = `${codexLabel(c)} · ${shortCentury(c)}`;
      printFilterMs.appendChild(opt);
    });

  function printMatchCard(m) {
    const il = illById[m.illustration_id];
    if (!il) return "";
    const c = codexOfIll(il);
    const place = codexPlace(c);
    const grp = clusterOf[il.illustration_id];
    const grpBtn = grp && grp.label.startsWith("repeating")
      ? `<button class="link-btn print-grp" data-cluster="${grp.cluster_id}" title="Show this manuscript group in the Clusters tab">ms group ${grp.cluster_id}</button>` : "";
    return `
      <div class="ill-card print-match" data-id="${escapeHtml(il.illustration_id)}" title="Open page ${escapeHtml(il.page_number)} in the reader">
        <div class="ill-thumb"><img src="../${escapeHtml(il.crop_file)}" alt="Manuscript illustration" loading="lazy"></div>
        <div class="ill-caption">
          <div class="print-match-top"><span class="tier-badge tier-${m.tier}">${m.tier}</span>
            <span class="print-score" title="CSLS score ${m.score} · raw cosine ${m.cosine}">${m.score.toFixed(3)}</span></div>
          <div class="ill-shelfmark">${escapeHtml(codexLabel(c))}</div>
          <div class="ill-meta">${escapeHtml(c.library || "")}</div>
          <div class="ill-meta">${escapeHtml(shortCentury(c))}${place ? ` · ${escapeHtml(place)}` : ""}${c.script && c.script !== "Not Specified" ? ` · ${escapeHtml(c.script)}` : ""}</div>
          <div class="ill-meta">p. ${escapeHtml(il.page_number)} ${grpBtn}</div>
        </div>
      </div>`;
  }

  function renderPrintSummary() {
    const box = document.getElementById("print-summary");
    if (!printData) {
      box.innerHTML = `<p class="empty-note">No print matches yet. Run code/07_match_print_illustrations.py and rebuild.</p>`;
      return;
    }
    const pairs = printClusters.flatMap(p => p.matches);
    const count = t => pairs.filter(m => m.tier === t).length;
    const perCodex = {};
    printClusters.forEach(p => {
      new Set(p.matches.filter(m => m.tier !== "possible").map(m => (codexOfIllId(m.illustration_id) || {}).codex_id))
        .forEach(id => { if (id) perCodex[id] = (perCodex[id] || 0) + 1; });
    });
    const top = Object.entries(perCodex).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([id, n]) => { const c = codexById[id] || codexOfMms(id); return [`${codexLabel(c)} · ${shortCentury(c)}`, n, `${codexLabel(c)}, ${c.library}`]; });
    const t = printData.tiers;
    box.innerHTML = `
      <div class="clusters-headline">
        <span class="clusters-big">${printClusters.length}</span> of ${printData.n_print_clusters.toLocaleString()} print illustration clusters
        resemble at least one of ${printData.n_ms_illustrations.toLocaleString()} manuscript diagrams
      </div>
      <div class="clusters-stats">
        <div class="stat-item"><span class="label">Strong pairs</span> <span class="value">${count("strong")}</span></div>
        <div class="stat-item"><span class="label">Probable pairs</span> <span class="value">${count("probable")}</span></div>
        <div class="stat-item"><span class="label">Possible pairs</span> <span class="value">${count("possible")}</span></div>
        <div class="stat-item"><span class="label">Manuscript diagrams matched</span> <span class="value">${Object.keys(printsOfIll).length}</span></div>
      </div>
      <div class="overview-grid">
        <div class="overview-box">
          <h4>Manuscripts with the most print parallels (strong + probable)</h4>
          ${barRows(top, top.length ? top[0][1] : 1, true)}
        </div>
        <div class="overview-box">
          <h4>How to read the scores</h4>
          <p class="clusters-note">Each print cluster is represented by one image from the printed-editions corpus.
            Print and manuscript crops are compared with the same models as the Clusters tab (${escapeHtml(printData.method)}).
            Because most diagrams are "circles and lines", the score is corrected for crops that resemble everything:
            a pair scores high only if the two are closer to each other than to the rest of the other corpus.</p>
          <p class="clusters-note"><span class="tier-badge tier-strong">strong</span> ≥ ${t.strong}: almost always the same diagram.
            <span class="tier-badge tier-probable">probable</span> ≥ ${t.probable}: mostly right.
            <span class="tier-badge tier-possible">possible</span> ≥ ${t.possible}: about half are true parallels.
            These are candidates to check by eye, not proof of copying.</p>
        </div>
      </div>`;
  }

  function renderPrint() {
    const list = document.getElementById("print-list");
    if (!printData) { list.innerHTML = ""; return; }
    const minRank = tierRank[printFilterTier.value];
    const msFilter = printFilterMs.value;
    let rows = printClusters.map(p => ({
      print: p,
      matches: p.matches.filter(m => tierRank[m.tier] >= minRank &&
        (!msFilter || (codexOfIllId(m.illustration_id) || {}).codex_id === msFilter))
    })).filter(r => r.matches.length);
    const nMss = r => new Set(r.matches.map(m => (codexOfIllId(m.illustration_id) || {}).codex_id)).size;
    if (printSort.value === "mss") rows.sort((a, b) => nMss(b) - nMss(a) || b.matches[0].score - a.matches[0].score);
    else if (printSort.value === "id") rows.sort((a, b) => a.print.print_id.localeCompare(b.print.print_id));
    else rows.sort((a, b) => b.matches[0].score - a.matches[0].score);
    document.getElementById("print-count").textContent = rows.length;
    list.innerHTML = rows.length ? rows.map(r => `
      <div class="print-row">
        <div class="print-source">
          <div class="ill-thumb"><img src="../${escapeHtml(r.print.print_file)}" alt="Print cluster ${escapeHtml(r.print.print_id)}" loading="lazy"></div>
          <div class="print-source-caption">
            <div class="print-source-label">Printed editions</div>
            <div class="ill-shelfmark">${escapeHtml(r.print.print_id)}</div>
            <div class="ill-meta">${r.matches.length} match${r.matches.length === 1 ? "" : "es"} · ${nMss(r)} manuscript${nMss(r) === 1 ? "" : "s"}</div>
          </div>
        </div>
        <div class="print-arrow" aria-hidden="true">↔</div>
        <div class="ill-grid compact print-matches">${r.matches.map(printMatchCard).join("")}</div>
      </div>`).join("")
      : `<p class="empty-note">No print clusters match these filters.</p>`;
    attachIllustrationClicks(list);
    list.querySelectorAll(".print-grp").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      openClusterDetail(b.dataset.cluster);
    }));
  }

  printFilterTier.addEventListener("change", renderPrint);
  printFilterMs.addEventListener("change", renderPrint);
  printSort.addEventListener("change", renderPrint);

  // Utility: HTML Escaping
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // -----------------------------------------------------------
  // Initial Boot
  // -----------------------------------------------------------
  makeSortable(document.getElementById("catalogue-table"), state.catalogueSort, renderCatalogue);
  makeSortable(document.getElementById("persons-table"), state.personsSort, renderPersons);
  renderCatalogue();
  renderPersons();
  // ---------- overview above the Illustrations grid: how many, from how many manuscripts, per manuscript ----------
  const ILL_CLASS_COLOURS = { "Content Illustration": "#8e283b", "Table": "#1d6fa5", "Decoration": "#b07d2b",
                              "Initial": "#2b7042", "Printer's Mark": "#6b3fa0" };
  const illClassColour = c => ILL_CLASS_COLOURS[c] || "#7d8794";
  const illOverview = { by: "count" };

  function renderIllOverview() {
    const box = document.getElementById("ill-overview");
    if (!box || !illustrations.length) { if (box) box.innerHTML = ""; return; }
    const cls = illFilterClass.value;
    const ills = illustrations.filter(il => !cls || il.class === cls);
    const classes = cls ? [cls] : [...new Set(illustrations.map(il => il.class))].sort((a, b) =>
      illustrations.filter(il => il.class === b).length - illustrations.filter(il => il.class === a).length);
    // per codex: counts by class
    const per = new Map();
    ills.forEach(il => {
      const c = codexOfIll(il);
      if (!per.has(c.codex_id)) per.set(c.codex_id, { c, n: 0, byClass: {}, mms: il.mms_id });
      const e = per.get(c.codex_id);
      e.n++; e.byClass[il.class] = (e.byClass[il.class] || 0) + 1;
    });
    const rows = [...per.values()];
    const allMs = new Set(illustrations.map(il => codexOfIll(il).codex_id)).size;
    const byClassTotal = classes.map(k => [k, illustrations.filter(il => il.class === k).length]);

    // arrangement: sections (century / country / script) or one list (count / date)
    const by = illOverview.by;
    const keyOf = { century: e => centuryOf(e.c), place: e => countryOf(e.c), script: e => scriptOf(e.c) }[by];
    const noneLabel = { century: "Undated", place: "No place recorded", script: "No script recorded" }[by];
    const sectionLabel = k => by === "century" ? `${ordinal(k)} century` : k;
    const byDate = (a, b) => (codexYear(a.c) || 9999) - (codexYear(b.c) || 9999) || b.n - a.n;
    let sections;
    if (!keyOf) sections = [{ label: null, rows: rows.slice().sort(by === "date" ? byDate : (a, b) => b.n - a.n) }];
    else {
      const m = new Map();
      rows.forEach(e => { const k = keyOf(e) || null; if (!m.has(k)) m.set(k, []); m.get(k).push(e); });
      const keys = [...m.keys()].filter(k => k !== null);
      if (by === "century") keys.sort((a, b) => a - b);
      else keys.sort((a, b) => m.get(b).reduce((s, e) => s + e.n, 0) - m.get(a).reduce((s, e) => s + e.n, 0));
      if (m.has(null)) keys.push(null);
      sections = keys.map(k => ({ label: k === null ? noneLabel : sectionLabel(k), rows: m.get(k).sort(by === "century" ? byDate : (a, b) => b.n - a.n) }));
    }
    const max = Math.max(1, ...rows.map(e => e.n));
    const bar = e => {
      const place = codexPlace(e.c), sc = scriptOf(e.c);
      const segs = classes.filter(k => e.byClass[k]).map(k =>
        `<span style="width:${100 * e.byClass[k] / max}%; background:${illClassColour(k)}" title="${escapeHtml(k)}: ${e.byClass[k]}"></span>`).join("");
      return `<div class="ipm-row" data-mms="${escapeHtml(e.mms)}" title="${escapeHtml(`${codexLabel(e.c)}, ${e.c.library || ""} · ${shortCentury(e.c)}${place ? " · " + place : ""}${sc ? " · " + sc : ""}: ${e.n} illustrations — click to show them`)}">
        <span class="ipm-label">${escapeHtml(codexLabel(e.c))} <span class="muted">${escapeHtml(shortCentury(e.c))}</span></span>
        <span class="ipm-track">${segs}</span><span class="ipm-n">${e.n}</span></div>`;
    };
    box.innerHTML = `
      <div class="clusters-headline">
        <span class="clusters-big">${illustrations.length}</span> illustrations from <span class="clusters-big">${allMs}</span> manuscripts
      </div>
      <div class="clusters-stats">${byClassTotal.map(([k, n]) =>
        `<div class="stat-item"><span class="label"><span class="ipm-swatch" style="background:${illClassColour(k)}"></span>${escapeHtml(k)}</span> <span class="value">${n}</span></div>`).join("")}</div>
      <details class="ipm" open>
        <summary>Illustrations per manuscript${cls ? ` (${escapeHtml(cls)} only)` : ""}: ${rows.length} manuscripts</summary>
        <div class="ipm-controls"><span class="net-label">Arrange by:</span>
          <div class="net-seg">${[["count", "Number"], ["date", "Date"], ["century", "Century"], ["place", "Place"], ["script", "Script"]].map(([k, t]) =>
            `<button class="chip-btn ${by === k ? "active" : ""}" data-ipm="${k}">${t}</button>`).join("")}</div>
          <span class="muted ipm-hint">Click a manuscript to show its illustrations below. ${cls ? "" : "Colours: illustration classes (see the counts above)."}</span>
        </div>
        <div class="ipm-chart">${sections.map(s => `
          ${s.label !== null ? `<div class="ipm-section">${escapeHtml(String(s.label))}
            <span class="muted">${s.rows.length} manuscript${s.rows.length === 1 ? "" : "s"} · ${s.rows.reduce((t, e) => t + e.n, 0)} illustrations</span></div>` : ""}
          ${s.rows.map(bar).join("")}`).join("")}</div>
      </details>`;
    box.querySelectorAll("[data-ipm]").forEach(b => b.addEventListener("click", () => { illOverview.by = b.dataset.ipm; renderIllOverview(); }));
    box.querySelectorAll(".ipm-row").forEach(r => r.addEventListener("click", () => {
      illFilterMs.value = r.dataset.mms;
      renderIllustrations();
      document.querySelector("#tab-illustrations .filter-card").scrollIntoView({ block: "start", behavior: "smooth" });
    }));
  }

  renderIllOverview();
  renderIllustrations();
  renderClusters();
  renderUserGroups();
  renderTextsSummary();
  renderSubjects();
  renderTexts();
  renderPrintSummary();
  renderPrint();

  // used by network.js (the Network tab)
  window.SPHAERA_APP = { switchTab, openManuscriptInReader, openIllustrationPage, illById, clusterOf, escapeHtml };

  // Pre-load first downloaded manuscript into reader
  if (downloadedManuscripts.length > 0) {
    loadManuscriptIntoReader(downloadedManuscripts[0].mms_id, 0);
  }
});
