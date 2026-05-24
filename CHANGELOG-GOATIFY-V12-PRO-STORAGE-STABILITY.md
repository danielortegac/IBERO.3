# Goatify V12 — Pro Storage & Stability

## Objetivo
Ronda quirúrgica de mejora sobre V11 sin quitar módulos, botones ni cambiar la experiencia visual principal.

## Cambios principales

### 1. Servicio central de subida con cuota
Se agregó `services/storageQuotaService.ts` con:
- `uploadWithQuotaCheck()`
- `uploadStringWithQuotaCheck()`
- `safeStoragePath()`

Este servicio valida almacenamiento contra Cloud Run antes de subir, registra consumo y hace rollback si la subida falla.

### 2. Storage más seguro desde backend
Las subidas corregidas ahora usan `/api/usage/consume` y `/api/usage/release` para que el consumo de Drive no dependa solo de escrituras directas del cliente.

### 3. Módulos reforzados
Se migraron subidas sensibles a la nueva capa:
- Advanced Chat
- Quick AiChat
- Direct Messages
- Goatify Drive
- Web Programmer
- Smart POS
- Video Insights
- Profile avatar
- Article images
- AppContext: AI images, web files to project, custom stickers

### 4. Rollback de storage
Si una subida falla después de consumir espacio, la app revierte automáticamente el contador.

### 5. Límite backend de storage más realista
El endpoint `/api/usage/consume` ahora permite validar cargas grandes de storage hasta 2GB por operación en lugar de 250MB.

## Qué NO se tocó
- Cloud Run config visual
- Login principal
- Diseño general
- POS visual
- Mail visual
- Social Media Studio visual
- Presentaciones visual
- Chat avanzado UI/botones
- Política Pro/Premium de modelos
- Navegación general

## Validación
- TypeScript OK con `npx tsc --noEmit --pretty false --skipLibCheck`.
