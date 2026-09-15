// Service Worker Version: 1.0.2
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
    icon: "/manifest-icon-192.maskable.png",
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
