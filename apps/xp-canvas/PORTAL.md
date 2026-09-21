# Portal de alumnos

Guía para administrar cuentas, probar y publicar el portal. El diseño técnico está en [ARCHITECTURE.md](../../ARCHITECTURE.md); la experiencia del pase y del perfil está en [ONBOARDING.md](ONBOARDING.md).

## Acceso y administración

El profesor da de alta alumnos con matrícula y nombre, individualmente o pegando hasta 100 líneas. Cada alumno puede pertenecer a un grupo. No hay registro público. No completes nombres o matrículas por suposición.

La matrícula es el usuario y la contraseña inicial. El primer acceso exige elegir una contraseña de entre 10 y 128 caracteres, distinta de la matrícula, y completar la bienvenida. Después, el alumno entra a Mis clases. Puede escribir la matrícula inicial en minúsculas; su contraseña personal sí distingue mayúsculas y minúsculas.

Conocer una matrícula permite usar la cuenta mientras conserve la contraseña inicial. La primera persona que la cambie puede quedarse con ella hasta que el profesor la restablezca. Este acceso no acredita identidad ni asistencia y no debe usarse para calificaciones o información sensible.

Desde el menú de cada canvas, Compartir con alumnos concede acceso a grupos o alumnos individuales. Dar de alta una cuenta no comparte canvases. Los alumnos solo pueden observar; la implementación de los permisos está en [Worker y persistencia](../../ARCHITECTURE.md#worker-y-persistencia).

El menú de cuenta del profesor incluye Alumnos y Papelera. Desde Alumnos puede cambiar el grupo, deshabilitar una cuenta o restablecer su contraseña a la matrícula. Restablecerla no borra su pase. Lo que una persona ya vio o descargó no puede retirarse de su dispositivo.

Profesor y alumno comparten la navegación de biblioteca. El menú del alumno contiene Mi perfil y Cerrar sesión. Dentro de un canvas, la flecha vuelve a la biblioteca; el espectador usa la mano para desplazarse y la rueda para ampliar. La exportación está en el menú de tldraw. Para duplicar canvases y administrar archivos, consulta el [README del editor](README.md).

El profesor ve los alumnos conectados en una única lista en la barra lateral derecha. Puede colapsarla y cada cuenta aparece una sola vez aunque tenga varias pestañas abiertas. Las herramientas de edición están a la izquierda tanto en escritorio como en iPad. El nombre mostrado en el canvas es el de la cuenta del alumno; el menú de participantes no permite cambiarlo. **Seguir a Leo** solo aparece para los espectadores. Los alumnos tienen un botón **Levantar la mano** que cambia a **Bajar la mano** mientras está activo. El profesor ve una mano junto a su nombre en la lista. Al cerrar la pestaña o salir del canvas se retira esa mano; si el alumno tiene varias pestañas, el indicador permanece mientras alguna de las conectadas tenga la mano levantada.

## Desarrollo y pruebas

Prepara una carpeta de QA nueva y no uses el estado del servidor de clases. Desde `apps/xp-canvas`:

```bash
export XP_CANVAS_STATE_PATH="$(mktemp -d /tmp/xp-canvas-portal-qa.XXXXXX)"
npx wrangler d1 migrations apply xp-canvas-portal --local --config wrangler.portal.toml --persist-to "$XP_CANVAS_STATE_PATH"
XP_PORTAL_QA=1 npm run dev:portal
```

Abre `http://127.0.0.1:5177`. El usuario ficticio es `leo` y la contraseña de QA es `qa-teacher-password-only-local`. No expongas este servidor a Internet ni uses sus credenciales con alumnos reales. Una carpeta en `/tmp` no es almacenamiento permanente ni un respaldo. Si el puerto está ocupado, elige otro y ajusta también `BASE_URL`.

Para desarrollo con credenciales propias, omite `XP_PORTAL_QA` y prepara `.dev.vars` según [.dev.vars.example](.dev.vars.example), sin sustituir valores existentes. Consulta la función de cada variable en [Cuentas y secretos](../../ARCHITECTURE.md#cuentas-y-secretos).

Desde la raíz del repositorio, con el servidor aislado disponible:

```bash
npm run typecheck:xp-canvas
npm run test:xp-canvas
BASE_URL=http://127.0.0.1:5177 npm run smoke:onboarding-api --workspace=apps/xp-canvas
BASE_URL=http://127.0.0.1:5177 npm run smoke:portal --workspace=apps/xp-canvas
npm run build:portal --workspace=apps/xp-canvas
```

Los smokes crean cuentas y documentos ficticios. Comprueban el acceso inicial, bienvenida, perfil, descarga, guardado, grupos, biblioteca y archivos privados, lectura en tiempo real, identidad, revocación, límites de intentos y origen de escrituras. No los ejecutes contra datos de clases. La revisión de interacción del pase está en [Verificación](ONBOARDING.md#verificación).

## Publicación y comprobaciones

Antes de publicar, revisa los [entornos](../../ARCHITECTURE.md#entornos-y-validación) y las [variables necesarias](../../ARCHITECTURE.md#cuentas-y-secretos). Para un despliegue manual autorizado, desde esta app:

```bash
npm test
npm run build:portal
npx wrangler deploy --dry-run --config dist/xp_canvas_portal/wrangler.json
npx wrangler deploy --config dist/xp_canvas_portal/wrangler.json
```

La función de puntos necesita `0003_points.sql`; el gachapon requiere además `0004_gachapon.sql` y `0005_gachapon_cost.sql` en el entorno de destino. Aplicarla en QA local no la aplica en producción; la migración remota requiere autorización específica y debe preceder al despliegue de esa función.

Antes del último comando, comprueba que los bindings del dry-run coincidan con los [recursos de producción](../../ARCHITECTURE.md#worker-y-persistencia) y revisa cualquier migración pendiente. No apliques migraciones remotas como efecto secundario de publicar código ni subas la carpeta `dist` completa.

Después de publicar, comprueba HTTPS sin omitir la validación del certificado, `/api/health`, `/api/portal/session`, el rechazo de `/api/library` sin sesión y el acceso con una cuenta autorizada. Abre también un canvas y sus archivos; un HTTP 200 de la portada no demuestra que los datos y permisos funcionen. Los cambios del portal no deben alterar DNS de otros servicios.

El smoke `scripts/portal-live-smoke.mjs` exige argumentos explícitos y un archivo de credenciales privado. Es una prueba con escrituras y requiere autorización para el entorno de destino. Crea una cuenta sintética y un canvas; al salir revoca sus permisos, deshabilita la cuenta y manda el canvas a la papelera. Conserva su registro de fixtures para una limpieza posterior. No lo uses con cuentas reales ni como comprobación rutinaria de solo lectura.

### Publicación desde Git

Cloudflare Workers Builds usa esta configuración en Settings > Builds:

- Worker existente `xp-canvas-portal`, repositorio `leosanxyz/leosanxyz`, rama `main`.
- Directorio de trabajo raíz del repositorio; instalación con `npm ci`.
- Build `npm run build:portal --workspace=apps/xp-canvas`.
- Deploy `npx wrangler deploy --config apps/xp-canvas/dist/xp_canvas_portal/wrangler.json`.
- Rutas vigiladas `apps/xp-canvas/*`, `package.json` y `package-lock.json`, además de cualquier futuro archivo compartido que lea el build.
- `VITE_TLDRAW_LICENSE_KEY` guardada como variable cifrada del build. `PORTAL_PASSWORD_PEPPER` permanece como secreto del Worker, no del build.
- Builds de ramas distintas de `main` desactivados mientras no tengan recursos separados.

Un push a `main` que coincida con esas rutas inicia el build y, si termina correctamente, el despliegue. Comprueba su resultado en Deployments; que el push termine no demuestra que el Worker ya se haya actualizado. Las migraciones de D1 y las transferencias de datos no forman parte de este proceso.

El criterio de separación entre despliegues está en [Publicación desde Git](../../ARCHITECTURE.md#publicación-desde-git).

## Transferencia de datos

`scripts/migrate-canvases.mjs` separa captura y aplicación. Guarda copias privadas, verifica hashes y permite retomar una transferencia si el contenido remoto coincide. Rechaza archivos o documentos distintos. Revisa y autoriza por separado el origen y el destino antes de aplicar una copia.

Copiar un canvas y sus archivos no copia las entradas ni las carpetas de la biblioteca global de recursos. Si necesitas esa biblioteca, trátala como una operación adicional con respaldo, comprobación de colisiones y hashes, sin sobrescribir archivos existentes. Consulta la [separación entre datos locales y remotos](../../ARCHITECTURE.md#worker-y-persistencia) antes de preparar la transferencia.
