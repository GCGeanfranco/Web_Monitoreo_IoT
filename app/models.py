from sqlalchemy import Column, Integer, Float, Boolean, String, DateTime
from sqlalchemy.sql import func
from app.database import Base


class LecturaTransformador(Base):
    __tablename__ = "lecturas_transformador"

    id = Column(Integer, primary_key=True, index=True)
    voltaje_entrada = Column(Float)
    voltaje_salida = Column(Float)
    tap_activo = Column(Integer)
    temperatura = Column(Float)
    estado_bomba = Column(Boolean, default=False)
    alarma = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())


class LecturaRiego(Base):
    __tablename__ = "lecturas_riego"

    id = Column(Integer, primary_key=True, index=True)
    humedad_suelo = Column(Float)
    modo_riego = Column(String(20))
    electrovalvula_activa = Column(Boolean, default=False)
    tiempo_riego = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())
