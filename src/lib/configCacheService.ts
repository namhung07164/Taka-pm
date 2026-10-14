import { doc, getDoc, getDocs, collection, setDoc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { db, APP_ID } from "./firebase";
import { useAppStore } from "../store/useAppStore";
import { usePerformanceStore } from "../store/usePerformanceStore";
import { safeGetItemLocal, safeSetItemLocal } from "./storage";
import { NotificationRule, PermissionMatrix, AppUser } from "../types";

export interface ConfigVersions {
  locationsVersion?: number;
  partiesVersion?: number;
  ratesVersion?: number;
  rulesVersion?: number;
  r2Version?: number;
  permissionsVersion?: number;
  subAppUsersVersion?: number;
  appUsersVersion?: number;
  globalRestoreCutoff?: number;
  dataFingerprint?: string;
  updatedAt?: string;
}

const CACHE_KEYS = {
  LOCATIONS: "taka_cache_locations_v1",
  LOCATION_VISIBILITY: "taka_cache_location_visibility_v1",
  PARTIES: "taka_cache_parties_v1",
  JPY_RATE: "taka_cache_exchange_jpy_v1",
  USD_RATE: "taka_cache_exchange_usd_v1",
  RULES: "taka_cache_rules_v1",
  VERSIONS: "taka_cache_config_versions_v1",
  R2_CONFIG: "taka_cache_r2_config_v1",
  PERMISSIONS: "taka_cache_permissions_v1",
  SUB_APP_USERS: "taka_cache_sub_app_users_v1",
  APP_USERS: "taka_cache_app_users_v2",
};

/**
 * Đọc phiên bản cache hiện tại từ localStorage
 */
export function getLocalConfigVersions(): ConfigVersions {
  try {
    const raw = safeGetItemLocal(CACHE_KEYS.VERSIONS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {};
}

/**
 * Lưu phiên bản cache mới vào localStorage
 */
export function setLocalConfigVersions(versions: ConfigVersions): void {
  try {
    safeSetItemLocal(CACHE_KEYS.VERSIONS, JSON.stringify(versions));
  } catch (e) {}
}

/**
 * Tải trước dữ liệu tĩnh từ LocalStorage vào Zustand Store để app mở tức thì (0ms, 0 Read)
 */
export function loadCachedStaticConfig(): {
  locations: string[];
  locationVisibility: Record<string, boolean>;
  parties: string[];
  jpyRate: number;
  usdRate: number;
  rules: NotificationRule[];
  r2Config: { accountId: string; bucketName: string; accessKeyId: string; secretAccessKey: string } | null;
  permissions: PermissionMatrix;
  subAppUsers: any[];
  appUsers: AppUser[];
} {
  let locations: string[] = [];
  let locationVisibility: Record<string, boolean> = {};
  let parties: string[] = ["Shimizu", "Landlord", "Takashimaya", "CP"];
  let jpyRate = 160;
  let usdRate = 25000;
  let rules: NotificationRule[] = [];
  let r2Config = null;
  let permissions: PermissionMatrix = {} as PermissionMatrix;
  let subAppUsers: any[] = [];
  let appUsers: AppUser[] = [];

  try {
    const rawLocs = safeGetItemLocal(CACHE_KEYS.LOCATIONS);
    if (rawLocs) locations = JSON.parse(rawLocs);

    const rawVis = safeGetItemLocal(CACHE_KEYS.LOCATION_VISIBILITY);
    if (rawVis) locationVisibility = JSON.parse(rawVis);

    const rawParties = safeGetItemLocal(CACHE_KEYS.PARTIES);
    if (rawParties) parties = JSON.parse(rawParties);

    const rawJpy = safeGetItemLocal(CACHE_KEYS.JPY_RATE);
    if (rawJpy) {
      const num = Number(rawJpy);
      if (!isNaN(num) && num > 0) jpyRate = num;
    }

    const rawUsd = safeGetItemLocal(CACHE_KEYS.USD_RATE);
    if (rawUsd) {
      const num = Number(rawUsd);
      if (!isNaN(num) && num > 0) usdRate = num;
    }

    const rawRules = safeGetItemLocal(CACHE_KEYS.RULES);
    if (rawRules) rules = JSON.parse(rawRules);

    const rawR2 = safeGetItemLocal(CACHE_KEYS.R2_CONFIG);
    if (rawR2) r2Config = JSON.parse(rawR2);

    const rawPerms = safeGetItemLocal(CACHE_KEYS.PERMISSIONS);
    if (rawPerms) permissions = JSON.parse(rawPerms);

    const rawSubUsers = safeGetItemLocal(CACHE_KEYS.SUB_APP_USERS);
    if (rawSubUsers) subAppUsers = JSON.parse(rawSubUsers);

    const rawAppUsers = safeGetItemLocal(CACHE_KEYS.APP_USERS);
    if (rawAppUsers) appUsers = JSON.parse(rawAppUsers);
  } catch (e) {
    console.warn("Failed to parse cached static config:", e);
  }

  return { locations, locationVisibility, parties, jpyRate, usdRate, rules, r2Config, permissions, subAppUsers, appUsers };
}

/**
 * Lưu R2 Config vào LocalStorage
 */
export function cacheR2Config(config: { accountId: string; bucketName: string; accessKeyId: string; secretAccessKey: string } | null): void {
  try {
    if (config) {
      safeSetItemLocal(CACHE_KEYS.R2_CONFIG, JSON.stringify(config));
      safeSetItemLocal('r2_account_id', config.accountId || '');
      safeSetItemLocal('r2_bucket_name', config.bucketName || '');
      safeSetItemLocal('r2_access_key', config.accessKeyId || '');
      safeSetItemLocal('r2_access_key_id', config.accessKeyId || '');
      safeSetItemLocal('r2_secret_key', config.secretAccessKey || '');
      safeSetItemLocal('r2_secret_access_key', config.secretAccessKey || '');
    } else {
      safeSetItemLocal(CACHE_KEYS.R2_CONFIG, "");
    }
  } catch (e) {}
}

/**
 * Lưu Locations vào LocalStorage
 */
export function cacheLocations(list: string[], visibility?: Record<string, boolean>): void {
  try {
    safeSetItemLocal(CACHE_KEYS.LOCATIONS, JSON.stringify(list));
    if (visibility) {
      safeSetItemLocal(CACHE_KEYS.LOCATION_VISIBILITY, JSON.stringify(visibility));
    }
  } catch (e) {}
}

/**
 * Lưu Parties vào LocalStorage
 */
export function cacheParties(list: string[]): void {
  try {
    safeSetItemLocal(CACHE_KEYS.PARTIES, JSON.stringify(list));
  } catch (e) {}
}

/**
 * Lưu Tỷ giá vào LocalStorage
 */
export function cacheExchangeRates(jpy: number, usd: number): void {
  try {
    safeSetItemLocal(CACHE_KEYS.JPY_RATE, String(jpy));
    safeSetItemLocal(CACHE_KEYS.USD_RATE, String(usd));
  } catch (e) {}
}

/**
 * Lưu Rules vào LocalStorage
 */
export function cacheRules(rules: NotificationRule[]): void {
  try {
    safeSetItemLocal(CACHE_KEYS.RULES, JSON.stringify(rules));
  } catch (e) {}
}

/**
 * Lưu Permissions vào LocalStorage
 */
export function cachePermissions(permissions: PermissionMatrix): void {
  try {
    safeSetItemLocal(CACHE_KEYS.PERMISSIONS, JSON.stringify(permissions));
  } catch (e) {}
}

/**
 * Lưu Sub App Users vào LocalStorage
 */
export function cacheSubAppUsers(subAppUsers: any[]): void {
  try {
    safeSetItemLocal(CACHE_KEYS.SUB_APP_USERS, JSON.stringify(subAppUsers));
  } catch (e) {}
}

/**
 * Lưu App Users vào LocalStorage
 */
export function cacheAppUsers(appUsers: AppUser[]): void {
  try {
    safeSetItemLocal(CACHE_KEYS.APP_USERS, JSON.stringify(appUsers));
  } catch (e) {}
}

/**
 * Gửi tín hiệu tăng số phiên bản của một danh mục cấu hình khi Admin chỉnh sửa.
 * Giúp các client khác tự động kích hoạt tải lại chỉ 1 document tương ứng.
 */
export async function bumpConfigVersion(
  type: "locations" | "parties" | "rates" | "rules" | "permissions" | "sub_app_users" | "app_users"
): Promise<void> {
  const versionRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "versions");
  const now = Date.now();
  const updatePayload: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (type === "locations") updatePayload.locationsVersion = now;
  if (type === "parties") updatePayload.partiesVersion = now;
  if (type === "rates") updatePayload.ratesVersion = now;
  if (type === "rules") updatePayload.rulesVersion = now;
  if (type === "permissions") updatePayload.permissionsVersion = now;
  if (type === "sub_app_users") updatePayload.subAppUsersVersion = now;
  if (type === "app_users") updatePayload.appUsersVersion = now;

  try {
    await setDoc(versionRef, updatePayload, { merge: true });
  } catch (e) {
    console.error("Failed to bump config version:", e);
  }
}

/**
 * Đồng bộ danh mục cấu hình tĩnh theo cơ chế Cache + Versioning.
 * Thay vì mở nhiều onSnapshot liên tục, chỉ lắng nghe 1 document version nhẹ duy nhất.
 */
export function setupStaticConfigSync(): Unsubscribe {
  const versionRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "versions");
  usePerformanceStore.getState().registerListener("taka_config/versions");

  const unsubscribe = onSnapshot(
    versionRef,
    async (docSnap) => {
      usePerformanceStore.getState().trackSnapshot("taka_config/versions", docSnap);
      useAppStore.getState().setCloudStatus("online");
      const localVersions = getLocalConfigVersions();
      const store = useAppStore.getState();

      const remoteData: ConfigVersions = docSnap.exists() ? (docSnap.data() as ConfigVersions) : {};
      const needsInit = !docSnap.exists();

      // 1. Locations
      const localLocs = store.locations;
      const remoteLocVer = remoteData.locationsVersion || 1;
      if (localVersions.locationsVersion !== remoteLocVer || localLocs.length === 0 || needsInit) {
        try {
          const locDoc = await getDoc(
            doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "locations")
          );
          if (locDoc.exists()) {
            const list = locDoc.data()?.list || [];
            const visibility = locDoc.data()?.visibility || {};
            const uniqueList = [...new Set(list)] as string[];
            store.setLocations(uniqueList);
            store.setLocationVisibility(visibility);
            cacheLocations(uniqueList, visibility);
          }
        } catch (err) {
          console.error("Error fetching locations config:", err);
        }
      }

      // 2. Parties
      const localParties = store.parties;
      const remotePartyVer = remoteData.partiesVersion || 1;
      if (localVersions.partiesVersion !== remotePartyVer || localParties.length === 0 || needsInit) {
        try {
          const partyDoc = await getDoc(
            doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "parties")
          );
          if (partyDoc.exists() && partyDoc.data()?.list) {
            const list = partyDoc.data()?.list;
            store.setParties(list);
            cacheParties(list);
          } else {
            const defaultParties = ["Shimizu", "Landlord", "Takashimaya", "CP"];
            store.setParties(defaultParties);
            cacheParties(defaultParties);
          }
        } catch (err) {
          console.error("Error fetching parties config:", err);
        }
      }

      // 3. Exchange Rates
      const remoteRateVer = remoteData.ratesVersion || 1;
      if (localVersions.ratesVersion !== remoteRateVer || needsInit) {
        try {
          const rateDoc = await getDoc(
            doc(db, "artifacts", APP_ID, "public", "data", "taka_settings", "exchange_rates")
          );
          if (rateDoc.exists()) {
            const data = rateDoc.data();
            const jpy = data.jpyRate !== undefined ? Number(data.jpyRate) : 160;
            const usd = data.usdRate !== undefined ? Number(data.usdRate) : 25000;
            store.setJpyRate(jpy);
            store.setUsdRate(usd);
            cacheExchangeRates(jpy, usd);
          }
        } catch (err) {
          console.error("Error fetching exchange rates config:", err);
        }
      }

      // 4. Notification Rules
      const remoteRuleVer = remoteData.rulesVersion || 1;
      if (localVersions.rulesVersion !== remoteRuleVer || store.notificationRules.length === 0 || needsInit) {
        try {
          const rulesSnap = await getDocs(
            collection(db, "artifacts", APP_ID, "public", "data", "taka_rules")
          );
          const loaded: NotificationRule[] = [];
          rulesSnap.forEach((d) => {
            loaded.push({ id: d.id, ...d.data() } as NotificationRule);
          });
          store.setNotificationRules(loaded);
          cacheRules(loaded);
        } catch (err) {
          console.error("Error fetching notification rules config:", err);
        }
      }

      // 5. R2 Config
      const remoteR2Ver = remoteData.r2Version || 1;
      if (localVersions.r2Version !== remoteR2Ver || store.r2Config === null || needsInit) {
        try {
          const r2Doc = await getDoc(
            doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "r2_credentials")
          );
          if (r2Doc.exists()) {
            const data = r2Doc.data() as { accountId: string; bucketName: string; accessKeyId: string; secretAccessKey: string };
            if (data.accountId && data.accessKeyId) {
               store.setR2Config(data);
               cacheR2Config(data);
            }
          }
        } catch (err) {
          console.error("Error fetching r2 config:", err);
        }
      }

      // 6. Permissions Matrix
      const remotePermsVer = remoteData.permissionsVersion || 1;
      if (localVersions.permissionsVersion !== remotePermsVer || Object.keys(store.permissionMatrix || {}).length === 0 || needsInit) {
        try {
          const permsDoc = await getDoc(
            doc(db, "artifacts", APP_ID, "public", "data", "taka_settings", "permissions")
          );
          if (permsDoc.exists()) {
            const data = permsDoc.data() as PermissionMatrix;
            store.setPermissionMatrix(data);
            cachePermissions(data);
          }
        } catch (err) {
          console.error("Error fetching permissions config:", err);
        }
      }

      // 7. Sub App Users
      const remoteSubUsersVer = remoteData.subAppUsersVersion || 1;
      if (localVersions.subAppUsersVersion !== remoteSubUsersVer || store.subAppUsers.length === 0 || needsInit) {
        try {
          const subUsersSnap = await getDocs(
            collection(db, "artifacts", APP_ID, "public", "data", "taka_sub_app_users")
          );
          const loaded: any[] = [];
          subUsersSnap.forEach((docSnap) => {
            loaded.push({ id: docSnap.id, ...docSnap.data() });
          });
          store.setSubAppUsers(loaded);
          cacheSubAppUsers(loaded);
        } catch (err) {
          console.error("Error fetching subAppUsers config:", err);
        }
      }

      // 8. App Users (taka_users versioning)
      const remoteAppUsersVer = remoteData.appUsersVersion || 1;
      if (localVersions.appUsersVersion !== remoteAppUsersVer || store.appUsers.length === 0 || needsInit) {
        try {
          const usersSnap = await getDocs(
            collection(db, "artifacts", APP_ID, "public", "data", "taka_users")
          );
          const loaded: AppUser[] = [];
          usersSnap.forEach((docSnap) => {
            loaded.push({ id: docSnap.id, ...docSnap.data() } as AppUser);
          });
          store.setAppUsers(loaded);
          cacheAppUsers(loaded);
        } catch (err) {
          console.error("Error fetching taka_users config:", err);
        }
      }

      // Cập nhật lại versions vào local cache
      setLocalConfigVersions({
        locationsVersion: remoteLocVer,
        partiesVersion: remotePartyVer,
        ratesVersion: remoteRateVer,
        rulesVersion: remoteRuleVer,
        r2Version: remoteR2Ver,
        permissionsVersion: remotePermsVer,
        subAppUsersVersion: remoteSubUsersVer,
        appUsersVersion: remoteAppUsersVer,
        globalRestoreCutoff: remoteData.globalRestoreCutoff,
        dataFingerprint: remoteData.dataFingerprint,
        updatedAt: remoteData.updatedAt || new Date().toISOString(),
      });
    },
    (err) => {
      console.warn("Config versions listener error:", err);
    }
  );

  return () => {
    unsubscribe();
    usePerformanceStore.getState().unregisterListener("taka_config/versions");
  };
}
