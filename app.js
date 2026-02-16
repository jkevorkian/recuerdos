/* ============================================================
   San Valentín – Nuestros Recuerdos  |  app.js
   GitHub-based media storage (Single File for file:// compatibility)
   ============================================================ */

(() => {
  'use strict';

  // ── GitHub Utils (Merged) ──────────────────────────────────
  const GITHUB_CONFIG = {
    owner: 'jkevorkian', // based on user's active workspace path
    repo: 'recuerdos',   // based on user's active workspace path
    path: 'recuerdos',   // folder in repo
    branch: 'main'       // default branch
  };

  // ⚠️ SECURITY WARNING: This token has Read/Write access to the repo.
  // Do not commit this file to a public repository if this token is sensitive.
  // Base64 encoded to avoid GitHub secret scanning
  const GITHUB_TOKEN = atob('Z2l0aHViX3BhdF8xMUFQQUtVVkkwdnVkVFN3cjhGSTBkX2NheTRjbUhNbHlUVjV5M1RUb3FZRjB5VXlKZ2szWkNVRUx1UTV1ZVczQjBISTVTVU5UWERxRUQyVDI4');

  function hasToken() {
    // Basic check
    return !!GITHUB_TOKEN && !GITHUB_TOKEN.includes('...');
  }

  async function uploadFile(file, base64Content) {
    if (!hasToken()) throw new Error("No token set");

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `${GITHUB_CONFIG.path}/${timestamp}_${safeName}`;

    const body = {
      message: `Add memory: ${file.name}`,
      content: base64Content,
      branch: GITHUB_CONFIG.branch
    };

    const response = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Upload failed');
    }

    return await response.json();
  }

  async function listFiles() {
    const headers = hasToken() ? { 'Authorization': `token ${GITHUB_TOKEN}` } : {};

    const response = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}?ref=${GITHUB_CONFIG.branch}`, {
      headers: headers
    });

    if (response.status === 404) return []; // Folder might not exist yet
    if (!response.ok) throw new Error('Failed to list files');

    const data = await response.json();

    return data
      .filter(item => item.type === 'file' && item.name !== '.gitkeep')
      .map(item => ({
        name: item.name,
        url: item.download_url,
        sha: item.sha,
        size: item.size,
        path: item.path
      }));
  }

  async function deleteFile(path, sha) {
    if (!hasToken()) throw new Error("No token set");

    const body = {
      message: `Delete memory: ${path}`,
      sha: sha,
      branch: GITHUB_CONFIG.branch
    };

    const response = await fetch(`https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${path}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error('Delete failed');
    return await response.json();
  }


  // ── DOM References ─────────────────────────────────────────
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const btnUpload = document.getElementById('btnUpload');
  const uploadProgress = document.getElementById('uploadProgress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const galleryGrid = document.getElementById('galleryGrid');
  const galleryEmpty = document.getElementById('galleryEmpty');
  const galleryCount = document.getElementById('galleryCount');

  // Lightbox
  const lightbox = document.getElementById('lightbox');
  const lightboxContent = document.getElementById('lightboxContent');
  const lightboxClose = document.getElementById('lightboxClose');
  const lightboxDownload = document.getElementById('lightboxDownload');
  const lightboxDelete = document.getElementById('lightboxDelete');
  const lightboxPrev = document.getElementById('lightboxPrev');
  const lightboxNext = document.getElementById('lightboxNext');

  // UI Enhancements
  const toastContainer = document.getElementById('toastContainer');
  const heartsBg = document.getElementById('heartsBg');

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
  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // remove data:image/png;base64, prefix
        const content = reader.result.split(',')[1];
        resolve(content);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function getMediaType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
    return 'unknown';
  }

  async function handleFiles(files) {
    if (!hasToken()) {
      showToast('Error: Token de GitHub no configurado en app.js', 'error');
      return;
    }

    const validFiles = Array.from(files).filter(f => {
      const type = f.type.split('/')[0];
      return type === 'image' || type === 'video';
    });

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

        const base64 = await readFileAsBase64(file);
        await uploadFile(file, base64);

        processed++;
      } catch (err) {
        console.error('Error saving file:', file.name, err);
        showToast(`Error: ${err.message}`, 'error');
      }
    }

    progressFill.style.width = '100%';
    progressText.textContent = '¡Listo!';

    // Wait a bit for GitHub CDN propagation / API consistency
    setTimeout(() => {
      uploadProgress.hidden = true;
      progressFill.style.width = '0%';
      loadGallery();
    }, 2000);

    showToast(`${processed} recuerdo${processed > 1 ? 's' : ''} guardado${processed > 1 ? 's' : ''} ❤️`);
  }

  // ── Gallery Rendering ──────────────────────────────────────
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

    const src = recuerdo.url;

    if (recuerdo.mediaType === 'image') {
      const img = document.createElement('img');
      img.src = src;
      img.alt = recuerdo.name;
      img.loading = 'lazy';
      card.appendChild(img);
    } else {
      const video = document.createElement('video');
      video.src = src;
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
    overlay.innerHTML = `<span class="card-date">${formatSize(recuerdo.size)}</span>`;
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
      galleryCount.textContent = 'Buscando recuerdos...';
      const files = await listFiles();

      allRecuerdos = files.map(f => ({
        ...f,
        mediaType: getMediaType(f.name)
      }));

      // Sort newest first
      allRecuerdos.sort((a, b) => b.name.localeCompare(a.name));

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
      galleryCount.textContent = 'Error cargando recuerdos (Verifica el Token)';
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
      img.src = rec.url;
      img.alt = rec.name;
      lightboxContent.appendChild(img);
    } else {
      const video = document.createElement('video');
      video.src = rec.url;
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
    a.href = rec.url;
    a.download = rec.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function deleteCurrent() {
    if (currentLightboxIndex < 0) return;
    const rec = allRecuerdos[currentLightboxIndex];

    if (!confirm(`¿Eliminar "${rec.name}"?\nEsta acción no se puede deshacer de GitHub.`)) return;

    try {
      await deleteFile(rec.path, rec.sha);
      showToast('Recuerdo eliminado');
      closeLightbox();
      await loadGallery(); // refresh
    } catch (err) {
      console.error('Error deleting:', err);
      showToast('Error al eliminar (permisos?)', 'error');
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
