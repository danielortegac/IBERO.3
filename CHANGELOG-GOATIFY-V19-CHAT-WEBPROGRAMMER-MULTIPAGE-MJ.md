# Goatify V19 — Chat Avanzado + Web Programmer Multi-página Premium — MJ

## Base
Versión construida sobre `goatify-v18-brand-admin-tailwind-storage-MJ`.

## Cambios principales

### 1. Chat Avanzado modernizado
- Nuevo estado vacío premium tipo Command Center.
- Burbujas de chat rediseñadas con glass, sombras, gradientes, bordes suaves y mejor legibilidad.
- Composer inferior más moderno, con blur, ring de foco, sombra premium y botones rápidos estilo pill.
- Header más elegante con icono degradado y mejor jerarquía visual.
- Fondo del chat más limpio y moderno, menos plano y menos “app vieja”.

### 2. Web Programmer: generación premium
- Se reforzó el prompt interno de `generateWebCodeStream` para que Shivo genere páginas más largas, comerciales y completas.
- Ahora pide explícitamente estructura premium: hero, beneficios, proceso, servicios/oferta, prueba social, métricas, FAQ y CTA final cuando corresponda.
- Se agregaron chips rápidos: `Web Premium Larga` y `Multi-página Pro`.
- Placeholder actualizado para orientar al usuario hacia webs premium, nuevas pestañas y publicación multi-página.

### 3. Web Programmer: publicación multi-página real
- El publish ahora guarda metadata adicional:
  - `entryFile`
  - `pageNames`
  - `navigationMode: goatify-multipage-v19`
  - `htmlCode` compatible legacy
  - `files` con navegación inyectada
- Al publicar, cada archivo HTML recibe navegación superior premium con todas las páginas del proyecto.
- La vista previa interna intercepta clicks entre páginas HTML y cambia de pestaña dentro del editor.
- La descarga ZIP también incluye navegación inyectada para que los archivos funcionen conectados.

### 4. PublicSitePage robusto para multi-página
- `PublicSitePage` ahora entiende `files[]`, no depende solo de `htmlCode` legacy.
- Carga `index.html` o `entryFile` como página inicial.
- Intercepta mensajes `GOATIFY_PUBLIC_SITE_NAVIGATE` desde el iframe.
- Cambia de página dentro del sitio publicado sin salir del enlace público.
- Reinyecta menú premium superior y mantiene la pestaña activa marcada.

## Archivos modificados
- `components/AdvancedChat.tsx`
- `components/WebProgrammer.tsx`
- `components/PublicSitePage.tsx`
- `services/geminiService.ts`

## Notas de verificación
- Se hizo revisión estática con TypeScript global. No aparecieron errores de sintaxis en los cambios nuevos; los errores reportados fueron por dependencias/tipos no instalados en este entorno (`react`, `firebase`, etc.).
- No se ejecutó `npm ci` ni build completo en este entorno por falta de `node_modules`/tiempo de instalación.

## Pendiente recomendado para V20
- Probar publicación multi-página real en Cloud Run con 2–4 páginas: `index.html`, `servicios.html`, `contacto.html`.
- Probar navegación en móvil dentro del iframe público.
- Separar el sistema de navegación inyectada en una utilidad compartida para evitar duplicación entre Web Programmer y PublicSitePage.
- Agregar opción “usar menú generado por el usuario” vs “inyectar menú Goatify premium”.
- Agregar deploy con assets reales externos si más adelante se guardan CSS/JS/imagenes como archivos separados.
