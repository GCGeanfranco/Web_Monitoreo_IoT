"""
Servicio de notificaciones push (Web Push API).

Usa VAPID para autenticarse ante los navegadores sin depender de un
proveedor externo (Firebase, OneSignal, etc.) — funciona directo con
Chrome/Edge/Firefox/Safari vía el estándar Web Push.

Requiere las variables de entorno:
  - VAPID_PUBLIC_KEY
  - VAPID_PRIVATE_KEY
  - VAPID_CLAIMS_EMAIL  (mailto:tu-correo@dominio.com, lo exige el estándar)
"""
import os
import logging
from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session
from app.models import PushSubscription

logger = logging.getLogger("push_service")

VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:admin@example.com")


def push_configurado() -> bool:
    return bool(VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY)


def enviar_push_alarma(db: Session, voltaje_entrada: float):
    """
    Envía una notificación push de alarma a TODOS los dispositivos suscritos.
    Si una suscripción ya no es válida (el usuario desinstaló la PWA, revocó
    el permiso, etc.), el navegador/broker responde 404/410 — en ese caso
    la borramos de la tabla para no seguir intentando en vano.
    """
    if not push_configurado():
        logger.warning("[PUSH] VAPID no configurado — se omite el envío de push.")
        return

    suscripciones = db.query(PushSubscription).all()
    if not suscripciones:
        return

    payload = {
        "title": "⚠️ Alarma — Fundo Lopez",
        "body": f"Voltaje de entrada crítico: {voltaje_entrada:.1f}V",
        "tag": "alarma-voltaje",  # agrupa notificaciones repetidas en una sola
        "url": "/",
    }

    suscripciones_invalidas = []

    for sub in suscripciones:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=_json(payload),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
            )
        except WebPushException as ex:
            status = getattr(ex.response, "status_code", None)
            if status in (404, 410):
                suscripciones_invalidas.append(sub.id)
            else:
                logger.error(f"[PUSH] Error enviando a {sub.endpoint[:50]}...: {ex}")
        except Exception as ex:
            # Cualquier otro error (llaves corruptas, endpoint malformado, etc.)
            # NUNCA debe propagarse hacia crear_lectura_transformador() — ese
            # endpoint lo llama el ESP32 y tiene que responder 200 siempre que
            # la lectura en sí se haya guardado bien, sin importar qué pase
            # con el envío de notificaciones a otros dispositivos.
            logger.error(f"[PUSH] Error inesperado con suscripción {sub.id}: {ex}")
            suscripciones_invalidas.append(sub.id)

    if suscripciones_invalidas:
        db.query(PushSubscription).filter(
            PushSubscription.id.in_(suscripciones_invalidas)
        ).delete(synchronize_session=False)
        db.commit()
        logger.info(f"[PUSH] Limpiadas {len(suscripciones_invalidas)} suscripciones inválidas.")


def _json(payload: dict) -> str:
    import json
    return json.dumps(payload)