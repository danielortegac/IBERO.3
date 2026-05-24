# Goatify Cloud Run Secure V3 — Presentaciones + Super Admin + Alter Ego

## Cambios quirúrgicos realizados

### 1. Presentaciones cinemáticas Masterpiece
- Se reforzó `generatePresentationCode` para que el modo cinemático genere presentaciones más profesionales, lógicas y visualmente terminadas.
- Ahora exige JSON válido, número exacto de diapositivas, narrativa conectada, diseño premium, layouts variados, contraste alto y HTML renderizable por slide.
- Se corrigió búsqueda contextual para temas actuales, enlaces, mercado, tendencias, benchmark y referencias 2025/2026.
- Se mantiene la política de modelos: Pro solo para usuarios Premium activos/pagados; Pro y trial usan Flash/Lite según corresponda.

### 2. Panel Súper Admin mejorado
- Se agregaron métricas rápidas: online ahora, activos 24h, Alter Ego activos, Alter Ego pausados, Premium activos y costo API total.
- Se agregó filtro por estado: todos, online, activos 24h, con Alter Ego, Alter Ego pausado, Premium y alto costo API.
- Se añadieron columnas nuevas: actividad y Alter Ego.
- Cada usuario ahora puede desplegar una fila de detalle operativo con UID, último visto, plan, modelo IA permitido, ciclo, tokens, web ops, presentaciones, voz/video y estado del Alter Ego.

### 3. Control de Alter Ego desde Súper Admin
- Súper Admin puede pausar/reactivar Alter Ego por usuario.
- Pausar Alter Ego apaga `enabled` y guarda estado previo para poder restaurarlo.
- El perfil del usuario muestra aviso si su Alter Ego fue pausado por Súper Admin.
- El usuario no puede despertar manualmente su Alter Ego mientras esté pausado por Súper Admin.
- El motor autónomo `executeImmediateReflex` y `executeAutonomousPulse` ahora respetan `adminPaused` para evitar latidos y consumo de IA.

## Archivos modificados
- `services/geminiService.ts`
- `components/Partners.tsx`
- `components/Profile.tsx`
- `services/alterEgoService.ts`
- `types.ts`

## Validación
- `npm run typecheck -- --pretty false` OK.
- `npm run build` fue iniciado, pero el proceso de Vite se quedó transformando más tiempo del permitido por el entorno. No se detectaron errores TypeScript.
