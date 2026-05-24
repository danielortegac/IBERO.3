# Goatify V10 — Final Stability Pass

Versión enfocada en estabilidad real sin eliminar botones, módulos ni estructura visual existente.

## Cambios principales

### 1. Créditos IA sin doble cobro
- Se agregó `canUseLimit()` en `services/subscriptionService.ts` para prevalidar límites sin consumir créditos.
- `checkQueryLimit`, `checkMediaLimit`, `checkWebSearchLimit`, `checkPresentationLimit`, `checkSocialPostLimit` y `checkShivoLimit` ahora solo previsualizan límites en frontend.
- El consumo real de IA queda en Cloud Run/backend para evitar que una misma acción cobre doble.
- `releaseMediaLimit()` queda sin efecto para IA porque ya no hay preconsumo frontend que revertir.

### 2. Llamadas y reuniones con invitados
- Firestore rules ahora permiten que usuarios en `invited` puedan leer/actualizar la reunión para entrar a sala de espera o aceptar invitación.
- Los mensajes internos de llamadas siguen limitados a participantes reales.

### 3. Bloqueo de usuarios más blindado
- Al bloquear usuario, además de `users/{uid}.blockedUsers`, se actualiza `conversations/{conversationId}.blockedBy`.
- Al desbloquear, se limpia `blockedBy` de la conversación.
- Las reglas de conversación revisan `blockedBy` para bloquear interacción a nivel Firestore.

### 4. Mensajes más rápidos
- Las conversaciones ahora usan `unreadBy` en el documento principal para evitar una consulta de mensajes no leídos por cada conversación.
- Al abrir un chat se limpia `unreadBy.{uid}` a 0.
- Al enviar mensaje se incrementa `unreadBy` del receptor.

### 5. Conservación total
- No se eliminaron módulos.
- No se quitó ningún botón del chat avanzado.
- No se tocó Cloud Run, POS, Mail visual, Social Media visual, Presentaciones visual ni política Pro/Premium.

## Validación
- `npx tsc --noEmit --pretty false --skipLibCheck` ejecutado sin errores.
