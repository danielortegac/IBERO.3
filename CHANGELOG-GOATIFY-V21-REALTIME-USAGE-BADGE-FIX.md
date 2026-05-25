# Goatify V21 — Realtime Usage Badge Fix

## Objetivo
Corregir el problema donde el usuario usa IA, pero el badge sigue mostrando `IA 0/30`, `Web 0/20` o `Social 0/30`.

## Cambios aplicados

### 1. Stream de chat ahora envía snapshot de uso
`/api/gemini/stream` descuenta el crédito en backend y de inmediato envía por SSE un evento `usageUpdated` con el uso real actual del usuario.

### 2. El cliente escucha eventos de uso del stream
`services/geminiService.ts` detecta el evento `usageUpdated` y dispara `goatify:usage-updated`.

### 3. Badge actualiza inmediato
`PlanCreditBadge.tsx` ahora:
- recibe snapshots reales de uso,
- actualiza visualmente al instante,
- hace refresh posterior contra `/api/usage/current`,
- aplica fallback optimista si solo llega `featureKey` + `amount`.

### 4. Endpoints JSON también devuelven uso actualizado
Se añadió `usageUpdated`, `featureKey`, `amount` y `usage` a respuestas de:
- `/api/gemini/chat`
- `/api/gemini/images`
- `/api/gemini/tts`
- `/api/perplexity`

### 5. Perplexity e imágenes actualizan badge
`perplexityService.ts` y `generateImage()` ahora notifican al badge cuando el backend devuelve uso actualizado.

## Validación
- `npm run typecheck -- --pretty false`: OK
- `npm run build:server`: OK
