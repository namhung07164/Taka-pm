import { collection, doc, getDocs } from 'firebase/firestore';
import { setDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { useAppStore } from '../../store/useAppStore';
import { localDb } from '../../lib/localDb';
import { Project, Task } from '../../types';
import { removeUploadedImageEverywhere } from '../../lib/projectImageSync';
import { extractAllProjectCodes, projectMatchesUnitCode, extractProjectMetadata } from '../../lib/utils';

export type MediaPlacementType = 'comment_modular' | 'layout_picture';

export interface ProjectMediaLinkItem {
  key: string;
  url: string;
  projectId: string;
  projectCode: string;
  linkCodes: string;
  unitCode: string;
  year: string;
  store: 'HCM' | 'HN' | string;
  projectName: string;
  location: string;
  placements: MediaPlacementType[];
  placementDetails: string[];
  mediaType: 'image' | 'pdf_drive' | 'link';
  storageHost: 'R2 Cloud' | 'Firebase Storage' | 'Google Drive' | 'External URL';
  title: string;
  createdAt: string;
  authorName?: string;
  commentSnippet?: string;
  taskIds?: string[];
  unitDocIds?: string[];
}

export interface RemoteUnitImagesDoc {
  docId: string;
  unitCode: string;
  store: string;
  images: Array<{ id?: string; url: string; title?: string; createdAt?: string; store?: string }>;
  updatedAt?: string;
}

function normalizeStore(store?: string | null): string {
  if (!store) return 'HCM';
  const s = String(store).trim().toUpperCase();
  if (s.includes('HN') || s.includes('HÀ NỘI') || s.includes('HA NOI') || s.includes('HANOI')) return 'HN';
  if (s.includes('HCM') || s.includes('HỒ CHÍ MINH') || s.includes('HO CHI MINH') || s.includes('SAI GON') || s.includes('SG')) return 'HCM';
  return s;
}

export function detectMediaType(url: string): 'image' | 'pdf_drive' | 'link' {
  const lower = url.toLowerCase().trim();
  if (
    /\.(jpe?g|png|webp|gif|svg|bmp|avif)(\?.*)?$/i.test(lower) ||
    lower.includes('hcm.taka-pm.org') ||
    lower.includes('taka-pm-folder') ||
    lower.includes('firebasestorage.googleapis.com')
  ) {
    return lower.includes('.pdf') ? 'pdf_drive' : 'image';
  }
  if (/\.pdf($|\?|#)/i.test(lower) || lower.includes('drive.google.com') || lower.includes('docs.google.com')) {
    return 'pdf_drive';
  }
  return 'link';
}

export function detectStorageHost(url: string): 'R2 Cloud' | 'Firebase Storage' | 'Google Drive' | 'External URL' {
  const lower = url.toLowerCase();
  if (lower.includes('hcm.taka-pm.org') || lower.includes('taka-pm-folder') || lower.includes('r2.cloudflarestorage.com')) return 'R2 Cloud';
  if (lower.includes('firebasestorage.googleapis.com')) return 'Firebase Storage';
  if (lower.includes('drive.google.com') || lower.includes('docs.google.com')) return 'Google Drive';
  return 'External URL';
}

function extractUrlsFromText(text?: string | null): string[] {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(/https?:\/\/[^\s)\]"'<>]+/g) || [];
  return Array.from(new Set(matches.map((u) => u.trim()).filter(Boolean)));
}

export async function fetchAllCloudUnitImagesDocs(): Promise<RemoteUnitImagesDoc[]> {
  try {
    const snap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_unit_images'));
    return snap.docs.map((d) => {
      const data = d.data() as any;
      const parts = d.id.split('_');
      const fallbackStore = parts[0] || 'HCM';
      const fallbackUnit = parts.slice(1).join('_') || d.id;
      return {
        docId: d.id,
        unitCode: String(data.unitCode || fallbackUnit).trim(),
        store: normalizeStore(data.store || fallbackStore),
        images: Array.isArray(data.images) ? data.images : [],
        updatedAt: data.updatedAt || '',
      };
    });
  } catch (err) {
    console.warn('[projectLinksImagesService] Failed to fetch cloud taka_unit_images:', err);
    return [];
  }
}

export function collectLocalUnitImagesDocs(): RemoteUnitImagesDoc[] {
  const result: RemoteUnitImagesDoc[] = [];
  if (typeof localStorage === 'undefined') return result;

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('taka_unit_images_')) continue;
    try {
      const rest = k.replace('taka_unit_images_', '');
      const parts = rest.split('_');
      const st = normalizeStore(parts[0] || 'HCM');
      const unitCode = parts.slice(1).join('_').trim();
      if (!unitCode) continue;
      const parsed = JSON.parse(localStorage.getItem(k) || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        result.push({ docId: `${st}_${unitCode}`, unitCode, store: st, images: parsed });
      }
    } catch {
      // ignore malformed
    }
  }
  return result;
}

export function buildProjectMediaLinksList(
  projects: Project[],
  tasks: Task[],
  cloudUnitDocs: RemoteUnitImagesDoc[],
  appUsers: Array<{ id: string; username?: string; name?: string }> = []
): ProjectMediaLinkItem[] {
  const activeProjects = (projects || []).filter((p) => !p.isDeleted);
  const activeTasks = (tasks || []).filter((t) => !t.isDeleted);
  const userMap = new Map<string, string>();
  appUsers.forEach((u) => {
    if (u?.id) userMap.set(u.id, u.username || u.name || u.id);
  });

  const itemMap = new Map<string, ProjectMediaLinkItem>();

  const upsertItem = (params: {
    url: string;
    project?: Project;
    unitCode?: string;
    store?: string;
    year?: string;
    placement: MediaPlacementType;
    detailLabel: string;
    title?: string;
    createdAt?: string;
    authorName?: string;
    commentSnippet?: string;
    taskId?: string;
    unitDocId?: string;
  }) => {
    const rawUrl = (params.url || '').trim();
    if (!rawUrl) return;

    const p = params.project;
    const store = normalizeStore(p?.store || params.store || 'HCM');
    const year = String(p?.year || params.year || 'All').trim();
    const projectCode = String(p?.code || params.unitCode || 'UNLINKED').trim();
    const projectId = String(p?.id || `unit_${store}_${projectCode}`);
    const compositeKey = `${projectId}__${year}__${store}__${projectCode}__${rawUrl}`;

    const existing = itemMap.get(compositeKey);
    if (existing) {
      if (!existing.placements.includes(params.placement)) existing.placements.push(params.placement);
      if (params.detailLabel && !existing.placementDetails.includes(params.detailLabel)) {
        existing.placementDetails.push(params.detailLabel);
      }
      if (params.authorName && !existing.authorName) existing.authorName = params.authorName;
      if (params.commentSnippet && !existing.commentSnippet) existing.commentSnippet = params.commentSnippet;
      if (params.createdAt && (!existing.createdAt || params.createdAt > existing.createdAt)) {
        existing.createdAt = params.createdAt;
      }
      if (params.taskId) existing.taskIds = Array.from(new Set([...(existing.taskIds || []), params.taskId]));
      if (params.unitDocId) existing.unitDocIds = Array.from(new Set([...(existing.unitDocIds || []), params.unitDocId]));
      return;
    }

    itemMap.set(compositeKey, {
      key: compositeKey,
      url: rawUrl,
      projectId,
      projectCode,
      linkCodes: String(p?.linkCodes || ''),
      unitCode: String(params.unitCode || p?.code || ''),
      year,
      store,
      projectName: String(p?.name || params.unitCode || ''),
      location: String(p?.location || ''),
      placements: [params.placement],
      placementDetails: params.detailLabel ? [params.detailLabel] : [],
      mediaType: detectMediaType(rawUrl),
      storageHost: detectStorageHost(rawUrl),
      title: params.title || `${projectCode} Media`,
      createdAt: params.createdAt || p?.updatedAt || '',
      authorName: params.authorName,
      commentSnippet: params.commentSnippet,
      taskIds: params.taskId ? [params.taskId] : [],
      unitDocIds: params.unitDocId ? [params.unitDocId] : [],
    });
  };

  // 1. Scan all Projects (Comments, imageLinks, imageUrl/thumbnail, taskSummaries)
  activeProjects.forEach((p) => {
    if (Array.isArray(p.comments)) {
      p.comments.forEach((c) => {
        const author = c.userName || userMap.get(c.userId) || c.userId || 'User';
        const cleanSnippet = (c.text || '').replace(/https?:\/\/[^\s]+/g, '').trim();

        (c.attachments || []).forEach((att) => {
          if (att?.url) {
            upsertItem({
              url: att.url,
              project: p,
              placement: 'comment_modular',
              detailLabel: `Project Comment Attachment (${author})`,
              title: att.name || 'Comment Attachment',
              createdAt: c.createdAt,
              authorName: author,
              commentSnippet: cleanSnippet || c.text,
            });
          }
        });

        extractUrlsFromText(c.text).forEach((url) => {
          upsertItem({
            url,
            project: p,
            placement: 'comment_modular',
            detailLabel: `Project Comment Link (${author})`,
            title: cleanSnippet ? cleanSnippet.slice(0, 48) : `Comment by ${author}`,
            createdAt: c.createdAt,
            authorName: author,
            commentSnippet: cleanSnippet || c.text,
          });
        });
      });
    }

    if (Array.isArray(p.imageLinks)) {
      p.imageLinks.forEach((imgItem: any, idx: number) => {
        const url = typeof imgItem === 'string' ? imgItem : imgItem?.url;
        if (url && typeof url === 'string') {
          upsertItem({
            url,
            project: p,
            placement: 'layout_picture',
            detailLabel: 'Layout Project ImageLinks',
            title: (typeof imgItem === 'object' && imgItem?.title) || `Layout Link #${idx + 1}`,
            createdAt: (typeof imgItem === 'object' && imgItem?.createdAt) || p.updatedAt,
          });
        }
      });
    }

    (['imageUrl', 'thumbnail', 'photo', 'image'] as const).forEach((fieldKey) => {
      const val = (p as any)[fieldKey];
      if (val && typeof val === 'string' && val.trim().startsWith('http')) {
        upsertItem({
          url: val,
          project: p,
          placement: 'layout_picture',
          detailLabel: `Project ${fieldKey}`,
          title: `Project ${fieldKey}`,
          createdAt: p.updatedAt,
        });
      }
    });

    if (Array.isArray(p.taskSummaries)) {
      p.taskSummaries.forEach((ts) => {
        const directUrl = ts.link || ts.imageUrl || ts.thumbnail;
        if (directUrl && typeof directUrl === 'string') {
          upsertItem({
            url: directUrl,
            project: p,
            placement: 'layout_picture',
            detailLabel: 'Task Summary Media',
            title: ts.name || 'Task Summary Link',
            createdAt: p.updatedAt,
          });
        }
        extractUrlsFromText(ts.name).forEach((u) => {
          upsertItem({
            url: u,
            project: p,
            placement: 'layout_picture',
            detailLabel: 'Task Summary Inline Link',
            title: ts.name || 'Task Summary Link',
            createdAt: p.updatedAt,
          });
        });
      });
    }
  });

  // 2. Scan Tasks for task.comments URLs (strictly matched by Rule 16.1 composite key)
  const projectsById = new Map<string, Project>();
  activeProjects.forEach((p) => {
    if (p.id) projectsById.set(String(p.id), p);
  });

  activeTasks.forEach((t) => {
    const ownerProj = t.projectId
      ? projectsById.get(String(t.projectId))
      : activeProjects.find(
          (p) =>
            String(p.code || '').trim().toLowerCase() === String(t.projectCode || '').trim().toLowerCase() &&
            normalizeStore(p.store) === normalizeStore(t.projectStore) &&
            String(p.year || '').trim() === String(t.projectYear || '').trim()
        );

    (t.comments || []).forEach((c) => {
      const author = c.userName || userMap.get(c.userId) || c.userId || 'User';
      const cleanSnippet = (c.text || '').replace(/https?:\/\/[^\s]+/g, '').trim();
      (c.attachments || []).forEach((att) => {
        if (att?.url) {
          upsertItem({
            url: att.url,
            project: ownerProj,
            unitCode: t.projectCode,
            store: t.projectStore,
            year: String(t.projectYear || ''),
            placement: 'comment_modular',
            detailLabel: `Task "${t.name}" Comment`,
            title: att.name || t.name,
            createdAt: c.createdAt,
            authorName: author,
            commentSnippet: cleanSnippet || c.text,
            taskId: t.id,
          });
        }
      });
      extractUrlsFromText(c.text).forEach((url) => {
        upsertItem({
          url,
          project: ownerProj,
          unitCode: t.projectCode,
          store: t.projectStore,
          year: String(t.projectYear || ''),
          placement: 'comment_modular',
          detailLabel: `Task "${t.name}" Comment`,
          title: t.name,
          createdAt: c.createdAt,
          authorName: author,
          commentSnippet: cleanSnippet || c.text,
          taskId: t.id,
        });
      });
    });
  });

  // 3. Merge Local + Cloud `taka_unit_images` (Layout Picture Tooltip Gallery)
  const mergedUnitDocs = new Map<string, RemoteUnitImagesDoc>();
  collectLocalUnitImagesDocs().forEach((d) => mergedUnitDocs.set(d.docId, d));
  (cloudUnitDocs || []).forEach((d) => {
    const prev = mergedUnitDocs.get(d.docId);
    if (!prev) {
      mergedUnitDocs.set(d.docId, d);
    } else {
      const urlSet = new Set<string>();
      const combined: any[] = [];
      [...d.images, ...prev.images].forEach((img: any) => {
        const u = typeof img === 'string' ? img : img?.url;
        if (u && !urlSet.has(u)) {
          urlSet.add(u);
          combined.push(typeof img === 'string' ? { url: u } : img);
        }
      });
      mergedUnitDocs.set(d.docId, { ...d, images: combined });
    }
  });

  mergedUnitDocs.forEach((uDoc) => {
    const uStore = normalizeStore(uDoc.store);
    const uCodeLower = String(uDoc.unitCode || '').trim().toLowerCase();
    if (!uCodeLower) return;

    const matchedProjects = activeProjects.filter((p) => {
      const pStore = normalizeStore(extractProjectMetadata(p).store || p.store);
      if (pStore !== uStore) return false;
      const pCodes = extractAllProjectCodes(p).map((c) => c.toLowerCase());
      return pCodes.includes(uCodeLower) || projectMatchesUnitCode(pCodes, uCodeLower);
    });

    (uDoc.images || []).forEach((imgItem: any, idx: number) => {
      const url = typeof imgItem === 'string' ? imgItem : imgItem?.url;
      if (!url || typeof url !== 'string') return;
      const title = (typeof imgItem === 'object' && imgItem?.title) || `Unit ${uDoc.unitCode} Link #${idx + 1}`;
      const createdAt = (typeof imgItem === 'object' && imgItem?.createdAt) || uDoc.updatedAt || '';

      if (matchedProjects.length > 0) {
        matchedProjects.forEach((mp) => {
          upsertItem({
            url,
            project: mp,
            unitCode: uDoc.unitCode,
            store: uStore,
            placement: 'layout_picture',
            detailLabel: `Layout Unit Gallery (${uDoc.unitCode})`,
            title,
            createdAt,
            unitDocId: uDoc.docId,
          });
        });
      } else {
        upsertItem({
          url,
          unitCode: uDoc.unitCode,
          store: uStore,
          year: 'Layout Unit',
          placement: 'layout_picture',
          detailLabel: `Layout Unit Gallery (${uDoc.unitCode})`,
          title,
          createdAt,
          unitDocId: uDoc.docId,
        });
      }
    });
  });

  return Array.from(itemMap.values()).sort((a, b) => {
    const yCmp = String(b.year).localeCompare(String(a.year));
    if (yCmp !== 0) return yCmp;
    const sCmp = a.store.localeCompare(b.store);
    if (sCmp !== 0) return sCmp;
    return a.projectCode.localeCompare(b.projectCode);
  });
}

export async function deleteProjectMediaLinkItem(item: ProjectMediaLinkItem): Promise<void> {
  const st = useAppStore.getState();
  const targetProject = (st.projects || []).find(
    (p) =>
      String(p.id) === String(item.projectId) ||
      (String(p.code).trim().toLowerCase() === String(item.projectCode).trim().toLowerCase() &&
        normalizeStore(p.store) === normalizeStore(item.store) &&
        String(p.year).trim() === String(item.year).trim())
  );

  await removeUploadedImageEverywhere(item.url, targetProject || null, item.unitCode || item.projectCode);

  if (targetProject?.id) {
    const freshProj = useAppStore.getState().projects.find((p) => p.id === targetProject.id);
    if (freshProj) await localDb.projects.put(freshProj).catch(() => {});
  }

  if (item.unitDocIds && item.unitDocIds.length > 0) {
    for (const docId of item.unitDocIds) {
      try {
        const lsKey = `taka_unit_images_${docId}`;
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(lsKey) : null;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const next = parsed.filter((entry: any) => (typeof entry === 'string' ? entry : entry?.url) !== item.url);
            if (next.length === 0) localStorage.removeItem(lsKey);
            else localStorage.setItem(lsKey, JSON.stringify(next));
          }
        }
      } catch {
        // ignore
      }
    }
  }

  if (item.taskIds && item.taskIds.length > 0) {
    const allTasks = useAppStore.getState().tasks || [];
    const updatedTasks: Task[] = [];
    for (const tid of item.taskIds) {
      const t = allTasks.find((tk) => String(tk.id) === String(tid));
      if (!t || !Array.isArray(t.comments)) continue;
      const nextComments = t.comments
        .map((c) => ({
          ...c,
          text: (c.text || '').replace(item.url, '').trim(),
          attachments: Array.isArray(c.attachments) ? c.attachments.filter((a) => a.url !== item.url) : c.attachments,
        }))
        .filter((c) => (c.text && c.text.length > 0) || (Array.isArray(c.attachments) && c.attachments.length > 0));

      const patchedTask: Task = { ...t, comments: nextComments, updatedAt: new Date().toISOString() };
      updatedTasks.push(patchedTask);
      await setDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id),
        { comments: nextComments, updatedAt: patchedTask.updatedAt },
        { merge: true }
      ).catch(() => {});
      await localDb.tasks.put(patchedTask).catch(() => {});
    }
    if (updatedTasks.length > 0) useAppStore.getState().optimisticUpdateTasks(updatedTasks);
  }
}
