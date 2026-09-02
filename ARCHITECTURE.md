# Arquitectura del Sistema — Web Monitoreo IoT

> Documento de contexto técnico del proyecto. Si es la primera vez que ves este repositorio, lee este archivo antes de tocar el código.

---

## 1. Contexto del proyecto

Sistema de monitoreo y control IoT desarrollado como proyecto de tesis, con dos módulos principales:

- **Autotransformador eléctrico (10 taps)**: mide voltaje de entrada (sensor ZMPT101B), temperatura, estado de bomba y alarma. El firmware conmuta automáticamente entre 10 taps con histéresis para mantener la salida cerca de 220V.
- **Riego agrícola**: mide humedad del suelo y controla una electroválvula de riego de forma remota.

El nodo de hardware es un **ESP32** que envía lecturas cada 30 segundos a una API en la nube, y recibe comandos en tiempo real vía **MQTT**. Los datos se visualizan en un **dashboard web** con actualización en tiempo real.

---

## 2. Diagrama de arquitectura

```
┌─────────────────────┐
│   ESP32 (Arduino)   │  Lee voltaje (ZMPT101B), conmuta taps,
│   (firmware .ino)   │  bomba, alarma, humedad/electroválvula
└───────┬─────────────┘
        │                              ┌──────────────────────────────┐
        │ ① HTTP POST (cada 30s)       │  HiveMQ Cloud (broker MQTT)  │
        ▼                              │  TLS puerto 8883             │
┌─────────────────────┐                └───────────────▲──────────────┘
│  API FastAPI        │                                │
│  (Render)           │◄─────────── ② publish/         │
│  iot-api/           │             subscribe          │
│  web-monitoreo-     │                                │
│  iot.onrender.com   │                                │
└──────┬──────────┬───┘                                │
       │          │                                    │
       │          │ ③ SSE (/api/stream/estado)         │
       │          ▼                                    │
       │   ┌──────────────────────┐  ④ PUT control     │
       │   │  Dashboard React     │  (bomba/electrov.) │
       │   │  (Vercel / Railway)  │────────────────────┘
       │   │  dashboard/          │
       │   │  iotmonitoreito.     │
       │   │  vercel.app          │
       ▼
┌─────────────┐
│ PostgreSQL  │  lecturas_transformador, lecturas_riego, comandos_control
└─────────────┘
```

**Despliegue / CI/CD:**

```
GitHub → GitHub Actions (tests pytest) → Deploy automático (Render API, Railway/Vercel dashboard)
```

---

## 3. Flujos de datos

### 3.1 Telemetría (lecturas)

1. El ESP32 mide voltaje cada 100 ms y calcula el tap activo con histéresis (20 ciclos de espera para evitar rebotes).
2. Cada 30 s envía `HTTP POST /api/lecturas/transformador` (y `/api/lecturas/riego` cuando aplique) con JSON.
3. FastAPI valida con Pydantic, guarda en PostgreSQL y llama a `notificar_cambio()`.
4. `sse_manager` empuja el mensaje a todas las colas de los dashboards conectados (thread-safe con `call_soon_threadsafe`).
5. El dashboard recibe el evento por SSE y actualiza gauges, LEDs y gráficas sin recargar la página.

### 3.2 Control remoto (bomba / electroválvula)

1. El usuario toca un switch en el dashboard → `PUT /api/control/bomba` o `/api/control/electrovalvula`.
2. La API guarda el comando en la tabla `comandos_control` y publica en MQTT al topic `tesis-iot/{dispositivo}/control` (payload `"1"`/`"0"`, QoS 1).
3. El ESP32 está suscrito a esos topics y ejecuta la acción de inmediato (sin esperar al ciclo de 30 s).
4. El dashboard muestra estado "⏳ Esperando confirmación…" hasta que la siguiente lectura confirme el cambio (timeout de 5 s).

### 3.3 Estado del sistema (online/offline)

1. El ESP32 publica en el topic `tesis-iot/sistema/estado`.
2. `mqtt_listener.py` corre en background dentro de la API, suscrito a ese topic, y actualiza la variable `sistema_online`.
3. Los cambios se reenvían al dashboard por el mismo canal SSE (`tipo: "sistema"`), que habilita/deshabilita los switches.

---

## 4. Backend — `iot-api/` (FastAPI)

API REST + SSE. Código en `iot-api/app/`:

| Archivo | Responsabilidad |
|---|---|
| `main.py` | Punto de entrada. Crea tablas con `Base.metadata.create_all`, configura CORS (Vercel + localhost:5173), registra el router bajo `/api`. En startup registra el event loop e inicia el listener MQTT. |
| `routes.py` | Todos los endpoints. Al recibir un POST de lectura, guarda en BD y notifica por SSE. El PUT de control guarda en BD y publica en MQTT. |
| `models.py` | Modelos SQLAlchemy: `LecturaTransformador`, `LecturaRiego`, `ComandoControlDB`. |
| `database.py` | Engine SQLAlchemy desde `DATABASE_URL`, `SessionLocal`, helper `get_db()`. |
| `sse_manager.py` | Colas `asyncio.Queue` por cliente conectado, último estado conocido (para el mensaje "inicial"), y `notificar_cambio()` thread-safe desde endpoints sync. |
| `mqtt_client.py` | Cliente publicador: se conecta a HiveMQ (TLS 8883) por cada comando, publica y desconecta. |
| `mqtt_listener.py` | Cliente suscriptor permanente (hilo daemon): escucha `tesis-iot/sistema/estado` y actualiza `sistema_online`. |

### Tablas de la base de datos (PostgreSQL)

- **`lecturas_transformador`**: voltaje_entrada, voltaje_salida, tap_activo, temperatura, estado_bomba, alarma, created_at.
- **`lecturas_riego`**: humedad_suelo, modo_riego, electrovalvula_activa, tiempo_riego, created_at.
- **`comandos_control`**: dispositivo, accion, ejecutado, created_at.

### Endpoints (prefijo `/api`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Health check de la API |
| POST | `/lecturas/transformador` | Guarda lectura del transformador + notifica SSE |
| GET | `/lecturas/transformador` | Últimas 50 lecturas (para gráfica histórica) |
| POST | `/lecturas/riego` | Guarda lectura de riego + notifica SSE |
| GET | `/lecturas/riego` | Últimas 50 lecturas de riego |
| PUT | `/control/bomba` | Enciende/apaga bomba (BD + MQTT) |
| PUT | `/control/electrovalvula` | Abre/cierra electroválvula (BD + MQTT) |
| GET | `/control/estado` | Estado real actual de bomba y electroválvula |
| GET | `/sistema/estado` | `{"online": bool}` según MQTT |
| GET | `/stream/estado` | Stream SSE: envía estado inicial y luego eventos en vivo |

### Tiempo real (SSE)

Cada cliente que se conecta a `/api/stream/estado` recibe una cola propia. El primer mensaje es `{"tipo": "inicial", ...}` con el último estado conocido, y luego eventos `transformador`, `riego` o `sistema`. Los headers desactivan buffering (`X-Accel-Buffering: no`) para que funcione en Render.

---

## 5. Frontend — `dashboard/` (React + Vite)

- **Stack**: React 19, Vite, `axios` (REST), `recharts` (gráficas), CSS puro.
- **`src/App.jsx`**: componente único que orquesta todo.
  - Al montar: `fetchData()` obtiene historial (`/lecturas/*`), estado de control y estado del sistema, y abre el `EventSource` de SSE.
  - **Gauges** (SVG) para voltaje de entrada/salida, temperatura y humedad.
  - **TapIndicator** muestra el tap activo de 10.
  - **Switch** con lógica de confirmación: al togglear se marca "pendiente" hasta que la siguiente lectura confirme el estado real (evita desincronización visual), y se deshabilita si el sistema está offline.
  - **Gráficas** de historial de voltaje y humedad (últimas 50 lecturas), con hora formateada a `America/Lima`.
- **URL de la API** hardcodeada: `https://web-monitoreo-iot.onrender.com`.
- Se sirve como sitio estático (`npx serve dist -p 8080` según `nixpacks.toml`) y está desplegado en Vercel (`iotmonitoreito.vercel.app`, incluida en el CORS de la API).

---

## 6. Hardware / Firmware — ESP32 (Arduino)

- **Sensores/actuadores**: ZMPT101B (voltaje), 10 relés de taps, bomba (pin 14), alarma (pin 27), LCD I2C 16x2.
- **Lógica de control**:
  - Tabla de umbrales por tap (`TAP_CONFIG`): cada tap cubre un rango de voltaje de entrada para entregar ~220V nominales.
  - Histéresis de ±3V en el tap actual y 20 ciclos de espera antes de conmutar.
  - Voltaje < 130V → alarma, abre todos los relés y apaga la bomba; se recupera al superar 145V.
- **Comunicación**:
  - HTTP POST cada 30 s a la API (`/api/lecturas/transformador`) y GET de `/api/control/estado`.
  - MQTT sobre TLS (HiveMQ Cloud, puerto 8883): suscrito a `tesis-iot/bomba/control` y `tesis-iot/electrovalvula/control`, publica estado en `tesis-iot/sistema/estado`.
- **Nota**: la temperatura está fija en 25.0°C a la espera de un sensor real; el riego comparte el pin de bomba (pendiente de hardware dedicado).

---

## 7. Despliegue y CI/CD

| Componente | Plataforma | Configuración |
|---|---|---|
| API FastAPI | **Render** (`web-monitoreo-iot.onrender.com`) | `Procfile`: `uvicorn app.main:app --app-dir iot-api` |
| Dashboard | **Vercel** (`iotmonitoreito.vercel.app`) y/o **Railway** | Build de Vite → estático; `nixpacks.toml` usa `serve` |
| PostgreSQL | Servicio gestionado (URL en `DATABASE_URL`) | Backups en `*.dump` en la raíz |
| Broker MQTT | **HiveMQ Cloud** | TLS 8883, topics `tesis-iot/#` |

**GitHub Actions** (2 workflows):

- `.github/workflows/deploy.yml` (raíz): corre pytest con Python 3.13 y `DATABASE_URL` como secret; si pasan, Railway despliega el dashboard.
- `iot-api/.github/workflows/deploy.yml`: igual para la API, con `paths: ['iot-api/**']` para solo correr cuando cambia el backend; si pasan, Render despliega.

**Tests**: `pytest` + `httpx` (`iot-api/tests/test_api.py` y `tests/test_api.py`): health check, GET de lecturas y POST de una lectura de transformador.

---

## 8. Variables de entorno

Definidas en `.env` / secrets de la plataforma (ver `.env.example`):

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión PostgreSQL (`postgresql://usuario:pass@host:puerto/db`) |
| `MQTT_HOST` | Host del broker MQTT (HiveMQ Cloud) |
| `MQTT_PORT` | Puerto MQTT (8883 TLS) |
| `MQTT_USER` / `MQTT_PASSWORD` | Credenciales del broker |

---

## 9. Estructura del repositorio

```
├── ARCHITECTURE.md        # Este documento
├── iot-api/               # Backend FastAPI (Render)
│   ├── app/
│   │   ├── main.py        # Startup, CORS, router
│   │   ├── routes.py      # Endpoints REST + SSE
│   │   ├── models.py      # Modelos SQLAlchemy
│   │   ├── database.py    # Conexión PostgreSQL
│   │   ├── sse_manager.py # Colas SSE + notificación thread-safe
│   │   ├── mqtt_client.py # Publicador MQTT (comandos)
│   │   └── mqtt_listener.py # Suscriptor MQTT (estado sistema)
│   ├── tests/             # pytest + httpx
│   └── Procfile           # Comando de arranque en Render
├── dashboard/             # Frontend React + Vite (Vercel/Railway)
│   ├── src/App.jsx        # Dashboard completo
│   └── nixpacks.toml      # Servir build con `serve`
├── tests/                 # Tests adicionales
├── .github/workflows/     # CI/CD
├── Procfile               # Deploy de la API
└── requirements.txt       # Dependencias Python
```

---

## 10. Estado actual y pendientes

- ✅ API + BD en producción con endpoints funcionando.
- ✅ Dashboard con tiempo real (SSE), control remoto y gráficas históricas.
- ✅ CI/CD con tests automáticos en cada push.
- ✅ Control instantáneo por MQTT.
- 🚧 Pendiente: sensor de temperatura real, hardware de riego dedicado (el pin de electroválvula reusa el de bomba), simulador Python del ESP32 mencionado en el README.
