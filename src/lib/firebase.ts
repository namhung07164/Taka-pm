import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, persistentSingleTabManager, CACHE_SIZE_UNLIMITED } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported, getToken } from "firebase/messaging";

const firebaseConfigProd = {
    apiKey: "AIzaSyCsL4MZ76PLxV5-n0BHHLyb5dR_p5UmvTc",
    authDomain: "taka---projec-1.firebaseapp.com",
    projectId: "taka---projec-1",
    storageBucket: "taka---projec-1.appspot.com",
    messagingSenderId: "1016991080794",
    appId: "1:1016991080794:web:c447d870815a5ea2135363",
    measurementId: "G-5MNHZBR47R"
};

// DEV Config (Dành cho AI Studio Sandbox)
const firebaseConfigDev = {
  apiKey: "AIzaSyAaPtg8mZabKUJ6E2xz2KrBjQSfnHICjgc",
  authDomain: "tak-project---ver1.firebaseapp.com",
  projectId: "tak-project---ver1",
  storageBucket: "tak-project---ver1.firebasestorage.app",
  messagingSenderId: "855584353883",
  appId: "1:855584353883:web:8819bcbf8c58a28fb8997e"
};

// Tự động nhận diện môi trường
const isDevMode = (import.meta as any).env?.DEV || (typeof window !== 'undefined' && (window.location.hostname.includes('localhost') || window.location.hostname.includes('ais-dev')));
const firebaseConfig = isDevMode ? firebaseConfigDev : firebaseConfigProd;

console.log(`🔥 Firebase Initialized in ${isDevMode ? 'DEVELOPMENT' : 'PRODUCTION'} mode. Project: ${firebaseConfig.projectId}`);

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Using SingleTabManager with forceOwnership ensures that when a desktop PC or mobile wakes up
// from sleep or restarts after 1 hour, it immediately seizes the IndexedDB lock and reuses the local
// cache instead of assuming a broken lock and initiating an expensive full-server reconciliation fetch.
const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const isIframe = typeof window !== 'undefined' && window.self !== window.top;
const isPWA = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any)?.standalone);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ 
    tabManager: (isIframe || isPWA || isDevMode) 
      ? persistentSingleTabManager({ forceOwnership: true }) 
      : persistentMultipleTabManager(),
    // Setting unlimited cache size for Desktop while bounding iOS to 40MB (41943040) to avoid WebKit IDB purge / QuotaExceeded
    cacheSizeBytes: isIOS ? 41943040 : CACHE_SIZE_UNLIMITED 
  }),
});
export const storage = getStorage(app);

// Initialize Messaging conditionally (it might not be supported in some browsers/environments)
export const messaging = async () => {
  const supported = await isSupported();
  if (supported) {
    return getMessaging(app);
  }
  return null;
};

export { getToken };
export const APP_ID = 'taka-projects-app-v1';

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

import { writeBatch as firestoreWriteBatch, WriteBatch, setDoc as firestoreSetDoc, updateDoc as firestoreUpdateDoc, deleteDoc as firestoreDeleteDoc, collection, doc } from "firebase/firestore";
import { addPendingUpdate } from "./syncQueue";


function cleanDataForAudit(data: any) {
  if (!data) return null;
  const clone: any = {};
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const val = data[key];
      if (val === undefined) {
        clone[key] = null;
      } else if (val !== null && typeof val === 'object' && val.constructor && val.constructor.name !== 'Object' && val.constructor.name !== 'Array') {
        clone[key] = `[Special: ${val.constructor.name}]`;
      } else {
        clone[key] = val;
      }
    }
  }
  return clone;
}

function writeAuditLogAsync(action: 'CREATE' | 'UPDATE' | 'DELETE', docRef: any, data?: any) {
  try {
    if (!docRef || !docRef.path) return;
    const path = docRef.path;
    
    // Ignore audit logs and noisy system collections
    if (path.includes('audit_logs') || path.includes('device_telemetry') || path.includes('taka_config')) return;
    
    const user = auth.currentUser;
    let userId = user?.uid;
    let userEmail = user?.email;

    if (!userId || !userEmail) {
      try {
        const storedAuth = typeof window !== 'undefined' ? localStorage.getItem('taka_auth_v1') : null;
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth);
          if (parsed && typeof parsed === 'object') {
            userId = userId || parsed.id || parsed.username;
            userEmail = userEmail || parsed.email || parsed.username;
          }
        }
      } catch {}
    }

    userId = userId || 'system';
    userEmail = userEmail || 'anonymous';
    
    const dbInstance = docRef.firestore;
    const logRef = doc(collection(dbInstance, 'audit_logs'));
    
    // Determine entity type from path
    let entityType = 'other';
    if (path.includes('taka_projects')) entityType = 'project';
    else if (path.includes('taka_tasks')) entityType = 'task';
    else if (path.includes('taka_costs')) entityType = 'cost';
    else if (path.includes('taka_delegation_groups')) entityType = 'delegation';
    else if (path.includes('taka_users')) entityType = 'user';
    else if (path.includes('taka_rules')) entityType = 'rule';

    // Capture previous state snapshot for Visual Diff Viewer
    let previousData: any = null;
    try {
      const storeGetter = typeof window !== 'undefined' ? (window as any).__TAKA_APP_STORE__?.getState : null;
      if (storeGetter) {
        const storeState = storeGetter();
        let existingDoc: any = null;
        if (entityType === 'project') existingDoc = storeState.projects?.find((p: any) => p.id === docRef.id);
        else if (entityType === 'task') existingDoc = storeState.tasks?.find((t: any) => t.id === docRef.id);
        else if (entityType === 'cost') existingDoc = storeState.costs?.find((c: any) => c.id === docRef.id);
        else if (entityType === 'delegation') existingDoc = storeState.delegationGroups?.find((d: any) => d.id === docRef.id);

        if (action === 'UPDATE' && data && typeof data === 'object' && existingDoc) {
          const prevSlice: Record<string, any> = {};
          Object.keys(data).forEach(k => {
            if (k.includes('.')) {
              const parts = k.split('.');
              let curr = existingDoc;
              for (let i = 0; i < parts.length && curr != null; i++) {
                curr = curr[parts[i]];
              }
              prevSlice[k] = curr !== undefined ? curr : null;
            } else {
              prevSlice[k] = existingDoc[k] !== undefined ? existingDoc[k] : null;
            }
          });
          previousData = cleanDataForAudit(prevSlice);
        } else if (action === 'DELETE' && existingDoc) {
          previousData = cleanDataForAudit(existingDoc);
        }
      }
    } catch {}

    const logData = {
      timestamp: Date.now(),
      userId,
      userEmail,
      action,
      entityType,
      docPath: path,
      docId: docRef.id,
      data: cleanDataForAudit(data),
      ...(previousData ? { previousData } : {})
    };
    
    // Fire and forget (Optimistic UI unaffected)
    firestoreSetDoc(logRef, logData).catch(err => {
      console.warn("Audit log failed:", err);
    });
  } catch(e) {
    console.warn("Error preparing audit log:", e);
  }
}

function handleOfflineQueue(action: 'set' | 'update' | 'delete', docRef: any, data?: any) {
  let collectionPath = docRef.path;
  // Firestore path is usually something like "artifacts/APP_ID/public/data/taka_projects/project1"
  // We want to extract the collection path, which is everything before the last slash.
  if (collectionPath) {
    const parts = collectionPath.split('/');
    parts.pop(); // remove docId
    collectionPath = parts.join('/');
  }
  
  addPendingUpdate({
    collectionPath: collectionPath,
    action,
    docId: docRef.id,
    data: data || {}
  } as any);
}

import { validateFirestoreData } from './validation';

export function setDoc(docRef: any, data: any, options?: any) {
  validateFirestoreData(docRef.path, data, options?.merge === true);
  writeAuditLogAsync("CREATE", docRef, data);
  return firestoreSetDoc(docRef, data, options).catch(error => {
    console.warn("Network error during setDoc. Saving to local IndexedDB queue.", error);
    handleOfflineQueue('set', docRef, data);
    throw error;
  });
}

export function updateDoc(docRef: any, data: any) {
  validateFirestoreData(docRef.path, data, true);
  writeAuditLogAsync("UPDATE", docRef, data);
  return firestoreUpdateDoc(docRef, data).catch(error => {
    console.warn("Network error during updateDoc. Saving to local IndexedDB queue.", error);
    handleOfflineQueue('update', docRef, data);
    throw error;
  });
}

export function deleteDoc(docRef: any) {
  writeAuditLogAsync("DELETE", docRef);
  return firestoreDeleteDoc(docRef).catch(error => {
    console.warn("Network error during deleteDoc. Saving to local IndexedDB queue.", error);
    handleOfflineQueue('delete', docRef);
    throw error;
  });
}

export function writeBatch(dbInstance: any): WriteBatch {
  const batch = firestoreWriteBatch(dbInstance);
  const originalSet = batch.set.bind(batch);
  const originalUpdate = batch.update.bind(batch);
  const originalDelete = batch.delete.bind(batch);
  const originalCommit = batch.commit.bind(batch);

  const operations: any[] = [];

  (batch as any).set = (docRef: any, data: any, options?: any) => {
    validateFirestoreData(docRef.path, data, options?.merge === true);
    operations.push({ action: 'set', docRef, data, options });
    writeAuditLogAsync("CREATE", docRef, data);
    return originalSet(docRef, data, options);
  };
  
  (batch as any).update = (docRef: any, data: any, ...moreFieldsAndValues: any[]) => {
    validateFirestoreData(docRef.path, data, true);
    operations.push({ action: 'update', docRef, data });
    writeAuditLogAsync("UPDATE", docRef, data);
    return (originalUpdate as any)(docRef, data, ...moreFieldsAndValues);
  };

  (batch as any).delete = (docRef: any) => {
    operations.push({ action: 'delete', docRef });
    writeAuditLogAsync("DELETE", docRef);
    return originalDelete(docRef);
  };

  (batch as any).commit = () => {
    return originalCommit().catch(error => {
      console.warn("Network error during batch commit. Saving to local IndexedDB queue.", error);
      operations.forEach(op => {
         handleOfflineQueue(op.action, op.docRef, op.data);
      });
      throw error;
    });
  };

  return batch;
}
