# Goatify V8 — Ecosystem Credits & Stability Final

Versión enfocada en coherencia de planes, créditos, sitios publicados, estabilidad PWA y visibilidad de uso sin afectar módulos existentes.

## Cambios principales

### 1. Sitios publicados coherentes con planes
- `PublicSitePage` ya no exige Premium para mostrar sitios públicos.
- Respeta los cupos configurados: Free 1, Pro 10, Premium 30.
- Valida que el sitio esté activo.
- Valida dueño suspendido.
- Si un usuario excede su cupo tras downgrade, solo se muestran los sitios dentro del cupo actual.
- `WebProgrammer` ahora cuenta sitios activos, no sitios despublicados.

### 2. Motor de créditos más coherente
- Se completaron los resets mensuales con todos los contadores de `FEATURE_LIMIT_MAP`.
- Se completaron contadores faltantes al crear `user_usage`.
- Usuarios cancelados bajan a lógica efectiva Free en el control de límites.
- Se limpia costo/tokens al empezar nuevo ciclo mensual.
- `checkSocialPostLimit(amount)` ahora permite cobrar por cantidad real de posts.
- Social Media Studio consume según redes/posts esperados, no como si todo fuera un solo post.
- Web Search ahora consume `ai_grounding`, no `ai_chat`.
- Presentaciones ya no duplican consumo de chat en la prevalidación; el consumo de IA lo registra el motor IA.

### 3. Badge global de plan y créditos
- `PlanCreditBadge` ahora muestra: IA diaria, Social, Imágenes, Web ops, Presentaciones, Sitios y Drive.
- El botón `Subir` sigue visible.
- Se agregó badge compacto en AiStudio y versión móvil flotante global.

### 4. Storage y llamadas incorrectas
- Se corrigieron llamadas incorrectas a `checkAndConsumeLimit('storage', size)` en Hub y HubComponents.
- Ahora se manda uid, feature, amount y plan correctamente.

### 5. Seguridad de sesión Mail legacy
- `/api/auth/login` ahora exige Firebase ID Token real.
- Ya no acepta un `userId` arbitrario enviado desde el frontend.
- `/api/auth/identify` ya no crea sesiones arbitrarias si el token no existe.
- Goatify Mail manda el Firebase ID Token al crear/identificar sesión.

### 6. PWA / Service Worker
- Se dejó de precachear `/` e `index.html` para evitar builds viejos pegados después de deploy.
- Navegación usa network-first sin fallback obsoleto a index cacheado.

## Archivos modificados
- `services/subscriptionService.ts`
- `components/PublicSitePage.tsx`
- `components/WebProgrammer.tsx`
- `components/PlanCreditBadge.tsx`
- `components/AiStudio.tsx`
- `components/SocialMediaManager.tsx`
- `components/HubComponents.tsx`
- `components/Hub.tsx`
- `components/GoatifyMail.tsx`
- `context/AppContext.tsx`
- `types.ts`
- `server.ts`
- `sw.js`

## Validación
- `npm run typecheck -- --pretty false`: OK, sin errores TypeScript.
- `npm run build`: inició correctamente; en este entorno se cortó por timeout mientras Vite transformaba, sin mostrar error de código antes del corte.
