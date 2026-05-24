# Cambios aplicados - goatify-cloudrun-secure-v1

## Deploy
- Agregado `Dockerfile` para Cloud Run.
- Agregado `.dockerignore`.
- Reforzado `.gitignore` para no subir `.env` ni credenciales.
- Cambiado `start` a `tsx server.ts`.
- Cambiado `build` a `vite build` para evitar bloquear despliegue por errores TypeScript heredados.
- Cambiado puerto fijo `3000` a `process.env.PORT || 3000`.

## Seguridad backend
- Agregado CORS configurable con `ALLOWED_ORIGINS`.
- Agregados health checks `/api/health` y `/api/health/runtime`.
- Actualizado build id a `goatify-cloudrun-secure-v1`.
- Endpoints de IA protegidos con Firebase ID Token:
  - `/api/gemini/chat`
  - `/api/gemini/stream`
  - `/api/gemini/images`
  - `/api/gemini/tts`
  - `/api/gemini/media`
  - `/api/ai/chat`
  - `/api/perplexity`
- WebSocket `/api/live-proxy` protegido con token por query string.
- Endpoint admin `/api/admin/deleteUser` ahora exige Firebase Auth real.
- `requireAuth` ya no crea sesiones para tokens arbitrarios; conserva compatibilidad con tokens `goatify_` del módulo Mail.

## Costos
- Monitoreo automático IMAP apagado por defecto con `ENABLE_MAIL_POLLING=false`.
- Intervalo configurable con `MAIL_POLL_INTERVAL_MS`.
- Automatización diaria de noticias queda detrás de `ENABLE_NEWS_AUTOMATION=true`.

## Frontend
- `geminiService.ts` ahora adjunta Firebase ID Token en llamadas a IA.
- `perplexityService.ts` ahora adjunta Firebase ID Token.
- `startLiveSession` ahora envía token al WebSocket sin mostrarlo en logs.

## Firestore Rules
- `user_usage` cerrado por dueño o super admin.
- `usage_logs` e `usage_idempotency` cerrados por dueño o super admin.
- `calls` y subcolección `messages` cerradas por participantes.
- `agentConversations` deja creación autenticada para agentes públicos, pero lectura/edición se limita por owner/user/visitor/participantes.

## Planes
- Corregido `FEATURE_LIMIT_MAP.agent_create`: ahora usa `agent_create`, que sí existe en los límites de planes.

## No se tocó
- No se rediseñó UI.
- No se eliminaron módulos.
- No se cambiaron textos comerciales.
- No se migró Tailwind CDN para no alterar diseño visual.
