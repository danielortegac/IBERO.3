# Checklist de variables para Cloud Run

## Básicas

```env
NODE_ENV=production
APP_URL=https://TU-SERVICIO.run.app
FRONTEND_URL=https://TU-SERVICIO.run.app
ALLOWED_ORIGINS=https://TU-SERVICIO.run.app,https://goatify.app,https://www.goatify.app
API_JSON_LIMIT=200mb
```

## IA

```env
GEMINI_API_KEY=TU_CLAVE_REAL
PERPLEXITY_API_KEY=TU_CLAVE_REAL
IMAGEN_MODEL=imagen-4.0-generate-001
CHAT_FAST_MODEL=gemini-3.1-flash-lite-preview
```

También puedes usar `API_KEY` o `GOOGLE_API_KEY`, pero se recomienda `GEMINI_API_KEY`.

## Firebase Admin

```env
FIREBASE_PROJECT_ID=goatify-app-ia
FIREBASE_STORAGE_BUCKET=goatify-app-ia.firebasestorage.app
FIREBASE_SERVICE_ACCOUNT_JSON={...JSON completo...}
```

Pega el JSON completo en una sola variable. Si el private_key aparece con `\\n`, el backend ya lo corrige.

## Google / Microsoft OAuth

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
```

Recuerda configurar los redirect URI en Google/Microsoft usando la URL real del servicio.

## Push notifications

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VITE_VAPID_PUBLIC_KEY=
```

## Correos cifrados

```env
EMAIL_ENCRYPTION_KEY=UNA_FRASE_LARGA_UNICA_Y_SECRETA
```

No cambies esta clave después de guardar cuentas de correo, porque se usa para cifrar/descifrar.

## Control de costos

```env
ENABLE_MAIL_POLLING=false
MAIL_POLL_INTERVAL_MS=900000
ENABLE_NEWS_AUTOMATION=false
ALLOW_UNAUTHENTICATED_LIVE_PROXY=false
```

Recomendación inicial:

- `ENABLE_MAIL_POLLING=false` mientras pruebas.
- Activarlo solo cuando de verdad necesites monitoreo automático de correos.
- `ENABLE_NEWS_AUTOMATION=false` hasta confirmar que quieres envío automático diario.
