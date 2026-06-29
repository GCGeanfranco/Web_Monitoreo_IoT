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

# --- Endpoints Transformador ---


@router.post("/lecturas/transformador")
def crear_lectura_transformador(data: TransformadorIn, db: Session = Depends(get_db)):
    lectura = LecturaTransformador(**data.model_dump())
    db.add(lectura)
    db.commit()
    db.refresh(lectura)
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
    comandos = db.query(ComandoControlDB).all()
    return {c.dispositivo: c.accion for c in comandos}
