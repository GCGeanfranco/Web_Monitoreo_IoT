# Estado del Proyecto — Sistema Inteligente de Regulación de Tensión (Fundo Lopez)

*Última revisión: 27-08-2026*

## 1. Firmware ESP32 (`AutotransESP32_wifi_mqtt_v6_limpioyconpromediodevoltajes.ino`)

### Control y sensado
- Control de las 10 posiciones del autotransformador RECORD R.I.5641-2 vía relés SSR-60DA (`PIN_RELAY[1..10]`).
- Sensado de voltaje con **dos** sensores ZMPT101B (librería `ZMPT101B.h`):
  - Entrada: GPIO34, sensibilidad `500.0f`.
  - Salida: GPIO35, sensibilidad `500.0f`.
- Filtro SMA (promedio móvil simple) de **10 muestras**, con buffer y suma independientes para entrada (`filtrarVoltajeEntrada`) y salida (`filtrarVoltajeSalida`).
- `leerVoltajeSalidaAislado(n_muestras=8, intervalo_ms=15)`: lectura aislada usada **solo** durante el escaneo de taps, para no contaminar el buffer SMA global con muestras de taps distintos.

### Tabla de taps aprendida
- Estructura `FilaTabla { v_entrada, tap_optimo, v_salida_medida, diferencia }`, hasta 50 filas (`MAX_FILAS_TABLA`).
- Persistencia en NVS (`Preferences`): `guardarTablaEnNVS()`, `cargarTablaDesdeNVS()`, `borrarTablaEnNVS()` — sobrevive reinicios.
- `calcularTapDesdeTabla()` busca la fila con `v_entrada` más cercana (tolerancia ≤ 8V); si no hay coincidencia o la tabla está vacía, cae al fallback de `TAP_CONFIG` (tabla fija de umbrales por tap).
- `calcularTap()` aplica histéresis tanto sobre la tabla aprendida como sobre el fallback.

### Escaneo de taps (`ejecutarEscaneo()`)
- Recorre los 10 taps: abre todos los relés → espera 50ms → cierra el tap actual → espera 600ms de estabilización → mide con `leerVoltajeSalidaAislado()`.
- Elige el tap con salida más cercana a 220V (`V_OBJETIVO`) y lo deja activo al finalizar.
- Guarda el resultado como nueva fila en la tabla aprendida (NVS).
- Reporta por Serial y LCD el tap elegido, voltaje de salida y diferencia respecto a 220V.

### Comandos (Serial y MQTT)
- `S` / `scan` → ejecuta escaneo.
- `T` / `tabla` → imprime tabla aprendida por Serial.
- `X` / `reset` → borra tabla NVS (vuelve a fallback de umbrales).
- Vía MQTT, mismo set de comandos en el tópico `tesis-iot/autotransformador/control`.

### Conectividad
- WiFi con credenciales hardcodeadas (`WIFI_SSID`, `WIFI_PASSWORD`) — WiFiManager aún no integrado.
- MQTT (HiveMQ Cloud, TLS 8883) con **Last Will and Testament ya implementado**: al conectar se registra `willTopic="tesis-iot/sistema/estado"`, `willMessage="offline"`, y al conectar exitosamente se publica `"online"` con retain. *(Esto ya está en el código v6 — a verificar si esta versión ya fue reflasheada al ESP32 físico.)*
- Suscripciones: `tesis-iot/bomba/control`, `tesis-iot/electrovalvula/control`, `tesis-iot/autotransformador/control`.
- `enviarDatosAPI()` hace POST a `API_URL_TRANSFORMADOR` con `voltaje_entrada`, `voltaje_salida` (sensor real), `tap_activo`, `temperatura` (fija en 25.0, no leída de sensor real), `estado_bomba`, `alarma`. Envío condicionado a cambios significativos o `forzar=true` (heartbeat cada `INTERVALO_API`=30s).
- `leerComandosControl()` hace GET a `API_URL_CONTROL` para sincronizar estado de bomba desde el backend (función presente en el código pero no se ve invocada en `loop()` — revisar si quedó sin llamar).

### Seguridad / lógica de alarma
- `verificarAlarma()`: si voltaje < `V_CRITICO` (130V) → abre todos los relés, apaga bomba, activa alarma. Se desactiva alarma si sube 15V por encima del crítico (reencendido automático de bomba queda comentado).

### `TAP_CONFIG` — ACTUALIZADO 27-08-2026 (sesgado a subvoltaje)

**Contexto:** durante la visita de campo del 11-08-2026 se detectó que la salida llegaba a 235V (objetivo: 215–225V). El análisis del histórico completo de ese día (1036 lecturas reales) reveló que:

1. **Cada tap tiene una razón de transformación (`voltaje_salida/voltaje_entrada`) consistente**, con desviación estándar de solo 2–9% — el hardware se comporta de forma predecible, no hay descalibración caótica del sensor.
2. **Existen "huecos" reales en la escalera de taps**: para ciertos rangos de voltaje de entrada, ningún tap deja la salida limpiamente dentro de 215–225V (el mayor hueco está entre tap5 y tap6, ~10V de entrada sin cobertura limpia).
3. El `TAP_CONFIG` original (umbrales estimados, no medidos) no reflejaba estas razones reales.

**Razones de transformación medidas** (`voltaje_salida/voltaje_entrada`, 1036 lecturas de campo, 11-08-2026):

| Tap | Razón medida |
|---|---|
| 1 | 0.900 |
| 2 | 0.917 |
| 3 | 0.986 |
| 4 | 1.002 |
| 5 | 1.072 |
| 6 | 1.180 |
| 7 | 1.238 |
| 8 | 1.297 |
| 9 | 1.432 |
| 10 | **sin datos** (nunca se activó en el día medido) |

**Decisión de diseño:** ante un hueco donde ningún tap da una salida limpia en 215–225V, se decidió **sesgar la selección hacia el subvoltaje** (preferir quedarse un poco por debajo de 215V) en vez de repartir el error de forma equilibrada entre sub y sobrevoltaje, dado el riesgo observado de sobretensión en campo (ver sección de hallazgos de campo más abajo). Se usó un piso de seguridad `V_PISO_SESGO = 205.0V` — el tap de menor razón se sigue usando mientras su salida no baje de 205V; solo se cambia al siguiente tap cuando es estrictamente necesario. Este piso se eligió por debajo del peor caso del esquema balanceado (~209.1V) para garantizar que el sesgo *siempre* retrase el cambio de tap (nunca lo adelante), evitando así el efecto contraproducente que se dio al probar con un piso de 210V (en dos fronteras eso forzaba un cambio *más temprano*, empeorando el sobrevoltaje).

**Resultado — pico de sobrevoltaje al cambiar de tap, antes vs. después:**

| Frontera | Umbral balanceado | Umbral sesgado (vigente) | Salida al cambiar: antes → ahora |
|---|---|---|---|
| tap1→tap2 | 242.1V | 227.7V | 222.0V → 208.8V |
| tap2→tap3 | 231.2V | 223.5V | 227.9V → 220.4V |
| tap3→tap4 | 221.4V | 207.9V | 221.7V → 208.3V |
| tap4→tap5 | 212.2V | 204.7V | 227.4V → 219.3V |
| tap5→tap6 | 195.4V | 191.3V | 230.6V → **225.7V** |
| tap6→tap7 | 182.0V | 173.8V | 225.3V → 215.1V |
| tap7→tap8 | 173.6V | 165.7V | 225.2V → 214.9V |
| tap8→tap9 | 161.2V | 158.0V | 230.9V → **226.3V** |

**Código vigente:**

```cpp
// ============================================================
//  TABLA DE UMBRALES (fallback si no hay tabla aprendida)
//  Actualizada 27-08-2026 — SESGADA A SUBVOLTAJE.
//  Politica: usar el tap de menor razon (menos boost) mientras
//  su salida no caiga por debajo de V_PISO_SESGO; solo se
//  cambia al siguiente tap cuando es estrictamente necesario.
//  Esto prioriza quedarse corto de 220V antes que pasarse de
//  225V, dado el riesgo de sobretension observado en campo.
//
//  V_PISO_SESGO = 205.0V (elegido por debajo del peor caso de
//  la version balanceada ~209.1V, para garantizar que el sesgo
//  SIEMPRE retrase el cambio de tap, nunca lo adelante).
//
//  Razones de transformacion medidas (voltaje_salida/voltaje_entrada,
//  1036 lecturas de campo, 11-08-2026):
//    tap1=0.900  tap2=0.917  tap3=0.986  tap4=1.002  tap5=1.072
//    tap6=1.180  tap7=1.238  tap8=1.297  tap9=1.432
//
//  ADVERTENCIA: tap4 queda con rango angosto (204.7-207.9V,
//  3.2V) por su razon casi identica a la de tap3 — validar en
//  banco que no oscile con la histeresis actual (V_HISTERESIS=3V).
//
//  TAP 10: sin datos de campo (nunca se activo en el dia medido).
//  Deshabilitado hasta calibrarlo con datos reales.
// ============================================================
const TapConfig TAP_CONFIG[11] = {
  {  0.0f,   0.0f },
  {227.7f, 999.0f },  // TAP 1
  {223.5f, 227.7f },  // TAP 2
  {207.9f, 223.5f },  // TAP 3
  {204.7f, 207.9f },  // TAP 4  <- rango angosto, validar
  {191.3f, 204.7f },  // TAP 5
  {173.8f, 191.3f },  // TAP 6
  {165.7f, 173.8f },  // TAP 7
  {158.0f, 165.7f },  // TAP 8
  {130.0f, 158.0f },  // TAP 9
  {  0.0f,   0.0f }   // TAP 10 - deshabilitado
};
```

**Pendiente:** validar en banco antes de campo, particularmente el comportamiento del tap4 (rango angosto de solo 3.2V, similar a la histéresis actual — riesgo de oscilación). Si se observa parpadeo entre tap3/tap4, ampliar histéresis solo para esa transición o fusionar el tramo.

### Pendientes detectados en el firmware (arrastrados de revisión anterior)
- **`reiniciarFiltroSalida()`** (flush del buffer SMA de salida tras un cambio de tap en operación normal, fuera del escaneo) — aún no implementado; `conmutarTap()` no resetea `buffer_salida`. **[Prioridad: alta]**

  **Detalle del problema:** `buffer_salida` (SMA de 10 muestras) se llena de forma continua en cada vuelta de `loop()` vía `leerVoltajeSalida()`. Cuando `gestionarTaps()` dispara `conmutarTap()` y el relé cambia físicamente de tap, el buffer no se entera — sigue conteniendo una mezcla de muestras tomadas con el tap anterior y muestras tomadas con el tap nuevo. Como resultado, `g_voltaje_salida` queda contaminado durante ~10 ciclos de loop (~1 segundo), hasta que el buffer se renueva por completo.

  **Solución propuesta:** una función `reiniciarFiltroSalida()` que, al ejecutarse `conmutarTap()`, resetee a cero `buffer_salida`, `idx_salida`, `muestras_llenadas_salida` y `suma_salida`.

- **Sobretensión transitoria tras apagar la bomba, más severa de lo estimado inicialmente** (ver hallazgo de campo #2 abajo) — bloqueada por la regla de mínimo 20 ciclos de histéresis antes de permitir conmutación. **[Prioridad: alta — nuevo hallazgo 27-08]**
- Temperatura reportada a la API es un valor fijo (25.0°C), no proviene de un sensor real.
- `leerComandosControl()` definida pero no se observa que sea llamada desde `loop()`.
- Confirmar si el LWT ya implementado en este código fue efectivamente reflasheado al ESP32 en campo.
- Limpieza de filas corruptas en NVS (si persisten) antes de confiar en escaneos nuevos.

---

## 2. Hallazgos de la visita de campo (11-08-2026)

Durante la prueba en el fundo se detectaron tres problemas, investigados a fondo con datos reales de Neon (query agregada por tap/fase y archivo Excel del día completo, 1036 lecturas):

### 2.1 Voltaje de salida llegando a 235V (objetivo 215–225V)

**Causa raíz identificada:** combinación de (a) huecos reales en la escalera de taps del autotransformador (ver sección de `TAP_CONFIG` arriba) y (b) el evento de sobretensión transitoria del punto 2.2, que probablemente coincidió con la lectura de campo. **Resuelto** con el nuevo `TAP_CONFIG` sesgado a subvoltaje — pendiente de validación en banco y campo.

### 2.2 Pico de voltaje ~20s después de apagar la bomba

**Confirmado con datos reales y es más severo de lo estimado inicialmente.** Al clasificar las lecturas por fase (`bomba_on`, `transitorio_0_30s`, `bomba_off_estable`) usando una query con `LAG()` sobre `estado_bomba`, se encontraron picos de hasta **278.9V (tap6)**, **279.35V (tap9)** y **277.47V (tap7)** durante la ventana de 0–30s tras apagar la bomba — picos sistemáticos y correlacionados con el evento, no ruido aleatorio.

**Hipótesis física:** al apagar la bomba desaparece la caída de tensión por carga en la línea, y el autotransformador queda momentáneamente en el tap que era correcto *con carga*, ahora sobrando *sin carga*. El sistema detecta la sobretensión de inmediato pero la regla de histéresis (mínimo 20 ciclos, ≈20s con `CICLO_MS`=100ms si el conteo corre a ese ritmo) le impide conmutar hasta cumplir esa ventana de estabilidad.

**Pendiente de implementar:** una regla de excepción que permita conmutación inmediata (saltándose el conteo de 20 ciclos) cuando el voltaje supera un umbral de sobretensión crítica (ej. >235-240V), manteniendo los 20 ciclos solo para ajustes finos cerca del objetivo. Alternativa: detectar el evento de "apagado de bomba" como disparador explícito de recálculo inmediato.

### 2.3 Aparente descalibración de los sensores ZMPT101B

**Parcialmente descartado como causa principal.** El análisis de razón `voltaje_salida/voltaje_entrada` por tap mostró consistencia alta (desviación estándar 2–9%), lo que indica que el hardware/sensor se comporta de forma predecible — la variabilidad observada en campo se explica en gran parte por variación real del voltaje de entrada de la red (típico en zonas rurales agrícolas) y por el transitorio del punto 2.2, no por descalibración caótica del sensor.

**Aun así, pendiente de revisión preventiva:**
- Fijar mecánicamente el trimmer de calibración (si aplica) tras la calibración final.
- Verificar filtrado de alimentación del sensor (RC de 10Ω/100µF y cerámicos de 100nF en pines ADC — confirmar si ya están instalados físicamente).
- Recalibrar periódicamente en vez de asumir que `sensitivity=500.0f` es válida indefinidamente.

---

## 3. Contaminación de datos por bug de CI/CD — IDENTIFICADA Y ACOTADA (27-08-2026)

Se confirmó en Neon la presencia de filas de prueba escritas directamente en producción por el pipeline de GitHub Actions (bug ya documentado como corregido, pero las filas viejas seguían en la base). **Huella de identificación:** `temperatura != 25.0` — el firmware real siempre envía temperatura fija en 25.0°C (no hay sensor real), así que cualquier valor distinto es, por definición, una fila de prueba.

**Hallazgos:**
- 26 filas contaminadas, `id` 1 a 26, con timestamps entre **2026-06-05 23:21:53** y **2026-06-06 22:40:33**.
- Patrón reconocible de fixture de pytest: bloques de 6 filas con timestamp idéntico (imposible en un dispositivo real), repetidos 4 veces (4 ejecuciones del pipeline en esa ventana).
- **Verificado que no se cruzan con ningún análisis realizado hasta ahora** (visita de campo 11-08, dataset de transitorios, cálculo de `TAP_CONFIG`) — todos esos análisis están limpios.

**Acción pendiente:** ejecutar en Neon:
```sql
DELETE FROM lecturas_transformador WHERE id BETWEEN 1 AND 26;
```

---

## 4. Backend / Frontend

- **Backend:** FastAPI en Render (`https://web-monitoreo-iot.onrender.com`), directorio raíz `iot-api/`, arranque `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- **Base de datos:** PostgreSQL en Neon (migrada desde Railway). Timezone configurado a `America/Lima`; pendiente revisar el manejo del offset UTC en el timestamp generado por el ESP32.
- **Frontend:** Dashboard React/Vite + Recharts en Vercel (`https://iotmonitoreito.vercel.app`).
- **MQTT:** HiveMQ Cloud (TLS, puerto 8883). Tópicos: `tesis-iot/bomba/control`, `tesis-iot/electrovalvula/control` (fuera de alcance funcional pero el tópico y su manejo aún existen en el firmware), `tesis-iot/autotransformador/control` (comandos de escaneo/tabla/reset).
- **Tiempo real:** SSE (`sse_manager.py`) reemplaza polling; `mqtt_listener.py` corre en background thread y gestiona el estado online/offline vía LWT.
- **Resiliencia frontend:** patrón `Promise.allSettled` para que la falla de un endpoint no rompa el ciclo de fetch del dashboard.
- **CI/CD:** GitHub Actions. El bug de escritura de tests a producción ya está corregido (tests aislados a SQLite); quedaban filas viejas contaminando Neon, identificadas y acotadas en sección 3. Pendiente actualizar el secret `DATABASE_URL` para que apunte a Neon.
- **Cold start:** Render free tier (30–50s tras 15 min de inactividad); compensado con `http.setTimeout(20000)` en el ESP32.

---

## 5. Alcance de la tesis

**Título:** *"Diseño e implementación de un sistema inteligente de regulación de tensión basado en predicción y detección de anomalías mediante inteligencia artificial en el fundo Lopez"* — Chongoyape, Lambayeque. Periodo abril–octubre 2026. Co-autor: David Lopez Rojas.

- **Foco actual:** 100% en el sistema de regulación de tensión mediante el autotransformador de 10 taps. La gestión de riego/electroválvulas fue **retirada del alcance** (puede reevaluarse más adelante).
- **Componente de IA — siguiente fase de desarrollo, aún sin implementar:**
  1. Modelo de regresión predictivo para selección óptima de tap (a partir de la tabla de taps aprendida / histórico de voltajes).
  2. Detección de anomalías sobre la serie de tiempo del voltaje de entrada.
- **Trabajo de tesis en curso:** sección de Información General y Resumen/Abstract redactados con datos reales medidos; seis objetivos específicos corregidos (la versión previa mencionaba erróneamente un VFD, descartado por no ser necesario).

---

## 6. Próximos pasos priorizados (según revisión 27-08-2026)

1. **Validar en banco el nuevo `TAP_CONFIG` sesgado a subvoltaje**, con atención especial al rango angosto del tap4 (riesgo de oscilación con la histéresis actual).
2. **Implementar regla de conmutación inmediata ante sobretensión crítica** (saltándose el mínimo de 20 ciclos) — hallazgo de mayor severidad de esta revisión, picos de hasta 279V confirmados en campo.
3. **Implementar `reiniciarFiltroSalida()`** — evita contaminar el histórico de voltaje de salida tras cada conmutación de tap.
4. **Ejecutar el `DELETE` de las 26 filas de prueba de CI en Neon** (`id` 1–26).
5. Confirmar en campo si el firmware con LWT ya fue reflasheado al ESP32 físico.
6. Revisar y limpiar filas corruptas en NVS antes de confiar en nuevos escaneos.
7. Actualizar secret `DATABASE_URL` en GitHub Actions (Neon).
8. Capturar datos de campo para el tap 10 (nunca se ha activado, sin razón de transformación medida).
9. Decidir si conectar sensor de temperatura real o mantener valor fijo por ahora.
10. Avanzar con el diseño del modelo de regresión + detección de anomalías (siguiente fase de tesis).
