// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// Parse the firebaseConfig from the URL query parameters
const params = new URL(location).searchParams;
const configString = params.get('firebaseConfig');

if (configString) {
  try {
    const firebaseConfig = JSON.parse(decodeURIComponent(configString));
    
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);

    // Retrieve an instance of Firebase Messaging so that it can handle background messages.
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);
      // Customize notification here
      const notificationTitle = payload.notification?.title || 'Pengingat KINAA';
      const notificationOptions = {
        body: payload.notification?.body,
        icon: '/icon-192x192.png' // make sure you have an icon here
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } catch (error) {
    console.error('[firebase-messaging-sw.js] Error parsing config:', error);
  }
} else {
  console.warn('[firebase-messaging-sw.js] No firebaseConfig found in URL.');
}
