# Goatify V11 — Hardening & Performance

Versión enfocada en acercar Goatify a producción SaaS estable sin quitar funciones ni cambiar el flujo visual principal.

## Mejoras aplicadas

### Créditos y límites
- Se eliminó el doble consumo de `ai_grounding` en Advanced Chat y AiChat.
- La búsqueda web ahora solo previsualiza límite en frontend; Cloud Run descuenta el crédito real en `/api/perplexity`.
- Se agregó `services/usageService.ts` para consumir métricas de producto desde backend con Firebase ID Token.
- Se agregó `/api/usage/consume` y `/api/usage/release` en Cloud Run para contadores no-IA críticos.
- Social Media Studio ahora consume `social_post` por cantidad real de posts generados.
- Presentation Builder ahora previsualiza el límite y consume `presentation` desde backend al generar correctamente.

### Seguridad de llamadas
- Firestore Rules ahora permite a invitados leer llamadas y realizar acciones seguras.
- Los invitados solo pueden actualizar `waitingRoom` o aceptar invitación moviéndose de `invited` a `participants`.
- Campos críticos de una llamada quedan reservados para participantes/host/admin.

### Performance
- Se agregó lazy loading a módulos pesados del shell principal:
  - Dashboard
  - Projects
  - Global Calendar
  - Discovery
  - Hub
  - Wallet
  - Partners
  - AiStudio
  - Profile
  - Drive
  - Mail
  - Advanced Chat
  - AiChat
  - Live Conversation
  - Smart POS
- Esto reduce el bundle inicial y ayuda a que la app cargue más rápido.

## Validación
- `npx tsc --noEmit --pretty false --skipLibCheck` OK.
- `npm run build` inicia correctamente pero el entorno local se corta por timeout mientras Vite transforma el bundle grande.

## No tocado
- No se quitaron botones ni funciones del chat avanzado.
- No se tocó Cloud Run config.
- No se cambió login principal.
- No se tocó diseño global.
- No se eliminó ningún módulo.
