# Goatify V18 — Brand Kit, Super Admin, Tailwind local y Storage owner paths

## Base
- Versión construida sobre `goatify-v17-production-hardening-social-campus-MJ`.
- Se mantiene la arquitectura de producción de V17: Cloud Run, servidor compilado, hardening, Campus hacia QLASE, Social Manager pro y reglas de uso/créditos.

## 1. Social Media Manager — Brand Kit visual real
- Se amplió el Centro de Marca hacia un Brand Kit Visual 360.
- Nuevos campos por marca:
  - Logo principal.
  - Portada / banner de marca.
  - Moodboard / referencia visual.
  - Color primario, secundario y acento.
  - Tipografía / jerarquía visual.
  - Reglas de layout.
  - Estilo de imágenes.
  - Estilo de plantillas.
  - Notas de assets.
  - Links de referencia.
  - Competencia / referencias.
  - Promesa de marca.
- Se agregó carga de assets visuales con `uploadWithQuotaCheck` usando rutas con `userId`.
- El contexto de marca que se envía a la IA ahora incluye paleta, tipografía, logo, moodboard, estilo visual, reglas de layout y promesa de marca.
- Se agregó vista previa visual de marca con colores y logo.

## 2. Tailwind/PostCSS local
- Se eliminó `cdn.tailwindcss.com` del `index.html` principal.
- Se eliminó el `importmap` del `index.html` principal.
- Se agregó `styles.css` con directivas locales:
  - `@tailwind base`
  - `@tailwind components`
  - `@tailwind utilities`
- Se agregó `tailwind.config.js` con la configuración visual previa del proyecto.
- Se agregó `postcss.config.js`.
- Se agregaron dependencias de desarrollo:
  - `tailwindcss`
  - `postcss`
  - `autoprefixer`
- Se actualizó `package-lock.json` con `npm install --package-lock-only --ignore-scripts`.

> Nota: se dejó pendiente la migración de plantillas HTML standalone generadas/exportadas que todavía usan Tailwind CDN como fallback visual, para no romper formularios públicos ni HTML generado por IA en esta versión.

## 3. Storage con userId / ownerId
- Se reforzó `storageQuotaService` con validación de owner path: toda subida con cuota debe contener el `userId` real en la ruta.
- Se migraron rutas legacy seguras hacia rutas con owner/user:
  - agent voices
  - agent flows
  - agent avatars
  - project documents
  - hub media
  - vouchers
  - avatars
  - project logos
  - generated project web files
  - Social Media Brand Kit assets
- Se eliminó el fallback `anonymous` en cargas detectadas.
- Se endureció `storage.rules` con rutas owner-based para:
  - drive
  - users
  - avatars
  - article-images
  - receipts
  - crm files/logos/docs
  - video uploads
  - web-dev images
  - ai-images
  - stickers
  - direct messages
  - hub posts/media
  - POS images
  - projects
  - project logos
  - agents
  - agent voices
  - vouchers
  - social-brands
- El fallback legacy de Storage queda restringido a superadmin para escritura.

## 4. Super Admin Dashboard full-screen
- Se rediseñó el panel Super Admin para abrir en pantalla completa.
- Nueva pestaña `Comando` como overview ejecutivo.
- Nuevas métricas globales:
  - usuarios totales
  - usuarios online
  - usuarios activos en 24h
  - usuarios Free / Pro / Premium
  - señal de MRR
  - costo IA estimado
  - usuarios de alto costo
  - storage total
  - imágenes IA
  - posts sociales
  - presentaciones
  - operaciones web
  - agent responses
  - grounding/web
  - minutos de video y voz
  - clientes CRM
  - reuniones
  - sitios publicados
  - proyectos y tareas
  - tokens de entrada/salida
  - Alter Ego activo/pausado
- Se agregó ranking de usuarios por consumo IA y Storage.
- Se agregó acción rápida para convertir usuarios a:
  - Free
  - Pro
  - Premium
- El botón actualiza `plan` y `subscriptionStatus` mediante `updateUserProfile`.

## 5. Revisión técnica
- Revisión estática de sintaxis con TypeScript transpile en archivos modificados:
  - `components/SocialMediaManager.tsx`
  - `components/Partners.tsx`
  - `services/storageQuotaService.ts`
  - `index.tsx`
  - `types.ts`
  - `components/AiAgent.tsx`
  - `components/ProjectInfoView.tsx`
- `npm install --package-lock-only --ignore-scripts` completó correctamente.
- No se ejecutó build final completo porque `npm ci` no completó dentro del entorno de trabajo.

## Pendiente recomendado para V19
- Migrar plantillas standalone/exportadas que aún tienen Tailwind CDN:
  - `components/FormBuilder.tsx`
  - `components/PublicFormPage.tsx`
  - HTML generado desde `services/geminiService.ts`
- Probar build completo en Cloud Run.
- Desplegar `storage.rules` en Firebase.
- Hacer smoke test de:
  - login
  - carga de assets del Brand Kit
  - generación de posts sociales
  - subida de archivos de proyecto
  - cambio de plan desde Super Admin
  - métricas del Super Admin Dashboard
