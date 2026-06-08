from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root():
    """Verifica que la API responde"""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_get_lecturas_transformador():
    """Verifica que el endpoint de transformador responde"""
    response = client.get("/api/lecturas/transformador")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_lecturas_riego():
    """Verifica que el endpoint de riego responde"""
    response = client.get("/api/lecturas/riego")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_post_lectura_transformador():
    """Verifica que se puede guardar una lectura del transformador"""
    data = {
        "voltaje_entrada": 180.0,
        "voltaje_salida": 220.0,
        "tap_activo": 3,
        "temperatura": 45.0,
        "estado_bomba": True,
        "alarma": False
    }
    response = client.post("/api/lecturas/transformador", json=data)
    assert response.status_code == 200
    assert response.json()["ok"] == True
