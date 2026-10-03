# Smart Safety Access System

Sistema escolar de control de acceso por ID y verificación de equipo de protección personal. La cámara se utiliza únicamente para detectar persona, casco y chaleco; no hay reconocimiento facial ni almacenamiento de frames.

## Estado actual

- Consulta trabajadores activos por identificador o nombre exacto.
- Crea y cancela intentos de acceso.
- Captura webcam y consulta Roboflow desde el backend.
- Muestra detecciones, confianza y bounding boxes.
- Permite acceso después de cinco frames válidos consecutivos; deniega después de diez segundos configurables con PPE faltante.
- Registra el resultado una vez y crea una incidencia al denegar.
- WhatsApp/RapidAPI, dashboard administrativo y pruebas contra MySQL aún están pendientes.

## Requisitos

- Node.js 22 o posterior y npm.
- Docker Desktop iniciado para levantar MySQL local.
- Una clave privada Roboflow nueva. La clave compartida anteriormente debe revocarse y rotarse.

## Configuración local

1. Copia `.env.example` como `.env` y reemplaza las contraseñas de desarrollo.
2. Copia `backend/.env.example` como `backend/.env`; configura `DB_USER` y `DB_PASSWORD` con los mismos valores del `.env` raíz. Añade una clave Roboflow nueva en `ROBOFLOW_API_KEY`.
3. Inicia MySQL con `docker compose up -d`.
4. Instala dependencias desde la raíz:

   ```powershell
   npm --prefix backend install
   npm --prefix frontend install
   ```

5. Crea las tablas y datos ficticios:

   ```powershell
   npm --prefix backend run db:migrate
   npm --prefix backend run db:seed
   ```

6. En dos terminales, inicia backend y frontend:

   ```powershell
   npm --prefix backend run dev
   ```

   ```powershell
   npm --prefix frontend run dev
   ```

La interfaz estará en `http://localhost:5173` y el backend en `http://localhost:3000`. Los datos de prueba usan identificadores `DEMO-*`.

## Roboflow

El backend usa `ROBOFLOW_MODEL_ID` (por defecto `hard-hat-universe-0dy7t/26`) y `ROBOFLOW_CONFIDENCE_THRESHOLD=0.70`. Confirma en Roboflow que el modelo detecte las clases persona, casco y chaleco antes de usarlo para decisiones reales. La clave se mantiene en el backend y no debe empezar por `VITE_`.

## Validación

```powershell
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend test
npm --prefix frontend run build
npm --prefix frontend run lint
```

No se ha ejecutado aún la migración contra MySQL ni una inferencia autenticada; Docker debe estar iniciado y se requiere una clave Roboflow rotada para esas pruebas.