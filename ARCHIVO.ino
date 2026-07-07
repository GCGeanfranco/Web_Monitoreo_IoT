/**
 * ============================================================
 *  AUTOTRANSFORMADOR RECORD R.I.5641-2 - ESP32
 *  Control automático 10 taps + LCD + ZMPT101B + IoT API
 * ============================================================
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

// ============================================================
//  WIFI + API
// ============================================================
const char *WIFI_SSID = "Redmi Note GC";
const char *WIFI_PASSWORD = "123456779";
const char *API_URL_TRANSFORMADOR = "https://web-monitoreo-iot.onrender.com/api/lecturas/transformador";
const char *API_URL_CONTROL = "https://web-monitoreo-iot.onrender.com/api/control/estado";

#define INTERVALO_API 30000 // 30 segundos
unsigned long g_ultimo_api = 0;
bool wifi_conectado = false;

// ============================================================
//  MQTT
// ============================================================
const char *MQTT_HOST = "24fbe3439acd4f0190d2c360c78447ce.s1.eu.hivemq.cloud";
const int MQTT_PORT = 8883;
const char *MQTT_USER = "HiveMQ_IoT";
const char *MQTT_PASSWORD = "M.TM4BTJdQe5TpA";
const char *MQTT_CLIENT_ID = "ESP32_Autotransformador";

WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

// ============================================================
//  SECCION 1: MAPA DE PINES ESP32
// ============================================================
#define PIN_ZMPT 34
#define ADC_VREF 3.3f
#define ADC_MAX 4095
#define ZMPT_SENSITIVITY 0.437f

const int PIN_RELAY[11] = {
    -1, // TAP 0  → reservado
    2,  // TAP 1  → K1
    4,  // TAP 2  → K2
    5,  // TAP 3  → K3
    18, // TAP 4  → K4
    19, // TAP 5  → K5
    13, // TAP 6  → K6
    15, // TAP 7  → K7
    23, // TAP 8  → K8
    25, // TAP 9  → K9
    26  // TAP 10 → K10
};

#define NUM_TAPS 10
#define NUM_MUESTRAS 150
#define PIN_BOMBA 14
#define PIN_ALARMA 27
#define RELAY_ON HIGH
#define RELAY_OFF LOW

// ============================================================
//  SECCION 2: PARAMETROS DEL ALGORITMO
// ============================================================
#define V_CRITICO 130.0f
#define V_HISTERESIS 3.0f
#define CICLOS_HISTERESIS 20
#define CICLO_MS 100
#define LCD_INTERVALO 1000

// ============================================================
//  SECCION 3: TABLA DE UMBRALES
// ============================================================
struct TapConfig
{
  float umbral_bajo;
  float umbral_alto;
  float v_salida_nom;
};

const TapConfig TAP_CONFIG[11] = {
    {0.0f, 0.0f, 0.0f},
    {240.0f, 999.0f, 220.0f},
    {229.0f, 240.0f, 220.0f},
    {219.0f, 229.0f, 220.0f},
    {209.0f, 219.0f, 220.0f},
    {200.0f, 209.0f, 220.0f},
    {189.0f, 200.0f, 220.0f},
    {179.0f, 189.0f, 220.0f},
    {171.0f, 179.0f, 220.0f},
    {162.0f, 171.0f, 220.0f},
    {130.0f, 162.0f, 220.0f}};

// ============================================================
//  SECCION 4: VARIABLES GLOBALES
// ============================================================
int g_tap_actual = 0;
int g_ciclos_espera = 0;
float g_voltaje = 220.0f;
bool g_bomba_on = false;
bool g_alarma = false;

unsigned long g_ultimo_ciclo = 0;
unsigned long g_ultimo_print = 0;
unsigned long g_ultimo_lcd = 0;

// ============================================================
//  MODULO WiFi
// ============================================================
void conectarWiFi()
{
  Serial.printf("[WiFi] Conectando a %s", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 20)
  {
    delay(500);
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    wifi_conectado = true;
    Serial.println("\n[WiFi] Conectado!");
    Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi OK!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP().toString());
    delay(2000);
  }
  else
  {
    wifi_conectado = false;
    Serial.println("\n[WiFi] Sin conexion. Modo offline.");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi: FALLO");
    lcd.setCursor(0, 1);
    lcd.print("Modo offline");
    delay(2000);
  }
}

// ============================================================
//  MODULO API - Enviar datos
// ============================================================
void enviarDatosAPI()
{
  if (!wifi_conectado || WiFi.status() != WL_CONNECTED)
  {
    Serial.println("[API] Sin WiFi, omitiendo envio.");
    return;
  }

  // Calcular voltaje salida estimado
  float v_salida = (g_tap_actual >= 1) ? TAP_CONFIG[g_tap_actual].v_salida_nom : 0;

  // Construir JSON
  StaticJsonDocument<256> doc;
  doc["voltaje_entrada"] = round(g_voltaje * 10) / 10.0;
  doc["voltaje_salida"] = v_salida;
  doc["tap_activo"] = g_tap_actual;
  doc["temperatura"] = 25.0; // reemplazar con sensor real si tienes
  doc["estado_bomba"] = g_bomba_on;
  doc["alarma"] = g_alarma;

  String jsonStr;
  serializeJson(doc, jsonStr);

  HTTPClient http;
  http.begin(API_URL_TRANSFORMADOR);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(20000); // Render free puede tardar en "despertar" tras inactividad

  int httpCode = http.POST(jsonStr);

  if (httpCode == 200)
  {
    Serial.printf("[API] Datos enviados OK | V=%.1fV | K%d | Bomba=%s\n",
                  g_voltaje, g_tap_actual, g_bomba_on ? "ON" : "OFF");
  }
  else
  {
    Serial.printf("[API] Error HTTP: %d\n", httpCode);
  }

  http.end();
}

// ============================================================
//  MODULO API - Leer comandos de control
// ============================================================
void leerComandosControl()
{
  if (!wifi_conectado || WiFi.status() != WL_CONNECTED)
    return;

  HTTPClient http;
  http.begin(API_URL_CONTROL);
  http.setTimeout(20000); // Render free puede tardar en "despertar" tras inactividad

  int httpCode = http.GET();

  if (httpCode == 200)
  {
    String payload = http.getString();
    StaticJsonDocument<128> doc;
    deserializeJson(doc, payload);

    bool bomba_cmd = doc["bomba"] | false;

    if (bomba_cmd && !g_bomba_on)
    {
      encenderBomba();
      Serial.println("[API] Comando: ENCENDER bomba");
    }
    else if (!bomba_cmd && g_bomba_on)
    {
      apagarBomba();
      Serial.println("[API] Comando: APAGAR bomba");
    }
  }

  http.end();
}

// ============================================================
//  MODULO LCD
// ============================================================
void lcdBienvenida()
{
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("AutoTrans ESP32");
  lcd.setCursor(0, 1);
  lcd.print("10 Taps reales");
  delay(2000);
  lcd.clear();
}

void actualizarLCD()
{
  lcd.setCursor(0, 0);
  lcd.print("V:");
  char v_str[8];
  dtostrf(g_voltaje, 5, 1, v_str);
  lcd.print(v_str);
  lcd.print("V");
  lcd.setCursor(9, 0);
  lcd.print("TAP:K");
  lcd.print(g_tap_actual);
  if (g_tap_actual < 10)
    lcd.print(" ");

  lcd.setCursor(0, 1);
  if (g_alarma)
  {
    lcd.print("!!ALARMA V<130V ");
  }
  else
  {
    lcd.print("BOM:");
    lcd.print(g_bomba_on ? "ON " : "OFF");
    lcd.print(wifi_conectado ? " W:OK" : " W:--");
  }
}

void lcdMostrarCambioTap(int tap_anterior, int tap_nuevo)
{
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("** TAP CAMBIO **");
  lcd.setCursor(0, 1);
  lcd.print("K");
  lcd.print(tap_anterior);
  lcd.print(" -> K");
  lcd.print(tap_nuevo);
  lcd.print(" ~220V");
  delay(1500);
  lcd.clear();
}

// ============================================================
//  MODULO 1: LECTURA ZMPT101B
// ============================================================
float leerVoltajeRMS()
{
  long suma = 0;
  int lect[NUM_MUESTRAS];

  for (int i = 0; i < NUM_MUESTRAS; i++)
  {
    lect[i] = analogRead(PIN_ZMPT);
    suma += lect[i];
    delayMicroseconds(400);
  }
  int offset_counts = (int)(suma / NUM_MUESTRAS);

  float sc = 0.0f;
  for (int i = 0; i < NUM_MUESTRAS; i++)
  {
    float c = (float)(lect[i] - offset_counts);
    sc += c * c;
  }
  float rms_counts = sqrt(sc / NUM_MUESTRAS);
  float voltaje = rms_counts * ZMPT_SENSITIVITY;

  if (voltaje < 0.0f)
    voltaje = 0.0f;
  if (voltaje > 280.0f)
    voltaje = 280.0f;
  return voltaje;
}

float leerVoltajeEstable()
{
  float suma = 0;
  for (int i = 0; i < 3; i++)
    suma += leerVoltajeRMS();
  return suma / 3.0f;
}

// ============================================================
//  MODULO 2: LOGICA DE TAPS
// ============================================================
int calcularTap(float voltaje, int tap_prev)
{
  if (voltaje < V_CRITICO)
    return -1;

  for (int t = NUM_TAPS; t >= 1; t--)
  {
    float ub = TAP_CONFIG[t].umbral_bajo;
    float ua = TAP_CONFIG[t].umbral_alto;
    if (t == tap_prev)
    {
      ub -= V_HISTERESIS;
      ua += V_HISTERESIS;
    }
    if (voltaje >= ub && voltaje < ua)
      return t;
  }
  return 1;
}

void abrirTodosReles()
{
  for (int t = 1; t <= NUM_TAPS; t++)
    if (PIN_RELAY[t] >= 0)
      digitalWrite(PIN_RELAY[t], RELAY_OFF);
}

void conmutarTap(int tap_nuevo)
{
  int tap_anterior = g_tap_actual;
  abrirTodosReles();
  delay(100);

  if (tap_nuevo >= 1 && tap_nuevo <= NUM_TAPS && PIN_RELAY[tap_nuevo] >= 0)
  {
    digitalWrite(PIN_RELAY[tap_nuevo], RELAY_ON);
  }

  g_tap_actual = tap_nuevo;
  lcdMostrarCambioTap(tap_anterior, tap_nuevo);
}

void gestionarTaps(float voltaje)
{
  int tap_req = calcularTap(voltaje, g_tap_actual);
  if (tap_req == -1)
    return;

  if (tap_req != g_tap_actual)
  {
    g_ciclos_espera++;
    if (g_ciclos_espera >= CICLOS_HISTERESIS)
    {
      conmutarTap(tap_req);
      g_ciclos_espera = 0;
    }
  }
  else
  {
    g_ciclos_espera = 0;
  }
}

// ============================================================
//  MODULO 3: BOMBA Y ALARMA
// ============================================================
void encenderBomba()
{
  if (!g_bomba_on)
  {
    digitalWrite(PIN_BOMBA, RELAY_ON);
    g_bomba_on = true;
    Serial.println("[BOMBA] Encendida.");
  }
}

void apagarBomba()
{
  if (g_bomba_on)
  {
    digitalWrite(PIN_BOMBA, RELAY_OFF);
    g_bomba_on = false;
    Serial.println("[BOMBA] APAGADA.");
  }
}

void activarAlarma()
{
  if (!g_alarma)
  {
    digitalWrite(PIN_ALARMA, HIGH);
    g_alarma = true;
    Serial.println("[ALARMA] ACTIVADA!");
  }
}

void desactivarAlarma()
{
  if (g_alarma)
  {
    digitalWrite(PIN_ALARMA, LOW);
    g_alarma = false;
    Serial.println("[ALARMA] Desactivada.");
  }
}

bool verificarAlarma(float voltaje)
{
  if (voltaje < V_CRITICO)
  {
    abrirTodosReles();
    apagarBomba();
    activarAlarma();
    return true;
  }
  if (voltaje > (V_CRITICO + 15.0f) && g_alarma)
  {
    desactivarAlarma();
    encenderBomba();
  }
  return false;
}

// ============================================================
//  MQTT
// ============================================================

void mqttCallback(char *topic, byte *payload, unsigned int length)
{
  String mensaje = "";
  for (int i = 0; i < length; i++)
  {
    mensaje += (char)payload[i];
  }

  Serial.printf("[MQTT] Topic: %s | Mensaje: %s\n", topic, mensaje.c_str());

  if (String(topic) == "tesis-iot/bomba/control")
  {
    if (mensaje == "1")
    {
      encenderBomba();
      Serial.println("[MQTT] Comando: ENCENDER bomba");
    }
    else
    {
      apagarBomba();
      Serial.println("[MQTT] Comando: APAGAR bomba");
    }
  }

  if (String(topic) == "tesis-iot/electrovalvula/control")
  {
    if (mensaje == "1")
    {
      digitalWrite(PIN_BOMBA, RELAY_ON);
      Serial.println("[MQTT] Comando: ABRIR electrovalvula");
    }
    else
    {
      digitalWrite(PIN_BOMBA, RELAY_OFF);
      Serial.println("[MQTT] Comando: CERRAR electrovalvula");
    }
  }
}

void conectarMQTT()
{
  espClient.setInsecure();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(256);
  mqttClient.setKeepAlive(15);

  String clientId = "ESP32_Autotrans_" + WiFi.macAddress();

  int intentos = 0;
  while (!mqttClient.connected() && intentos < 5)
  {
    Serial.print("[MQTT] Conectando...");
    if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD))
    {
      Serial.println(" Conectado!");
      mqttClient.subscribe("tesis-iot/bomba/control");
      mqttClient.subscribe("tesis-iot/electrovalvula/control");
    }
    else
    {
      Serial.printf(" Fallo, rc=%d. Reintentando...\n", mqttClient.state());
      delay(2000);
      intentos++;
    }
  }
}

// ============================================================
//  SETUP
// ============================================================
void setup()
{
  Serial.begin(115200);
  delay(300);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Wire.begin();
  delay(100);
  lcd.init();
  lcd.begin(16, 2);
  lcd.backlight();
  lcdBienvenida();

  // Configurar pines relés
  for (int t = 1; t <= NUM_TAPS; t++)
  {
    if (PIN_RELAY[t] >= 0)
    {
      pinMode(PIN_RELAY[t], OUTPUT);
      digitalWrite(PIN_RELAY[t], RELAY_OFF);
    }
  }
  abrirTodosReles();

  pinMode(PIN_BOMBA, OUTPUT);
  pinMode(PIN_ALARMA, OUTPUT);
  digitalWrite(PIN_BOMBA, RELAY_OFF);
  digitalWrite(PIN_ALARMA, LOW);

  // Conectar WiFi
  conectarWiFi();

  // Conectar MQTT
  if (wifi_conectado)
  {
    conectarMQTT();
  }

  float v_inicial = leerVoltajeEstable();
  Serial.printf("[SETUP] Voltaje inicial: %.1fV\n", v_inicial);

  if (v_inicial >= V_CRITICO)
  {
    encenderBomba();
    int tap_ini = calcularTap(v_inicial, 0);
    if (tap_ini >= 1)
      conmutarTap(tap_ini);
  }
  else
  {
    activarAlarma();
  }

  g_ultimo_ciclo = millis();
  g_ultimo_print = millis();
  g_ultimo_lcd = millis();
  g_ultimo_api = millis();

  Serial.println("[SETUP] Sistema listo con IoT API.\n");
}

// ============================================================
//  LOOP PRINCIPAL
// ============================================================
void loop()
{
  // Mantener conexión MQTT activa
  if (wifi_conectado && !mqttClient.connected())
  {
    conectarMQTT();
  }
  if (wifi_conectado)
  {
    mqttClient.loop();
  }

  unsigned long ahora = millis();

  g_voltaje = leerVoltajeEstable();

  if ((ahora - g_ultimo_ciclo) >= CICLO_MS)
  {
    g_ultimo_ciclo = ahora;
    bool hay_alarma = verificarAlarma(g_voltaje);
    if (!hay_alarma)
      gestionarTaps(g_voltaje);
  }

  if ((ahora - g_ultimo_print) >= CICLO_MS)
  {
    g_ultimo_print = ahora;
    Serial.printf("[LOOP] V=%.1fV | K%d | V_sal~%dV | Bomba=%s | Alarma=%s | WiFi=%s\n",
                  g_voltaje, g_tap_actual, g_tap_actual >= 1 ? (int)TAP_CONFIG[g_tap_actual].v_salida_nom : 0,
                  g_bomba_on ? "ON" : "OFF",
                  g_alarma ? "ON" : "OFF",
                  wifi_conectado ? "OK" : "--");
  }

  if ((ahora - g_ultimo_lcd) >= LCD_INTERVALO)
  {
    g_ultimo_lcd = ahora;
    actualizarLCD();
  }

  // Enviar datos a API cada 30 segundos
  if ((ahora - g_ultimo_api) >= INTERVALO_API)
  {
    g_ultimo_api = ahora;
    leerComandosControl();
    enviarDatosAPI();
  }
}