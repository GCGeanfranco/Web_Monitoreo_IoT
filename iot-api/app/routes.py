import asyncio
import json
from fastapi.responses import StreamingResponse
from app import sse_manager
from app import mqtt_listener
from app.sse_manager import (
    conexiones_activas,
    notificar_cambio,
    ultimo_estado_transformador,
    ultimo_estado_riego,
)
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import LecturaTransformador, LecturaRiego, ComandoControlDB
from pydantic import BaseModel
from typing import Optional
from app.mqtt_client import publicar_comando


router = APIRouter()

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
