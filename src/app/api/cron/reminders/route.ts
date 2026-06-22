import { NextResponse } from 'next/server';
import { adminDb, adminMessaging } from '@/lib/firebaseAdmin';

// This handles the Vercel Cron Job request or external cron-job.org request
export async function GET(request: Request) {
  try {
    // 1. Get current time in WIB (UTC+7)
    const now = new Date();
    // Use toLocaleString to get the Date parts in Asia/Jakarta securely
    const wibDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));

    // Format securely to HH:mm
    const hh = String(wibDate.getHours()).padStart(2, '0');
    const mm = String(wibDate.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hh}:${mm}`;

    console.log(`[Cron] Checking reminders for time: ${currentTimeStr} WIB`);

    // We don't have a direct "reminders" collection at root.
    // In Kinaa, reminders are saved under: artifacts/{appId}/users/{uid}/reminders
    // Since we don't know the exact appId or uid here globally easily without traversing,
    // we use a Collection Group query!

    // This requires a composite index on Firestore for 'reminders' collection group.
    const remindersSnapshot = await adminDb.collectionGroup('reminders').where('timeStr', '==', currentTimeStr).get();

    if (remindersSnapshot.empty) {
      console.log('No reminders due at this time.');
      return NextResponse.json({ success: true, message: 'No reminders due.' });
    }

    const messages: any[] = [];

    for (const doc of remindersSnapshot.docs) {
      const reminderData = doc.data();
      const userRef = doc.ref.parent.parent; // users/{uid} document reference

      if (!userRef) continue;

      const userDoc = await userRef.get();
      if (!userDoc.exists) continue;

      const userData = userDoc.data();
      const fcmToken = userData?.fcmToken;

      if (!fcmToken) {
        console.log(`User ${userRef.id} has no FCM Token. Skipping reminder.`);
        continue;
      }

      // Prepare Notification Payload
      const typeLabel = reminderData.type === 'dbf' ? 'Menyusui Langsung' : 'Perah ASI';
      const body = `Waktunya untuk ${typeLabel}! (Target: ${reminderData.frequency} jam sekali)`;

      messages.push({
        token: fcmToken,
        notification: {
          title: 'Pengingat KINAA',
          body: body,
        },
        data: {
          click_action: 'FLUTTER_NOTIFICATION_CLICK', // optional if they ever migrate
          type: reminderData.type
        }
      });
    }

    if (messages.length > 0) {
      // Send all push notifications
      const response = await adminMessaging.sendEach(messages);
      console.log(`Successfully sent ${response.successCount} messages; Failed: ${response.failureCount}`);
      return NextResponse.json({ success: true, sentCount: response.successCount });
    }

    return NextResponse.json({ success: true, message: 'Processed all reminders, no valid tokens found.' });

  } catch (error: any) {
    console.error('Error processing cron reminders:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
