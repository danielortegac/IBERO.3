# Goatify V7 — Free Site Publish Fix

## Cambio quirúrgico
Se corrigió la publicación de sitios web desde el Programador Web para que el plan gratis respete correctamente el cupo anunciado de **1 sitio publicado**.

## Problema corregido
Antes, la validación usaba `checkAndConsumeLimit(currentUser.uid, 'site_publish')` antes de crear el documento. Eso podía bloquear usuarios gratis por contadores `user_usage` desincronizados o inexistentes, aunque el plan dijera que tenían 1 sitio disponible.

## Solución aplicada
- La publicación ahora cuenta los sitios reales del usuario en `published_sites` antes de bloquear.
- El plan gratis puede publicar 1 sitio correctamente.
- Pro puede publicar 10 sitios.
- Premium puede publicar 30 sitios.
- Súper admin mantiene cupo masivo.
- Si el usuario republica/actualiza un sitio propio con el mismo slug, no consume otro cupo.
- Después de publicar, se sincroniza `user_usage.counters.current_published_sites` con el conteo real.
- Se muestra un mensaje claro cuando el usuario llega al límite.

## Archivos modificados
- `components/WebProgrammer.tsx`

## No se tocó
- Login
- Cloud Run
- Mail
- POS
- Social Media Studio
- Presentaciones
- Chat avanzado
- Calendario
- Política Pro/Premium de modelos IA
- Endpoints backend sensibles
