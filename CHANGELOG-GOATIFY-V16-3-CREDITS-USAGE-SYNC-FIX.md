# Goatify V16.3 — Credits & Usage Sync Fix

## Objetivo
Corregir el bug donde las herramientas del chat y los créditos de IA seguían mostrando `0` aunque el usuario sí estuviera usando la IA.

## Problema detectado
- `/api/usage/sync` reiniciaba contadores a cero cada vez que el perfil se sincronizaba.
- `AppContext` llamaba `syncUserUsage()` en cada snapshot del perfil, lo que podía borrar el consumo recién registrado.
- El badge/panel podía quedarse en `0` mientras Firestore actualizaba o si el snapshot se demoraba.

## Cambios aplicados
- `/api/usage/sync` ahora solo asegura/crea el documento de uso y rellena campos faltantes.
- Ya no resetea contadores salvo cuando corresponde por ciclo diario o mensual.
- `AppContext` sincroniza uso solo cuando cambia el plan/estado de suscripción, no en cada actualización del perfil.
- `user_usage` se cachea localmente para que el badge no quede vacío si el snapshot tarda.
- `/api/version` actualizado a `goatify-v16-3-credits-usage-sync-fix`.

## Validación
- `npm run typecheck` pasó correctamente.
- `npm run build:server` pasó correctamente.

## Archivos tocados
- `server.ts`
- `context/AppContext.tsx`
