import asyncio
import os
import paho.mqtt.client as mqtt
import threading
from dotenv import load_dotenv
from app import sse_manager

load_dotenv()

MQTT_HOST = os.getenv("MQTT_HOST")
MQTT_PORT = int(os.getenv("MQTT_PORT", 8883))
MQTT_USER = os.getenv("MQTT_USER")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")

# Estado en memoria, accesible desde los endpoints
sistema_online = False

_main_loop: asyncio.AbstractEventLoop | None = None
_client: mqtt.Client | None = None


def _on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("[MQTT Listener] Conectado, suscribiendo a tesis-iot/sistema/estado")
        client.subscribe("tesis-iot/sistema/estado", qos=1)
    else:
        print(f"[MQTT Listener] Fallo de conexion, rc={rc}")


def _on_message(client, userdata, msg):
    global sistema_online
    payload = msg.payload.decode().strip().lower()

    nuevo_estado = payload == "online"
    if nuevo_estado != sistema_online:
        sistema_online = nuevo_estado
        print(
            f"[MQTT Listener] Sistema {'ONLINE' if nuevo_estado else 'OFFLINE'}")

        # Reusa el mismo canal SSE para avisar al dashboard en tiempo real
        if _main_loop is not None:
            _main_loop.call_soon_threadsafe(
                _notificar_estado_sistema, nuevo_estado
            )


def _notificar_estado_sistema(online: bool):
    sse_manager.notificar_cambio("sistema", {"online": online})


def iniciar_listener(loop: asyncio.AbstractEventLoop):
    global _client, _main_loop
    _main_loop = loop

    _client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    _client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
    _client.tls_set()
    _client.on_connect = _on_connect
    _client.on_message = _on_message

    def _conectar_en_background():
        try:
            _client.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
            _client.loop_start()
            print("[MQTT Listener] Iniciado en background")
        except Exception as e:
            print(f"[MQTT Listener] Error al conectar: {e}")

    threading.Thread(target=_conectar_en_background, daemon=True).start()


def detener_listener():
    if _client:
        _client.loop_stop()
        _client.disconnect()
