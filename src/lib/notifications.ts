import { setDoc } from "../lib/firebase";
import { useAppStore } from '../store/useAppStore';
import { getToken } from 'firebase/messaging';
import { messaging, db, APP_ID } from './firebase';
import { doc } from 'firebase/firestore';

export const testLocalNotification = async () => {
  try {
    if (!('Notification' in window)) {
      useAppStore.getState().setToast({ title: "Notice", message: "This browser does not support notifications. Please use Safari on iOS 16.4+ or Chrome/Edge." });
      return;
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (!isStandalone && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
      useAppStore.getState().setToast({ title: "Notice", message: 'To receive notifications on iOS/iPadOS:\n1. Tap the Share button in Safari\n2. Select "Add to Home Screen"\n3. Open the app from the Home Screen' });
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification('Test Notification', {
          body: 'This is a test notification from the PWA.',
          icon: '/manifest-icon-192.maskable.png'
        });
        useAppStore.getState().setToast({ title: "Notice", message: "Sent test notification request via Service Worker. Please check your notification center." });
      } else {
        new Notification('Test Notification', {
          body: 'This is a test notification from the browser.',
          icon: '/manifest-icon-192.maskable.png'
        });
        useAppStore.getState().setToast({ title: "Notice", message: "Sent test notification request via Browser. Please check your notification center." });
      }
    } else {
      useAppStore.getState().setToast({ title: "Notice", message: "Notification permission not granted. Please check browser/device settings." });
    }
  } catch (error) {
    console.error('Error showing local notification:', error);
    useAppStore.getState().setToast({ title: "Error", message: 'Cannot display notification: ' + (error instanceof Error ? error.message : String(error)) });
  }
};

export const requestNotificationPermission = async (userId: string, silent = false) => {
  try {
    console.log('Requesting notification permission...');
    
    // Check if notifications are supported
    if (!('Notification' in window)) {
      if (!silent) useAppStore.getState().setToast({ title: "Notice", message: "This browser does not support notifications. Please use Safari on iOS 16.4+ or Chrome/Edge." });
      return;
    }

    // Check if in standalone mode (iOS requirement)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (!isStandalone && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
      if (!silent) useAppStore.getState().setToast({ title: "Notice", message: 'To receive notifications on iPad/iPhone:\n1. Tap the Share button in Safari\n2. Select "Add to Home Screen"\n3. Open the app from the Home Screen' });
      return;
    }

    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('Notification permission granted.');
      const msg = await messaging();
      if (msg) {
        // Ensure Service Worker is registered and ready
        if (!('serviceWorker' in navigator)) {
          if (!silent) useAppStore.getState().setToast({ title: "Notice", message: "Service Worker is not supported on this browser." });
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        console.log('Service Worker ready:', registration);

        const token = await getToken(msg, {
          vapidKey: 'BJD0gr0az3BCgcGFFymvboFJY8Ra3CzHNzb-NSwzLbDGrqgCHCfjTEwbnT7uqJVCUM0ocQi1fvziz13IZCPWJzU',
          serviceWorkerRegistration: registration
        });
        
        console.log('FCM Token:', token);
        
        // Save token to user document
        if (userId && userId !== 'guest') {
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_users', userId), {
            fcmToken: token,
            fcmTokenUpdatedAt: new Date().toISOString(),
            lastPlatform: navigator.platform,
            isStandalone: !!isStandalone
          }, { merge: true });
        }
        
        return token;
      } else {
        if (!silent) useAppStore.getState().setToast({ title: "Error", message: "Failed to initialize Firebase Messaging." });
      }
    } else {
      console.log('Unable to get permission to notify.');
      if (!silent) useAppStore.getState().setToast({ title: "Notice", message: "Notification permission was denied. Please enable it in Settings -> Notifications -> Taka PM." });
    }
  } catch (error: any) {
    console.error('Error requesting notification permission:', error);
    let errorMsg = 'Notification activation error: ';
    
    if (error?.code === 'messaging/permission-blocked') {
      errorMsg += 'Notification permission is blocked.';
    } else if (error?.code === 'messaging/failed-serviceworker-registration') {
      errorMsg += 'Service Worker registration failed. Try removing the app from Home Screen and adding it again.';
    } else {
      errorMsg += error?.message || 'Unknown error.';
    }
    
    if (!silent) useAppStore.getState().setToast({ title: "Error", message: String(errorMsg + '\n\nPlease ensure you are using HTTPS and have added the app to your Home Screen.') });
  }
};
