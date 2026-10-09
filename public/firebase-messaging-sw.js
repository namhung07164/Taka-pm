// Service Worker Version: 1.0.4 - Static Asset Caching & Firebase Push Notifications
const CACHE_NAME = "taka-static-v1.0.4";
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png"
];

// 1. Install Event: Precache App Shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn("[SW] Precache soft failure (expected in dev mode):", err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Cleanup Old Cache Stores & Claim Clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith("taka-static-") && name !== CACHE_NAME)
            .map((name) => {
              console.log("[SW] Removing outdated cache store:", name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Intelligent Tiered Caching Strategy
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only intercept GET requests
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Ignore unsupported protocols (chrome-extension, blob, etc.)
  if (!url.protocol.startsWith("http")) return;

  // STRICT BYPASS: Never intercept or cache Firestore, Auth, Storage, Cloud APIs or Local APIs
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("securetoken.googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("fcm.googleapis.com") ||
    url.hostname.includes("firebasestorage.googleapis.com") ||
    url.hostname.includes("cloudflarestorage.com") ||
    url.searchParams.has("X-Amz-Signature") ||
    url.searchParams.has("x-amz-signature")
  ) {
    return;
  }

  // A. Navigation Requests (HTML / Page Loads) -> Network-First with Cache Fallback
  // Ensures user always gets the freshest deployment when online, but can load offline
  if (req.mode === "navigate" || (req.headers.get("accept") && req.headers.get("accept").includes("text/html"))) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            return cached || caches.match("/index.html") || caches.match("/");
          });
        })
    );
    return;
  }

  // B. Immutable Hashed Bundles (Vite chunks: /assets/*.js, /assets/*.css) -> Cache-First
  // Content hashes ensure these files never change, allowing 0ms instant disk load
  if (url.pathname.startsWith("/assets/") || url.pathname.match(/\.[a-f0-9]{8,}\.(js|css)$/i)) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        if (cachedRes) return cachedRes;

        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // C. Static App Shell Assets, Icons & External CDNs -> Stale-While-Revalidate
  const isStaticAsset =
    url.origin === self.location.origin &&
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|json)$/i);
  const isCdnAsset =
    url.hostname.includes("unpkg.com") ||
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com");

  if (isStaticAsset || isCdnAsset) {
    event.respondWith(
      caches.match(req).then((cachedRes) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const resClone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            }
            return networkRes;
          })
          .catch(() => cachedRes);

        return cachedRes || fetchPromise;
      })
    );
    return;
  }
});

// --- Firebase Cloud Messaging Section ---
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js",
);

const firebaseConfig = {
  apiKey: "AIzaSyCsL4MZ76PLxV5-n0BHHLyb5dR_p5UmvTc",
  authDomain: "taka---projec-1.firebaseapp.com",
  projectId: "taka---projec-1",
  storageBucket: "taka---projec-1.firebasestorage.app",
  messagingSenderId: "1016991080794",
  appId: "1:1016991080794:web:c447d870815a5ea2135363",
  measurementId: "G-5MNHZBR47R",
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload,
  );

  function formatPushMessage(original) {
    if (!original) return original;
    let text = original;

    if (text.startsWith("You were mentioned in a comment: ")) {
      return text.replace("You were mentioned in a comment: ", "");
    }

    if (text.includes("Delegation task:")) {
      return text.replace(/ by [^,]+(, status:)/, "$1");
    }

    if (text.includes(" deadline ")) {
      const parts = text.split(" - ");
      let lastPart = parts[parts.length - 1];
      lastPart = lastPart.replace(/(days |hours|hour\)) by .+$/, "$1");
      return lastPart;
    }

    return text;
  }

  const notificationTitle = payload.notification?.title || "New Notification";
  const notificationOptions = {
    body: formatPushMessage(payload.notification?.body || ""),
    icon: "/icon-192.png",
    data: payload.data || {},
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        let url = "/";
        if (data && data.notificationId) {
          url = `/?notificationId=${data.notificationId}`;
        } else if (data && data.targetType && data.targetId) {
          url = `/?targetType=${data.targetType}&targetId=${data.targetId}`;
        }

        if (clientList.length > 0) {
          let client = clientList[0];
          let isFocused = false;
          for (let i = 0; i < clientList.length; i++) {
            if (clientList[i].focused) {
              client = clientList[i];
              isFocused = true;
            }
          }

          if (isFocused) {
            if (data) {
              client.postMessage({ type: "NOTIFICATION_CLICK", data });
            }
            return;
          }

          // On iOS, postMessage might fail if the app is waking up from background.
          // Navigating ensures the app gets the URL parameters.
          if (url !== "/") {
            return client
              .navigate(url)
              .then((c) => (c ? c.focus() : client.focus()));
          }

          if (data) {
            client.postMessage({ type: "NOTIFICATION_CLICK", data });
          }
          return client.focus();
        }

        return clients.openWindow(url);
      }),
  );
});
