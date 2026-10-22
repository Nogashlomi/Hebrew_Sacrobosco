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
    sortRows(filtered, state.personsSort, (p, key) => p[key]);

    personsBody.innerHTML = filtered.length ? filtered.map(p => {
      const key = `${p.name}|${p.role}`;
      const open = state.personsOpen === key;
      return `
        <tr class="clickable-row ${open ? "open" : ""}" data-key="${escapeHtml(key)}" title="Show this person's manuscripts">
          <td class="cell-person" dir="auto">${escapeHtml(p.name)}</td>
          <td><span class="person-role-badge">${escapeHtml(p.role)}</span></td>
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
  illFilterClass.addEventListener("change", renderIllustrations);

  // -----------------------------------------------------------
  // 9. Tab 7: Clusters (repeating illustrations from step 5)
  // -----------------------------------------------------------
  // clusters.json: id 0 = "other (no close match)", "repeating group N" = groups above the
  // similarity threshold, "... (not compared)" = classes left out of the comparison.
  function renderClusters() {
    const summary = document.getElementById("clusters-summary");
    const body = document.getElementById("clusters-body");
    if (!clusterGroups.length) {
      summary.innerHTML = `<p class="empty-note">No clusters yet. Run code/05_cluster_illustrations.py and rebuild.</p>`;
      return;
    }

    const repeating = clusterGroups.filter(c => c.label.startsWith("repeating"));
    const other = clusterGroups.find(c => c.cluster_id === 0) || { illustration_ids: [] };
    const notCompared = clusterGroups.filter(c => c.label.endsWith("(not compared)"));
    const across = repeating.filter(c => c.n_manuscripts > 1);
    const within = repeating.filter(c => c.n_manuscripts === 1);
    const nClustered = repeating.reduce((n, c) => n + c.illustration_ids.length, 0);
    const nCompared = nClustered + other.illustration_ids.length;
    const pct = nCompared ? Math.round(100 * nClustered / nCompared) : 0;
    const threshold = data.clusters.similarity_threshold;

    summary.innerHTML = `
      <div class="clusters-headline">
        <span class="clusters-big">${nClustered}</span> of ${nCompared} diagrams (${pct}%) were found in repeating groups
      </div>
      <div class="clusters-stats">
        <div class="stat-item"><span class="label">Repeating groups</span> <span class="value">${repeating.length}</span></div>
        <div class="stat-item"><span class="label">Across manuscripts</span> <span class="value">${across.length}</span></div>
        <div class="stat-item"><span class="label">Within one manuscript</span> <span class="value">${within.length}</span></div>
        <div class="stat-item"><span class="label">No close match</span> <span class="value">${other.illustration_ids.length}</span></div>
      </div>
      <p class="clusters-note">
        A group is formed only when every two diagrams in it are at least
        ${threshold != null ? `<strong>${Math.round(threshold * 100)}%</strong>` : "the chosen level"} similar
        (${escapeHtml(data.clusters.method)}).
        ${notCompared.length ? `Not compared: ${notCompared.map(c => `${c.illustration_ids.length} ${escapeHtml(c.label.replace(" (not compared)", ""))}`).join(", ")}.` : ""}
        Click an illustration to open its page in the reader.
      </p>
    `;

    const groupCard = c => `
      <div class="cluster-card">
        <div class="cluster-card-head">
          <span class="cluster-name">Group ${c.cluster_id}</span>
          <span class="cluster-counts">${c.illustration_ids.length} illustrations · ${c.n_manuscripts} manuscript${c.n_manuscripts > 1 ? "s" : ""}</span>
        </div>
        <div class="ill-grid compact">${c.illustration_ids.map(id => illById[id]).filter(Boolean).map(illustrationCard).join("")}</div>
      </div>
    `;
    const section = (title, note, inner) => `
      <h3 class="clusters-section-title">${title}</h3>
      <p class="clusters-section-note">${note}</p>
      ${inner}
    `;

    body.innerHTML =
      section(`Repeating across manuscripts (${across.length} groups)`,
              "The same kind of diagram found in two or more manuscripts.",
              across.map(groupCard).join("")) +
      section(`Repeating within one manuscript (${within.length} groups)`,
              "Similar diagrams that recur inside a single manuscript.",
              within.map(groupCard).join("")) +
      section(`No close match (${other.illustration_ids.length})`,
              "Diagrams with no other diagram above the similarity level: these appear only once in the corpus.",
              `<div class="ill-grid compact">${other.illustration_ids.map(id => illById[id]).filter(Boolean).map(illustrationCard).join("")}</div>`);
    attachIllustrationClicks(body);
  }

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
  renderIllustrations();
  renderClusters();

  // Pre-load first downloaded manuscript into reader
  if (downloadedManuscripts.length > 0) {
    loadManuscriptIntoReader(downloadedManuscripts[0].mms_id, 0);
  }
});
