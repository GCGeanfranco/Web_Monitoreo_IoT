from fastapi import FastAPI
from app.routes import router
from app.database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Tesis IoT API",
    description="API para monitoreo de autotransformador y sistema de riego",
    version="1.0.0"
)

app.include_router(router, prefix="/api")


@app.get("/")
def root():
    return {"status": "ok", "mensaje": "API Tesis IoT funcionando"}
