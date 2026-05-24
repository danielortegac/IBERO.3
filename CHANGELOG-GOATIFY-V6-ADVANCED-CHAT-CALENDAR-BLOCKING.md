# Goatify V6 — Advanced Chat UI + Calendar Drag Fix + Plan/Credits + User Blocking

Esta versión se construyó sobre `goatify-cloudrun-secure-v5-social-calendar-dragdrop` y mantiene intactos los módulos existentes. Los cambios son quirúrgicos y enfocados en experiencia, control operativo y seguridad social.

## 1. Chat avanzado más moderno

- Se rediseñó la superficie visual del chat avanzado con fondo premium, glassmorphism suave, header más limpio y contexto activo.
- Se mantuvieron los botones existentes: nuevo chat, asignar proyecto, borrar chat, pantalla compartida, pantalla completa, manual, adjuntar PC, adjuntar Drive, enviar, audio y video.
- Se agregó una franja de contexto activo con acceso rápido a proyecto, Drive, calendario y chats recientes.
- Se agregó panel inteligente lateral en desktop con accesos a proyectos, calendario, plan/créditos y memoria cruzada.
- Se agregó memoria contextual de chats recientes del mismo usuario dentro del prompt del chat avanzado, sin mezclar datos de otros usuarios.
- Se reforzó el manejo de archivos en el chat para respetar el espacio disponible del Drive por plan antes de adjuntar/subir archivos.

## 2. Plan, créditos y botón de subir visibles

- Se creó `components/PlanCreditBadge.tsx` como componente reutilizable.
- Se agregó estado de plan, créditos usados, créditos pendientes y botón de subir en:
  - Header global de la app.
  - Sidebar desktop.
  - Header del chat avanzado.
  - Panel inteligente del chat avanzado.
- El badge muestra IA diaria, Social mensual y uso de Drive.

## 3. Calendario global con drag & drop real

- Se corrigió el manejo de fechas para evitar desfases por zona horaria usando fecha local `YYYY-MM-DD`.
- El calendario mensual ahora actualiza tareas con persistencia real.
- La vista semanal también usa fecha local y arrastre seguro.
- Al mover una tarea conserva la hora original.
- Se agrega metadata `lastMovedAt` y `lastMovedBy` cuando aplica.
- Se agregó feedback con toast de tarea movida o error.
- Se evita que al soltar una tarea se dispare accidentalmente el modal de creación.
- Se agrega soporte para tareas personales en `users/{uid}/tasks` además de tareas de proyecto.

## 4. Bloqueo de usuarios

- Se agregó `blockedUsers` al perfil de usuario.
- Se añadieron funciones globales:
  - `blockUser`
  - `unblockUser`
  - `isUserBlocked`
- Al bloquear:
  - Se agrega el UID al campo `blockedUsers`.
  - Se remueve la conexión/círculo entre ambos usuarios.
  - Se impide enviar mensajes directos.
  - Se oculta el perfil completo si la otra persona bloqueó al usuario actual.
- Se agregó botón de Bloquear/Desbloquear en perfiles ajenos.
- El modal de mensaje directo muestra bloqueo de privacidad y deshabilita el envío cuando aplica.

## 5. Sin tocar lo delicado

No se modificó la configuración de Cloud Run, login, Mail, POS, política de modelos Pro/Premium, endpoints IA sensibles, Social Media Studio V4/V5, Presentations V3 ni los módulos no relacionados.

## Validación

- `npm run typecheck -- --pretty false`: OK sin errores TypeScript.
- `npm run build`: Vite inició correctamente y quedó transformando; en este entorno se cortó por timeout sin mostrar error de código antes del corte.
