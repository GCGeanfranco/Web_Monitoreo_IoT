import { useState, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import axios from "axios";

const API = "https://webmonitoreoiot-production.up.railway.app";

const formatearHora = (timestamp) => {
  if (!timestamp) return "";
  const fecha = new Date(timestamp);
  return fecha.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatearTooltip = (timestamp) => {
  if (!timestamp) return "";
  const fecha = new Date(timestamp);
  return fecha.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};

function StatCard({ title, value, unit, color, icon }) {
  return (
    <div style={{
      background: "#1e1e2e", borderRadius: 12, padding: "20px 24px",
      borderLeft: `4px solid ${color}`, flex: 1, minWidth: 160
    }}>
      <div style={{ color: "#888", fontSize: 13, marginBottom: 6 }}>{icon} {title}</div>
      <div style={{ color, fontSize: 32, fontWeight: 700 }}>
        {value ?? "—"}<span style={{ fontSize: 14, marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  );
}

function ControlButton({ label, estado, onToggle, color }) {
  return (
    <div style={{
      background: "#1e1e2e", borderRadius: 12, padding: "20px 24px",
      borderLeft: `4px solid ${color}`, flex: 1, minWidth: 160,
      display: "flex", flexDirection: "column", gap: 12
    }}>
      <div style={{ color: "#888", fontSize: 13 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ color, fontSize: 24, fontWeight: 700 }}>
          {estado ? "ON" : "OFF"}
        </span>
        <button
          onClick={onToggle}
          style={{
            background: estado ? "#f38ba8" : "#a6e3a1",
            color: "#13131f", border: "none", borderRadius: 8,
            padding: "8px 20px", fontWeight: 700, cursor: "pointer",
            fontSize: 14
          }}>
          {estado ? "Apagar" : "Encender"}
        </button>
      </div>
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
    <div style={{ background: "#13131f", minHeight: "100vh", color: "#fff", fontFamily: "sans-serif", padding: 24 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: "#a6e3a1" }}>
          ⚡ Sistema IoT — Autotransformador & Riego
        </h1>
        <p style={{ color: "#555", margin: "4px 0 0" }}>Actualización cada 10 segundos</p>
      </div>

      {/* Cards Transformador */}
      <h2 style={{ color: "#cdd6f4", fontSize: 15, marginBottom: 12 }}>🔌 Autotransformador</h2>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard title="Voltaje Entrada" value={ultima?.voltaje_entrada} unit="V" color="#89b4fa" icon="📥" />
        <StatCard title="Voltaje Salida" value={ultima?.voltaje_salida} unit="V" color="#a6e3a1" icon="📤" />
        <StatCard title="Tap Activo" value={ultima?.tap_activo} unit="" color="#f9e2af" icon="🎚️" />
        <StatCard title="Temperatura" value={ultima?.temperatura} unit="°C" color="#fab387" icon="🌡️" />
      </div>

      {/* Botones Control Transformador */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
        <StatCard
          title="Estado Bomba (sensor)"
          value={ultima?.estado_bomba ? "ON" : "OFF"}
          unit="" color={ultima?.estado_bomba ? "#a6e3a1" : "#f38ba8"} icon="💧" />
        <StatCard
          title="Alarma"
          value={ultima?.alarma ? "ACTIVA" : "OK"}
          unit="" color={ultima?.alarma ? "#f38ba8" : "#a6e3a1"} icon="🚨" />
        <ControlButton
          label="🎛️ Control Manual de Autotransformador"
          estado={controlBomba}
          onToggle={toggleBomba}
          color="#89b4fa" />
      </div>

      {/* Gráfica Voltaje */}
      <h2 style={{ color: "#cdd6f4", fontSize: 15, marginBottom: 12 }}>📈 Historial de Voltaje</h2>
      <div style={{ background: "#1e1e2e", borderRadius: 12, padding: 20, marginBottom: 28 }}>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={transformador}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis
              dataKey="created_at"
              stroke="#555"
              tick={{ fontSize: 10 }}
              tickFormatter={formatearHora}
              interval="preserveStartEnd"
            />
            <YAxis stroke="#555" tick={{ fontSize: 11 }} domain={[150, 250]} />
            <Tooltip
              contentStyle={{ background: "#1e1e2e", border: "1px solid #333" }}
              labelFormatter={formatearTooltip}
            />
            <Legend />
            <Line type="monotone" dataKey="voltaje_entrada" stroke="#89b4fa" dot={false} name="V. Entrada" />
            <Line type="monotone" dataKey="voltaje_salida" stroke="#a6e3a1" dot={false} name="V. Salida" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Cards Riego */}
      <h2 style={{ color: "#cdd6f4", fontSize: 15, marginBottom: 12 }}>🌱 Sistema de Riego</h2>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard title="Humedad Suelo" value={ultimoRiego?.humedad_suelo} unit="%" color="#89dceb" icon="💧" />
        <StatCard title="Modo Riego" value={ultimoRiego?.modo_riego} unit="" color="#cba6f7" icon="🚿" />
        <StatCard
          title="Electroválvula (sensor)"
          value={ultimoRiego?.electrovalvula_activa ? "ABIERTA" : "CERRADA"}
          unit="" color={ultimoRiego?.electrovalvula_activa ? "#a6e3a1" : "#f38ba8"} icon="🔧" />
        <StatCard title="Tiempo Riego" value={ultimoRiego?.tiempo_riego} unit="min" color="#f9e2af" icon="⏱️" />
      </div>

      {/* Botón Control Riego */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
        <ControlButton
          label="🎛️ Control Manual de Bomba"
          estado={controlValvula}
          onToggle={toggleValvula}
          color="#89dceb" />
      </div>

      {/* Gráfica Humedad */}
      <h2 style={{ color: "#cdd6f4", fontSize: 15, marginBottom: 12 }}>📈 Historial de Humedad</h2>
      <div style={{ background: "#1e1e2e", borderRadius: 12, padding: 20 }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={riego}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis
              dataKey="created_at"
              stroke="#555"
              tick={{ fontSize: 10 }}
              tickFormatter={formatearHora}
              interval="preserveStartEnd"
            />
            <YAxis stroke="#555" tick={{ fontSize: 11 }} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ background: "#1e1e2e", border: "1px solid #333" }}
              labelFormatter={formatearTooltip}
            />
            <Line type="monotone" dataKey="humedad_suelo" stroke="#89dceb" dot={false} name="Humedad %" />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}