# Deploy Goatify IA en Cloud Run

Esta versión está preparada para subir a GitHub privado y desplegar en Cloud Run.

## 1. Subir a GitHub privado

1. Abre GitHub Desktop.
2. `File > Add local repository`.
3. Selecciona esta carpeta.
4. Si te pide crear repositorio, créalo.
5. Commit inicial.
6. `Publish repository`.
7. Marca `Keep this code private`.

No subas `.env` reales. Este ZIP ya incluye `.gitignore` reforzado.

## 2. Crear servicio en Cloud Run

1. Entra a Google Cloud Console.
2. Ve a Cloud Run.
3. Crea un servicio nuevo.
4. Conecta el repositorio privado de GitHub.
5. Usa Dockerfile.
6. Región sugerida: `us-central1`.
7. Memoria inicial sugerida: `1 GiB` o `2 GiB`.
8. CPU inicial sugerida: `1`.
9. Para app pública: activa `Allow unauthenticated invocations`.

## 3. Variables de entorno

Agrega las variables de `ENV-CLOUD-RUN-CHECKLIST.md` en:

`Cloud Run > Service > Edit & deploy new revision > Variables & Secrets`

La app ya usa `process.env.PORT || 3000`, por eso Cloud Run puede asignar el puerto correcto.

## 4. Pruebas después del deploy

Abre:

- `/api/health`
- `/api/version`
- `/api/health/gemini`

Si `/api/health/gemini` falla, revisa `GEMINI_API_KEY`, permisos, cuotas o modelo.

## 5. Notas importantes

- El frontend y backend viven juntos en Cloud Run.
- Netlify queda como opción futura para separar solo el frontend.
- Los endpoints de IA ahora esperan Firebase ID Token desde el frontend.
- El Live Proxy WebSocket ahora usa `?token=FIREBASE_ID_TOKEN`.
- El monitoreo automático de correos queda apagado por defecto para controlar costos. Actívalo con `ENABLE_MAIL_POLLING=true`.
