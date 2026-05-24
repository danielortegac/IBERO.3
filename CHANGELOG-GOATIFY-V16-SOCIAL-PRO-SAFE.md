# Goatify V16 Social Pro Safe Merge

Base: V16 uploaded build with V15 production hardening, Social Pro and Campus redirect.

## Ajustes realizados
- Se conserva la parte fuerte de Social Media/Gestor de Contenidos de la versión subida.
- Se mantiene Centro de Marca, YouTube, formatos visuales por red, prompts de imagen por formato, guiones de video, publicación asistida, filtros y calendario de contenidos.
- Se restauró drag & drop en el calendario social para mover posts entre días conservando hora y guardando en Firestore/socialCalendar.
- Se corrigió la fecha local del calendario social para evitar desfases por zona horaria.
- Se mantiene integración con campañas, calendario social global y notificaciones internas.
- No se modificó Cloud Run, login, POS, Mail, Drive, Chat avanzado, Chill ni la política Pro/Premium.

## Validación
- TypeScript check: OK con `npx tsc --noEmit --pretty false --skipLibCheck`.
