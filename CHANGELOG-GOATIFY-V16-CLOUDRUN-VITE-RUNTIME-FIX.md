# Goatify V16 - Cloud Run Vite Runtime Fix

## Problema corregido
Cloud Run fallaba al iniciar con:

```txt
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite' imported from /app/dist-server/server.js
```

La causa era que `server.ts` importaba `vite` arriba del archivo, y el Dockerfile de producción instala solo dependencias productivas (`npm ci --omit=dev`). Como `vite` vive en `devDependencies`, el servidor compilado intentaba cargarlo en producción y el contenedor salía con `exit(1)` antes de escuchar el puerto 8080.

## Corrección
- Se eliminó el import estático de `vite` en `server.ts`.
- Se cambió a import dinámico solo cuando `NODE_ENV !== "production"`.
- Producción ya no necesita `vite` en runtime.
- Se cambió el worker de recordatorios para que venga apagado por defecto y solo prenda con `ENABLE_REMINDER_WORKER=true`.

## Validación
- `npm run typecheck -- --pretty false`: OK.
- `npm run build:server`: OK.
- `NODE_ENV=production PORT=4243 node dist-server/server.js`: OK.
- `/api/health`: OK.

## No se tocó
- Social Media Studio.
- Campus / QLASE.
- Chat avanzado.
- Mail.
- POS.
- Drive.
- Juegos / Chill.
- Presentaciones.
- Política Pro/Premium.
- Diseño visual.
