# Goatify V18 — Public Sites & Usage Counter Fix

## Correcciones críticas

### 1. Sitios publicados en blanco
- `WebProgrammer` ahora guarda también `htmlCode`, `homeFileName` y `pages` al publicar.
- `PublicSitePage` ahora puede renderizar sitios antiguos y nuevos:
  - si existe `htmlCode`, lo muestra;
  - si existe `files`, toma `index.html` o el primer archivo válido;
  - si no hay contenido, muestra un aviso claro en vez de pantalla blanca.
- Se agregó navegación multipágina dentro del iframe publicado para enlaces internos `.html`.

### 2. Créditos / uso IA congelado en 0
- El cálculo de tokens, costo y actividad IA ahora se registra desde Cloud Run con Admin SDK.
- El cliente ya no intenta escribir `user_usage` directamente para telemetry.
- Se agregó `/api/usage/current` para que los badges puedan refrescar uso real desde backend.
- `PlanCreditBadge` ahora escucha eventos de uso, foco de ventana y refresca periódicamente para evitar quedarse en 0.

### 3. Validación
- TypeScript OK.
- `build:server` OK.
- `/api/health` responde correctamente en modo production.

## No se tocó
- Diseño general.
- Chat avanzado limpio V17.
- Social Media Studio.
- POS.
- Mail.
- Cloud Run base.
- Política Pro/Premium.
