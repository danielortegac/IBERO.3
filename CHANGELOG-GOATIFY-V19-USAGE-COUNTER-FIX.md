# Goatify V19 — Usage Counter Fix

## Corrección crítica
- `/api/usage/sync` ya no reinicia los contadores de créditos.
- Antes el listener de perfil llamaba `syncUserUsage()` y podía dejar `IA 0/30`, `Social 0/30`, etc. aunque el usuario sí usara IA.
- Ahora `sync` solo crea el documento si no existe, actualiza el plan y rellena campos faltantes sin pisar consumo existente.

## Badge de créditos
- El badge compacto ahora también muestra `Web`, que es el contador usado por Perplexity/búsqueda web.
- El chat avanzado y el chat rápido disparan refresh del badge al terminar una respuesta.

## Conservado
- No se cambió diseño general.
- No se tocaron módulos visuales.
- Se mantiene el Chat limpio V17, Social Pro y el fix de sitios públicos V18.
