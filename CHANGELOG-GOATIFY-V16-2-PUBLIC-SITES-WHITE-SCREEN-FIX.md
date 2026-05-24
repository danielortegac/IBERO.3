# Goatify V16.2 — Public Sites White Screen Fix

Corrección quirúrgica para Programador Web y sitios publicados.

## Fix principal
- `PublicSitePage` ahora prioriza `files[]` sobre `htmlCode` para proyectos multipágina publicados.
- Se reconstruye el sitio publicado desde `index.html` + CSS + JS del proyecto.
- Se mantiene menú automático para navegar entre páginas internas (`index.html`, `servicios.html`, `contacto.html`, etc.).
- Se interceptan enlaces internos dentro del sitio publicado para cambiar de página sin dejar el visor.

## Fix de pantalla en blanco
- El publicador ya no inserta footer HTML dentro de archivos `.css` o `.js`.
- El visor público limpia footers antiguos insertados por error en assets CSS/JS.
- Los proyectos antiguos afectados pueden requerir republicación para quedar 100% limpios, pero el visor ya intenta tolerarlos.

## Sin afectar
No se tocaron Dashboard, Mail, POS, Projects, Drive, Agents, Presentaciones, Gestor de Contenidos, Chill, Dockerfile ni variables.

## Validación
- `npm run typecheck` OK.
- `npm run build:server` OK.
