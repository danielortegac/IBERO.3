# Goatify V9 — Stability, Credits, Rules & Calendar Hardening

## Objetivo
Versión de estabilidad crítica construida sobre V8. No rediseña ni elimina módulos. Corrige inconsistencias de límites, reglas, calendario y guardado para acercar Goatify a un SaaS más coherente y seguro.

## Cambios principales

### 1. Goatify Meet / reuniones
- `checkMeetingLimit()` ahora usa la feature correcta: `meeting_create`.
- Evita que reuniones se bloqueen por una llave inexistente (`meetings_monthly`).

### 2. Formularios por plan
- Se agregó `active_forms` a los planes:
  - Free: 1 formulario activo.
  - Pro: 10 formularios activos.
  - Premium: 50 formularios activos.
- `form_create` ya tiene un límite real en la matriz de planes.

### 3. Créditos server-side para IA
Se agregó un motor de créditos en `server.ts` para que Cloud Run valide y descuente consumo aunque alguien intente llamar endpoints directamente:
- `/api/gemini/chat` → `ai_chat`
- `/api/gemini/stream` → `ai_chat`
- `/api/ai/chat` → `ai_chat`
- `/api/gemini/images` → `ai_image`
- `/api/gemini/tts` → `voice_command`
- `/api/gemini/media` → `ai_chat` o `ai_video` según archivo
- `/api/perplexity` → `ai_grounding`

Incluye:
- Reseteo diario/mensual en backend.
- Downgrade de plan cancelado a Free.
- Logs en `users/{uid}/usage_logs`.
- Rollback si falla la llamada de IA después de consumir crédito.

### 4. Evitar doble consumo de chat
- Se quitó el preconsumo genérico de `ai_chat` en `executeAiWithFallback()`.
- La validación visual sigue existiendo en la app, pero el descuento real de IA queda en backend.
- Se removieron preconsumos duplicados en módulos que ya ejecutan IA por backend.

### 5. Firestore Rules
- Se agregaron reglas específicas para `conversations` y `conversations/{id}/messages`.
- Se cerró escritura de formularios: owner/admin para update/delete.
- `published_sites` permite lectura pública de sitios activos y escritura solo owner/admin.
- `users` respeta bloqueo básico: si un perfil bloqueó a un usuario, ese usuario no lee el perfil completo desde Firestore.

### 6. Social Media Studio conectado al calendario global
- Al calendarizar o mover un post social, también se sincroniza en:
  - `users/{uid}/socialCalendar/{itemId}`
- El calendario global ahora escucha `socialCalendar` y muestra posts sociales en cada día.

### 7. Calendario y zona horaria
- Calendario de proyecto y global usan fecha local `YYYY-MM-DD`, evitando desfases por `toISOString()`.

### 8. Storage / Drive
- Guardar artifacts en Drive desde backend ahora valida espacio con el motor server-side.
- Stickers, imágenes del Web Programmer y adjuntos de mensajes directos tienen chequeo de storage antes de subir.

## No tocado
- No se cambió Cloud Run.
- No se tocó login principal.
- No se tocó POS.
- No se eliminó ningún módulo.
- No se cambió diseño global.
- No se cambió política de Gemini Pro: Pro real solo para Premium activo/pagado.

## Validación
- `npm run typecheck -- --pretty false`: OK.
- `npm run build`: inició correctamente; en este entorno se cortó por timeout durante transformación, sin mostrar error de código antes del corte.
