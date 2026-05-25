# Goatify V22 — Real Usage Counters Fix

## Problema corregido
La app podía responder con IA pero el contador visual seguía en 0 o no descontaba créditos correctamente.

La causa principal estaba en `server.ts`: varios writes a Firestore usaban claves con punto como `counters.daily_chat_count`, `counters.monthly_chat_count` y `counters.last_activity` dentro de `tx.set(..., { merge: true })`.

Eso podía guardar campos literales de primer nivel con esos nombres, en vez de actualizar el objeto real `usage.counters.daily_chat_count` que lee la UI.

Resultado: el backend parecía guardar uso, pero el badge seguía leyendo `usage.counters` en cero.

## Cambios aplicados
- Se agregó `normalizeUsageCounters()` en `server.ts` para leer contadores reales y también recuperar valores legacy guardados como campos con punto.
- Se corrigió `refreshUsageRollover()` para escribir dentro del objeto `counters` real.
- Se corrigió `consumeFeatureOrReject()` para incrementar `counters[feature.usageKey]` dentro del objeto real `counters`.
- Se corrigió `/api/usage/current` para devolver contadores normalizados.
- Se corrigió `/api/usage/sync` para no escribir claves con punto.
- Se corrigió `/api/usage/entry` para no escribir claves con punto.
- Se agregó fallback de UI en `PlanCreditBadge.tsx` para leer valores legacy si todavía existen en documentos antiguos.
- Se añadió `usageUpdated`, `featureKey`, `amount` y `usage` a respuestas importantes como `/api/ai/chat` y `/api/gemini/media`.
- Se actualizó `/api/version` a `goatify-v22-usage-counters-real`.
- Se actualizó el cache del service worker a `goatify-cache-v22-usage-counters-real`.

## Validación
- `npm run typecheck -- --pretty false`: OK
- `npm run build:server`: OK
- `npm run build`: OK

## Cómo verificar después de desplegar
1. Abrir `/api/version` y confirmar `buildId: goatify-v22-usage-counters-real`.
2. Entrar con un usuario real.
3. Ejecutar una acción de chat IA.
4. Revisar `/api/usage/current`.
5. Confirmar que `usage.counters.daily_chat_count` sube de 0 a 1.
6. Confirmar que el badge cambia visualmente, por ejemplo de `0 / 30` a `1 / 30`.

## Nota
Los campos antiguos tipo `counters.daily_chat_count` pueden quedar en Firestore como basura legacy, pero esta versión ya los ignora/normaliza. Se pueden limpiar luego con una migración puntual si se desea.
