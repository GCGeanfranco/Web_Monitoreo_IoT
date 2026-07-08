import asyncio
import json

# Guardamos también el loop principal para poder notificar
# de forma segura desde endpoints sync (que corren en threadpool)
_main_loop: asyncio.AbstractEventLoop | None = None
conexiones_activas: list[asyncio.Queue] = []

# Guardamos el último estado conocido para dar "estado inicial"
# a cualquier dashboard que recién conecta
ultimo_estado_transformador: dict | None = None
ultimo_estado_riego: dict | None = None


def registrar_loop(loop: asyncio.AbstractEventLoop):
    global _main_loop
    _main_loop = loop


def notificar_cambio(tipo: str, payload: dict):
    """
    Llamada desde endpoints SYNC (Depends(get_db) es sync).
    Empuja el mensaje a todas las colas de forma thread-safe.
    """
    global ultimo_estado_transformador, ultimo_estado_riego

    if tipo == "transformador":
        ultimo_estado_transformador = payload
    elif tipo == "riego":
        ultimo_estado_riego = payload

    mensaje = json.dumps({"tipo": tipo, "data": payload})

    if _main_loop is None:
        return  # seguridad por si se llama antes de arrancar

    for queue in list(conexiones_activas):
        _main_loop.call_soon_threadsafe(queue.put_nowait, mensaje)
