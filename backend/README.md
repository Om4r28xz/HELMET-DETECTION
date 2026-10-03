# Smart Safety Access System backend

API inicial en Node.js, Express, TypeScript, Sequelize y MySQL. La compilacion y el chequeo de tipos no necesitan una instancia de MySQL.

## Inicio

1. Ejecuta `npm install` desde `backend/`.
2. Copia `.env.example` a `.env` y configura la conexion MySQL local; el ejemplo no contiene credenciales.
3. Crea la base de datos indicada por `DB_NAME`.
4. Ejecuta `npm run db:migrate` y, opcionalmente, `npm run db:seed` para insertar datos de demostracion.
5. Ejecuta `npm run dev`.

`npm run build` y `npm run typecheck` son independientes de la disponibilidad de MySQL.

## API

- `GET /api/health`: estado de la API y conectividad MySQL.
- `GET /api/workers/lookup?identifier=...`: busca un trabajador.
- `POST /api/access-sessions`: JSON `{ "identifier": "...", "attempt_id": "<UUID opcional>" }`. Solo crea una sesion para un trabajador activo; sesion y log de entrada se guardan en una transaccion.
- `GET /api/access-sessions/:id`: consulta una sesion por UUID.
- `POST /api/access-sessions/:id/inference`: JSON `{ "image": "data:image/jpeg;base64,..." }`. Requiere una sesion activa y una imagen JPEG, PNG o WebP de hasta 1 MB decodificada. Envía el frame a Roboflow sin almacenarlo ni registrar su contenido y devuelve predicciones, dimensiones y detecciones de persona, casco y chaleco. No registra ni finaliza decisiones de acceso.
- `GET /api/access-logs?page=1&limit=20`: lista logs con paginacion (limite maximo 100).

Configura `ROBOFLOW_API_KEY` con una clave secreta de Roboflow. `ROBOFLOW_MODEL_ID` selecciona `project/version` (por defecto `hard-hat-universe-0dy7t/26`) y `ROBOFLOW_CONFIDENCE_THRESHOLD` establece el umbral entre `0` y `1` (por defecto `0.70`). Las llamadas tienen un timeout de 15 segundos. Errores de configuracion, proveedor y timeout se devuelven como JSON seguro con estado 503, 502 o 504.

La decision se confirma tras cinco frames consecutivos con PPE completo o diez segundos continuos con el mismo equipo faltante (`PPE_DENIAL_GRACE_MS=10000`). Una denegacion crea el registro de acceso y la incidencia; despues del commit, se envia una alerta WhatsApp por sesion. Si falta casco, el mensaje dice explicitamente que el trabajador no trae casco. Una restriccion unica por sesion y supervisor evita mensajes repetidos.

Para WhatsApp, configura `WHATSAPP_ENABLED=true`, `WHATSAPP_SENDER_PHONE` y el telefono destinatario en `supervisors.phone` o, para el supervisor sin telefono, en `SUPERVISOR_PHONE`. Inicia el backend y abre `http://localhost:3000/api/notifications/whatsapp/qr` para vincular el dispositivo remitente. Las credenciales locales de Baileys se guardan en `backend/auth_info_baileys/`, no en Git.

Las migraciones y seeders estan en `migrations/` y `seeders/`. Los identificadores `DEMO-*` del seeder son datos ficticios.