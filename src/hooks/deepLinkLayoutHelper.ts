import { doc, getDoc, getDocs, collection, query, where, limit } from "firebase/firestore";
import { db, APP_ID } from "../lib/firebase";
import { Project } from "../types";
import { useAppStore } from "../store/useAppStore";
import { safeSetItemLocal } from "../lib/storage";
import { extractFloorFromCodeOrName } from "../lib/layoutUnitFinder";
import { findProjectWithCompositeIsolation } from "./deepLinkStoreResolver";

export interface DeepLinkExtraParams {
  store?: string;
  year?: string;
  code?: string;
  projectId?: string;
  openChat?: boolean;
  openModal?: boolean;
  tab?: string;
  isQrOrUrl?: boolean;
}

export const isMobileDevice = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) || window.innerWidth < 768
  );
};

export function navigateToProjectLayout(
  project: Project | null,
  options: DeepLinkExtraParams | undefined,
  handleTabChange: (tab: any) => void
) {
  const currentUser = useAppStore.getState().currentUser;
  const p = project;

  const unitCode = (p as any)?.unit || options?.code || p?.code || "";
  const rawCode = p?.code || (p as any)?.unit || options?.code || "";
  const targetUnitCode = unitCode || rawCode;

  const extractedFloor =
    extractFloorFromCodeOrName(targetUnitCode) ||
    extractFloorFromCodeOrName((p as any)?.unit) ||
    extractFloorFromCodeOrName(p?.code) ||
    extractFloorFromCodeOrName(options?.code);
  const targetFloor =
    p?.location && p.location !== "all" && p.location !== "ALL"
      ? p.location
      : extractedFloor || "all";

  const yearVal = p?.year || (options?.year ? Number(options.year) : null);
  const targetYear = yearVal ? String(yearVal) : "all";
  const storeVal = p?.store || options?.store;
  const targetStore = storeVal ? String(storeVal).toUpperCase().trim() : "all";

  if (targetStore && targetStore !== "all" && currentUser?.id) {
    safeSetItemLocal(`taka_store_filter_${currentUser.id}`, targetStore);
  }

  const updates: any = {
    globalYearFilter: targetYear,
    globalStoreFilter: targetStore,
    activeTab: "layout",
  };

  if (targetFloor && targetFloor !== "all" && targetFloor !== "ALL") {
    updates.globalLocationFilter = [targetFloor];
  }

  updates.layoutTabFilters = {
    store: targetStore,
    location: targetFloor,
    projectCode: targetUnitCode,
    _ts: Date.now(),
  };

  // Close any open modals
  updates.isProjectModalOpen = false;
  updates.editingProject = null;

  useAppStore.setState(updates);
  handleTabChange("layout");
  window.history.replaceState({}, document.title, window.location.pathname);
}

export async function openProjectTarget(
  targetId: string,
  extraParams: DeepLinkExtraParams | undefined,
  enrichedProjects: Project[],
  checkAccessLocally: (data: any) => boolean,
  syncProjectScopeFilters: (pStore?: string, pYear?: string | number, pLocation?: string, pId?: string) => void,
  handleTabChange: (tab: any) => void
) {
  const isMobile = isMobileDevice();
  const shouldOpenLayout =
    extraParams?.tab === "layout" ||
    (extraParams?.isQrOrUrl && isMobile && !extraParams?.openChat);

  const curProjects = useAppStore.getState().projects || [];
  const curNotifProjects = useAppStore.getState().allProjectsForNotifs || [];

  let p = findProjectWithCompositeIsolation(
    [enrichedProjects, curProjects, curNotifProjects],
    String(targetId),
    extraParams
  );

  if (!p) {
    try {
      const { localDb } = await import("../lib/localDb");
      if (localDb) {
        const allLocalProjs = await localDb.projects.toArray();
        p = findProjectWithCompositeIsolation([allLocalProjs], String(targetId), extraParams);
      }
    } catch {}
  }

  const activateProjectTarget = (proj: Project) => {
    if (!checkAccessLocally(proj)) {
      window.history.replaceState({}, document.title, window.location.pathname);
      useAppStore.getState().setToast({
        title: "Access Denied",
        message: "You do not have permission to access this project's store."
      });
      return;
    }

    if (shouldOpenLayout) {
      navigateToProjectLayout(proj, extraParams, handleTabChange);
      return;
    }

    syncProjectScopeFilters(proj.store, proj.year, proj.location, proj.id);
    handleTabChange("detail");
    if (proj.code) useAppStore.getState().setDetailTabFilterCode(proj.code);
    if (extraParams?.openModal !== false) {
      useAppStore.getState().setEditingProject(proj);
      useAppStore.getState().setModalInitialTab(extraParams?.openChat ? "chat" : "details");
      useAppStore.getState().setIsReadOnlyModal(!extraParams?.openChat);
      useAppStore.getState().setIsProjectModalOpen(true);
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  if (p) {
    activateProjectTarget(p);
    return;
  }

  // Fast Firestore point read (<100ms) with strict store isolation
  try {
    let fetchedProj: Project | null = null;
    const docIdCandidate =
      extraParams?.projectId ||
      (String(targetId).includes("_") || String(targetId).length > 8 ? String(targetId) : "");
    if (docIdCandidate) {
      const docRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", docIdCandidate);
      const snap = await getDoc(docRef);
      if (snap.exists()) fetchedProj = { id: snap.id, ...snap.data() } as Project;
    }
    if (!fetchedProj) {
      const isNum = !isNaN(Number(targetId));
      const constraints: any[] = [isNum ? where("no", "==", Number(targetId)) : where("code", "==", targetId)];
      if (extraParams?.store && extraParams.store.toLowerCase() !== "all") {
        constraints.push(where("store", "==", extraParams.store.trim().toUpperCase()));
      }
      const q = query(collection(db, "artifacts", APP_ID, "public", "data", "taka_projects"), ...constraints, limit(5));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
        fetchedProj = findProjectWithCompositeIsolation([docs], String(targetId), extraParams) || docs[0];
      }
    }

    if (fetchedProj) {
      activateProjectTarget(fetchedProj);
    } else if (shouldOpenLayout && extraParams?.code) {
      // If project record is not found in DB but unit code is provided, still zoom to layout unit
      navigateToProjectLayout(null, extraParams, handleTabChange);
    } else {
      window.history.replaceState({}, document.title, window.location.pathname);
      useAppStore.getState().setToast({
        title: "Not Found",
        message: "This project was not found or data has been deleted."
      });
    }
  } catch (err) {
    console.error("Error fetching project deep link:", err);
    if (shouldOpenLayout && extraParams?.code) {
      navigateToProjectLayout(null, extraParams, handleTabChange);
    } else {
      window.history.replaceState({}, document.title, window.location.pathname);
      useAppStore.getState().setToast({ title: "Error", message: "Could not load project." });
    }
  }
}
