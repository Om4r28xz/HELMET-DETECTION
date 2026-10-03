# Smart Safety Access System

Sistema escolar de control de acceso por ID y verificación de equipo de protección personal. La cámara se utiliza únicamente para detectar persona, casco y chaleco; no hay reconocimiento facial ni almacenamiento de frames.

## Estado actual

- Consulta trabajadores activos por identificador o nombre exacto.
- Crea y cancela intentos de acceso.
- Captura webcam y consulta Roboflow desde el backend.
- Muestra detecciones, confianza y bounding boxes.
- Permite acceso después de cinco frames válidos consecutivos; deniega después de diez segundos configurables con PPE faltante.
- Registra el resultado una vez y crea una incidencia al denegar.
- Notificaciones WhatsApp automáticas a supervisores al denegar acceso (vía Baileys / WhatsApp Web directo).
- Vinculación sencilla por código QR desde navegador en `http://localhost:3000/api/notifications/whatsapp/qr`.
- Resolución automática de JID para números de México (`521...`).
- Endpoints de notificaciones: listado, detalle, estado, QR y prueba de envío.

## Requisitos

- Node.js 22 o posterior y npm.
- Docker Desktop iniciado para levantar MySQL local.
- Una clave privada Roboflow nueva. La clave compartida anteriormente debe revocarse y rotarse.

## Configuración local

1. Copia `.env.example` como `.env` y reemplaza las contraseñas de desarrollo.
2. Copia `backend/.env.example` como `backend/.env`; configura `DB_USER` y `DB_PASSWORD` con los mismos valores del `.env` raíz. Añade una clave Roboflow nueva en `ROBOFLOW_API_KEY`.
3. Inicia MySQL con `docker compose up -d`.
4. Instala dependencias desde la raíz:

   ```bash
   npm --prefix backend install
   npm --prefix frontend install
   ```

5. Crea las tablas y datos ficticios:

   ```bash
   npm --prefix backend run db:migrate
   npm --prefix backend run db:seed
   ```

6. En dos terminales, inicia backend y frontend:

   ```bash
   npm --prefix backend run dev
   npm --prefix frontend run dev
   ```

La interfaz estará en `http://localhost:5173` y el backend en `http://localhost:3000`. Los datos de prueba usan identificadores `DEMO-*`.

## Roboflow

El backend usa `ROBOFLOW_MODEL_ID` (por defecto `hard-hat-universe-0dy7t/26`) y `ROBOFLOW_CONFIDENCE_THRESHOLD=0.70`. Confirma en Roboflow que el modelo detecte las clases persona, casco y chaleco antes de usarlo para decisiones reales. La clave se mantiene en el backend y no debe empezar por `VITE_`.

## WhatsApp (Baileys)

Cuando se deniega el acceso a un trabajador, el sistema envía una notificación por WhatsApp a todos los supervisores activos que tengan un número de teléfono configurado. Se utiliza una conexión directa con Baileys (protocolo WhatsApp Web), permitiendo enviar mensajes reales sin depender de Meta Cloud API ni intermediarios caídos.

### Vinculación de dispositivo remitente

1. Inicia el backend (`npm --prefix backend run dev`).
2. Abre en tu navegador: `http://localhost:3000/api/notifications/whatsapp/qr`.
3. Desde tu WhatsApp remitente, ve a **Dispositivos vinculados > Vincular un dispositivo** y escanea el QR.
4. La sesión se guardará localmente en `auth_info_baileys/` para mantener la conexión persistente.

### Endpoints de notificaciones

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/notifications/whatsapp/qr` | Vista web con código QR para vincular dispositivo |
| `GET` | `/api/notifications/whatsapp/status` | Estado de conexión con WhatsApp |
| `GET` | `/api/notifications/status` | Estado global y estadísticas de notificaciones |
| `GET` | `/api/notifications` | Listado paginado de notificaciones |
| `GET` | `/api/notifications/:id` | Detalle de una notificación |
| `POST` | `/api/notifications/test` | Enviar mensaje de prueba (`{ "phone": "526141320311" }`) |

### Probar la integración

```bash
curl -X POST http://localhost:3000/api/notifications/test \
  -H 'Content-Type: application/json' \
  -d '{"phone": "526141320311"}'
```

## Validación

```powershell
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend test
npm --prefix frontend run build
npm --prefix frontend run lint
```

No se ha ejecutado aún la migración contra MySQL ni una inferencia autenticada; Docker debe estar iniciado y se requiere una clave Roboflow rotada para esas pruebas.