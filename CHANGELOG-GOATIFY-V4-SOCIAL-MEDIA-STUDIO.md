# Goatify V4 — Social Media Studio

## Objetivo
Mejorar de forma considerable el módulo de Social Media sin afectar el resto de Goatify.

## Cambios aplicados

### Social Media Studio
- Se renombró visualmente el módulo desde Social Media Manager hacia Social Media Studio.
- Se rediseñó el módulo como un ecosistema de campañas, no solo como generador de posts.
- Se agregó memoria persistente de campañas por usuario en Firestore bajo `users/{uid}/socialCampaigns/{campaignId}`.
- Se mantiene caché local por usuario en localStorage para velocidad y respaldo si Firestore falla.

### Campañas guardadas
- Cada campaña guarda nombre, fecha, objetivo, oferta, redes, audiencia, industria, modo de campaña, duración, presupuesto, brand voice, universo de contenido y posts.
- Las campañas no se borran al recargar.
- Se pueden abrir, duplicar, archivar, exportar o eliminar definitivamente con confirmación.

### Calendario editorial
- Cada post puede calendarizarse con fecha, hora y recordatorio.
- Se agregó vista de publicaciones del día.
- Se muestra aviso cuando existen publicaciones para hoy.
- Cada post calendarizado permite copiar, abrir plataforma y marcar como publicado.

### Publicación asistida
- Instagram/Facebook abren Meta Business Suite.
- X abre el compositor con texto prellenado.
- LinkedIn abre el feed para publicar.
- TikTok abre la subida web.
- En todos los casos el copy se copia al portapapeles antes de abrir la plataforma.

### Prompt visual y video
- Cada post incluye prompt de foto profesional.
- Se agregó blueprint de video con hook, escenas, ritmo, texto en pantalla y CTA.
- Se puede copiar el prompt o generar imagen usando el generador existente.

### Pauta y Meta Business
- Se agregó bloque de pauta / Meta Business para objetivo, audiencia, presupuesto, testing y métricas.
- Se agregó guía interna de publicación, pauta y revisión de pantalla.

### Universo de Contenido
- No se usa el nombre NAS.
- Se agregó "Universo de Contenido", memoria estratégica del usuario para hooks, CTAs, objeciones, ofertas, links, testimonios y palabras de marca.
- Ese contexto se inyecta en futuras campañas.

### AI Prompt 2026
- Se reforzó `generateSocialContent` para generar contenido social más completo, por red, actualizado a 2026, con foco en campaña, pauta, video, foto, hooks, CTA, AB variants y calidad.

### Integridad
- No se tocó Cloud Run.
- No se tocó login.
- No se tocó Mail.
- No se tocó POS.
- No se tocó Projects salvo guardar posts como notas, que ya existía.
- No se tocó Drive.
- No se tocó la política de modelos V2/V3: Pro sigue reservado para Premium activo/pagado.

## Archivos modificados
- `components/SocialMediaManager.tsx`
- `components/AiStudio.tsx`
- `services/geminiService.ts`
- `types.ts`

## Validación
- `npm run typecheck -- --pretty false`: OK.
- `npm run build`: Vite inició transformación, pero el entorno de trabajo agotó tiempo antes de terminar. No arrojó error de código antes del corte.
