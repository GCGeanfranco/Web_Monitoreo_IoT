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
