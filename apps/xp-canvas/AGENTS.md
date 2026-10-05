# Mapa para trabajar en XP Canvas

Canvas tldraw con portal de alumnos, publicado como Cloudflare Worker en `xp.leosan.xyz`. Estas reglas se suman a las del [AGENTS.md de la raíz](../../AGENTS.md). La arquitectura, los datos y los permisos están en [ARCHITECTURE.md](../../ARCHITECTURE.md).

## Dónde buscar

Rutas relativas a `apps/xp-canvas/`.

| Trabajo | Punto de entrada |
| --- | --- |
| Rutas y acceso del portal | `client/App.tsx`, `client/portal/PortalProvider.tsx`, `client/access.ts` |
| Perfil, bienvenida y pase | `client/portal/`, `client/portal/pass/` |
| Biblioteca y canvas | `client/boards/`, `client/pages/Room.tsx` |
| Pencil, gestos y herramientas | `client/ipad/`, `client/pencil/`, `client/quickShape/`, `client/eraser/` |
| Recursos y emojis | `client/resources/`, `client/emojis/` |
| Preguntas interactivas | `client/questions/`, `worker/questions.ts` |
| Gachapon | `client/gachapon/` |
| Demo de Esquiva | `client/esquiva/` |
| Imágenes y sonidos | `design/` |
| Tipos y validadores compartidos | `shared/` |
| API, rutas y permisos | `worker/worker.ts`; un módulo por tema en `worker/` |
| Documento colaborativo | `worker/TldrawDurableObject.ts` |
| Catálogo de canvases y carpetas | `worker/BoardCatalog.ts` |
| Esquema de D1 | `migrations/` |
| Publicación | `wrangler.portal.toml`, `vite.portal.config.ts` |

Antes de editar un módulo, revisa los archivos que importa y su `*.test.ts` cercano.

## Validación

Desde la raíz del repositorio:

```bash
npm run typecheck:xp-canvas
npm run test:xp-canvas
npm run build:xp-canvas
```

Si el cambio afecta al portal, ejecuta también `npm run build:portal --workspace=apps/xp-canvas`. Los smokes de `scripts/*smoke.mjs` necesitan un servidor aislado. Consulta [Comandos](README.md#comandos) y [Desarrollo y pruebas del portal](PORTAL.md#desarrollo-y-pruebas) antes de ejecutarlos.

## Dónde documentar cada tema

| Documento | Responsabilidad |
| --- | --- |
| [README.md](README.md) | Uso del canvas, herramientas, desarrollo local y pruebas del editor. |
| [PORTAL.md](PORTAL.md) | Gestión de cuentas, entorno QA, pruebas del portal, publicación y transferencia de datos. |
| [ONBOARDING.md](ONBOARDING.md) | Experiencia del pase y perfil, interacción, sonido y criterios de revisión. |
| README de cada carpeta de `design/` | Procedencia y condiciones de uso de sus imágenes y sonidos. |

## Límites que debes conservar

- No borres ni reutilices datos de clases para QA. Usa una carpeta de estado aislada, como indica [PORTAL.md](PORTAL.md#desarrollo-y-pruebas).
- Migraciones remotas, cambios de credenciales, DNS, despliegues manuales y limpiezas requieren autorización específica.
- La emulación de Chromium no demuestra el comportamiento de Safari ni del Apple Pencil. Si el cambio afecta a Pencil, gestos o Safari, dilo y pide a Leo que lo pruebe en el iPad.
- Cualquier cambio en `apps/xp-canvas/` que llegue a `main`, incluidos los documentos, inicia un build y un despliegue en Cloudflare.
