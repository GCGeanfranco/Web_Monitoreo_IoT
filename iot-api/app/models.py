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


class ComandoControlDB(Base):
    __tablename__ = "comandos_control"

    id = Column(Integer, primary_key=True, index=True)
    dispositivo = Column(String(50))
    accion = Column(Boolean, default=False)
    ejecutado = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    # URL única que identifica el dispositivo/navegador suscrito (la da el navegador)
    endpoint = Column(String(500), unique=True, index=True)
    p256dh = Column(String(255))
    auth = Column(String(255))
    created_at = Column(DateTime, server_default=func.now())
