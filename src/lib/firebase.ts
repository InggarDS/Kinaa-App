import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, getToken, isSupported, Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "dummy-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "dummy-auth-domain",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "dummy-project-id",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "dummy-storage-bucket",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "dummy-sender-id",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "dummy-app-id"
};

// Initialize Firebase only if it hasn't been initialized already
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

const auth = getAuth(app);
const db = getFirestore(app);

let messaging: Messaging | null = null;

export const initializeMessaging = async () => {
  try {
    if (typeof window !== "undefined" && await isSupported()) {
      messaging = getMessaging(app);
    }
  } catch (error) {
    console.error("Messaging not supported", error);
  }
};

export const requestFCMToken = async (vapidKey?: string) => {
  if (!messaging) await initializeMessaging();
  if (messaging) {
    try {
      const vKey = vapidKey || process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vKey) {
        console.error("VAPID key is required for FCM.");
        return null;
      }

      // Pass the firebaseConfig to the service worker via URL parameters
      const configString = encodeURIComponent(JSON.stringify(firebaseConfig));
      const registration = await navigator.serviceWorker.register(
        `/firebase-messaging-sw.js?firebaseConfig=${configString}`
      );

      const currentToken = await getToken(messaging, { 
        vapidKey: vKey,
        serviceWorkerRegistration: registration 
      });
      return currentToken || null;
    } catch (err) {
      console.log('An error occurred while retrieving FCM token. ', err);
      return null;
    }
  }
  return null;
};

export { app, auth, db, messaging };
