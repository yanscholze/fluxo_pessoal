import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { notificationsApi } from "./api";

export { Notifications };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("fluxo-updates", {
      name: "Atualizações do Fluxo",
      description: "Recomendações, respostas e avisos importantes da sua conta.",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#35b7aa",
      sound: "default",
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.status === "granted" ? existing : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await notificationsApi({ action: "register-push", expoPushToken: token, platform: Platform.OS });
  return token;
}

export async function unregisterPushNotifications() {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId || !Device.isDevice) return;
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") return;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await notificationsApi({ action: "unregister-push", expoPushToken: token });
  } catch {
    // O logout continua mesmo quando o aparelho está sem rede.
  }
}
