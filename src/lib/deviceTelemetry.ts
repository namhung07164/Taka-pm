import { setDoc } from "../lib/firebase";
import { doc } from 'firebase/firestore';
import { db, APP_ID } from "./firebase";
import { safeGetItemLocal, safeSetItemLocal } from "./storage";
import { usePerformanceStore, DevicePerformanceData } from "../store/usePerformanceStore";
import { useAppStore } from "../store/useAppStore";

const DEVICE_ID_KEY = "taka_device_uuid";

export function getOrCreateDeviceId(): string {
  let id = safeGetItemLocal(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    safeSetItemLocal(DEVICE_ID_KEY, id);
  }
  return id;
}

export function detectDeviceInfo(): { platform: string; deviceName: string } {
  if (typeof window === "undefined" || !navigator) {
    return { platform: "Unknown", deviceName: "Web Client" };
  }

  const ua = navigator.userAgent;
  let browser = "Chrome";
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("SamsungBrowser")) browser = "Samsung Browser";
  else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";
  else if (ua.includes("Edge") || ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";

  let os = "Desktop";
  let isMobile = false;
  if (ua.includes("Win")) os = "Windows PC";
  else if (ua.includes("Mac") && !ua.includes("like Mac")) os = "MacBook/Mac";
  else if (ua.includes("Linux") && !ua.includes("Android")) os = "Linux PC";
  else if (ua.includes("Android")) {
    os = "Android Device";
    isMobile = true;
  } else if (ua.includes("iPhone")) {
    os = "iPhone";
    isMobile = true;
  } else if (ua.includes("iPad")) {
    os = "iPad Tablet";
    isMobile = true;
  }

  const isPWA = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
  const suffix = isPWA ? " (PWA App)" : "";

  return {
    platform: `${os}${suffix}`,
    deviceName: `${browser} on ${os}${suffix}`,
  };
}

let lastReportTimestamp = 0;
let isReporting = false;

/**
 * Report current device metrics to Firestore under `taka_device_metrics/{deviceId}`.
 * Strictly throttled: at most once every 60 seconds unless forced, saving writes.
 */
export async function reportDevicePerformance(forced: boolean = false) {
  const now = Date.now();
  if (!forced && now - lastReportTimestamp < 60_000) {
    return;
  }
  if (isReporting) return;

  try {
    isReporting = true;
    lastReportTimestamp = now;

    const deviceId = getOrCreateDeviceId();
    const { platform, deviceName } = detectDeviceInfo();

    const perfState = usePerformanceStore.getState();
    const appState = useAppStore.getState();
    const currentUser = appState.currentUser;

    const totalOps = perfState.serverReads + perfState.cacheReads;
    const hitRate = totalOps > 0 ? Number(((perfState.cacheReads / totalOps) * 100).toFixed(1)) : 100.0;

    // Determine top collection by query volume
    let topCol = "-";
    let maxEvents = 0;
    Object.entries(perfState.collectionStats).forEach(([name, stat]) => {
      if (stat.totalEvents > maxEvents) {
        maxEvents = stat.totalEvents;
        topCol = name;
      }
    });

    const elapsedSec = Math.floor((now - perfState.sessionStartTime) / 1000);

    const payload: DevicePerformanceData = {
      deviceId,
      deviceName,
      platform,
      userName: currentUser?.username || currentUser?.id || "Anonymous User",
      userRole: currentUser?.role || "user",
      serverReads: perfState.serverReads,
      cacheReads: perfState.cacheReads,
      activeListeners: perfState.activeListeners,
      cacheHitRate: hitRate,
      lastActiveAt: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      lastActiveTimestamp: now,
      sessionDurationSec: elapsedSec,
      totalEvents: perfState.events.length,
      status: "online",
      topCollection: topCol,
    };

    const docRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_device_metrics", deviceId);
    setDoc(docRef, payload, { merge: true });
  } catch (err) {
    // Non-blocking catch to ensure telemetry never affects UI or operations
    console.debug("Telemetry device metric sync skipped:", err);
  } finally {
    isReporting = false;
  }
}
