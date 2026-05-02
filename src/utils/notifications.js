import { LocalNotifications } from '@capacitor/local-notifications';

export async function requestNotificationPermission() {
  try {
    const res = await LocalNotifications.requestPermissions();
    return res.display === 'granted';
  } catch (e) {
    console.error("Local notifications not available or running in web", e);
    return false;
  }
}

export async function scheduleNotification(id, title, body, date) {
  try {
    // Generate a positive Int32 id if the provided id is not valid
    const numericId = typeof id === 'number' ? id : Math.floor(Math.random() * 2000000000);
    
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: numericId,
          schedule: { at: date },
          sound: null,
          actionTypeId: '',
          extra: null
        }
      ]
    });
    return numericId;
  } catch (e) {
    console.error("Failed to schedule native notification", e);
    return null;
  }
}

export async function scheduleDailyNotification(id, title, body, hour, minute) {
  try {
    const numericId = typeof id === 'number' ? id : Math.floor(Math.random() * 2000000000);
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: numericId,
          schedule: { repeats: true, every: 'day', on: { hour, minute } },
          sound: null,
          actionTypeId: '',
          extra: null
        }
      ]
    });
    return numericId;
  } catch (e) {
    console.error("Failed to schedule daily native notification", e);
    return null;
  }
}

export async function cancelNotification(id) {
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch (e) {}
}

export async function clearAllNotifications() {
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel(pending);
    }
  } catch (e) {}
}
