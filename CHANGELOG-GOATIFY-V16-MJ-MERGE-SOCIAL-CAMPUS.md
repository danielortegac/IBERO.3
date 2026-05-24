# Goatify V16 MJ Merge: V15 base + Social Media Pro + Campus Launcher

## Base
- Se conserva `goatify-cloudrun-secure-v15-final-polish-runtime` como base principal.
- No se alteran Dockerfile, Cloud Run runtime, server.ts, reglas de créditos, reglas de Firestore, storageQuotaService ni arquitectura crítica de producción.

## Campus
- Se agrega Campus al menú lateral como acceso directo a QLASE (`https://qlase.goatify.app/`).
- Se incluye una vista Campus limpia para acceso por hash `#/campus`, sin convertir Goatify en LMS interno.

## Social Media Manager
- Se porta el módulo Social Media Manager más avanzado desde la versión portal2-sin-lms-campus.
- Se agregan Centro de Marca, memoria de contenido, marcas guardadas, calendario editorial, filtros por marca/campaña/red/estado, YouTube, formatos visuales por plataforma y campos de video corto.
- Se mantiene la validación/consumo server-side de `social_post` de V15 mediante `/api/usage/consume`.

## Seguridad conservada
- Se conserva el hardening de V15: créditos en backend, Cloud Run compilado, storage controlado y reglas robustas.
