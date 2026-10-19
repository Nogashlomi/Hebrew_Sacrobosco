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
    personsRoleFilter: ""
  };

  // -----------------------------------------------------------
  // 0. Initialize Masthead Global Statistics
  // -----------------------------------------------------------
  document.getElementById("stat-total-ms").textContent = data.stats.total_manuscripts;
  document.getElementById("stat-downloaded-ms").textContent = `${data.stats.downloaded_manuscripts} (${data.stats.total_downloaded_pages.toLocaleString()} pages)`;
  document.getElementById("stat-open-catalog").textContent = `${data.stats.total_open_in_catalog} (${data.stats.total_pages_in_catalog.toLocaleString()} pages)`;
  document.getElementById("stat-persons").textContent = (data.persons || []).length;
  document.getElementById("stat-places").textContent = (data.places || []).length;

  // -----------------------------------------------------------
  // 1. Navigation & Tab Switching
  // -----------------------------------------------------------
  const navTabs = document.querySelectorAll("#main-nav .nav-tab");
  const tabPanes = document.querySelectorAll(".tab-pane");

  function switchTab(targetId) {
    state.activeTab = targetId;
    navTabs.forEach(t => t.classList.toggle("active", t.dataset.tab === targetId));
    tabPanes.forEach(p => p.classList.toggle("active", p.id === targetId));

    if (targetId === "tab-map") {
      setTimeout(() => {
        if (state.map.leafletInstance) {
          state.map.leafletInstance.invalidateSize();
        } else {
          initMap();
        }
      }, 100);
    } else if (targetId === "tab-all-visuals") {
      // Initialize visuals gallery and clusters
      if (window.initAllVisuals) {
        window.initAllVisuals();
      }
    }
    state.activeTab = targetId;
    navTabs.forEach(t => t.classList.toggle("active", t.dataset.tab === targetId));
    tabPanes.forEach(p => p.classList.toggle("active", p.id === targetId));

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
          m.subjects
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
        <div style="grid-column: 1 / -1; padding: 4rem 2rem; text-align: center; background: var(--bg-surface); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
          <h3 style="font-family: var(--font-serif-text); font-size: 1.3rem; margin-bottom: 0.4rem; color: var(--ink-primary);">No manuscripts match your filter criteria</h3>
          <p style="font-size: 0.88rem; color: var(--ink-muted); margin-bottom: 1.25rem;">Try relaxing your search keywords or resetting the selected filters.</p>
          <button id="btn-empty-reset" class="btn-primary">Reset Filters</button>
        </div>
      `;
      const btnEmptyReset = document.getElementById("btn-empty-reset");
      if (btnEmptyReset) btnEmptyReset.onclick = resetFilters;
      return;
    }

    manuscriptsGrid.innerHTML = filtered.map(m => {
      // Status pill
      let statusHtml = "";
      if (m.has_local_images) {
        statusHtml = `<span class="status-pill downloaded" title="Complete high-resolution digital images stored locally">Facsimile (${m.downloaded_pages_count} pp)</span>`;
      } else if (m.ktiv_link) {
        statusHtml = `<span class="status-pill open-iiif" title="Open IIIF Manifest in Ktiv">Ktiv IIIF</span>`;
      } else {
        statusHtml = `<span class="status-pill catalog-only">Catalog Record</span>`;
      }

      // Shelfmark badge
      const shelfmarkDisplay = m.shelfmark || "Shelfmark Not Recorded";

      // Origin place & holding city
      const originPlace = m.place_writing ? m.place_writing : "Origin Unknown";
      const holdingDisplay = m.library_city ? `${m.library} (${m.library_city})` : m.library;

      return `
        <article class="ms-card" data-mms="${m.mms_id}">
          <div>
            <div class="ms-card-header">
              <span class="ms-shelfmark-badge">${escapeHtml(shelfmarkDisplay)}</span>
              ${statusHtml}
            </div>

            <div class="ms-card-titles">
              <div class="ms-title-hebrew" dir="rtl">${escapeHtml(m.title || "ללא כותר עברי")}</div>
              ${m.author ? `<div class="ms-title-latin">${escapeHtml(m.author)}</div>` : ""}
            </div>

            <div class="ms-card-meta">
              <div class="meta-item">
                <span class="meta-label">Date / Era:</span>
                <span class="meta-val"><strong>${escapeHtml(m.century)}</strong> ${m.date_place ? `— <span style="color: var(--ink-muted);">${escapeHtml(m.date_place)}</span>` : ""}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Origin:</span>
                <span class="meta-val">${escapeHtml(originPlace)}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Repository:</span>
                <span class="meta-val">${escapeHtml(holdingDisplay)}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Script:</span>
                <span class="meta-val">${escapeHtml(m.script)} ${m.extent ? `· (${escapeHtml(m.extent)})` : ""}</span>
              </div>
            </div>
          </div>

          <div class="ms-card-footer">
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              ${m.has_local_images ? `
                <button class="btn-primary btn-open-reader" data-mms="${m.mms_id}">
                  Read Facsimile
                </button>
              ` : ""}
              <button class="btn-secondary btn-open-modal" data-mms="${m.mms_id}">
                Details
              </button>
            </div>
            ${m.ktiv_link ? `
              <a href="${m.ktiv_link}" target="_blank" rel="noopener noreferrer" class="btn-secondary" title="View record on Ktiv Portal">
                Ktiv
              </a>
            ` : ""}
          </div>
        </article>
      `;
    }).join("");

    // Attach Click Handlers
    document.querySelectorAll(".btn-open-reader").forEach(btn => {
      btn.addEventListener("click", () => {
        openManuscriptInReader(btn.dataset.mms);
      });
    });

    document.querySelectorAll(".btn-open-modal").forEach(btn => {
      btn.addEventListener("click", () => {
        openManuscriptModal(btn.dataset.mms);
      });
    });
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

    setReaderPage(initialPageIndex);
  }

  function setReaderPage(index) {
    const ms = downloadedManuscripts.find(m => m.mms_id === state.reader.activeMmsId);
    if (!ms || !ms.pages[index]) return;

    state.reader.activePageIndex = index;
    const page = ms.pages[index];

    readerMainImg.src = `../${page.relative_path}`;
    readerMainImg.style.transform = `scale(${state.reader.zoomLevel})`;

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

  btnZoomIn.addEventListener("click", () => {
    state.reader.zoomLevel = Math.min(3.5, state.reader.zoomLevel + 0.25);
    readerMainImg.style.transform = `scale(${state.reader.zoomLevel})`;
  });

  btnZoomOut.addEventListener("click", () => {
    state.reader.zoomLevel = Math.max(0.6, state.reader.zoomLevel - 0.25);
    readerMainImg.style.transform = `scale(${state.reader.zoomLevel})`;
  });

  btnZoomReset.addEventListener("click", () => {
    state.reader.zoomLevel = 1.0;
    readerMainImg.style.transform = `scale(1.0)`;
  });

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
      }
    }
  });

  // -----------------------------------------------------------
  // 4. Tab 3: Prosopography & Persons Directory
  // -----------------------------------------------------------
  const personsSearch = document.getElementById("persons-search");
  const personsCount = document.getElementById("persons-count");
  const personsGrid = document.getElementById("persons-grid");

  function renderPersons() {
    const q = state.personsSearch.toLowerCase();
    const filtered = data.persons.filter(p => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });

    personsCount.textContent = filtered.length;

    personsGrid.innerHTML = filtered.map(p => `
      <div class="person-card">
        <div class="person-name-box">
          <h3 class="person-name">${escapeHtml(p.name)}</h3>
          <span class="person-role-badge">${escapeHtml(p.role)}</span>
        </div>

        <div style="font-size: 0.84rem; color: var(--ink-secondary); margin-bottom: 0.75rem;">
          Recorded in <strong>${p.count}</strong> manuscript${p.count > 1 ? 's' : ''} in the corpus.
        </div>

        <div class="person-card-footer">
          <button class="btn-secondary btn-person-filter" data-name="${escapeHtml(p.name)}">
            View in Catalogue (${p.count})
          </button>
        </div>
      </div>
    `).join("");

    personsGrid.querySelectorAll(".btn-person-filter").forEach(btn => {
      btn.addEventListener("click", () => {
        state.catalogueFilters.search = btn.dataset.name;
        catalogueSearch.value = btn.dataset.name;
        switchTab("tab-catalogue");
        renderCatalogue();
      });
    });
  }

  personsSearch.addEventListener("input", e => {
    state.personsSearch = e.target.value.trim();
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
  renderCatalogue();
  renderPersons();

  // Pre-load first downloaded manuscript into reader
  if (downloadedManuscripts.length > 0) {
    loadManuscriptIntoReader(downloadedManuscripts[0].mms_id, 0);
  }
});
