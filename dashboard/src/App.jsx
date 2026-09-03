import { useState, useEffect, useRef } from "react";
import "./App.css";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import axios from "axios";
import {
  pushSoportado,
  suscribirseAAlertas,
  desuscribirseDeAlertas,
  yaEstaSuscrito,
} from "./pushNotifications";

const API = "https://web-monitoreo-iot.onrender.com";

const formatearHora = (timestamp) => {
  if (!timestamp) return "";
  const fecha = new Date(timestamp + "-05:00");
  return fecha.toLocaleTimeString("es-PE", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Lima"
  });
};

const formatearTooltip = (timestamp) => {
  if (!timestamp) return "";
  const fecha = new Date(timestamp + "-05:00");
  return fecha.toLocaleDateString("es-PE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    second: "2-digit", timeZone: "America/Lima"
  });
};

function Gauge({ value, min, max, unit, label, icon, color }) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const arcFraction = 0.75;
  const arcLength = circumference * arcFraction;
  const pct = value == null ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const dash = arcLength * pct;

  return (
    <div className="gauge-card">
      <svg viewBox="0 0 100 100" className="gauge-svg">
        <circle cx="50" cy="50" r={r} className="gauge-track"
          strokeDasharray={`${arcLength} ${circumference}`}
          transform="rotate(135 50 50)" />
        <circle cx="50" cy="50" r={r} className="gauge-fill" style={{ stroke: color }}
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(135 50 50)" />
      </svg>
      <div className="gauge-center">
        <div className="gauge-value" style={{ color }}>
          {value ?? "—"}<span className="gauge-unit">{unit}</span>
        </div>
        <div className="gauge-label">{icon} {label}</div>
      </div>
    </div>
  );
}

function Led({ icon, label, active, color, text, pulse = false }) {
  return (
    <div className="led-card">
      <span
        className={`led${active && pulse ? " led-pulse" : ""}`}
        data-active={active}
        style={{ "--led-color": color }}
      />
      <div>
        <div className="led-label">{icon} {label}</div>
        <div className="led-value" style={{ color }}>{text}</div>
      </div>
    </div>
  );
}

function TapIndicator({ active = 0, total = 5, color }) {
  return (
    <div className="tap-indicator">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="tap-dot" data-on={i < active} style={{ "--dot-color": color }} />
      ))}
    </div>
  );
}

function Switch({ label, on, onToggle, color, disabled = false, pendiente = false, sinConfirmar = false }) {
  return (
    <div className="switch-card" style={{ "--sw-color": color }}>
      <div className="switch-label">{label}</div>
      <button
        className="switch-track"
        data-on={on}
        onClick={disabled ? undefined : onToggle}
        aria-pressed={on}
        disabled={disabled}
        style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        <span className="switch-thumb" />
        <span className="switch-text off">OFF</span>
        <span className="switch-text on">ON</span>
      </button>
      {pendiente && !sinConfirmar && (
        <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>
          ⏳ Esperando confirmación del equipo...
        </span>
      )}
      {sinConfirmar && (
        <span style={{ fontSize: "12px", color: "var(--alert)", fontWeight: 600 }}>
          ⚠️ No confirmado — el equipo no respondió, verifica el estado real antes de asumir el cambio.
        </span>
      )}
      {disabled && (
        <span style={{ fontSize: "12px", color: "var(--alert)" }}>
          ⚠️ Sistema desconectado
        </span>
      )}
    </div>
  );
}

export default function App() {
  const [transformador, setTransformador] = useState([]);
  const [riego, setRiego] = useState([]);
  const [ultima, setUltima] = useState(null);
  const [ultimoRiego, setUltimoRiego] = useState(null);
  const [controlBomba, setControlBomba] = useState(false);
  const [controlBomba2, setControlBomba2] = useState(false);
  const [controlValvula, setControlValvula] = useState(false);
  const [bombaPendiente, setBombaPendiente] = useState(false);
  const [bombaPendiente2, setBombaPendiente2] = useState(false);
  const [bombaSinConfirmar, setBombaSinConfirmar] = useState(false);
  const [bombaSinConfirmar2, setBombaSinConfirmar2] = useState(false);
  const [valvulaPendiente, setValvulaPendiente] = useState(false);
  const [sistemaOnline, setSistemaOnline] = useState(false);
  const [alertasActivas, setAlertasActivas] = useState(false);
  const [alertasCargando, setAlertasCargando] = useState(false);
  const [alertasError, setAlertasError] = useState(null);
  const [devMode, setDevMode] = useState(() => sessionStorage.getItem("devMode") === "1");
  const [escaneando, setEscaneando] = useState(false);
  const bombaTimeoutRef = useRef(null);
  const bombaTimeoutRef2 = useRef(null);
  const valvulaTimeoutRef = useRef(null);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef(null);

  // Refs para evitar "stale closures" dentro del callback de EventSource
  const bombaPendienteRef = useRef(false);
  const bombaPendienteRef2 = useRef(false);
  const valvulaPendienteRef = useRef(false);
  const controlBombaRef = useRef(false);
  const controlBombaRef2 = useRef(false);
  const controlValvulaRef = useRef(false);

  useEffect(() => { bombaPendienteRef.current = bombaPendiente; }, [bombaPendiente]);
  useEffect(() => { bombaPendienteRef2.current = bombaPendiente2; }, [bombaPendiente2]);
  useEffect(() => { valvulaPendienteRef.current = valvulaPendiente; }, [valvulaPendiente]);
  useEffect(() => { controlBombaRef.current = controlBomba; }, [controlBomba]);
  useEffect(() => { controlBombaRef2.current = controlBomba2; }, [controlBomba2]);
  useEffect(() => { controlValvulaRef.current = controlValvula; }, [controlValvula]);

  const fetchData = async () => {
    try {
      const [t, r, control, sistema] = await Promise.all([
        axios.get(`${API}/api/lecturas/transformador`),
        axios.get(`${API}/api/lecturas/riego`),
        axios.get(`${API}/api/control/estado`),
        axios.get(`${API}/api/sistema/estado`)
      ]);
      const tData = t.data.reverse();
      const rData = r.data.reverse();
      setTransformador(tData);
      setRiego(rData);
      setUltima(tData[tData.length - 1]);
      setUltimoRiego(rData[rData.length - 1]);

      const estadoBombaReal = control.data.bomba ?? false;
      if (!bombaPendienteRef.current || estadoBombaReal === controlBombaRef.current) {
        setControlBomba(estadoBombaReal);
        setBombaPendiente(false);
        setBombaSinConfirmar(false);
        clearTimeout(bombaTimeoutRef.current);
      }

      const estadoBomba2Real = control.data.bomba2 ?? false;
      if (!bombaPendienteRef2.current || estadoBomba2Real === controlBombaRef2.current) {
        setControlBomba2(estadoBomba2Real);
        setBombaPendiente2(false);
        setBombaSinConfirmar2(false);
        clearTimeout(bombaTimeoutRef2.current);
      }

      const estadoValvulaReal = control.data.electrovalvula ?? false;
      if (!valvulaPendienteRef.current || estadoValvulaReal === controlValvulaRef.current) {
        setControlValvula(estadoValvulaReal);
        setValvulaPendiente(false);
        clearTimeout(valvulaTimeoutRef.current);
      }

      setSistemaOnline(sistema.data.online ?? false);
    } catch (e) {
      console.error("Error fetching data", e);
    }
  };

  const toggleBomba = async () => {
    const nuevaAccion = !controlBomba;
    setControlBomba(nuevaAccion);
    setBombaPendiente(true);
    setBombaSinConfirmar(false);

    // bombaPendiente ya NO se limpia por tiempo: eso era la "confirmación
    // falsa" (el switch parecía confirmado sin que el ESP32 haya dicho
    // nada). A los 5s sin eco real, mostramos una advertencia explícita
    // en vez de ocultar el aviso. bombaPendiente solo se limpia cuando
    // fetchData()/SSE reciben un estado real que coincide con lo pedido.
    clearTimeout(bombaTimeoutRef.current);
    bombaTimeoutRef.current = setTimeout(() => setBombaSinConfirmar(true), 5000);

    try {
      await axios.put(`${API}/api/control/bomba`, { accion: nuevaAccion });
    } catch (e) {
      console.error("Error enviando comando de bomba", e);
      clearTimeout(bombaTimeoutRef.current);
      setBombaSinConfirmar(true);
    }
  };

  const toggleBomba2 = async () => {
    const nuevaAccion = !controlBomba2;
    setControlBomba2(nuevaAccion);
    setBombaPendiente2(true);
    setBombaSinConfirmar2(false);

    clearTimeout(bombaTimeoutRef2.current);
    bombaTimeoutRef2.current = setTimeout(() => setBombaSinConfirmar2(true), 5000);

    try {
      await axios.put(`${API}/api/control/bomba2`, { accion: nuevaAccion });
    } catch (e) {
      console.error("Error enviando comando de bomba2", e);
      clearTimeout(bombaTimeoutRef2.current);
      setBombaSinConfirmar2(true);
    }
  };

  const toggleValvula = async () => {
    const nuevaAccion = !controlValvula;
    setControlValvula(nuevaAccion);
    setValvulaPendiente(true);

    clearTimeout(valvulaTimeoutRef.current);
    valvulaTimeoutRef.current = setTimeout(() => setValvulaPendiente(false), 5000);

    await axios.put(`${API}/api/control/electrovalvula`, { accion: nuevaAccion });
  };

  // Ref al EventSource activo, para poder cerrarlo y reabrirlo
  // (p.ej. cuando la PWA vuelve de segundo plano en el celular).
  const eventSourceRef = useRef(null);

  useEffect(() => {
    const conectarSSE = () => {
      // Si ya había una conexión (p.ej. una reconexión manual), ciérrala primero
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(`${API}/api/stream/estado`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const mensaje = JSON.parse(event.data);

        if (mensaje.tipo === "inicial") {
          if (mensaje.data.transformador) setUltima(mensaje.data.transformador);
          if (mensaje.data.riego) setUltimoRiego(mensaje.data.riego);
        } else if (mensaje.tipo === "transformador") {
          setUltima(mensaje.data);
          const estadoBombaReal = mensaje.data.estado_bomba ?? false;
          if (!bombaPendienteRef.current || estadoBombaReal === controlBombaRef.current) {
            setControlBomba(estadoBombaReal);
            setBombaPendiente(false);
            setBombaSinConfirmar(false);
            clearTimeout(bombaTimeoutRef.current);
          }
          const estadoBomba2Real = mensaje.data.estado_bomba2 ?? false;
          if (!bombaPendienteRef2.current || estadoBomba2Real === controlBombaRef2.current) {
            setControlBomba2(estadoBomba2Real);
            setBombaPendiente2(false);
            setBombaSinConfirmar2(false);
            clearTimeout(bombaTimeoutRef2.current);
          }
          setTransformador((prev) => [...prev, mensaje.data].slice(-50));
        } else if (mensaje.tipo === "riego") {
          setUltimoRiego(mensaje.data);
          const estadoValvulaReal = mensaje.data.electrovalvula_activa ?? false;
          if (!valvulaPendienteRef.current || estadoValvulaReal === controlValvulaRef.current) {
            setControlValvula(estadoValvulaReal);
            setValvulaPendiente(false);
            clearTimeout(valvulaTimeoutRef.current);
          }
          setRiego((prev) => [...prev, mensaje.data].slice(-50));
        } else if (mensaje.tipo === "sistema") {
          setSistemaOnline(mensaje.data.online);
        }
      };

      eventSource.onerror = () => {
        console.log("[SSE] Desconectado, el navegador reintentará automáticamente...");
      };
    };

    fetchData();
    conectarSSE();

    // En móvil, al volver del background (celular bloqueado o cambio de app),
    // el navegador puede haber matado la conexión SSE sin avisar. Al recuperar
    // visibilidad, refrescamos datos y forzamos una reconexión limpia.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchData();
        conectarSSE();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  // Revisar, al cargar, si este dispositivo ya está suscrito a las alertas
  // (para que el botón arranque en el estado correcto sin que el usuario
  // tenga que volver a tocarlo cada vez que abre la app).
  useEffect(() => {
    if (!pushSoportado()) return;
    yaEstaSuscrito().then(setAlertasActivas).catch(() => {});
  }, []);

  const handleToggleAlertas = async () => {
    setAlertasError(null);
    setAlertasCargando(true);
    try {
      if (alertasActivas) {
        await desuscribirseDeAlertas(API);
        setAlertasActivas(false);
      } else {
        await suscribirseAAlertas(API);
        setAlertasActivas(true);
      }
    } catch (err) {
      setAlertasError(err.message || "No se pudo actualizar la suscripción.");
    } finally {
      setAlertasCargando(false);
    }
  };

  // Gesto oculto: 5 toques en el titulo en menos de 2s activa el modo dev.
  // Se guarda en sessionStorage (se pierde al cerrar la pestaña, a proposito).
  const handleTituloTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 2000);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setDevMode(true);
      sessionStorage.setItem("devMode", "1");
    }
  };

  const solicitarEscaneo = async () => {
    setEscaneando(true);
    try {
      await axios.post(`${API}/api/control/escaneo`);
    } catch (err) {
      console.error("Error al iniciar escaneo", err);
      alert("Error al iniciar escaneo: " + (err.message || "desconocido"));
    } finally {
      setTimeout(() => setEscaneando(false), 8000);
    }
  };
  
  const ocultarPanelDev = () => {
    setDevMode(false);
    sessionStorage.removeItem("devMode");
  };

  return (
    <div className="dashboard">
      <div className="topbar">
        <h1 onClick={handleTituloTap} style={{ userSelect: "none", cursor: "default" }}>
          Sistema IoT — Autotransformador &amp; Riego
        </h1>
        <div className="topbar-status">
          <span className="live-dot" />
          Última lectura: {ultima?.created_at ? formatearTooltip(ultima.created_at) : "—"}
        </div>
        {pushSoportado() && (
          <div className="alertas-push">
            <button
              className={`btn-alertas ${alertasActivas ? "activo" : ""}`}
              onClick={handleToggleAlertas}
              disabled={alertasCargando}
            >
              {alertasCargando
                ? "..."
                : alertasActivas
                ? "🔔 Alertas activadas"
                : "🔕 Activar alertas"}
            </button>
            {alertasError && <div className="alertas-error">{alertasError}</div>}
          </div>
        )}
      </div>

      {devMode && (
        <div className="dev-panel">
          <span className="dev-badge">🔧 MODO DEV</span>
          <button
            className="btn-escaneo"
            onClick={solicitarEscaneo}
            disabled={escaneando || !sistemaOnline}
          >
            {escaneando ? "Escaneando taps..." : "⚡ Escanear Taps"}
          </button>
          {!sistemaOnline && (
            <span className="dev-panel-hint">Sistema desconectado — no se puede escanear</span>
          )}
          <button className="btn-cerrar-dev" onClick={ocultarPanelDev} title="Ocultar panel dev">
            ✕
          </button>
        </div>
      )}

      <div className="module-grid">
        <div className="module" style={{ "--module-color": "var(--copper)" }}>
          <div className="module-header">🔌 Autotransformador</div>
          <div className="module-body">
            <div className="gauge-row">
              <Gauge label="V. Entrada" value={ultima?.voltaje_entrada} min={0} max={250} unit="V" icon="📥" color="var(--copper)" />
              <Gauge label="V. Salida" value={ultima?.voltaje_salida} min={0} max={250} unit="V" icon="📤" color="var(--volt)" />
              <Gauge label="Temperatura" value={ultima?.temperatura} min={0} max={100} unit="°C" icon="🌡️" color="var(--alert)" />
            </div>

            <div className="mini-row">
              <div className="mini-card">
                <div className="mini-label">🎚️ Tap Activo</div>
                <div className="mini-value">{ultima?.tap_activo ?? "—"}</div>
                <TapIndicator active={ultima?.tap_activo ?? 0} total={10} color="var(--volt)" />
              </div>
            </div>

            <div className="mini-row">
              <Led icon="💧" label="Estado Bomba (sensor)" active={!!ultima?.estado_bomba}
                color={ultima?.estado_bomba ? "var(--ok)" : "var(--text-dim)"}
                text={ultima?.estado_bomba ? "ON" : "OFF"} />
              <Led icon="💧" label="Estado Bomba 2 (sensor)" active={!!ultima?.estado_bomba2}
                color={ultima?.estado_bomba2 ? "var(--ok)" : "var(--text-dim)"}
                text={ultima?.estado_bomba2 ? "ON" : "OFF"} />
              <Led icon="🚨" label="Alarma" active={!!ultima?.alarma}
                color={ultima?.alarma ? "var(--alert)" : "var(--ok)"}
                text={ultima?.alarma ? "ACTIVA" : "OK"}
                pulse
              />
            </div>

            <Switch
              label="🎛️ Control Manual de Bomba"
              on={controlBomba}
              onToggle={toggleBomba}
              color="var(--copper)"
              disabled={!sistemaOnline}
              pendiente={bombaPendiente}
              sinConfirmar={bombaSinConfirmar}
            />
            <Switch
              label="🎛️ Control Manual de Bomba 2"
              on={controlBomba2}
              onToggle={toggleBomba2}
              color="var(--copper)"
              disabled={!sistemaOnline}
              pendiente={bombaPendiente2}
              sinConfirmar={bombaSinConfirmar2}
            />
          </div>
        </div>

        <div className="module" style={{ "--module-color": "var(--water)" }}>
          <div className="module-header">🌱 Sistema de Riego</div>
          <div className="module-body">
            <div className="gauge-row">
              <Gauge label={<>Humedad<br />Suelo</>} value={ultimoRiego?.humedad_suelo} min={0} max={100} unit="%" icon="💧" color="var(--water)" />
            </div>

            <div className="mini-row">
              <div className="mini-card">
                <div className="mini-label">🚿 Modo Riego</div>
                <div className="mini-value">{ultimoRiego?.modo_riego ?? "—"}</div>
              </div>
              <div className="mini-card">
                <div className="mini-label">⏱️ Tiempo Riego</div>
                <div className="mini-value">{ultimoRiego?.tiempo_riego ?? "—"} min</div>
              </div>
            </div>

            <div className="mini-row">
              <Led icon="🔧" label="Electroválvula (sensor)" active={!!ultimoRiego?.electrovalvula_activa}
                color={ultimoRiego?.electrovalvula_activa ? "var(--water)" : "var(--text-dim)"}
                text={ultimoRiego?.electrovalvula_activa ? "ABIERTA" : "CERRADA"} />
            </div>

            <Switch
              label="🎛️ Control Manual de Electroválvula"
              on={controlValvula}
              onToggle={toggleValvula}
              color="var(--water)"
              disabled={!sistemaOnline}
              pendiente={valvulaPendiente}
            />
          </div>
        </div>
      </div>

      <div className="chart-panel">
        <h2 className="chart-panel-title">📈 Historial de Voltaje</h2>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={transformador}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="created_at" stroke="#555" tick={{ fontSize: 10 }}
              tickFormatter={formatearHora} interval="preserveStartEnd" />
            <YAxis stroke="#555" tick={{ fontSize: 11 }} domain={[150, 250]} />
            <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }}
              labelFormatter={formatearTooltip} />
            <Legend />
            <Line type="monotone" dataKey="voltaje_entrada" stroke="var(--copper)" dot={false} name="V. Entrada" />
            <Line type="monotone" dataKey="voltaje_salida" stroke="var(--volt)" dot={false} name="V. Salida" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-panel">
        <h2 className="chart-panel-title">📈 Historial de Humedad</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={riego}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="created_at" stroke="#555" tick={{ fontSize: 10 }}
              tickFormatter={formatearHora} interval="preserveStartEnd" />
            <YAxis stroke="#555" tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)" }}
              labelFormatter={formatearTooltip} />
            <Line type="monotone" dataKey="humedad_suelo" stroke="var(--water)" dot={false} name="Humedad %" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}