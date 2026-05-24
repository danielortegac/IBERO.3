# Goatify V17 - Production Hardening MJ

Base: V16 = V15 Cloud Run secure + Social Media Manager Pro + Campus QLASE.

## Cambios principales

1. CORS más seguro en producción
- `NODE_ENV=production` ya no deja CORS abierto si `ALLOWED_ORIGINS` está vacío.
- Se usan `APP_URL`, `FRONTEND_URL` y dominios oficiales de Goatify como fallback.

2. Headers de seguridad
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN`
- `Permissions-Policy` básico.

3. Rate limiting in-memory
- Límite general para `/api/*`.
- Límite específico para `/api/gemini` y `/api/ai`.
- Límite específico para endpoints públicos que disparan emails/notificaciones.

4. Rollback de créditos más seguro
- `/api/usage/consume` ahora devuelve `operationId`.
- `/api/usage/release` requiere `operationId` para evitar devoluciones arbitrarias desde consola.
- Se creó subcolección server-only `users/{uid}/usage_operations`.
- Los borrados reales de recursos usan `/api/usage/recalculate` en vez de rollback manual.
- Los rollbacks internos del servidor se mantienen compatibles para errores de IA.

5. Storage con reglas
- Se añadió `storage.rules`.
- Se añadió `firebase.json` para desplegar Firestore + Storage Rules.
- Se protegieron rutas con uid explícito.
- Las rutas legacy sin uid quedan autenticadas para no romper la app; pendiente migrarlas a rutas con ownerId/uid.

6. Endpoints públicos/email con protección gradual
- Se agregó rate limit a: scheduler confirm, project invite, task assign, wallet receipt, loyalty registration/processed, POS receipt y forms notify.
- Se agregó `PUBLIC_ACTION_SECRET` opcional para exigir HMAC en acciones públicas cuando el frontend esté preparado.

## Pendiente para V18

- Migrar Tailwind CDN/importmap a build local con Tailwind/PostCSS.
- Migrar rutas legacy de Storage a rutas con uid/ownerId explícito.
- Crear publicación real vía Meta API/OAuth para Social Media Manager.
- Agregar Brand Kit visual completo: logo, colores, tipografías, assets y restricciones de marca.
- Crear dashboard admin de costos IA, storage y endpoints más consumidos.
- Reemplazar alert/confirm nativos por modals/toasts premium.
