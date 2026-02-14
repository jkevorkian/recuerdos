/* ============================================================
   San Valentín – Nuestros Recuerdos  |  app.js
   IndexedDB-based media storage for GitHub Pages
   ============================================================ */

(() => {
  'use strict';

  // ── IndexedDB wrapper ──────────────────────────────────────
  const DB_NAME    = 'RecuerdosDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'recuerdos';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async function dbAdd(record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async function dbGetAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async function dbGet(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async function dbDelete(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  // ── DOM References ─────────────────────────────────────────
  const dropZone       = document.getElementById('dropZone');
  const fileInput      = document.getElementById('fileInput');
  const btnUpload      = document.getElementById('btnUpload');
  const uploadProgress = document.getElementById('uploadProgress');
  const progressFill   = document.getElementById('progressFill');
  const progressText   = document.getElementById('progressText');
  const galleryGrid    = document.getElementById('galleryGrid');
  const galleryEmpty   = document.getElementById('galleryEmpty');
  const galleryCount   = document.getElementById('galleryCount');
  const lightbox       = document.getElementById('lightbox');
  const lightboxContent= document.getElementById('lightboxContent');
  const lightboxClose  = document.getElementById('lightboxClose');
  const lightboxDownload = document.getElementById('lightboxDownload');
  const lightboxDelete = document.getElementById('lightboxDelete');
  const lightboxPrev   = document.getElementById('lightboxPrev');
  const lightboxNext   = document.getElementById('lightboxNext');
  const toastContainer = document.getElementById('toastContainer');
  const heartsBg       = document.getElementById('heartsBg');

  // ── State ──────────────────────────────────────────────────
  let allRecuerdos = [];
  let currentLightboxIndex = -1;

  // ── Floating Hearts ────────────────────────────────────────
  function spawnHearts() {
    const hearts = ['❤️', '💕', '💖', '💗', '💘', '💝', '🌹', '✨'];
    const count = Math.min(20, Math.floor(window.innerWidth / 60));

    for (let i = 0; i < count; i++) {
      const span = document.createElement('span');
      span.className = 'floating-heart';
      span.textContent = hearts[Math.floor(Math.random() * hearts.length)];
      span.style.left = Math.random() * 100 + '%';
      span.style.animationDuration = (8 + Math.random() * 12) + 's';
      span.style.animationDelay = (Math.random() * 15) + 's';
      span.style.fontSize = (0.8 + Math.random() * 1.2) + 'rem';
      heartsBg.appendChild(span);
    }
  }

  // ── Toast Notification ─────────────────────────────────────
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  // ── File Handling ──────────────────────────────────────────
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function isImage(type) { return type.startsWith('image/'); }
  function isVideo(type) { return type.startsWith('video/'); }

  async function handleFiles(files) {
    const validFiles = Array.from(files).filter(f => isImage(f.type) || isVideo(f.type));

    if (validFiles.length === 0) {
      showToast('Solo se permiten fotos y videos', 'error');
      return;
    }

    uploadProgress.hidden = false;
    let processed = 0;

    for (const file of validFiles) {
      try {
        progressText.textContent = `Subiendo ${processed + 1} de ${validFiles.length}...`;
        progressFill.style.width = ((processed / validFiles.length) * 100) + '%';

        const dataURL = await readFileAsDataURL(file);

        const record = {
          name: file.name,
          type: file.type,
          mediaType: isImage(file.type) ? 'image' : 'video',
          data: dataURL,
          date: new Date().toISOString(),
          size: file.size,
        };

        await dbAdd(record);
        processed++;
      } catch (err) {
        console.error('Error saving file:', file.name, err);
        showToast(`Error guardando ${file.name}`, 'error');
      }
    }

    progressFill.style.width = '100%';
    progressText.textContent = '¡Listo!';

    setTimeout(() => {
      uploadProgress.hidden = true;
      progressFill.style.width = '0%';
    }, 1500);

    showToast(`${processed} recuerdo${processed > 1 ? 's' : ''} guardado${processed > 1 ? 's' : ''} ❤️`);
    await loadGallery();
  }

  // ── Gallery Rendering ──────────────────────────────────────
  function formatDate(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function createCard(recuerdo, index) {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    if (recuerdo.mediaType === 'image') {
      const img = document.createElement('img');
      img.src = recuerdo.data;
      img.alt = recuerdo.name;
      img.loading = 'lazy';
      card.appendChild(img);
    } else {
      const video = document.createElement('video');
      video.src = recuerdo.data;
      video.muted = true;
      video.preload = 'metadata';
      video.setAttribute('playsinline', '');
      card.appendChild(video);

      // Play icon
      const play = document.createElement('div');
      play.className = 'card-play';
      play.innerHTML = `<svg viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>`;
      card.appendChild(play);
    }

    // Type badge
    const badge = document.createElement('span');
    badge.className = 'card-type-badge';
    badge.textContent = recuerdo.mediaType === 'image' ? '📷 Foto' : '🎬 Video';
    card.appendChild(badge);

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';
    overlay.innerHTML = `<span class="card-date">${formatDate(recuerdo.date)} · ${formatSize(recuerdo.size)}</span>`;
    card.appendChild(overlay);

    // Click to open lightbox
    card.addEventListener('click', () => openLightbox(index));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') openLightbox(index);
    });

    return card;
  }

  async function loadGallery() {
    try {
      allRecuerdos = await dbGetAll();

      // Sort newest first
      allRecuerdos.sort((a, b) => new Date(b.date) - new Date(a.date));

      galleryGrid.innerHTML = '';

      if (allRecuerdos.length === 0) {
        galleryEmpty.hidden = false;
        galleryCount.textContent = '';
        return;
      }

      galleryEmpty.hidden = true;
      galleryCount.textContent = `${allRecuerdos.length} recuerdo${allRecuerdos.length > 1 ? 's' : ''}`;

      allRecuerdos.forEach((rec, idx) => {
        const card = createCard(rec, idx);
        // Stagger animation
        card.style.animation = `fadeInUp 0.5s ${idx * 0.08}s both`;
        galleryGrid.appendChild(card);
      });
    } catch (err) {
      console.error('Error loading gallery:', err);
      galleryCount.textContent = 'Error cargando recuerdos';
    }
  }

  // ── Lightbox ───────────────────────────────────────────────
  function openLightbox(index) {
    if (index < 0 || index >= allRecuerdos.length) return;

    currentLightboxIndex = index;
    const rec = allRecuerdos[index];
    lightboxContent.innerHTML = '';

    if (rec.mediaType === 'image') {
      const img = document.createElement('img');
      img.src = rec.data;
      img.alt = rec.name;
      lightboxContent.appendChild(img);
    } else {
      const video = document.createElement('video');
      video.src = rec.data;
      video.controls = true;
      video.autoplay = true;
      video.setAttribute('playsinline', '');
      lightboxContent.appendChild(video);
    }

    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';

    // Update nav visibility
    lightboxPrev.style.display = index > 0 ? 'block' : 'none';
    lightboxNext.style.display = index < allRecuerdos.length - 1 ? 'block' : 'none';
  }

  function closeLightbox() {
    lightbox.hidden = true;
    document.body.style.overflow = '';
    // Pause any video
    const video = lightboxContent.querySelector('video');
    if (video) video.pause();
    currentLightboxIndex = -1;
  }

  function downloadCurrent() {
    if (currentLightboxIndex < 0) return;
    const rec = allRecuerdos[currentLightboxIndex];

    const a = document.createElement('a');
    a.href = rec.data;
    a.download = rec.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Descargando ' + rec.name);
  }

  async function deleteCurrent() {
    if (currentLightboxIndex < 0) return;
    const rec = allRecuerdos[currentLightboxIndex];

    if (!confirm(`¿Eliminar "${rec.name}"?\nEsta acción no se puede deshacer.`)) return;

    try {
      await dbDelete(rec.id);
      showToast('Recuerdo eliminado');
      closeLightbox();
      await loadGallery();
    } catch (err) {
      console.error('Error deleting:', err);
      showToast('Error al eliminar', 'error');
    }
  }

  // ── Event Listeners ────────────────────────────────────────

  // Upload button
  btnUpload.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  // Drop zone click
  dropZone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFiles(fileInput.files);
      fileInput.value = '';
    }
  });

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

  // Lightbox controls
  lightboxClose.addEventListener('click', closeLightbox);
  lightboxDownload.addEventListener('click', downloadCurrent);
  lightboxDelete.addEventListener('click', deleteCurrent);

  lightboxPrev.addEventListener('click', () => {
    if (currentLightboxIndex > 0) openLightbox(currentLightboxIndex - 1);
  });

  lightboxNext.addEventListener('click', () => {
    if (currentLightboxIndex < allRecuerdos.length - 1) openLightbox(currentLightboxIndex + 1);
  });

  // Lightbox backdrop click
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (lightbox.hidden) return;

    switch (e.key) {
      case 'Escape':
        closeLightbox();
        break;
      case 'ArrowLeft':
        if (currentLightboxIndex > 0) openLightbox(currentLightboxIndex - 1);
        break;
      case 'ArrowRight':
        if (currentLightboxIndex < allRecuerdos.length - 1) openLightbox(currentLightboxIndex + 1);
        break;
    }
  });

  // Prevent default drag on the whole page
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());

  // ── Init ───────────────────────────────────────────────────
  spawnHearts();
  loadGallery();
})();
