import React, { useEffect } from 'react';
import { onMessage } from "firebase/messaging";
import { messaging } from "../lib/firebase";
import { safeGetItemLocal } from "../lib/storage";

export function usePushNotifications() {
  useEffect(() => {
    const setupMessaging = async () => {
      const msg = await messaging();
      if (msg) {
        onMessage(msg, (payload) => {
          console.log("Message received in foreground: ", payload);
          if (payload.notification) {
            // Check if current user has notifications enabled
            const savedAuth = safeGetItemLocal("taka_auth_v1");
            if (savedAuth) {
              const user = JSON.parse(savedAuth);
              if (user.notification === false) return;
            }

            function stripHtml(htmlStr: string): string {
              if (!htmlStr) return '';
              return htmlStr
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/gi, ' ')
                .replace(/&amp;/gi, '&')
                .replace(/&lt;/gi, '<')
                .replace(/&gt;/gi, '>')
                .replace(/&quot;/gi, '"')
                .replace(/\s+/g, ' ')
                .trim();
            }

            function formatPushMessage(original: string) {
              if (!original) return original;
              let text = stripHtml(original);

              if (text.startsWith("You were mentioned in a comment: ")) {
                return text.replace("You were mentioned in a comment: ", "");
              }

              if (text.includes("Delegation task:")) {
                return text.replace(/ by [^,]+(, status:)/, "$1");
              }

              if (text.includes(" deadline ")) {
                const parts = text.split(" - ");
                let lastPart = parts[parts.length - 1];
                lastPart = lastPart.replace(
                  /(days |hours|hour\)) by .+$/,
                  "$1",
                );
                return lastPart;
              }
              return text;
            }

            const bodyToSpeak = formatPushMessage(payload.notification.body || "");
            const iconUrl = typeof window !== "undefined" ? `${window.location.origin}/icon-192.png` : "/icon-192.png";
            
            // Trigger native notification if in background/minimized
            if (document.hidden) {
              new Notification(payload.notification.title || "Taka App", {
                body: bodyToSpeak,
                icon: iconUrl,
                badge: iconUrl
              });
            } else {
               // Foreground alert handled by Toast usually, but we could add sound here.
            }
          }
        });
      }
    };

    setupMessaging();
  }, []);
}
