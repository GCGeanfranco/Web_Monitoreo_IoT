# Web_Monitoreo_IoT 
Sistema de monitoreo IoT de autotransformador y riego de cultivo

# 🌐 Web Monitoreo IoT — Dashboard de Monitoreo en Tiempo Real

Sistema de monitoreo IoT para transformadores eléctricos y riego agrícola. Incluye una API REST, base de datos, dashboard web, despliegue en la nube con Docker y pipeline CI/CD automatizado.

> Proyecto desarrollado progresivamente. Actualmente en construcción. 🚧

---

## 📋 Tabla de Contenidos

- [Descripción](#-descripción)
- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Stack Tecnológico](#-stack-tecnológico)
- [Fases del Proyecto](#-fases-del-proyecto)
- [Autor](#-autor)

---

## 📖 Descripción

Este proyecto implementa un sistema completo de monitoreo IoT que permite:

- **Monitorear transformadores eléctricos**: temperatura, voltaje y corriente en tiempo real.
- **Automatizar el riego agrícola**: lectura de humedad del suelo y control remoto de bomba de agua.
- **Visualizar datos históricos**: mediante un dashboard web accesible desde cualquier dispositivo.
- **Recibir alertas automáticas**: notificaciones cuando los valores superan umbrales críticos.

El sistema funciona con un **ESP32** como nodo de hardware y un **servidor en la nube** como backend. Durante el desarrollo se utiliza un **simulador en Python** que replica el comportamiento del ESP32.

---

## 🏗️ Arquitectura del Sistema

```
ESP32 / Simulador Python
        │
        │  HTTP POST (cada 30s)
        ▼
   [API FastAPI]  ←──────────────────────────────┐
        │                                         │
        ▼                                         │
  [PostgreSQL]                              [Dashboard Web]
        │                                         │
        └──────────────────────────────────────► fetch()
                                                  │
                                             [Nginx / HTTPS]
                                                  │
                                             [Grafana + Prometheus]
```

**Flujo de datos:**
```
GitHub → GitHub Actions → SSH → Docker Compose → Servidor en la nube
```

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Hardware | ESP32, sensor DS18B20, ZMPT101B, sensor de humedad capacitivo, relé |
| Backend | Python, FastAPI |
| Base de datos | PostgreSQL |
| Frontend / Dashboard | HTML, CSS, JavaScript |
| Contenedores | Docker, Docker Compose |
| Servidor web | Nginx (reverse proxy) |
| SSL/HTTPS | Certbot + DuckDNS |
| Monitoreo | Grafana, Prometheus, Node Exporter |
| CI/CD | GitHub Actions |
| Nube | AWS EC2 / Railway |
| IaC (post-proyecto) | Terraform |
| Testing | pytest |
| Firmware ESP32 | Arduino IDE (C++) |

---

## 🗺️ Fases del Proyecto

### 
✅ FASE 1 - Infraestructura
   - Railway configurado
---

✅ FASE 2 - API + Base de datos
   - FastAPI en producción
   - PostgreSQL con datos reales
   - 4 endpoints funcionando
---

✅ FASE 3 - Dashboard con HTTPS
   - React + Vite desplegado
   - URL pública con HTTPS automático
   - Datos en tiempo real cada 10s
   - Gráficas históricas de voltaje y humedad
---
✅ FASE 4 - CI/CD con GitHub Actions
   - Pipeline automático configurado
   - Tests automáticos corriendo
   - Deploy automático en cada push
   - Secret DATABASE_URL configurado
---
## 👤 Autor

**Geanfranco**
- GitHub: [@GCGeanfranco](https://github.com/GCGeanfranco)
- LinkedIn: [gcgeanfranco](https://linkedin.com/in/gcgeanfranco)
- Ubicación: Perú 🇵🇪


---

*Proyecto — Sistema IoT de Monitoreo*

