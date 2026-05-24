# Goatify V13 — Production Final Hardening

Esta versión parte de V12 y aplica una ronda final de hardening sin eliminar módulos, botones ni flujos visuales existentes.

## Cambios principales

### 1. Producción Cloud Run más fina
- `package.json` ahora separa `dev`, `build:server` y `start`.
- `start` ejecuta `node dist-server/server.js` en vez de `tsx server.ts`.
- `Dockerfile` pasa a multi-stage: build con dev dependencies, runtime con `npm ci --omit=dev`.
- Se reduce peso del contenedor y superficie de producción.

### 2. Límites JSON por endpoint
- Global: `API_JSON_LIMIT=10mb`.
- Imágenes: `API_IMAGE_JSON_LIMIT=25mb`.
- Documentos/artefactos: `API_DOCS_JSON_LIMIT=50mb`.
- Media/video: `API_MEDIA_JSON_LIMIT=100mb`.
- Esto evita que todos los endpoints acepten 200 MB por defecto.

### 3. Storage centralizado más completo
Migración adicional de subidas directas hacia `uploadWithQuotaCheck()`:
- Agentes públicos: notas de voz.
- Agentes IA: archivos de flujo y avatares.
- Artículos/Discovery: imágenes.
- Documentos de proyecto.
- Finanzas: recibos.
- Hub: adjuntos DM, grupos y posts.
- Partners: comprobantes.
- Presentaciones: archivos al Drive.
- CRM: logos, emisor y documentos.
- Project Info: logos.
- CallContext: grabaciones de reuniones.

### 4. Release de storage/créditos más seguro
- `/api/usage/release` ya no puede dejar contadores negativos.
- Se usa transacción y clamp mínimo en 0.

### 5. Recordatorios reales
- Worker opcional `ENABLE_REMINDER_WORKER`.
- Crea notificaciones internas/push para:
  - Posts sociales próximos.
  - Reuniones próximas.
- Usa `users/{uid}/notifications` para que el Push Guard existente las entregue.

### 6. Social Media
- Se eliminó doble sync redundante en calendario social.
- Se agregó índice sugerido en `firestore.indexes.json` para `socialCalendar.scheduledAt`.

## Validación local
- `npm run typecheck -- --pretty false`: OK.
- `npm run build:server`: OK.
- `node dist-server/server.js` + `/api/health`: OK.
- `npm run build`: Vite inicia, pero en este entorno se corta por timeout por el tamaño del bundle. No mostró error de código antes del corte.

## No se tocó
- No se quitaron botones del chat avanzado.
- No se eliminaron módulos.
- No se cambió diseño global.
- No se tocó login principal.
- No se cambió política Pro/Premium.
- No se alteró Mail/POS/Social/Presentaciones visualmente.
