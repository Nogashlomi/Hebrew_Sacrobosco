// visuals.js – Handles extraction of visual elements (illustrations, diagrams, tables) from manuscript image folders
// Simple heuristic: treat any image file in a manuscript's image_folder as a visual element.
// Clustering is rudimentary – groups by manuscript (folder) as a placeholder for similarity clustering.

(function() {
  // Ensure data is loaded
  const data = window.SPHAERA_DATA;
  if (!data) {
    console.error('SPHAERA_DATA not found – cannot initialize visuals.');
    return;
  }

  // ---------------------------------------------------------------------------
  // 1. Extract visual elements from manuscripts
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  function extractVisuals() {
    const visuals = [];
    // Manuscripts array expected in data.manuscripts
    (data.manuscripts || []).forEach(m => {
      if (m.has_local_images && m.pages) {
        m.pages.forEach(page => {
          const src = `../${page.relative_path}`;
          visuals.push({ manuscriptId: m.id || m.shelfmark, src, folder: m.image_folder || '' });
        });
      }
    });
    return visuals;
  }



      // if (m.has_local_images && m.pages) {
        // // Use pages array to get image paths
        // m.pages.forEach(page => {
          // const src = `../${page.relative_path}`;
          // visuals.push({ manuscriptId: m.id || m.shelfmark, src, folder: m.image_folder || '' });
        // });
      // }
        // // Image list may be in m.images array; fallback to scanning relative_path entries if present
        // const images = m.images || [];
        // images.forEach(img => {
          // // Build relative URL for the image (paths are relative to the visualizer folder)
          const src = `${m.image_folder.replace(/\\/+$/,'')}/${img.relative_path.replace(/^images\//,'')}`;
          // visuals.push({ manuscriptId: m.id || m.shelfmark, src, folder: m.image_folder });
        // });
      // }
    // });
    // return visuals;
  }

  // ---------------------------------------------------------------------------
  // 2. Very simple clustering – group by image folder (i.e., by manuscript)
  // ---------------------------------------------------------------------------
  function clusterVisuals(visuals) {
    const clusters = {};
    visuals.forEach(v => {
      const key = v.folder; // folder path as cluster key
      if (!clusters[key]) clusters[key] = [];
      clusters[key].push(v);
    });
    // Return an array of clusters {folder, items[]}
    return Object.entries(clusters).map(([folder, items]) => ({ folder, items }));
  }

  // ---------------------------------------------------------------------------
  // 3. Rendering the gallery
  // ---------------------------------------------------------------------------
  function renderGallery() {
    const container = document.getElementById('visuals-gallery');
    if (!container) {
      console.warn('Visuals gallery container not found.');
      return;
    }
    const visuals = extractVisuals();
    const clusters = clusterVisuals(visuals);

    // Clear any existing content
    container.innerHTML = '';

    clusters.forEach(cluster => {
      // Create a sub‑section for each manuscript (optional header)
      const section = document.createElement('section');
      section.className = 'visuals-cluster';
      const header = document.createElement('h3');
      header.className = 'visuals-cluster-title';
      header.textContent = `Manuscript visuals – ${cluster.folder}`;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'visuals-grid';

      cluster.items.forEach(v => {
        const img = document.createElement('img');
        img.src = v.src;
        img.alt = `Visual from ${v.manuscriptId}`;
        img.loading = 'lazy';
        img.className = 'visuals-thumb';
        img.onclick = () => openImageModal(v.src, v.manuscriptId);
        grid.appendChild(img);
      });
      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Simple modal to view a larger image (re‑uses existing #ms-modal structure)
  // ---------------------------------------------------------------------------
  function openImageModal(src, title) {
    const modal = document.getElementById('ms-modal');
    const body = document.getElementById('modal-body');
    if (!modal || !body) return;
    body.innerHTML = `<h3 style="margin-bottom:0.5rem;">${title}</h3><img src="${src}" style="max-width:100%; height:auto;"/>`;
    modal.classList.add('active');
  }

  // Close modal handling (existing close button) – ensure it works for visual modal as well
  const closeBtn = document.getElementById('modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const modal = document.getElementById('ms-modal');
      if (modal) modal.classList.remove('active');
    });
  }

  // Expose a public init function if needed by app.js
  window.initVisuals = function() {
    // expose helper for clustering scripts
    window.getAllVisuals = extractVisuals;
    renderGallery();
  };

  // ---------------------------------------------------------------------------
  // 5. Render all visuals (across all manuscripts)
  // ---------------------------------------------------------------------------
  function renderAllVisuals() {
    const container = document.getElementById('all-visuals-gallery');
    if (!container) return;
    const visuals = extractVisuals();
    container.innerHTML = '';
    visuals.forEach(v => {
      const img = document.createElement('img');
      img.src = v.src;
      img.alt = `Visual from ${v.manuscriptId}`;
      img.loading = 'lazy';
      img.className = 'visuals-thumb';
      img.onclick = () => openImageModal(v.src, v.manuscriptId);
      container.appendChild(img);
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Render image clusters (by identical file name across manuscripts)
  // ---------------------------------------------------------------------------
  function renderClusters() {
    const container = document.getElementById('clusters-gallery');
    if (!container) return;

    // Load clustering data generated by the Python script
    fetch('../data/viz/visuals_clusters.json')
      .then(r => r.json())
      .then(clusters => {
        container.innerHTML = '';
        clusters.forEach(cluster => {
          const section = document.createElement('section');
          section.className = 'visuals-cluster';

          const header = document.createElement('h3');
          header.className = 'visuals-cluster-title';
          header.textContent = `Cluster (${cluster.images.length} image${cluster.images.length > 1 ? 's' : ''})`;
          section.appendChild(header);

          const grid = document.createElement('div');
          grid.className = 'visuals-grid';

          cluster.images.forEach(v => {
            const img = document.createElement('img');
            img.src = v.src;
            img.alt = `Visual from ${v.manuscript_id}`;
            img.loading = 'lazy';
            img.className = 'visuals-thumb';
            img.onclick = () => openImageModal(v.src, v.manuscript_id);
            grid.appendChild(img);
          });
          section.appendChild(grid);
          container.appendChild(section);
        });
      })
      .catch(err => console.error('Failed to load clusters JSON', err));
  }

  // ---------------------------------------------------------------------------
  // 7. Initialise All Visuals & Clusters tab
  // ---------------------------------------------------------------------------
  function initAllVisuals() {
    renderAllVisuals();
    renderClusters();
  }

  // Expose to global scope
  window.initAllVisuals = initAllVisuals;
    // expose helper for clustering scripts
    window.getAllVisuals = extractVisuals;
    renderGallery();
  };
})();
