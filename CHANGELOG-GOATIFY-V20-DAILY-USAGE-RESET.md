# Goatify V20 — Daily Usage Reset Hardening

## Objetivo
Cerrar el comportamiento de créditos diarios por usuario para que los contadores se reinicien de forma confiable cada día y no dependan solo de UTC ni solo del primer consumo.

## Cambios
- El backend ahora calcula el día según zona horaria efectiva del usuario.
- La zona horaria se toma de `timezone`, `schedulingConfig.timezone` o país del perfil; si no existe, cae a UTC.
- `/api/usage/current` ahora aplica rollover diario/mensual antes de responder, para que el badge no muestre valores viejos.
- `/api/usage/sync` conserva contadores pero también aplica rollover seguro si corresponde.
- `/api/usage/entry` usa fecha local del usuario y ya no fecha UTC plana.
- `consumeFeatureOrReject` descuenta por usuario autenticado y resetea diario con fecha local antes de validar límites.
- `canUseLimit` del frontend usa la misma lógica de fecha local para previsualizar límites sin bloquear por desfase UTC.

## Garantía funcional
- Cada usuario consume en su propio documento `user_usage/{uid}` usando Firebase ID Token.
- Los créditos diarios se resetean por usuario cuando cruza su día local.
- Los contadores mensuales siguen respetando `billing_cycle_end`.
- No se tocaron diseño, chat, social, web programmer, POS ni navegación.
