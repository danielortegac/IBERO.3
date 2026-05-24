# Goatify V5 — Social Calendar Drag & Drop

## Qué se corrigió

- El calendario editorial de Social Media Studio ahora tiene una grilla mensual real.
- Los posts calendarizados se pueden arrastrar y soltar entre días.
- Al mover un post se actualiza `scheduledAt` en la campaña guardada.
- Se conserva la hora original del post al cambiar de día.
- Se actualiza Firestore cuando el usuario está autenticado.
- Se actualiza cache local como respaldo.
- Se actualiza la campaña abierta en pantalla si corresponde.
- Se mantiene el botón manual “Calendarizar” para móvil o navegadores donde drag & drop sea limitado.

## Mejora adicional

- El calendario global de tareas ahora usa fecha local para evitar desfases por zona horaria al mover tareas.
- El drag & drop de tareas ahora envía metadata más clara (`itemType=task`) y evita abrir el modal de crear tarea al soltar.

## Qué NO se tocó

- No se tocó Cloud Run.
- No se tocó login.
- No se tocó Mail.
- No se tocó POS.
- No se tocó Dashboard.
- No se tocó Drive.
- No se tocó la política de modelos Pro/Premium.
- No se cambió el resto de módulos.
