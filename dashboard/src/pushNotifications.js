// Utilidades para notificaciones push (Web Push API).
import axios from "axios";

// El navegador exige que la llave pública VAPID venga en Uint8Array,
// no en el string base64url que entrega el backend — de ahí este helper.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function pushSoportado() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// Devuelve 'granted' | 'denied' | 'default' sin pedir permiso todavía
export function estadoPermisoNotificaciones() {
  if (!pushSoportado()) return "unsupported";
  return Notification.permission;
}

export async function suscribirseAAlertas(apiUrl) {
  if (!pushSoportado()) {
    throw new Error("Este navegador no soporta notificaciones push.");
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    throw new Error("Permiso de notificaciones denegado.");
  }

  const registration = await navigator.serviceWorker.ready;

  const { data } = await axios.get(`${apiUrl}/api/push/vapid-public-key`);

  if (!data.configurado || !data.publicKey) {
    throw new Error("El servidor todavía no tiene configuradas las notificaciones push.");
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });

  const subJson = subscription.toJSON();
  await axios.post(`${apiUrl}/api/push/subscribe`, {
    endpoint: subJson.endpoint,
    keys: subJson.keys,
  });

  return subscription;
}

export async function desuscribirseDeAlertas(apiUrl) {
  if (!pushSoportado()) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();

  await axios.post(`${apiUrl}/api/push/unsubscribe`, { endpoint });
}

// Para saber, al cargar la app, si este dispositivo ya está suscrito
// (y así mostrar el botón como "Alertas activadas" en vez de "Activar")
export async function yaEstaSuscrito() {
  if (!pushSoportado()) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return !!subscription;
}