# Mapa para trabajar en leosanxyz

Este repositorio contiene el sitio personal de Leo y XP Canvas.

Si hace falta, lee [ARCHITECTURE.md](ARCHITECTURE.md) para entender cómo se conectan sus componentes. Mantén los cambios simples y limitados a lo que pide la tarea.

## Dónde buscar

| Trabajo | Punto de entrada |
| --- | --- |
| Sitio personal en Vercel | `src/app/`, `src/app/layout.tsx`, `src/app/globals.css` |
| Portada, arte, escritura y software | `src/app/page.tsx`, `src/app/arte/`, `src/app/escritura/`, `src/app/software/` |
| Componentes del sitio | `src/app/components/`, `src/hooks/`, `src/utils/`, `src/data/` |
| Textos, GIFs y archivos públicos | `content/`, `public/` |
| APIs del sitio | `src/app/api/posts/`, `src/app/api/arena/` |
| Rutas y acceso del portal | `apps/xp-canvas/client/App.tsx`, `client/portal/PortalProvider.tsx` |
| Biblioteca y canvas | `apps/xp-canvas/client/boards/`, `client/pages/Room.tsx` |
| Pencil, gestos y herramientas | `apps/xp-canvas/client/ipad/`, `client/pencil/`, `client/quickShape/` |
| Interfaz de recursos y emojis | `apps/xp-canvas/client/resources/`, `client/emojis/`, `shared/resourceShape.ts` |
| Perfil, bienvenida y pase | `apps/xp-canvas/client/portal/`, `client/portal/pass/` |
| Imágenes y sonidos del pase | `apps/xp-canvas/design/` |
| API y permisos del portal | `apps/xp-canvas/worker/worker.ts`, `worker/portal.ts`, `worker/portalAuth.ts` |
| Documentos colaborativos | `apps/xp-canvas/worker/TldrawDurableObject.ts` |
| Catálogo de canvases y carpetas | `apps/xp-canvas/worker/BoardCatalog.ts` |
| Archivos y biblioteca de recursos | `apps/xp-canvas/worker/assetUploads.ts`, `worker/resources.ts` |
| Tipos compartidos y esquema de usuarios | `apps/xp-canvas/shared/`, `apps/xp-canvas/migrations/` |
| Pruebas | Tests `*.test.ts` y `apps/xp-canvas/scripts/*smoke.mjs` |
| Publicación | `vercel.json`, `scripts/vercel-ignore.mjs`, `apps/xp-canvas/wrangler.portal.toml` |

Las rutas abreviadas de una celda pertenecen a la misma app. Antes de editar un módulo, revisa los archivos que importa y sus pruebas cercanas.

## Dónde documentar cada tema

| Documento | Responsabilidad |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Componentes, almacenamiento, permisos técnicos, contratos de datos, secretos y separación de entornos y despliegues. |
| [README del editor](apps/xp-canvas/README.md) | Uso del canvas, herramientas, desarrollo local y pruebas del editor. |
| [PORTAL.md](apps/xp-canvas/PORTAL.md) | Gestión de cuentas, entorno QA, pruebas del portal, publicación y transferencia de datos. |
| [ONBOARDING.md](apps/xp-canvas/ONBOARDING.md) | Experiencia del pase y perfil, interacción, sonido y criterios de revisión. |
| README de `design/` | Procedencia y condiciones de uso de imágenes y sonidos. |

Cada explicación tiene un documento responsable. En los demás, enlaza la sección; no copies su contenido. El README de la raíz es el perfil público de GitHub de Leo, no el manual del proyecto.

Para el sitio personal usa `npm run dev:site` y `npm run build:site`. Para el filtro de Vercel, `node --test scripts/vercel-ignore.test.mjs`. Los comandos del canvas están en los documentos de la tabla. El script heredado `npm run lint` usa `next lint`, no disponible en Next 16; no lo presentes como una comprobación que funciona.

## Límites que debes conservar

- Revisa `git status` antes de editar. Conserva cambios ajenos a la tarea y añade a Git solo rutas revisadas.
- Antes de tocar persistencia, acceso o despliegues, consulta [ARCHITECTURE.md](ARCHITECTURE.md). No debilites permisos para resolver una prueba o una publicación.
- No publiques secretos, sesiones, datos personales ni respaldos. Revisa tanto los archivos que añadirás a Git como los assets del build.
- No borres ni reutilices datos de clases para QA. Migraciones remotas, cambios de credenciales, DNS y limpiezas requieren autorización específica.
- Usa los procedimientos de prueba del entorno afectado. La emulación de Chromium no demuestra el comportamiento físico de Safari o Apple Pencil.
- Para trabajo con Tailscale, SSH, `leosan-linux` o `steamdeck`, usa la skill `manage-tailnet-hosts`, comprueba el estado actual y respeta los alias SSH.

## Flujo de cambios

`main` es la rama estable para ambas aplicaciones. Usa ramas cortas `codex/<cambio>` para las siguientes mejoras. Valida la app afectada; cuando cambien dependencias o configuración compartidas, valida ambas. Publicar, desplegar y migrar datos son acciones distintas: informa cuál se ha verificado realmente.

Mantén este mapa y `ARCHITECTURE.md` actualizados cuando cambien rutas, almacenamiento, comandos o publicación. Documenta el funcionamiento vigente; retira planes ya ejecutados, bitácoras de migración y resultados puntuales de pruebas. El historial de Git conserva ese contexto. Mantén las notas de compatibilidad mientras protejan datos existentes. No guardes aquí contraseñas ni inventarios personales.
