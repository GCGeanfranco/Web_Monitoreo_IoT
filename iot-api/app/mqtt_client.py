import paho.mqtt.client as mqtt
import os
from dotenv import load_dotenv

load_dotenv()

MQTT_HOST = os.getenv("MQTT_HOST")
MQTT_PORT = int(os.getenv("MQTT_PORT", 8883))
MQTT_USER = os.getenv("MQTT_USER")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")


def publicar_comando(dispositivo: str, accion: bool):
    """Publica un comando en el topic MQTT correspondiente"""
    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        client.username_pw_set(MQTT_USER, MQTT_PASSWORD)
        client.tls_set()
        client.connect(MQTT_HOST, MQTT_PORT, 60)

        topic = f"tesis-iot/{dispositivo}/control"
        payload = "1" if accion else "0"

        client.publish(topic, payload, qos=1)
        client.disconnect()

        print(f"[MQTT] Publicado en {topic}: {payload}")
        return True
    except Exception as e:
        print(f"[MQTT] Error: {e}")
        return False
