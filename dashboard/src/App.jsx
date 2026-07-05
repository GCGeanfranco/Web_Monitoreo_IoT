import { useState, useEffect } from "react";
import "./App.css";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import axios from "axios";

const API = "https://webmonitoreoiot-production.up.railway.app";

const formatearHora = (timestamp) => {
  if (!timestamp) return "";
  const fecha = new Date(timestamp + "Z");
  return fecha.toLocaleTimeString("es-PE", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Lima"
  });
};

const formatearTooltip = (timestamp) => {
  if (!timestamp) return "";
  const fecha = new Date(timestamp + "Z");
  return fecha.toLocaleDateString("es-PE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    second: "2-digit", timeZone: "America/Lima"
  });
};

function Gauge({ value, min, max, unit, label, icon, color }) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const arcFraction = 0.75; // arco de 270°
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

function Led({ icon, label, active, color, text }) {
  return (
    <div className="led-card">
      <span className="led" data-active={active} style={{ "--led-color": color }} />
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

function Switch({ label, on, onToggle, color }) {
  return (
    <div className="switch-card" style={{ "--sw-color": color }}>
      <div className="switch-label">{label}</div>
      <button className="switch-track" data-on={on} onClick={onToggle} aria-pressed={on}>
        <span className="switch-thumb" />
        <span className="switch-text off">OFF</span>
        <span className="switch-text on">ON</span>
      </button>
    </div>
  );
}

export default function App() {
  const [transformador, setTransformador] = useState([]);
  const [riego, setRiego] = useState([]);
  const [ultima, setUltima] = useState(null);
  const [ultimoRiego, setUltimoRiego] = useState(null);
  const [controlBomba, setControlBomba] = useState(false);
  const [controlValvula, setControlValvula] = useState(false);

  const fetchData = async () => {
    try {
      const [t, r, control] = await Promise.all([
        axios.get(`${API}/api/lecturas/transformador`),
        axios.get(`${API}/api/lecturas/riego`),
        axios.get(`${API}/api/control/estado`)
      ]);
      const tData = t.data.reverse();
      const rData = r.data.reverse();
      setTransformador(tData);
      setRiego(rData);
      setUltima(tData[tData.length - 1]);
      setUltimoRiego(rData[rData.length - 1]);
      setControlBomba(control.data.bomba ?? false);
      setControlValvula(control.data.electrovalvula ?? false);
    } catch (e) {
      console.error("Error fetching data", e);
    }
  };

  const toggleBomba = async () => {
    const nuevaAccion = !controlBomba;
    setControlBomba(nuevaAccion);
    await axios.put(`${API}/api/control/bomba`, { accion: nuevaAccion });
  };

  const toggleValvula = async () => {
    const nuevaAccion = !controlValvula;
    setControlValvula(nuevaAccion);
    await axios.put(`${API}/api/control/electrovalvula`, { accion: nuevaAccion });
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="dashboard">
      <div className="topbar">
        <h1>Sistema IoT — Autotransformador &amp; Riego</h1>
        <div className="topbar-status">
          <span className="live-dot" />
          Última lectura: {ultima?.created_at ? formatearTooltip(ultima.created_at) : "—"}
        </div>
      </div>

      <div className="module-grid">
        {/* Módulo Autotransformador */}
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
              <Led icon="🚨" label="Alarma" active={!!ultima?.alarma}
                color={ultima?.alarma ? "var(--alert)" : "var(--ok)"}
                text={ultima?.alarma ? "ACTIVA" : "OK"} />
            </div>

            <Switch label="🎛️ Control Manual de Bomba" on={controlBomba} onToggle={toggleBomba} color="var(--copper)" />
          </div>
        </div>

        {/* Módulo Riego */}
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

            <Switch label="🎛️ Control Manual de Electroválvula" on={controlValvula} onToggle={toggleValvula} color="var(--water)" />
          </div>
        </div>
      </div>

      {/* Gráfica Voltaje */}
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

      {/* Gráfica Humedad */}
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