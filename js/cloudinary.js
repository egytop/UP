import { CLOUDS } from "./config.js";

export function getCloud(id) {
  return CLOUDS.find(c => c.id === id) || CLOUDS[0];
}

export function chooseCloud(mode, usage) {
  if (mode !== "auto") return getCloud(mode);
  return [...CLOUDS].sort((a, b) => (usage[a.id] || 0) - (usage[b.id] || 0))[0];
}

export function cloudinaryThumb(url, size = 520) {
  if (!url) return "";
  if (!url.includes("/upload/")) return url;
  return url.replace("/upload/", `/upload/c_fill,w_${size},h_${size},g_auto,q_auto,f_auto/`);
}

export function cloudinaryDownload(url) {
  if (!url) return "#";
  if (!url.includes("/upload/")) return url;
  return url.replace("/upload/", "/upload/fl_attachment/");
}

export function uploadImage(file, cloud, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud.cloudName)}/image/upload`;
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", cloud.uploadPreset);

    xhr.open("POST", url, true);
    xhr.responseType = "json";

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      const body = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body?.error?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("تعذر الاتصال بخدمة رفع الصور."));
    xhr.ontimeout = () => reject(new Error("انتهت مهلة رفع الصورة."));
    xhr.timeout = 120000;
    xhr.send(form);
  });
}
