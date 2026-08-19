import {
  db, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, writeBatch
} from "./firebase.js";

export function watchLibrary(onPhotos, onAlbums, onError) {
  const unsubPhotos = onSnapshot(collection(db, "photos"), snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    onPhotos(items);
  }, onError);

  const unsubAlbums = onSnapshot(collection(db, "albums"), snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    onAlbums(items);
  }, onError);

  return () => { unsubPhotos(); unsubAlbums(); };
}

export async function addPhotoRecord(data) {
  return addDoc(collection(db, "photos"), {
    ...data,
    favorite: false,
    deleted: false,
    deletedAt: null,
    createdAt: serverTimestamp()
  });
}

export async function setFavorite(photoId, favorite) {
  return updateDoc(doc(db, "photos", photoId), { favorite });
}

export async function setAlbum(photoId, albumId) {
  return updateDoc(doc(db, "photos", photoId), { albumId: albumId || null });
}

export async function moveToTrash(photoId) {
  return updateDoc(doc(db, "photos", photoId), {
    deleted: true,
    deletedAt: new Date().toISOString()
  });
}

export async function restorePhoto(photoId) {
  return updateDoc(doc(db, "photos", photoId), {
    deleted: false,
    deletedAt: null
  });
}

export async function deletePhotoMetadata(photoId) {
  return deleteDoc(doc(db, "photos", photoId));
}

export async function createAlbum(name) {
  return addDoc(collection(db, "albums"), {
    name: String(name || "").trim(),
    createdAt: serverTimestamp()
  });
}

export async function deleteAlbum(albumId, photos) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "albums", albumId));
  photos.filter(p => p.albumId === albumId).forEach(p => {
    batch.update(doc(db, "photos", p.id), { albumId: null });
  });
  return batch.commit();
}
