from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import LecturaTransformador, LecturaRiego
from pydantic import BaseModel
from typing import Optional

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
