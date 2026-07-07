import asyncio
from app.sse_manager import registrar_loop
from app.mqtt_listener import iniciar_listener, detener_listener
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router
from app.database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Tesis IoT API",
    description="API para monitoreo de autotransformador y sistema de riego",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://iotmonitoreito.vercel.app",
        "http://localhost:5173",  # desarrollo local con Vite
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/")
def root():
    return {"status": "ok", "mensaje": "API Tesis IoT funcionando"}


@app.on_event("startup")
async def startup_event():
    loop = asyncio.get_running_loop()
    registrar_loop(loop)
    iniciar_listener(loop)


@app.on_event("shutdown")
async def shutdown_event():
    detener_listener()
