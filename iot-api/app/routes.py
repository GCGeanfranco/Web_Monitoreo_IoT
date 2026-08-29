import asyncio
import json
import logging
from fastapi.responses import StreamingResponse
from app import sse_manager
from app import mqtt_listener
from app.sse_manager import (
    conexiones_activas,
    notificar_cambio,
    ultimo_estado_transformador,
    ultimo_estado_riego,
)
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import LecturaTransformador, LecturaRiego, ComandoControlDB, PushSubscription
from pydantic import BaseModel
from typing import Optional
from app.mqtt_client import publicar_comando, publicar_comando_escaneo
from app.push_service import enviar_push_alarma, push_configurado, VAPID_PUBLIC_KEY


router = APIRouter()
logger = logging.getLogger("routes")

# --- Schemas ---


class TransformadorIn(BaseModel):
    voltaje_entrada: float
    voltaje_salida: float
    tap_activo: int
    temperatura: float
    estado_bomba: bool = False
    alarma: bool = False


class RiegoIn(BaseModel):
    humedad_suelo: float
    modo_riego: str
    electrovalvula_activa: bool = False
    tiempo_riego: int


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: PushKeys


# --- Endpoint SSE ---

async def event_generator(queue: asyncio.Queue):
    try:
        while True:
            mensaje = await queue.get()
            yield f"data: {mensaje}\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        if queue in conexiones_activas:
            conexiones_activas.remove(queue)


@router.get("/sistema/estado")
def obtener_estado_sistema():
    return {"online": mqtt_listener.sistema_online}


@router.get("/stream/estado")
async def stream_estado():
    queue = asyncio.Queue()
    conexiones_activas.append(queue)

    # Enviar estado inicial inmediatamente al conectar,
    # para que el dashboard no espere al próximo evento
    estado_inicial = {
        "tipo": "inicial",
        "data": {
            "transformador": sse_manager.ultimo_estado_transformador,
            "riego": sse_manager.ultimo_estado_riego,
        },
    }
    await queue.put(json.dumps(estado_inicial))

    return StreamingResponse(
        event_generator(queue),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # evita buffering en proxies (importante en Render)
            "X-Accel-Buffering": "no",
        },
    )

# --- Endpoints Transformador ---


@router.post("/lecturas/transformador")
def crear_lectura_transformador(data: TransformadorIn, db: Session = Depends(get_db)):
    # Capturamos el estado de alarma ANTERIOR antes de que notificar_cambio()
    # lo sobreescriba, para detectar el flanco OFF->ON (y no repetir el push
    # en cada lectura mientras la alarma se mantiene activa).
    alarma_anterior = False
    if sse_manager.ultimo_estado_transformador:
        alarma_anterior = sse_manager.ultimo_estado_transformador.get("alarma", False)

    lectura = LecturaTransformador(**data.model_dump())
    db.add(lectura)
    db.commit()
    db.refresh(lectura)

    # Notificar a todos los dashboards conectados
    notificar_cambio("transformador", {
        "id": lectura.id,
        "voltaje_entrada": lectura.voltaje_entrada,
        "voltaje_salida": lectura.voltaje_salida,
        "tap_activo": lectura.tap_activo,
        "temperatura": lectura.temperatura,
        "estado_bomba": lectura.estado_bomba,
        "alarma": lectura.alarma,
        "created_at": lectura.created_at.isoformat() if lectura.created_at else None,
    })

    # Push solo en el flanco de subida de la alarma (OFF -> ON).
    # Envuelto en try/except a propósito: este endpoint lo llama el ESP32 en
    # tiempo real, y un fallo en el sistema de notificaciones NUNCA debe
    # impedir que la lectura se guarde y se confirme con 200.
    if lectura.alarma and not alarma_anterior:
        try:
            enviar_push_alarma(db, voltaje_entrada=lectura.voltaje_entrada)
        except Exception as ex:
            logger.error(f"[PUSH] Fallo no controlado al enviar alarma: {ex}")

    return {"ok": True, "id": lectura.id}


@router.get("/lecturas/transformador")
def obtener_lecturas_transformador(db: Session = Depends(get_db)):
    return db.query(LecturaTransformador).order_by(
        LecturaTransformador.created_at.desc()
    ).limit(50).all()

# --- Endpoints Riego ---


@router.post("/lecturas/riego")
def crear_lectura_riego(data: RiegoIn, db: Session = Depends(get_db)):
    lectura = LecturaRiego(**data.model_dump())
    db.add(lectura)
    db.commit()
    db.refresh(lectura)

    notificar_cambio("riego", {
        "id": lectura.id,
        "humedad_suelo": lectura.humedad_suelo,
        "modo_riego": lectura.modo_riego,
        "electrovalvula_activa": lectura.electrovalvula_activa,
        "tiempo_riego": lectura.tiempo_riego,
        "created_at": lectura.created_at.isoformat() if lectura.created_at else None,
    })

    return {"ok": True, "id": lectura.id}


@router.get("/lecturas/riego")
def obtener_lecturas_riego(db: Session = Depends(get_db)):
    return db.query(LecturaRiego).order_by(
        LecturaRiego.created_at.desc()
    ).limit(50).all()

# --- Schema Control ---


class ComandoControl(BaseModel):
    accion: bool

# --- Endpoints Control ---


@router.put("/control/bomba")
def controlar_bomba(data: ComandoControl, db: Session = Depends(get_db)):
    comando = db.query(ComandoControlDB).filter_by(dispositivo="bomba").first()
    if comando:
        comando.accion = data.accion
        comando.ejecutado = False
    else:
        comando = ComandoControlDB(
            dispositivo="bomba", accion=data.accion, ejecutado=False)
        db.add(comando)
    db.commit()

    # Publicar en MQTT para respuesta instantánea
    publicar_comando("bomba", data.accion)

    return {"ok": True, "dispositivo": "bomba", "accion": data.accion}


@router.put("/control/electrovalvula")
def controlar_electrovalvula(data: ComandoControl, db: Session = Depends(get_db)):
    comando = db.query(ComandoControlDB).filter_by(
        dispositivo="electrovalvula").first()
    if comando:
        comando.accion = data.accion
        comando.ejecutado = False
    else:
        comando = ComandoControlDB(
            dispositivo="electrovalvula", accion=data.accion, ejecutado=False)
        db.add(comando)
    db.commit()

    # Publicar en MQTT para respuesta instantánea
    publicar_comando("electrovalvula", data.accion)

    return {"ok": True, "dispositivo": "electrovalvula", "accion": data.accion}


@router.post("/control/escaneo")
def solicitar_escaneo():
    """
    Dispara un escaneo remoto de los 10 taps en el ESP32 (comando 'scan' via
    MQTT). No persiste estado en BD: a diferencia de bomba/electrovalvula,
    el escaneo no es un on/off que deba sincronizarse, es una accion puntual
    que el firmware ejecuta una vez y termina sola.

    El ESP32 tarda ~7s en recorrer los 10 taps (600ms de estabilizacion x10
    + pausas de rele); durante ese lapso no envia lecturas normales por HTTP.
    """
    ok = publicar_comando_escaneo()
    if not ok:
        raise HTTPException(status_code=502, detail="No se pudo publicar el comando de escaneo en MQTT")
    return {"ok": True, "comando": "scan"}


@router.get("/control/estado")
def obtener_estado_control(db: Session = Depends(get_db)):
    ultima_lectura = db.query(LecturaTransformador).order_by(
        LecturaTransformador.created_at.desc()
    ).first()
    ultimo_riego = db.query(LecturaRiego).order_by(
        LecturaRiego.created_at.desc()
    ).first()

    return {
        "bomba": ultima_lectura.estado_bomba if ultima_lectura else False,
        "electrovalvula": ultimo_riego.electrovalvula_activa if ultimo_riego else False,
    }

# --- Endpoints Push Notifications ---


@router.get("/push/vapid-public-key")
def obtener_vapid_public_key():
    """El frontend necesita esta llave pública para pedir la suscripción
    push al navegador (PushManager.subscribe)."""
    return {"publicKey": VAPID_PUBLIC_KEY, "configurado": push_configurado()}


@router.post("/push/subscribe")
def suscribir_push(data: PushSubscriptionIn, db: Session = Depends(get_db)):
    existente = db.query(PushSubscription).filter_by(endpoint=data.endpoint).first()
    if existente:
        existente.p256dh = data.keys.p256dh
        existente.auth = data.keys.auth
    else:
        db.add(PushSubscription(
            endpoint=data.endpoint,
            p256dh=data.keys.p256dh,
            auth=data.keys.auth,
        ))
    db.commit()
    return {"ok": True}


@router.post("/push/unsubscribe")
def desuscribir_push(data: dict, db: Session = Depends(get_db)):
    endpoint = data.get("endpoint")
    if endpoint:
        db.query(PushSubscription).filter_by(endpoint=endpoint).delete()
        db.commit()
    return {"ok": True}
