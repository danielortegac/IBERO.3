# Goatify AI Model Policy V2

Cambios aplicados sobre `goatify-cloudrun-secure-v1`.

## Regla principal

Gemini Pro solo puede usarse cuando el usuario cumple estas dos condiciones:

- `plan === "premium"`
- `subscriptionStatus === "active"`

Usuarios `free`, `pro`, `premium` en prueba (`trialing`) o `premium` cancelado (`canceled`) quedan automáticamente en modelos Lite/Flash.

## Archivos modificados

- `server.ts`
  - Agregado guardrail server-side para modelos IA.
  - Si el frontend intenta pedir `gemini-2.5-pro` o `gemini-3.1-pro-preview` sin Premium activo, el backend lo baja automáticamente a Lite/Flash.
  - Agregado límite server-side de `maxOutputTokens` por plan/módulo.
  - Cambiados defaults legacy `gemini-1.5-flash-latest` a política centralizada Lite/Flash.

- `services/subscriptionService.ts`
  - Centralizada la regla `isPaidPremiumPlan`.
  - `pickModel` ahora solo devuelve Gemini Pro para Premium activo.
  - Pro/Premium trial/cancelado usan Flash.

- `services/geminiService.ts`
  - Presentaciones avanzadas dejaron de pedir Pro hardcodeado.
  - Programador web dejó de pedir Pro hardcodeado.
  - Transcripción de audio dejó de pedir Pro hardcodeado.
  - Las llamadas al backend envían `module` para que el servidor aplique la política correcta.

- `components/WebProgrammer.tsx`
  - La UI ahora muestra correctamente si está usando Lite, Flash o Pro según plan y estado activo.

- `.env.example`
  - Agregadas variables `CHAT_STANDARD_MODEL` y `CHAT_PRO_MODEL`.

## Validación

- `npm run typecheck`: OK
- `npm run build`: OK

## Nota

Esto no cambia el diseño ni elimina módulos. Es una capa de control de costo/modelos para Cloud Run y Gemini.
