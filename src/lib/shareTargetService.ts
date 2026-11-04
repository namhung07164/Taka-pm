import { doc } from 'firebase/firestore';
import { setDoc } from './firestoreWrites';
import { db, APP_ID } from './firebase';
import { localDb, SharedMediaRecord } from './localDb';
import { useAppStore } from '../store/useAppStore';
import { Project, Task, TaskComment } from '../types';
import { compressImageToWebp } from './imageCompression';
import { uploadPictureToTakaFolder } from './r2StorageUtils';
import { syncUploadedImageToProjectAndUnit } from './projectImageSync';
import { recordDelta } from './deltaSyncService';

const SHARE_INBOX_DB_NAME = 'TakaShareTargetInboxDB';
const SHARE_INBOX_STORE_NAME = 'shared_inbox';

export interface IncomingSharedFileItem {
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  type: string;
}

export interface IncomingSharePayload {
  id: string;
  title: string;
  text: string;
  url: string;
  files: IncomingSharedFileItem[];
  receivedAt: string;
}

export interface SaveSharedMediaParams {
  files: File[];
  title: string;
  caption: string;
  sharedUrl?: string;
  store: string;
  year: string;
  location: string;
  project?: Project | null;
  unitCode: string;
  pinId: string;
  pinLabel: string;
  pinX?: number;
  pinY?: number;
  targetTask?: Task | null;
}

export interface SaveSharedMediaResult {
  savedCount: number;
  syncedToR2Count: number;
  queuedOfflineCount: number;
  records: SharedMediaRecord[];
}

function normalizeStore(store?: string | null): string {
  if (!store) return 'HCM';
  const s = String(store).trim().toUpperCase();
  if (s.includes('HN') || s.includes('HÀ NỘI') || s.includes('HA NOI') || s.includes('HANOI')) return 'HN';
  return 'HCM';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToFile(dataUrl: string, fileName: string, mimeType?: string): File {
  const parts = dataUrl.split(',');
  const header = parts[0] || '';
  const body = parts[1] || '';
  const detectedMime = mimeType || header.match(/:(.*?);/)?.[1] || 'image/webp';
  const binary = atob(body);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new File([array], fileName, { type: detectedMime, lastModified: Date.now() });
}

/**
 * Reads and consumes all shared payloads stored by the Service Worker in `TakaShareTargetInboxDB`.
 */
export async function consumeSharedInboxPayloads(): Promise<IncomingSharePayload[]> {
  if (typeof indexedDB === 'undefined') return [];

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(SHARE_INBOX_DB_NAME, 1);
      req.onupgradeneeded = (event: any) => {
        const idb = event.target.result as IDBDatabase;
        if (!idb.objectStoreNames.contains(SHARE_INBOX_STORE_NAME)) {
          idb.createObjectStore(SHARE_INBOX_STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = (event: any) => {
        const idb = event.target.result as IDBDatabase;
        if (!idb.objectStoreNames.contains(SHARE_INBOX_STORE_NAME)) {
          idb.close();
          resolve([]);
          return;
        }
        const tx = idb.transaction(SHARE_INBOX_STORE_NAME, 'readwrite');
        const store = tx.objectStore(SHARE_INBOX_STORE_NAME);
        const getAllReq = store.getAll();

        getAllReq.onsuccess = () => {
          const rawItems = Array.isArray(getAllReq.result) ? getAllReq.result : [];
          if (rawItems.length > 0) {
            store.clear();
          }
          const parsedPayloads: IncomingSharePayload[] = rawItems.map((raw: any) => {
            const files: IncomingSharedFileItem[] = (raw.files || []).map((f: any) => {
              const blob = new Blob([f.buffer], { type: f.type || 'image/jpeg' });
              const file = new File([blob], f.name || `shared_${Date.now()}.jpg`, {
                type: f.type || 'image/jpeg',
                lastModified: f.lastModified || Date.now(),
              });
              return {
                file,
                previewUrl: URL.createObjectURL(blob),
                name: file.name,
                size: file.size,
                type: file.type,
              };
            });

            return {
              id: String(raw.id || `share_${Date.now()}`),
              title: String(raw.title || ''),
              text: String(raw.text || ''),
              url: String(raw.url || ''),
              files,
              receivedAt: String(raw.receivedAt || new Date().toISOString()),
            };
          });

          idb.close();
          resolve(parsedPayloads);
        };

        getAllReq.onerror = () => {
          idb.close();
          resolve([]);
        };
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Updates local + Firestore unit gallery (`taka_unit_images`) and replaces `oldUrl` if upgrading from offline DataURL to R2 URL.
 */
async function upsertUnitPinImageRecord(params: {
  store: string;
  unitCode: string;
  url: string;
  oldUrlToReplace?: string;
  title: string;
  pinId: string;
  pinLabel: string;
  pinX?: number;
  pinY?: number;
  caption?: string;
  project?: Project | null;
}): Promise<void> {
  const normStore = normalizeStore(params.store);
  const cleanUnit = String(params.unitCode || params.project?.code || 'GENERAL').trim();
  if (!cleanUnit) return;

  const lsKey = `taka_unit_images_${normStore}_${cleanUnit}`;
  const docKey = `${normStore}_${cleanUnit}`;
  const nowIso = new Date().toISOString();

  let list: any[] = [];
  try {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch {
    list = [];
  }

  if (params.oldUrlToReplace) {
    list = list.filter((it) => (typeof it === 'string' ? it : it?.url) !== params.oldUrlToReplace);
  }

  const newEntry = {
    id: `pin_img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    url: params.url,
    title: params.title,
    caption: params.caption || '',
    pinId: params.pinId,
    pinLabel: params.pinLabel,
    pinX: params.pinX,
    pinY: params.pinY,
    store: normStore,
    unitCode: cleanUnit,
    projectId: params.project?.id || '',
    projectCode: params.project?.code || cleanUnit,
    year: String(params.project?.year || ''),
    createdAt: nowIso,
  };

  const exists = list.some((it) => (typeof it === 'string' ? it === params.url : it?.url === params.url));
  const updatedList = exists ? list : [newEntry, ...list];

  try {
    localStorage.setItem(lsKey, JSON.stringify(updatedList));
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('taka_unit_images_changed'));
  }

  try {
    const unitDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_unit_images', docKey);
    await setDoc(
      unitDocRef,
      {
        unitCode: cleanUnit,
        store: normStore,
        images: updatedList,
        updatedAt: nowIso,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[shareTargetService] Deferred unit image Firestore write (offline):', err);
  }
}

/**
 * Attaches shared media + inspection caption & pin metadata to Project and optional Task in Zustand + Dexie + Firestore.
 */
async function attachMediaToProjectAndTask(params: {
  project?: Project | null;
  targetTask?: Task | null;
  url: string;
  oldUrlToReplace?: string;
  fileName: string;
  title: string;
  caption: string;
  unitCode: string;
  pinLabel: string;
  pinX?: number;
  pinY?: number;
  store: string;
}): Promise<void> {
  const { project, targetTask, url, oldUrlToReplace, fileName, title, caption, unitCode, pinLabel, pinX, pinY } = params;
  const currentUser = useAppStore.getState().currentUser;
  const authorName = currentUser?.name || currentUser?.username || 'Field Inspector';
  const authorId = currentUser?.id || 'inspector';
  const nowIso = new Date().toISOString();

  const coordBadge =
    typeof pinX === 'number' && typeof pinY === 'number'
      ? ` [Pin @ ${pinX.toFixed(0)}%, ${pinY.toFixed(0)}%]`
      : '';
  const commentText = `[Zalo Share • Unit: ${unitCode || project?.code || 'N/A'} • Pin: ${pinLabel || 'General'}${coordBadge}]${
    caption ? ` ${caption}` : title ? ` ${title}` : ''
  }`;

  if (project && project.id) {
    await syncUploadedImageToProjectAndUnit(url, title || fileName, project);

    const allProjects = useAppStore.getState().projects;
    const latestProj = allProjects.find((p) => p.id === project.id) || project;
    const existingComments = Array.isArray(latestProj.comments) ? [...latestProj.comments] : [];

    let updatedComments: TaskComment[];
    if (oldUrlToReplace) {
      updatedComments = existingComments.map((c) => ({
        ...c,
        attachments: (c.attachments || []).map((a) => (a.url === oldUrlToReplace ? { ...a, url } : a)),
      }));
    } else {
      const newComment: TaskComment = {
        id: `comm_share_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: commentText,
        createdAt: nowIso,
        userId: authorId,
        userName: authorName,
        attachments: [
          {
            name: title || fileName,
            url,
            fullPath: url,
            type: 'image',
          },
        ],
      };
      updatedComments = [...existingComments, newComment];
    }

    const existingLinks = Array.isArray(latestProj.imageLinks) ? [...latestProj.imageLinks] : [];
    const cleanedLinks = oldUrlToReplace
      ? existingLinks.map((l: any) =>
          (typeof l === 'string' ? l : l?.url) === oldUrlToReplace
            ? { ...(typeof l === 'object' ? l : {}), url, title: title || fileName }
            : l
        )
      : existingLinks;

    const updatedProj: Project = {
      ...latestProj,
      comments: updatedComments,
      imageLinks: cleanedLinks,
      imageUrl: latestProj.imageUrl === oldUrlToReplace ? url : latestProj.imageUrl || url,
      thumbnail: latestProj.thumbnail === oldUrlToReplace ? url : latestProj.thumbnail || url,
      updatedAt: nowIso,
    };

    useAppStore.getState().setProjects(allProjects.map((p) => (p.id === updatedProj.id ? updatedProj : p)));
    await localDb.projects.put(updatedProj).catch(() => {});

    try {
      const projRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', updatedProj.id!);
      const patchData = {
        comments: updatedComments,
        imageLinks: cleanedLinks,
        imageUrl: updatedProj.imageUrl,
        thumbnail: updatedProj.thumbnail,
        updatedAt: nowIso,
      };
      await setDoc(projRef, patchData, { merge: true });
      await recordDelta({
        docId: updatedProj.id!,
        collectionName: 'taka_projects',
        action: 'update',
        data: patchData,
        year: String(updatedProj.year || ''),
        projectId: updatedProj.id,
        projectCode: updatedProj.code,
      }).catch(() => {});
    } catch {}
  }

  if (targetTask && targetTask.id && !oldUrlToReplace) {
    const allTasks = useAppStore.getState().tasks;
    const latestTask = allTasks.find((t) => t.id === targetTask.id) || targetTask;
    const taskComment: TaskComment = {
      id: `tcomm_share_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: commentText,
      createdAt: nowIso,
      userId: authorId,
      userName: authorName,
      attachments: [
        {
          name: title || fileName,
          url,
          fullPath: url,
          type: 'image',
        },
      ],
    };
    const nextTaskComments = [...(latestTask.comments || []), taskComment];
    const updatedTask: Task = {
      ...latestTask,
      comments: nextTaskComments,
      updatedAt: nowIso,
    };
    useAppStore.getState().optimisticUpdateTasks([updatedTask]);
    await localDb.tasks.put(updatedTask).catch(() => {});
    try {
      await setDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', updatedTask.id),
        { comments: nextTaskComments, updatedAt: nowIso },
        { merge: true }
      );
    } catch {}
  }
}

/**
 * Primary pipeline: Saves shared photos + caption into Dexie (`localDb.sharedMedia`) in 0ms (offline-safe)
 * and uploads to Cloudflare R2 (`uploadPictureToTakaFolder`). If offline, queues in Dexie for auto-sync.
 */
export async function saveSharedMediaToDexieAndR2(
  params: SaveSharedMediaParams,
  onProgress?: (msg: string) => void
): Promise<SaveSharedMediaResult> {
  const normStore = normalizeStore(params.store || params.project?.store);
  const normYear = String(params.project?.year || params.year || new Date().getFullYear()).trim();
  const projectCode = String(params.project?.code || params.unitCode || 'FIELD-SHARE').trim();
  const projectId = String(params.project?.id || `unit_${normStore}_${projectCode}`).trim();
  const unitCode = String(params.unitCode || projectCode).trim();
  const currentUser = useAppStore.getState().currentUser;
  const createdBy = currentUser?.username || currentUser?.email || 'Field Manager';

  const savedRecords: SharedMediaRecord[] = [];
  let syncedToR2Count = 0;
  let queuedOfflineCount = 0;

  const filesToProcess = params.files.length > 0 ? params.files : [];

  for (let i = 0; i < filesToProcess.length; i++) {
    const rawFile = filesToProcess[i];
    onProgress?.(`Compressing & saving photo ${i + 1}/${filesToProcess.length} to IndexedDB (Dexie)...`);

    let compressedFile = rawFile;
    let localDataUrl = '';
    try {
      if (rawFile.type.startsWith('image/')) {
        const comp = await compressImageToWebp(rawFile, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
        compressedFile = comp.file;
        localDataUrl = await blobToDataUrl(comp.blob);
      } else {
        localDataUrl = await blobToDataUrl(rawFile);
      }
    } catch {
      localDataUrl = await blobToDataUrl(rawFile).catch(() => '');
    }

    const nowIso = new Date().toISOString();
    const recordId = `smedia_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const displayTitle =
      params.title?.trim() ||
      `${unitCode} - ${params.pinLabel || 'Inspection'}${filesToProcess.length > 1 ? ` (#${i + 1})` : ''}`;

    const initialRecord: SharedMediaRecord = {
      id: recordId,
      projectId,
      projectCode,
      year: normYear,
      store: normStore,
      location: params.location || params.project?.location || 'L1',
      unitCode,
      pinId: params.pinId || 'general_pin',
      pinLabel: params.pinLabel || 'General Inspection Pin',
      pinX: params.pinX,
      pinY: params.pinY,
      title: displayTitle,
      caption: params.caption || '',
      fileName: compressedFile.name,
      mimeType: compressedFile.type || 'image/webp',
      fileSize: compressedFile.size,
      localDataUrl,
      syncStatus: 'pending_r2',
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy,
    };

    // 1. Save immediately into IndexedDB (Dexie) - works 100% Offline in 0ms
    await localDb.sharedMedia.put(initialRecord);

    // 2. Immediately attach local preview to Project / Layout Unit / Pin so UI reflects in 0ms even offline
    if (localDataUrl) {
      await upsertUnitPinImageRecord({
        store: normStore,
        unitCode,
        url: localDataUrl,
        title: displayTitle,
        pinId: initialRecord.pinId,
        pinLabel: initialRecord.pinLabel,
        pinX: params.pinX,
        pinY: params.pinY,
        caption: params.caption,
        project: params.project,
      });

      await attachMediaToProjectAndTask({
        project: params.project,
        targetTask: params.targetTask,
        url: localDataUrl,
        fileName: compressedFile.name,
        title: displayTitle,
        caption: params.caption,
        unitCode,
        pinLabel: initialRecord.pinLabel,
        pinX: params.pinX,
        pinY: params.pinY,
        store: normStore,
      });
    }

    // 3. Push to Cloudflare R2 if online
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isOnline) {
      onProgress?.(`Uploading photo ${i + 1}/${filesToProcess.length} to Cloudflare R2...`);
      const r2Res = await uploadPictureToTakaFolder(compressedFile, unitCode, normStore);
      if (r2Res.success && r2Res.publicUrl) {
        const syncedRecord: SharedMediaRecord = {
          ...initialRecord,
          r2Url: r2Res.publicUrl,
          syncStatus: 'synced',
          updatedAt: new Date().toISOString(),
        };
        await localDb.sharedMedia.put(syncedRecord);
        savedRecords.push(syncedRecord);
        syncedToR2Count++;

        await upsertUnitPinImageRecord({
          store: normStore,
          unitCode,
          url: r2Res.publicUrl,
          oldUrlToReplace: localDataUrl,
          title: displayTitle,
          pinId: initialRecord.pinId,
          pinLabel: initialRecord.pinLabel,
          pinX: params.pinX,
          pinY: params.pinY,
          caption: params.caption,
          project: params.project,
        });

        await attachMediaToProjectAndTask({
          project: params.project,
          targetTask: params.targetTask,
          url: r2Res.publicUrl,
          oldUrlToReplace: localDataUrl,
          fileName: compressedFile.name,
          title: displayTitle,
          caption: params.caption,
          unitCode,
          pinLabel: initialRecord.pinLabel,
          pinX: params.pinX,
          pinY: params.pinY,
          store: normStore,
        });
        continue;
      }
    }

    savedRecords.push(initialRecord);
    queuedOfflineCount++;
  }

  return {
    savedCount: savedRecords.length,
    syncedToR2Count,
    queuedOfflineCount,
    records: savedRecords,
  };
}

let isFlushingR2Queue = false;

/**
 * Automatically flushes any `pending_r2` records from Dexie `localDb.sharedMedia` to Cloudflare R2 when back online.
 */
export async function flushPendingSharedMediaQueue(): Promise<{ synced: number; remaining: number }> {
  if (isFlushingR2Queue || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { synced: 0, remaining: 0 };
  }
  isFlushingR2Queue = true;
  let synced = 0;

  try {
    const pendingList = await localDb.sharedMedia.where('syncStatus').equals('pending_r2').toArray();
    if (pendingList.length === 0) {
      isFlushingR2Queue = false;
      return { synced: 0, remaining: 0 };
    }

    const allProjects = useAppStore.getState().projects || [];

    for (const item of pendingList) {
      if (!item.localDataUrl) continue;
      try {
        const file = dataUrlToFile(item.localDataUrl, item.fileName || `offline_${item.id}.webp`, item.mimeType);
        const r2Res = await uploadPictureToTakaFolder(file, item.unitCode || item.projectCode, item.store);
        if (r2Res.success && r2Res.publicUrl) {
          const matchedProject = allProjects.find(
            (p) =>
              p.id === item.projectId ||
              (String(p.code).toLowerCase() === String(item.projectCode).toLowerCase() &&
                normalizeStore(p.store) === normalizeStore(item.store) &&
                String(p.year) === String(item.year))
          );

          await localDb.sharedMedia.put({
            ...item,
            r2Url: r2Res.publicUrl,
            syncStatus: 'synced',
            updatedAt: new Date().toISOString(),
          });

          await upsertUnitPinImageRecord({
            store: item.store,
            unitCode: item.unitCode,
            url: r2Res.publicUrl,
            oldUrlToReplace: item.localDataUrl,
            title: item.title,
            pinId: item.pinId,
            pinLabel: item.pinLabel,
            pinX: item.pinX,
            pinY: item.pinY,
            caption: item.caption,
            project: matchedProject,
          });

          await attachMediaToProjectAndTask({
            project: matchedProject,
            url: r2Res.publicUrl,
            oldUrlToReplace: item.localDataUrl,
            fileName: item.fileName,
            title: item.title,
            caption: item.caption,
            unitCode: item.unitCode,
            pinLabel: item.pinLabel,
            pinX: item.pinX,
            pinY: item.pinY,
            store: item.store,
          });

          synced++;
        }
      } catch (err) {
        console.warn('[shareTargetService] Failed to flush offline R2 item:', item.id, err);
      }
    }

    const remaining = await localDb.sharedMedia.where('syncStatus').equals('pending_r2').count();
    return { synced, remaining };
  } catch {
    return { synced: 0, remaining: 0 };
  } finally {
    isFlushingR2Queue = false;
  }
}

/**
 * Generates a realistic sample contractor inspection image (`File`) to test the Zalo -> Share Target -> Dexie -> R2 flow.
 */
export async function createSimulatedZaloInspectionFile(unitLabel: string = 'L1-102'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 960, 640);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 960, 640);

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    for (let x = 60; x < 960; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 640);
      ctx.stroke();
    }
    for (let y = 60; y < 640; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(960, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#10b981';
    ctx.fillRect(60, 60, 290, 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('ZALO FIELD INSPECTION PHOTO', 78, 89);

    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(`Takashimaya Site Handover • ${unitLabel}`, 60, 175);

    ctx.fillStyle = '#93c5fd';
    ctx.font = '24px monospace';
    ctx.fillText(`Timestamp: ${new Date().toLocaleString()}`, 60, 230);
    ctx.fillText('Checklist: MEP Ceiling, Fire Sprinkler & Signage Pin Verified', 60, 275);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(60, 330, 840, 240);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.fillRect(60, 330, 840, 240);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('Contractor Submission via Web Share Target API', 95, 415);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '20px sans-serif';
    ctx.fillText('Stored locally in IndexedDB (Dexie) + Synced to Cloudflare R2', 95, 465);
  }

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        const b = blob || new Blob([''], { type: 'image/jpeg' });
        resolve(
          new File([b], `zalo_inspection_${unitLabel}_${Date.now()}.jpg`, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
        );
      },
      'image/jpeg',
      0.88
    );
  });
}
