# Goatify V15 — Final Polish & Runtime Optimization

Esta versión parte de V14 Chill Mobile Pro y aplica una ronda final de hardening sin quitar módulos, botones ni flujos visuales existentes.

## Cambios principales

### 1. Créditos y user_usage más seguros
- `user_usage` queda cerrado para escritura directa del cliente en Firestore Rules.
- El cliente conserva lectura de su propio consumo.
- La escritura de consumo/release/sync/recalculate/entry pasa por Cloud Run con Firebase ID Token.
- `checkAndConsumeLimit`, `releaseLimit`, `syncUserUsage`, `recalculateUserStats` y `recordAppEntry` ahora usan endpoints backend.

### 2. Backend de uso ampliado
- `/api/usage/consume` y `/api/usage/release` aceptan todas las features oficiales del mapa de límites.
- El backend ahora cubre también: proyectos, tareas, formularios, agentes, CRM, meetings, live sessions, artículos y sitios publicados.
- Soporte de minutos fraccionarios para voz/video live.
- Extras de agentes se toman en cuenta en backend.

### 3. Recalculo real de estadísticas
- Nuevo `/api/usage/recalculate` para recalcular proyectos, tareas, agentes, formularios, sitios publicados y storage.
- Web Programmer usa recalculo backend después de publicar/actualizar sitios.

### 4. Agentes públicos y llamadas
- Se agregó consumo seguro del owner del agente por Cloud Run.
- Los agentes públicos ya no escriben directo en `user_usage` del owner.
- Las llamadas de agentes validan créditos de voz del owner por backend.
- La facturación de minutos de llamadas se hace por endpoints, no por escritura directa de Firestore.

### 5. Storage y limpieza
- Se verificó que las subidas directas activas a Firebase Storage queden centralizadas en `storageQuotaService`.
- Fuera del servicio central no quedan llamadas activas a `uploadBytes(...)`.

### 6. Validaciones
- TypeScript pasa sin errores con `npx tsc --noEmit --pretty false --skipLibCheck`.
- `npm run build:server` pasa correctamente.
- `node dist-server/server.js` levanta y `/api/health` responde OK.

## No se tocó
- Diseño visual general.
- Botones del chat avanzado.
- Mail visual.
- POS visual.
- Social Media Studio visual.
- Presentaciones visuales.
- Dashboard.
- Navegación principal.
- Política Pro/Premium de modelos.
- Cloud Run base.

## Nota
El build completo de Vite sigue siendo pesado por el tamaño total de la app, pero no mostró error de código antes del timeout del entorno de pruebas.
