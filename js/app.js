import { CLOUDS, OWNER_EMAIL } from "./config.js";
import { login, logout, watchAuth } from "./auth.js";
import {
  watchLibrary, addPhotoRecord, setFavorite, setAlbum,
  moveToTrash, restorePhoto, deletePhotoMetadata, createAlbum, deleteAlbum
} from "./gallery.js";
import { chooseCloud, cloudinaryThumb, cloudinaryDownload, uploadImage } from "./cloudinary.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const els = {
  loginScreen: $("#login-screen"),
  appShell: $("#app-shell"),
  loginForm: $("#login-form"),
  username: $("#username"),
  password: $("#password"),
  loginBtn: $("#login-btn"),
  loginError: $("#login-error"),
  togglePassword: $("#toggle-password"),
  logoutBtn: $("#logout-btn"),
  themeBtn: $("#theme-btn"),
  main: $("#main-content"),
  title: $("#view-title"),
  eyebrow: $("#view-eyebrow"),
  openUpload: $("#open-upload-btn"),
  newAlbum: $("#new-album-btn"),
  uploadModal: $("#upload-modal"),
  albumModal: $("#album-modal"),
  viewer: $("#viewer-modal"),
  albumForm: $("#album-form"),
  albumName: $("#album-name"),
  fileInput: $("#file-input"),
  chooseFiles: $("#choose-files-btn"),
  dropzone: $("#dropzone"),
  uploadAlbum: $("#upload-album"),
  uploadCloud: $("#upload-cloud"),
  uploadSummary: $("#upload-summary"),
  uploadCount: $("#upload-count"),
  uploadTotalSize: $("#upload-total-size"),
  uploadTotalProgress: $("#upload-total-progress"),
  uploadQueue: $("#upload-queue"),
  startUpload: $("#start-upload-btn"),
  viewerClose: $("#viewer-close"),
  viewerImage: $("#viewer-image"),
  viewerInfo: $("#viewer-info"),
  viewerFavorite: $("#viewer-favorite"),
  viewerDownload: $("#viewer-download"),
  viewerTrash: $("#viewer-trash"),
  viewerPrev: $("#viewer-prev"),
  viewerNext: $("#viewer-next"),
  toastStack: $("#toast-stack")
};

const state = {
  user: null,
  photos: [],
  albums: [],
  view: "photos",
  period: "all",
  activeAlbumId: null,
  viewerPhotoId: null,
  uploadItems: [],
  uploading: false,
  unwatch: null
};

const viewMeta = {
  photos: ["المكتبة", "الصور"],
  favorites: ["المكتبة", "المفضلة"],
  albums: ["تنظيم", "الألبومات"],
  search: ["المكتبة", "بحث"],
  trash: ["الأدوات", "المحذوفة"],
  storage: ["الإعدادات", "التخزين"]
};

function toast(message, type = "ok") {
  const node = document.createElement("div");
  node.className = `toast ${type === "error" ? "error" : ""}`;
  node.textContent = message;
  els.toastStack.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

function toDate(value) {
  if (!value) return new Date(0);
  if (value?.toDate) return value.toDate();
  const d = new Date(value);
  return isNaN(d) ? new Date(0) : d;
}

function formatBytes(bytes = 0) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(date) {
  try {
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(toDate(date));
  } catch { return ""; }
}

function monthKey(photo) {
  const d = toDate(photo.takenAt || photo.uploadedAt || photo.createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(d);
}

function activePhotos() {
  return state.photos.filter(p => !p.deleted);
}

function trashPhotos() {
  return state.photos.filter(p => p.deleted);
}

function sortedPhotos(items) {
  return [...items].sort((a, b) => toDate(b.takenAt || b.uploadedAt || b.createdAt) - toDate(a.takenAt || a.uploadedAt || a.createdAt));
}

function photoUsage() {
  const usage = Object.fromEntries(CLOUDS.map(c => [c.id, 0]));
  state.photos.forEach(p => {
    if (usage[p.cloudId] != null) usage[p.cloudId] += Number(p.bytes) || 0;
  });
  return usage;
}

function setTheme(mode) {
  let theme = mode;
  if (mode === "system") {
    theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#000000" : "#f5f5f7");
  localStorage.setItem("iegy-theme", mode);
}

function cycleTheme() {
  const current = localStorage.getItem("iegy-theme") || "system";
  const next = current === "system" ? "dark" : current === "dark" ? "light" : "system";
  setTheme(next);
  toast(next === "dark" ? "الوضع الداكن" : next === "light" ? "الوضع الفاتح" : "المظهر حسب الجهاز");
}

function setView(view, albumId = null) {
  state.view = view;
  state.activeAlbumId = albumId;
  $$(".nav-item, .mobile-nav-item").forEach(b => b.classList.toggle("is-active", b.dataset.view === view));
  const [eyebrow, title] = viewMeta[view] || ["المكتبة", "الصور"];
  els.eyebrow.textContent = albumId ? "الألبومات" : eyebrow;
  if (albumId) {
    const album = state.albums.find(a => a.id === albumId);
    els.title.textContent = album?.name || "ألبوم";
  } else {
    els.title.textContent = title;
  }
  render();
  els.main.focus({ preventScroll: true });
}

function photoTile(photo, options = {}) {
  const fav = photo.favorite ? `<span class="heart">♥</span>` : "";
  const badge = `<span class="cloud-badge">${photo.cloudId === "cloud2" ? "C2" : "C1"}</span>`;
  const trashActions = options.trash ? `
    <span class="trash-item-actions">
      <button class="mini-action" data-restore="${photo.id}">استعادة</button>
      <button class="mini-action" data-remove="${photo.id}">إزالة</button>
    </span>` : "";
  return `
    <button class="photo-tile" data-photo-id="${photo.id}" type="button" aria-label="${escapeHtml(photo.originalFilename || "صورة")}">
      <img src="${escapeHtml(cloudinaryThumb(photo.secureUrl, 520))}" alt="" loading="lazy" decoding="async" />
      ${fav}${badge}${trashActions}
    </button>`;
}

function groupByMonth(items) {
  return sortedPhotos(items).reduce((acc, p) => {
    const key = monthKey(p);
    (acc[key] ||= []).push(p);
    return acc;
  }, {});
}

function renderPhotoLibrary(items, emptyTitle = "لا توجد صور بعد", emptyText = "ابدأ برفع صورك لتظهر هنا.") {
  if (!items.length) return emptyState("▧", emptyTitle, emptyText, true);
  const groups = groupByMonth(items);
  return Object.entries(groups).map(([key, photos]) => `
    <section class="photo-section">
      <div class="photo-section-head">
        <h2>${monthLabel(key)}</h2>
        <span>${photos.length} صورة</span>
      </div>
      <div class="photo-grid">
        ${photos.map(p => photoTile(p)).join("")}
      </div>
    </section>
  `).join("");
}

function filterByPeriod(items) {
  const now = new Date();
  if (state.period === "all") return items;
  if (state.period === "months") {
    return items.filter(p => {
      const d = toDate(p.takenAt || p.createdAt);
      return d.getFullYear() === now.getFullYear();
    });
  }
  if (state.period === "years") return items;
  return items;
}

function renderPhotosView() {
  const items = filterByPeriod(activePhotos());
  return `
    <div class="library-toolbar">
      <div class="segmented">
        <button data-period="years" class="${state.period === "years" ? "is-active" : ""}">السنوات</button>
        <button data-period="months" class="${state.period === "months" ? "is-active" : ""}">الشهور</button>
        <button data-period="all" class="${state.period === "all" ? "is-active" : ""}">كل الصور</button>
      </div>
      <div class="stat-line">${activePhotos().length} صورة · ${formatBytes(activePhotos().reduce((s,p)=>s+(Number(p.bytes)||0),0))}</div>
    </div>
    ${renderPhotoLibrary(items)}
  `;
}

function renderFavoritesView() {
  const items = activePhotos().filter(p => p.favorite);
  return renderPhotoLibrary(items, "لا توجد صور مفضلة", "اضغط ♡ داخل أي صورة لإضافتها إلى المفضلة.");
}

function albumCover(album) {
  const photos = sortedPhotos(activePhotos().filter(p => p.albumId === album.id));
  const cover = photos[0];
  return cover
    ? `<img src="${escapeHtml(cloudinaryThumb(cover.secureUrl, 620))}" alt="" loading="lazy" />`
    : `<span class="album-placeholder">▣</span>`;
}

function renderAlbumsView() {
  if (!state.albums.length) return emptyState("▣", "لا توجد ألبومات", "أنشئ ألبومًا جديدًا ونظّم صورك داخله.", false, `<button class="primary-btn" id="empty-new-album">+ ألبوم جديد</button>`);
  return `
    <div class="album-grid">
      ${[...state.albums].sort((a,b)=>String(a.name).localeCompare(String(b.name),"ar")).map(a => {
        const count = activePhotos().filter(p => p.albumId === a.id).length;
        return `
          <button class="album-card" data-album-id="${a.id}" type="button">
            <div class="album-cover">${albumCover(a)}</div>
            <h3>${escapeHtml(a.name)}</h3>
            <p>${count} صورة</p>
          </button>`;
      }).join("")}
    </div>`;
}

function renderAlbumDetail(albumId) {
  const album = state.albums.find(a => a.id === albumId);
  if (!album) return emptyState("▣", "الألبوم غير موجود", "");
  const photos = activePhotos().filter(p => p.albumId === albumId);
  return `
    <div class="library-toolbar">
      <div class="top-actions">
        <button class="secondary-btn" id="back-to-albums">← الألبومات</button>
        <button class="secondary-btn" id="delete-album-btn">حذف الألبوم</button>
      </div>
      <div class="stat-line">${photos.length} صورة</div>
    </div>
    ${renderPhotoLibrary(photos, "الألبوم فارغ", "ارفع صورًا أو أضف صورًا لهذا الألبوم.")}
  `;
}

function renderSearchView() {
  return `
    <div class="search-panel">
      <div class="search-box"><input id="search-input" type="search" placeholder="ابحث بالاسم أو الألبوم أو النوع…" autocomplete="off" /></div>
      <p class="search-hint">يمكنك البحث باسم الملف، اسم الألبوم، الامتداد أو اسم Cloudinary.</p>
    </div>
    <div id="search-results"></div>
  `;
}

function doSearch(query) {
  const q = String(query || "").trim().toLowerCase();
  const target = $("#search-results");
  if (!target) return;
  if (!q) {
    target.innerHTML = emptyState("⌕", "ابحث في مكتبتك", "اكتب كلمة للعثور على الصور بسرعة.");
    return;
  }
  const albumMap = Object.fromEntries(state.albums.map(a => [a.id, a.name || ""]));
  const results = activePhotos().filter(p => {
    const hay = [
      p.originalFilename, p.format, p.cloudName, p.publicId, albumMap[p.albumId]
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  });
  target.innerHTML = renderPhotoLibrary(results, "لا توجد نتائج", "جرّب كلمة بحث أخرى.");
  bindDynamicEvents();
}

function renderTrashView() {
  const items = sortedPhotos(trashPhotos());
  if (!items.length) return emptyState("⌫", "المحذوفة فارغة", "الصور التي تحذفها من المكتبة ستظهر هنا.");
  return `
    <div class="security-note"><strong>مهم:</strong> الحذف هنا يخص فهرس الموقع في Firestore. لأن الرفع Cloudinary Unsigned وبدون Backend، إزالة السجل نهائيًا من هنا لا تحذف الملف الأصلي من Cloudinary بعد انتهاء مهلة Delete Token؛ احذفه يدويًا من Cloudinary Console إذا أردت تحرير المساحة.</div>
    <div class="photo-grid" style="margin-top:18px">
      ${items.map(p => photoTile(p, { trash: true })).join("")}
    </div>`;
}

function renderStorageView() {
  const usage = photoUsage();
  const total = Object.values(usage).reduce((a,b)=>a+b,0);
  const max = Math.max(...Object.values(usage), 1);
  const countByCloud = Object.fromEntries(CLOUDS.map(c => [c.id, state.photos.filter(p => p.cloudId === c.id).length]));
  return `
    <div class="storage-card" style="margin-bottom:16px">
      <div class="storage-head"><div><h3>إجمالي التخزين المتتبع</h3><p>حسب الصور المسجلة داخل Firestore</p></div></div>
      <div class="storage-value">${formatBytes(total)}</div>
      <div class="storage-meta">${state.photos.length} ملف مسجل</div>
    </div>
    <div class="storage-grid">
      ${CLOUDS.map(c => `
        <article class="storage-card">
          <div class="storage-head">
            <div><h3>${c.label}</h3><p>${c.cloudName}</p></div>
            <span>${c.id === "cloud1" ? "C1" : "C2"}</span>
          </div>
          <div class="storage-value">${formatBytes(usage[c.id] || 0)}</div>
          <div class="storage-meta">${countByCloud[c.id] || 0} صورة</div>
          <div class="storage-bar"><i style="width:${Math.max(4, ((usage[c.id] || 0) / max) * 100)}%"></i></div>
        </article>
      `).join("")}
    </div>
    <div class="security-note"><strong>ملاحظة:</strong> هذه الأرقام ليست Quota رسمية من Cloudinary؛ هي مجموع أحجام الملفات التي رفعها هذا الموقع وسجّلها في Firestore. إذا رفعت أو حذفت ملفات يدويًا من Cloudinary Console فلن تتغير هذه الأرقام تلقائيًا.</div>
  `;
}

function emptyState(icon, title, text, uploadButton = false, custom = "") {
  return `
    <div class="empty-state">
      <div class="empty-inner">
        <div class="empty-icon">${icon}</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(text)}</p>
        ${uploadButton ? `<button class="primary-btn" id="empty-upload">＋ رفع صور</button>` : custom}
      </div>
    </div>`;
}

function render() {
  if (!state.user) return;
  let html = "";
  if (state.activeAlbumId) html = renderAlbumDetail(state.activeAlbumId);
  else if (state.view === "photos") html = renderPhotosView();
  else if (state.view === "favorites") html = renderFavoritesView();
  else if (state.view === "albums") html = renderAlbumsView();
  else if (state.view === "search") html = renderSearchView();
  else if (state.view === "trash") html = renderTrashView();
  else if (state.view === "storage") html = renderStorageView();
  els.main.innerHTML = html;
  bindDynamicEvents();
  if (state.view === "search" && !state.activeAlbumId) doSearch("");
}

function bindDynamicEvents() {
  $$("[data-photo-id]", els.main).forEach(btn => {
    btn.addEventListener("click", (e) => {
      if (e.target.closest("[data-restore], [data-remove]")) return;
      const id = btn.dataset.photoId;
      if (state.photos.find(p => p.id === id)?.deleted) return;
      openViewer(id);
    });
  });

  $$("[data-album-id]", els.main).forEach(btn => btn.addEventListener("click", () => setView("albums", btn.dataset.albumId)));
  $$("[data-period]", els.main).forEach(btn => btn.addEventListener("click", () => { state.period = btn.dataset.period; render(); }));

  $("#empty-upload")?.addEventListener("click", openUploadModal);
  $("#empty-new-album")?.addEventListener("click", openAlbumModal);
  $("#back-to-albums")?.addEventListener("click", () => setView("albums"));
  $("#delete-album-btn")?.addEventListener("click", handleDeleteAlbum);

  $$("[data-restore]", els.main).forEach(btn => btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    await restorePhoto(btn.dataset.restore);
    toast("تمت استعادة الصورة.");
  }));

  $$("[data-remove]", els.main).forEach(btn => btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const photo = state.photos.find(p => p.id === btn.dataset.remove);
    if (!photo) return;
    if (!confirm("إزالة سجل الصورة نهائيًا من الموقع؟ الملف الأصلي سيظل في Cloudinary ويلزم حذفه يدويًا من Cloudinary Console.")) return;
    await deletePhotoMetadata(photo.id);
    toast("تمت إزالة السجل من الموقع.");
  }));

  $("#search-input")?.addEventListener("input", (e) => doSearch(e.target.value));
}

function openModal(el) {
  el.classList.remove("is-hidden");
  el.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeModal(el) {
  el.classList.add("is-hidden");
  el.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function populateAlbumSelects() {
  const options = `<option value="">بدون ألبوم</option>` + state.albums
    .sort((a,b)=>String(a.name).localeCompare(String(b.name),"ar"))
    .map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  els.uploadAlbum.innerHTML = options;
}

function openUploadModal() {
  state.uploadItems.forEach(i => i.preview && URL.revokeObjectURL(i.preview));
  state.uploadItems = [];
  els.fileInput.value = "";
  els.uploadQueue.innerHTML = "";
  els.uploadSummary.classList.add("is-hidden");
  els.startUpload.disabled = true;
  els.uploadTotalProgress.style.width = "0%";
  populateAlbumSelects();
  if (state.activeAlbumId) els.uploadAlbum.value = state.activeAlbumId;
  openModal(els.uploadModal);
}

function openAlbumModal() {
  els.albumForm.reset();
  openModal(els.albumModal);
  setTimeout(() => els.albumName.focus(), 100);
}

function addFiles(files) {
  if (state.uploading) return;
  const incoming = [...files].filter(f => f.type.startsWith("image/"));
  if (!incoming.length) {
    toast("اختر ملفات صور فقط.", "error");
    return;
  }
  for (const file of incoming) {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (state.uploadItems.some(i => i.key === key)) continue;
    state.uploadItems.push({
      key, file, preview: URL.createObjectURL(file),
      progress: 0, status: "waiting", error: null
    });
  }
  renderUploadQueue();
}

function renderUploadQueue() {
  const total = state.uploadItems.reduce((s,i)=>s+i.file.size,0);
  const completedProgress = state.uploadItems.length
    ? state.uploadItems.reduce((s,i)=>s+i.progress,0) / state.uploadItems.length : 0;
  els.uploadSummary.classList.toggle("is-hidden", state.uploadItems.length === 0);
  els.uploadCount.textContent = `${state.uploadItems.length} صورة`;
  els.uploadTotalSize.textContent = formatBytes(total);
  els.uploadTotalProgress.style.width = `${completedProgress}%`;
  els.startUpload.disabled = !state.uploadItems.length || state.uploading || state.uploadItems.every(i => i.status === "done");

  els.uploadQueue.innerHTML = state.uploadItems.map((i, idx) => {
    const label = i.status === "done" ? "تم" : i.status === "uploading" ? `${i.progress}%` : i.status === "failed" ? "فشل" : "انتظار";
    return `
      <div class="queue-item">
        <img class="queue-thumb" src="${i.preview}" alt="" />
        <div class="queue-info">
          <strong>${escapeHtml(i.file.name)}</strong>
          <small>${formatBytes(i.file.size)}</small>
          <div class="item-progress"><i style="width:${i.progress}%"></i></div>
        </div>
        <span class="queue-state ${i.status === "done" ? "ok" : i.status === "failed" ? "fail" : ""}" title="${escapeHtml(i.error || "")}">${label}</span>
      </div>`;
  }).join("");
}

async function processUploadItem(item, usage) {
  item.status = "uploading";
  item.error = null;
  renderUploadQueue();
  const mode = els.uploadCloud.value;
  const cloud = chooseCloud(mode, usage);
  usage[cloud.id] = (usage[cloud.id] || 0) + item.file.size;

  try {
    const result = await uploadImage(item.file, cloud, p => {
      item.progress = p;
      renderUploadQueue();
    });
    await addPhotoRecord({
      cloudId: cloud.id,
      cloudName: cloud.cloudName,
      assetId: result.asset_id || "",
      publicId: result.public_id || "",
      secureUrl: result.secure_url || result.url || "",
      width: result.width || 0,
      height: result.height || 0,
      bytes: result.bytes || item.file.size,
      format: result.format || item.file.type.split("/")[1] || "",
      resourceType: result.resource_type || "image",
      originalFilename: item.file.name,
      uploadedAt: result.created_at || new Date().toISOString(),
      takenAt: item.file.lastModified ? new Date(item.file.lastModified).toISOString() : (result.created_at || new Date().toISOString()),
      albumId: els.uploadAlbum.value || null
    });
    item.progress = 100;
    item.status = "done";
  } catch (err) {
    usage[cloud.id] = Math.max(0, (usage[cloud.id] || 0) - item.file.size);
    item.status = "failed";
    item.error = err.message || "فشل الرفع";
  }
  renderUploadQueue();
}

async function startUpload() {
  if (state.uploading) return;
  const pending = state.uploadItems.filter(i => i.status !== "done");
  if (!pending.length) return;
  state.uploading = true;
  els.startUpload.disabled = true;
  const usage = photoUsage();

  const workers = Array.from({ length: Math.min(3, pending.length) }, async () => {
    while (pending.length) {
      const item = pending.shift();
      if (item) await processUploadItem(item, usage);
    }
  });

  await Promise.all(workers);
  state.uploading = false;
  renderUploadQueue();
  const failed = state.uploadItems.filter(i => i.status === "failed").length;
  if (failed) {
    els.startUpload.disabled = false;
    els.startUpload.textContent = `إعادة محاولة الفاشل (${failed})`;
    toast(`اكتمل الرفع مع ${failed} ملف فاشل.`, "error");
  } else {
    els.startUpload.textContent = "تم الرفع";
    toast("تم رفع كل الصور بنجاح.");
    setTimeout(() => closeModal(els.uploadModal), 700);
  }
}

function currentViewerList() {
  let items = activePhotos();
  if (state.activeAlbumId) items = items.filter(p => p.albumId === state.activeAlbumId);
  else if (state.view === "favorites") items = items.filter(p => p.favorite);
  return sortedPhotos(items);
}

function openViewer(photoId) {
  state.viewerPhotoId = photoId;
  renderViewer();
  els.viewer.classList.remove("is-hidden");
  els.viewer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeViewer() {
  els.viewer.classList.add("is-hidden");
  els.viewer.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  state.viewerPhotoId = null;
}

function renderViewer() {
  const photo = state.photos.find(p => p.id === state.viewerPhotoId);
  if (!photo) return closeViewer();
  els.viewerImage.src = photo.secureUrl;
  els.viewerImage.alt = photo.originalFilename || "صورة";
  els.viewerFavorite.textContent = photo.favorite ? "♥" : "♡";
  els.viewerDownload.href = cloudinaryDownload(photo.secureUrl);
  const albumOptions = `<option value="">بدون ألبوم</option>` + state.albums.map(a => `<option value="${a.id}" ${a.id === photo.albumId ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");
  els.viewerInfo.innerHTML = `
    <h3>${escapeHtml(photo.originalFilename || photo.publicId || "صورة")}</h3>
    <div class="viewer-date">${formatDate(photo.takenAt || photo.uploadedAt)}</div>
    <div class="info-row"><span>الأبعاد</span><span>${photo.width || "—"} × ${photo.height || "—"}</span></div>
    <div class="info-row"><span>الحجم</span><span>${formatBytes(photo.bytes)}</span></div>
    <div class="info-row"><span>النوع</span><span>${escapeHtml(String(photo.format || "").toUpperCase())}</span></div>
    <div class="info-row"><span>التخزين</span><span>${photo.cloudId === "cloud2" ? "Cloudinary 2" : "Cloudinary 1"}</span></div>
    <div class="info-row"><span>Cloud</span><span dir="ltr">${escapeHtml(photo.cloudName || "")}</span></div>
    <select id="viewer-album-select" aria-label="الألبوم">${albumOptions}</select>
  `;
  $("#viewer-album-select")?.addEventListener("change", async (e) => {
    await setAlbum(photo.id, e.target.value || null);
    toast("تم تحديث الألبوم.");
  });
  const list = currentViewerList();
  const idx = list.findIndex(p => p.id === photo.id);
  els.viewerPrev.disabled = idx <= 0;
  els.viewerNext.disabled = idx < 0 || idx >= list.length - 1;
  els.viewerPrev.style.opacity = els.viewerPrev.disabled ? ".25" : "1";
  els.viewerNext.style.opacity = els.viewerNext.disabled ? ".25" : "1";
}

function viewerStep(dir) {
  const list = currentViewerList();
  const idx = list.findIndex(p => p.id === state.viewerPhotoId);
  const next = list[idx + dir];
  if (next) {
    state.viewerPhotoId = next.id;
    renderViewer();
  }
}

async function handleDeleteAlbum() {
  const album = state.albums.find(a => a.id === state.activeAlbumId);
  if (!album) return;
  if (!confirm(`حذف ألبوم "${album.name}"؟ الصور لن تُحذف، فقط ستخرج من الألبوم.`)) return;
  await deleteAlbum(album.id, state.photos);
  toast("تم حذف الألبوم.");
  setView("albums");
}

function wireStaticEvents() {
  els.loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.loginError.textContent = "";
    els.loginBtn.disabled = true;
    els.loginBtn.textContent = "جاري الدخول…";
    try {
      await login(els.username.value, els.password.value);
      els.password.value = "";
    } catch (err) {
      const code = err?.code || "";
      if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
        els.loginError.textContent = "اسم المستخدم أو كلمة المرور غير صحيحة.";
      } else if (code.includes("too-many-requests")) {
        els.loginError.textContent = "محاولات كثيرة. جرّب بعد قليل.";
      } else {
        els.loginError.textContent = err?.message || "تعذر تسجيل الدخول.";
      }
    } finally {
      els.loginBtn.disabled = false;
      els.loginBtn.textContent = "دخول";
    }
  });

  els.togglePassword.addEventListener("click", () => {
    els.password.type = els.password.type === "password" ? "text" : "password";
  });

  els.logoutBtn.addEventListener("click", () => logout());
  els.themeBtn.addEventListener("click", cycleTheme);
  els.openUpload.addEventListener("click", openUploadModal);
  els.newAlbum.addEventListener("click", openAlbumModal);

  $$(".nav-item, .mobile-nav-item").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));

  $$("[data-close-modal]").forEach(btn => btn.addEventListener("click", () => {
    const which = btn.dataset.closeModal;
    if (which === "upload" && state.uploading) return toast("انتظر حتى ينتهي الرفع الحالي.", "error");
    closeModal(which === "upload" ? els.uploadModal : els.albumModal);
  }));

  els.albumForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = els.albumName.value.trim();
    if (!name) return;
    await createAlbum(name);
    closeModal(els.albumModal);
    toast("تم إنشاء الألبوم.");
  });

  els.chooseFiles.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => addFiles(els.fileInput.files));

  ["dragenter", "dragover"].forEach(evt => els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault(); els.dropzone.classList.add("is-dragover");
  }));
  ["dragleave", "drop"].forEach(evt => els.dropzone.addEventListener(evt, (e) => {
    e.preventDefault(); els.dropzone.classList.remove("is-dragover");
  }));
  els.dropzone.addEventListener("drop", e => addFiles(e.dataTransfer.files));

  els.startUpload.addEventListener("click", startUpload);

  els.viewerClose.addEventListener("click", closeViewer);
  els.viewerPrev.addEventListener("click", () => viewerStep(-1));
  els.viewerNext.addEventListener("click", () => viewerStep(1));
  els.viewerFavorite.addEventListener("click", async () => {
    const p = state.photos.find(p => p.id === state.viewerPhotoId);
    if (!p) return;
    await setFavorite(p.id, !p.favorite);
  });
  els.viewerTrash.addEventListener("click", async () => {
    const p = state.photos.find(p => p.id === state.viewerPhotoId);
    if (!p) return;
    if (!confirm("نقل الصورة إلى المحذوفة؟")) return;
    await moveToTrash(p.id);
    closeViewer();
    toast("تم نقل الصورة إلى المحذوفة.");
  });

  document.addEventListener("keydown", (e) => {
    if (!els.viewer.classList.contains("is-hidden")) {
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowLeft") viewerStep(document.dir === "rtl" ? 1 : -1);
      if (e.key === "ArrowRight") viewerStep(document.dir === "rtl" ? -1 : 1);
    }
  });
}

function startLibraryWatch() {
  state.unwatch?.();
  state.unwatch = watchLibrary(
    photos => {
      state.photos = photos;
      render();
      if (state.viewerPhotoId) renderViewer();
    },
    albums => {
      state.albums = albums;
      render();
      populateAlbumSelects();
      if (state.viewerPhotoId) renderViewer();
    },
    err => {
      console.error(err);
      toast("تعذر قراءة Firestore. تأكد من إنشاء القاعدة ونشر قواعد الأمان.", "error");
      els.main.innerHTML = emptyState("!", "تعذر فتح المكتبة", "تأكد من إعداد Firestore وقواعد الأمان ثم أعد تحميل الصفحة.");
    }
  );
}

wireStaticEvents();
setTheme(localStorage.getItem("iegy-theme") || "system");

watchAuth(user => {
  state.user = user;
  if (user) {
    els.loginScreen.classList.add("is-hidden");
    els.appShell.classList.remove("is-hidden");
    startLibraryWatch();
    render();
  } else {
    state.unwatch?.();
    state.unwatch = null;
    state.photos = [];
    state.albums = [];
    els.appShell.classList.add("is-hidden");
    els.loginScreen.classList.remove("is-hidden");
    els.username.value = "up";
    setTimeout(() => els.password.focus(), 50);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
