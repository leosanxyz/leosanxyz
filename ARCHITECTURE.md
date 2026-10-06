# Arquitectura de leosanxyz

## Dos aplicaciones, un repositorio

El sitio personal y XP Canvas comparten un workspace de npm y su archivo de dependencias bloqueadas. Tienen frontend, servidor, almacenamiento y despliegue propios. No hay una API común entre ellos ni se necesita mover el sitio a otra carpeta para publicarlos por separado.

```text
leosan.xyz / www.leosan.xyz
  Vercel: Next.js en src/app/
    contenido en content/, archivos en public/, API de Are.na

xp.leosan.xyz
  Cloudflare Worker xp-canvas-portal
    frontend React + Vite + tldraw
    API HTTP y acceso a WebSockets
      D1: cuentas, grupos, sesiones, permisos y pases
      Durable Objects: documentos y catálogo
      R2 privado: archivos, recursos y miniaturas
```

Porkbun es el registrador. Cloudflare administra el DNS del dominio. El sitio personal está en Vercel; cambiar la aplicación del portal no requiere cambiar sus registros DNS. La dirección `xp-canvas-portal.leosanxyz.workers.dev` llega al mismo portal y a los mismos datos que `xp.leosan.xyz`, pero sus cookies de sesión son independientes por hostname.

La ruta de `xp.leosan.xyz` se declara como Custom Domain en `apps/xp-canvas/wrangler.portal.toml`. Las comprobaciones posteriores a cambios están en [Publicación y comprobaciones](apps/xp-canvas/PORTAL.md#publicación-y-comprobaciones).

## Sitio personal

Next.js 16 usa App Router y React 19. La raíz contiene su `package.json`, `next.config.ts` y `tsconfig.json`. Las páginas están en `src/app/`; el layout y los estilos globales viven junto a ellas. Los componentes incluyen navegación, libros, animaciones y las piezas interactivas de la portada.

Las rutas públicas son `/`, `/arte`, `/escritura` y `/software`; `/test-screensaver` es una página de prueba. `/api/posts` y `/api/posts/[slug]` leen Markdown de `content/blog/` y usan GIFs de `content/gifs/` para las animaciones ASCII. `/api/arena` consulta Are.na desde el servidor. Su token opcional `ARENA_ACCESS_TOKEN` pertenece al entorno de Vercel, nunca al cliente ni al portal.

## Frontend del portal

`apps/xp-canvas/client/App.tsx` selecciona las pantallas mediante el pathname. `PortalProvider` resuelve sesión y rol; `PassGate` conduce al cambio inicial de contraseña y la bienvenida antes de abrir las clases.

| Ruta | Pantalla |
| --- | --- |
| `/` | Biblioteca del profesor o clases autorizadas del alumno |
| `/board/<id>` | Documento tldraw colaborativo |
| `/alumnos` | Administración del profesor |
| `/perfil` | Cuenta, contraseña y pase |
| `/tienda` | Tienda de cartas del alumno; el profesor la ve sin comprar |
| `/mi-pase` | Acceso anterior al editor del pase |
| `/bienvenida` | Repetición de la bienvenida del alumno |
| `/bienvenida/demo`, `/bienvenida/revision` | Herramientas de desarrollo, excluidas del build de producción |

El editor usa tldraw 5.4.0 y `@tldraw/sync`. Los tipos compartidos están en `shared/`. Los documentos se validan también en el servidor; esconder un botón no concede ni revoca permisos. La experiencia del pase y del perfil se describe en [ONBOARDING.md](apps/xp-canvas/ONBOARDING.md).

Vite empaqueta las imágenes y sonidos de `design/`. La procedencia de esos archivos está en sus README, no en el esquema de almacenamiento del portal.

## Worker y persistencia

`worker/worker.ts` registra las rutas con itty-router. Cloudflare entrega los assets de la SPA y ejecuta primero el Worker para `/api/*`. `portalGate` comprueba la sesión, el cambio obligatorio de contraseña, el pase completo y el acceso al documento antes de servir datos protegidos.

| Componente | Datos y responsabilidad |
| --- | --- |
| D1 `xp-canvas-portal` | Usuarios, grupos, hashes de sesión, permisos y pases. Esquema en `migrations/`. |
| `TldrawDurableObject` | Un objeto por identificador de canvas; SQLite y `TLSocketRoom` conservan y sincronizan el documento por WebSocket. |
| `BoardCatalog` | Metadatos de canvases, carpetas, papelera y organización de recursos. |
| R2 `xp-canvas-portal-assets` | Archivos originales, metadatos de recursos y miniaturas. El bucket no es público. |

Conserva los nombres e identificadores de estos recursos y las migraciones de Durable Objects. Cambiarlos puede apuntar a datos nuevos o dejar los existentes inaccesibles.

La biblioteca no almacena el documento de cada canvas. Duplicar crea otro documento y reutiliza archivos; no hereda permisos. Importar crea un canvas nuevo y no reemplaza uno existente. Mandar un canvas a la papelera corta su acceso; restaurarlo conserva los permisos que tenía.

Los datos locales y remotos son independientes. Las transferencias son copias puntuales, no una sincronización continua. El procedimiento está en [Transferencia de datos](apps/xp-canvas/PORTAL.md#transferencia-de-datos).

Los alumnos acceden a canvases concedidos individualmente o a su grupo y su conexión tldraw permanece en modo lectura. Las respuestas a preguntas usan la API restringida que se describe abajo. La biblioteca filtrada devuelve únicamente esos canvases y sus carpetas antecesoras, sin revelar carpetas privadas o vacías. Ver una carpeta no concede acceso a todo su contenido. El profesor administra la biblioteca global.

Los archivos se autorizan por sus referencias en documentos permitidos, antes de responder a GET, HEAD, Range o solicitudes condicionales. El navegador aporta el canvas de origen para acotar la consulta; sin esa pista se revisan los canvases concedidos. Esta búsqueda consulta los Durable Objects. Antes de ampliar el volumen de grupos y archivos, conviene medirla e indexar las referencias si hace falta. Las respuestas del portal usan `private, no-store` y no consultan ni llenan la caché pública del editor local.

El Worker fija el rol y la identidad del WebSocket. No acepta encabezados internos ni nombres del cliente como prueba de identidad. `TldrawDurableObject` impide escrituras del alumno y revalida conexiones al retirar permisos, cambiar una cuenta, restablecer su contraseña o cerrar sesión. Mandar un canvas a la papelera también revalida sus conexiones; renombrarlo, moverlo o actualizar su miniatura no, porque no cambia quién puede leerlo. Cada revalidación lee el canvas una vez y comprueba las sesiones en paralelo. Una alarma cada minuto respalda la revocación inmediata ante fallos; no garantiza un plazo exacto de ejecución. Los cambios de cuenta invalidan las sesiones para evitar nombres o grupos desactualizados.

Las conexiones de solo lectura no guardan el registro `user:` de tldraw en el documento. El servidor descartaría esa escritura y tldraw la repetiría sin pausa, así que la identidad del espectador viaja únicamente en su presencia.

La mano levantada viaja como `meta.handRaised` en la presencia de tldraw, vinculada a la identidad autenticada del WebSocket. El estado nace en los metadatos locales de la instancia y no forma parte del documento ni de su historial. La sidebar compartida por profesor y alumnos reúne las sesiones de cada alumno, incluye al propio alumno que la consulta y muestra la mano si cualquiera de ellas la tiene levantada.

Las preguntas son shapes `question`, con validadores compartidos entre cliente y servidor en `shared/questionShape.ts`. El documento conserva el enunciado, cuatro opciones, el índice correcto, las opciones elegidas, el premio en puntos y una revisión. La migración compartida añade un premio de 100 a las preguntas anteriores sin conceder puntos por respuestas pasadas. Clientes anteriores a esta versión deben recargar; no se degrada el esquema eliminando el premio. La clave correcta forma parte del documento compartido; esta actividad de clase no oculta la clave frente a quien inspeccione los datos del navegador. Editar o reiniciar una pregunta cambia su revisión y borra las opciones elegidas.

`GET/POST /api/boards/:boardId/interactions` vuelve a comprobar la sesión y el acceso al canvas dentro del Durable Object. Solo el profesor puede dar o retirar permiso. `question_permissions`, una tabla SQLite del propio objeto, conserva el permiso por alumno y canvas hasta que el profesor lo retire, también al recargar o reconectar. Esa tabla no forma parte del snapshot del documento y no se hereda al copiar o importar. Los cambios de permiso llegan por mensajes personalizados del WebSocket; al conectar, el cliente consulta su estado actual y se actualizan los demás clientes. Los alumnos ven también los permisos de sus compañeros conectados. Solo el profesor recibe permisos de alumnos desconectados y puede modificarlos.

Con permiso, un alumno puede enviar únicamente el identificador de la pregunta, su revisión y el índice elegido. El servidor rechaza preguntas inexistentes, revisiones antiguas y opciones ya elegidas. Añade la opción al documento mediante una transacción y tldraw sincroniza el resultado. Tras aceptar la respuesta, el servidor emite un mensaje efímero `question-result` con un identificador único a los clientes conectados. Ese evento activa el rebote o la celebración; no se guarda en el documento ni se reproduce al reconectar. Esta API nunca cambia el rol de lectura del WebSocket ni acepta cambios arbitrarios del documento. La retirada del acceso al canvas o de la sesión impide también responder, aunque exista un permiso de interacción.


La acción `draw` de la misma API está reservada al profesor. El servidor reúne alumnos conectados por identidad, sin duplicar pestañas, elige uno al azar y difunde un evento `student-draw` con participantes, ganador e instante de inicio. Todos recorren la misma secuencia y reproducen pulsos cada vez más espaciados. Con movimiento reducido solo se marca el resultado final. El sorteo no concede permiso de interacción. La tabla local `student_draw` conserva únicamente el plazo de bloqueo para impedir sorteos simultáneos incluso tras hibernar; participantes y resultado son efímeros y no se reproducen al reconectar.

El Worker transmite las cargas por streaming y valida permisos, tamaño, tipo MIME y cabecera binaria. Los documentos se descargan con `nosniff` y una política que impide ejecutar su contenido. Las descargas admiten rangos, ETag y solicitudes condicionales; el uso de caché depende del modo de acceso.

## Puntos de los alumnos

Cada alumno parte de cero. La migración D1 `0003_points.sql` crea `point_awards`, un registro de premios del servidor; el saldo es la suma de premios menos el costo de las tiradas de gachapon y de las compras de la tienda del usuario. Ningún cliente puede enviar un saldo ni concederse premios. Las respuestas correctas a preguntas generan premios de entre 0 y 1 000 000 puntos enteros, con 100 por defecto. La [tienda](#tienda) también premia girar las cartas del día y el regalo diario. El sistema de premios está separado del documento para poder usarlo en otras actividades.

Una respuesta correcta guarda su cambio en el documento, una reserva única en `point_receipts` y un premio pendiente en `point_outbox` dentro de la misma transacción SQLite del Durable Object. La celebración se emite al aceptar esa transacción; el premio se escribe en D1 en segundo plano. Su clave única reúne actividad, canvas, shape y revisión; reintentos, solicitudes simultáneas o deshacer una respuesta no duplican el premio. Reiniciar o editar la pregunta crea otra revisión y permite premiarla de nuevo. Si D1 falla, una alarma vuelve a intentar los premios pendientes incluso sin alumnos conectados. Los premios no se revierten al borrar preguntas, borrar canvases o editar documentos. Copiar o importar un canvas no copia saldos.

`GET /api/portal/points` usa exclusivamente la identidad de la sesión. El alumno consulta su total al abrir Mi perfil; no se incluye en su sesión general, presencia, sidebar ni documento compartido. El profesor recibe los totales mediante el roster privado y los ve en Alumnos. Tras reservar un premio, el evento `question-result` incluye únicamente los puntos ganados para mostrar `+puntos` sobre la pregunta a los presentes. No incluye el total del usuario. Los reintentos de guardado nunca repiten la celebración ni muestran avisos de guardado en el canvas. Las reservas también se recuperan de premios anteriores de D1 para conservar la protección frente a deshacer una respuesta.

## Gachapon y tarjetas desbloqueadas

La shape `gachapon` conserva la selección de premios, los alumnos habilitados, el costo en puntos, los participantes de la ronda y su revisión. Los validadores y la migración de costo están en `shared/gachaponShape.ts`; la interfaz, en `client/gachapon/`. Las máquinas anteriores sin costo se migran a gratis. Guardar ajustes conserva la ronda; solo Reiniciar tiradas cambia su revisión. La configuración muestra alumnos activos de los grupos o permisos individuales que tienen acceso al canvas.

La acción `gachapon` de la API de interacciones exige sesión de alumno, acceso vigente al canvas, permiso global de interacción y habilitación en la máquina. La interfaz exige además la herramienta Cursor. El servidor comprueba la revisión y el costo que vio el cliente, elige una tarjeta del catálogo configurado y rechaza tiradas repetidas. Un cambio de precio exige revisar el nuevo costo antes de reintentar. Los WebSockets de alumnos siguen siendo de lectura.

`0004_gachapon.sql` crea `gachapon_spins` y `0005_gachapon_cost.sql` añade el costo, con 0 para las tiradas anteriores. Una fila registra a la vez la tirada, el desbloqueo y el gasto. Su clave única reúne canvas, shape, revisión y alumno. El INSERT condicional comprueba el saldo dentro de la misma sentencia D1, por lo que intentos simultáneos, incluso desde máquinas o canvases distintos, no pueden gastar dos veces el mismo saldo ni cobrar sin registrar el premio. Un rechazo por saldo insuficiente no consume la tirada. El saldo del perfil y del roster descuenta estos costos.

Las tarjetas configuradas tienen la misma probabilidad y pueden repetirse; una repetida conserva un único desbloqueo y cobra el costo de esa tirada. Borrar la máquina, editarla o deshacer el documento no revierte premios ni gastos. La tabla local `gachapon_busy` impide otra tirada en la misma máquina durante la revelación. Tras guardar el premio se difunde `gachapon-result` con alumno, tarjeta e instante de inicio, sin saldo. La respuesta HTTP permite al participante recibir también su resultado; el cliente evita duplicarlo. La animación es efímera y no se reproduce al reconectar.

`GET /api/portal/pass` devuelve las tarjetas ganadas únicamente para la identidad de la sesión, ordenadas por su primer desbloqueo, de la más reciente a la más antigua. `PUT` rechaza equipar una tarjeta de recompensa sin una tirada registrada para ese alumno. El carrusel muestra primero las tarjetas desbloqueadas en ese orden y después las portadas anteriores. El selector del gachapon separa las recompensas en dos sets y permite combinarlas. Las nueve ilustraciones del set 2 tienen máscaras para aplicar el holograma al personaje o al fondo; las seis del set 1 conservan el holograma de tarjeta completa. Su procedencia está en [design/gachapon](apps/xp-canvas/design/gachapon/README.md).

## Tienda

`/tienda` vende las tarjetas de recompensa a cambio de puntos. Cada día, en la hora de Ciudad de México, `shopPool` en `shared/shop.ts` elige seis de las quince tarjetas a partir de la fecha. Cliente y Worker calculan la misma selección; no se guarda en ninguna tabla. México no tiene horario de verano desde 2022, así que la rotación ocurre cada 24 horas a medianoche.

Una tirada cuesta 150 puntos y una compra directa, 300. La tirada elige al azar entre las tarjetas del día que el alumno aún no tiene; si ya las tiene todas, la máquina se desactiva. Solo se compran tarjetas del día que no se tengan. Las adquisiciones son filas de `gachapon_spins`, igual que los premios de la máquina del canvas, así que desbloquean la tarjeta en el pase y descuentan el saldo del perfil y del roster sin otra tabla. Sus claves son `["shop-spin", alumno, tirada]`, `["shop-free", alumno, día]` y `["shop-card", alumno, tarjeta]`. El cliente genera el identificador de cada tirada: repetir la misma solicitud no cobra dos veces. El INSERT condicional comprueba el saldo y que el alumno no tenga ya esa tarjeta en la misma sentencia D1, por lo que solicitudes simultáneas no pueden gastar de más ni pagar dos veces la misma tarjeta.

Las seis cartas del día llegan boca abajo. Girar una paga 5 puntos: `POST /api/portal/shop/reveal` guarda en `point_awards` un premio de tipo `shop-reveal` con la clave `["shop-reveal", alumno, día, tarjeta]`, así que un doble toque o un reintento pagan una sola vez. El Worker solo acepta tarjetas del día y deduce las cartas giradas de esas mismas filas. El profesor ve todas las cartas boca arriba.

El regalo diario paga 25 puntos, o 50 desde el quinto día seguido y mientras dure la racha. `POST /api/portal/shop/gift` guarda un premio de tipo `shop-gift` con la clave `["shop-gift", alumno, día]` y el monto que calcula el Worker; reclamarlo otra vez el mismo día devuelve 409. La racha se deriva de los últimos 40 premios `shop-gift` del alumno: cuenta los días seguidos con regalo que terminan hoy o ayer (`giftStreak` en `shared/shop.ts`). No hay tabla ni migración para esto: `activity_kind` ya admite cualquier tipo.

La tirada gratis se gana una vez al día respondiendo bien tres preguntas de repaso, con hasta tres intentos. `0006_shop.sql` crea `shop_reviews`: cada intento guarda el día, las preguntas elegidas con su respuesta correcta, las respuestas del alumno y si aprobó. El estado de la tirada gratis se deriva de esas filas y de la clave `shop-free` del día. Para preparar un intento, el Worker pide a los Durable Objects de hasta 40 canvases concedidos y fuera de la papelera sus shapes `question` mediante `listQuestions()`, quita las repetidas por enunciado y elige tres al azar. El alumno recibe enunciados y opciones sin la clave; tras calificar, la respuesta muestra la opción correcta, que ya forma parte del documento compartido. Un intento sin terminar se conserva al recargar. La calificación solo se acepta una vez por intento.

`GET /api/portal/shop` no consulta Durable Objects. Las escrituras exigen una sesión de alumno con la bienvenida terminada; el profesor solo puede leer el catálogo del día. El punto de novedades de la barra lateral se calcula en el navegador: `localStorage` guarda por cuenta el último día en que el alumno abrió la tienda. No hay estado del servidor para ese aviso.

## Cuentas y secretos

El flujo de alta, acceso inicial y gestión del profesor está en [PORTAL.md](apps/xp-canvas/PORTAL.md#acceso-y-administración). Las matrículas se conservan como texto y se normalizan a mayúsculas, incluidos los ceros iniciales. Solo la contraseña inicial sigue esa normalización; la personal distingue mayúsculas y minúsculas.

Las contraseñas personales usan scrypt con sal aleatoria, N=16384, r=8 y p=5, seguido de HMAC con `PORTAL_PASSWORD_PEPPER`. La implementación usa 16 MiB y `node:crypto` nativo de Workers. Si cambian esos parámetros o el entorno, mide su coste en el Worker de destino; no lo reduzcas silenciosamente para encajar en una cuota de CPU.

Las sesiones del portal duran siete días. D1 guarda el hash de un token aleatorio y el navegador recibe una cookie HttpOnly, SameSite=Strict y Secure en HTTPS. Los intentos de login y cambio de contraseña tienen límites persistentes por cuenta y por IP; no son protección completa contra una denegación de servicio distribuida. La aplicación no registra secretos, contraseñas ni tokens en sus logs.

| Variable | Uso y conservación |
| --- | --- |
| `VITE_TLDRAW_LICENSE_KEY` | Clave de licencia incluida en el frontend, disponible durante el build y válida para el hostname final. En desarrollo puede estar en `.env.local`. No es una contraseña ni un secreto del Worker. |
| `PORTAL_PASSWORD_PEPPER` | Secreto remoto, fuera de D1 y de Git. Conservarlo y respaldarlo de forma privada; cambiarlo sin una migración invalida las contraseñas existentes. |
| `PORTAL_BOOTSTRAP_PASSWORD` | Crea al profesor únicamente en una base nueva. Está retirado de producción y no se necesita para desplegar código ni permite restablecer una cuenta existente. |
| `EDITOR_CODE`, `EDITOR_SESSION_SECRET` | Acceso opcional del editor local. No permiten entrar al portal. |

En el editor local, `EDITOR_AUTH_REQUIRED = "false"` permite edición abierta. Si falta esa variable o vale `"true"`, se exige el código. El Worker comprueba el origen de escrituras y WebSockets incluso en modo abierto. Con contraseña crea una cookie firmada HttpOnly y SameSite=Strict, válida por doce horas; no guarda credenciales en la URL ni en localStorage. El servidor fija el rol del WebSocket e impide que un espectador se convierta en editor.

Git contiene código, migraciones y plantillas. Las cuentas reales, sesiones, saludos, bases y respaldos pertenecen a almacenamiento privado. Los identificadores de recursos de `wrangler.portal.toml` no son credenciales, pero determinan qué datos usa el Worker.

## Persistencia del pase

La migración `0002_passes.sql` añade `student_passes`. Guarda por cuenta la introducción del profesor, el diseño, el progreso, la revisión y la fecha de finalización.

`GET /api/portal/session` indica con `passCompleted` si el alumno terminó la bienvenida. Con ese dato entra a clase sin esperar el pase completo, que se carga en segundo plano para el perfil. El servidor sigue exigiendo la bienvenida terminada para abrir canvases.

`GET/PUT /api/portal/pass` exige una sesión de alumno que ya cambió su contraseña. Obtiene la identidad de esa sesión, nunca de un parámetro enviado por el cliente. Valida nombres, valores finitos, catálogo de imágenes y stickers, límites de posición y tamaño. No admite URLs o HTML arbitrarios.

La firma se guarda dentro del diseño, sin una migración adicional. Son hasta doce trazos y 512 puntos enteros dentro de un área de 600 × 340, o un nombre escrito de hasta 32 caracteres. No se guarda presión, velocidad ni información biométrica adicional. Es un dibujo decorativo, no una firma legal, una verificación de identidad o un permiso. Se aceptan los pases anteriores sin firma para conservar compatibilidad; la interfaz pide añadirla al recorrer esta etapa. Las firmas dibujadas se recuperan al recargar y al volver a iniciar sesión. Los trazos cancelados no se guardan.

El holográfico también se guarda dentro del diseño: patrón del catálogo, zona de aplicación, color del holográfico de 0 a 360 y posición del control de infinito de 0 a 1. Los valores de color inferiores a 360 eligen una tonalidad; 360 corresponde al indicador multicolor del extremo y activa el arcoíris completo. El campo antiguo de intensidad de 0 a 100 se conserva para poder leer borradores anteriores, pero ya no lo modifica la interfaz ni regula la opacidad del nuevo acabado. Los pases anteriores sin zona ni color usan Toda y un tono predeterminado; el acabado antiguo Estelar se representa con el patrón de estrellas. Los originales guardados no se reescriben al leerlos. Se conserva la compatibilidad con las firmas de texto antiguas, aunque ya no se ofrece el botón Usar mi nombre.

El onboarding guarda tras 600 ms sin cambios y antes de salir o finalizar. Serializa las escrituras y utiliza una revisión para rechazar cambios basados en una versión antigua. El editor directo del perfil guarda con su botón Guardar cambios y utiliza la misma revisión. Un conflicto de otra pestaña exige recargar. El servidor no permite que editar la introducción o el identificador en la solicitud cambie otro perfil. Las respuestas usan `no-store`. La finalización no concede permisos de canvases ni cambia la identidad autenticada; solo permite consultar los accesos que el profesor ya haya concedido. Repetir la bienvenida no borra esa finalización ni los accesos.

El paso persistido sigue usando los valores 0 a 4. Celebración y lector comparten el último punto de guardado; al retomar ese punto se muestra primero la tarjeta terminada y su descarga. La pantalla adicional no cambia el contrato de la API ni requiere una migración.

## Entornos y validación

| Entorno | Configuración | Datos |
| --- | --- | --- |
| Editor local, puerto 5174 | `vite.config.ts`, `wrangler.toml` | `.wrangler/state`, edición abierta de desarrollo |
| Portal QA, puerto 5177 por defecto | `vite.portal.config.ts`, `wrangler.portal.toml` | Carpeta obligatoria `XP_CANVAS_STATE_PATH`, distinta del editor habitual |
| Portal publicado | Build de `vite.portal.config.ts` | Bindings remotos de D1, R2 y Durable Objects |

`XP_PORTAL_QA=1` habilita credenciales ficticias solo al servir en local; la configuración rechaza un build con ese valor. Una rama de Git no aísla bases de datos: los previews requieren bindings y estado independientes. Las migraciones remotas no se ejecutan automáticamente durante el build.

No borres `.wrangler/state` para reiniciar el editor ni conectes dos servidores a la misma carpeta de estado. Clonar el repositorio crea una instancia nueva, no copia los datos de otro equipo. Las copias `.tldr` incluyen los assets nativos de imágenes y videos; las tarjetas de audio y documentos conservan enlaces al servidor y no constituyen un respaldo independiente de sus archivos.

Next excluye `apps/` de su comprobación de TypeScript. El portal tiene su propio `tsconfig.json`; su build comprueba tipos y genera frontend y Worker. Un build correcto de una app no valida la otra. Un build sin modo portal devuelve 503 en su API publicada para impedir la publicación accidental del editor abierto.

El plugin de Cloudflare puede copiar `.dev.vars` a `dist/` para previews locales. Esa carpeta no es un respaldo publicable; la publicación usa la configuración compilada de Wrangler y sus exclusiones.

Los comandos están en [Desarrollo local del editor](apps/xp-canvas/README.md#desarrollo-local), [Pruebas del editor](apps/xp-canvas/README.md#comandos) y [Desarrollo y pruebas del portal](apps/xp-canvas/PORTAL.md#desarrollo-y-pruebas).

## Publicación desde Git

Ambas aplicaciones se publican desde `main`; las mejoras usan ramas cortas. Vercel está conectado al repositorio del sitio. `vercel.json` llama a `scripts/vercel-ignore.mjs`, que compara el commit con el último despliegue mediante `VERCEL_GIT_PREVIOUS_SHA`. Omite cambios exclusivamente del canvas o documentación; una modificación compartida vuelve a construir el sitio. Si no puede comprobar el historial, construye por seguridad.

Cloudflare Workers Builds está conectado al mismo repositorio y despliega el Worker existente `xp-canvas-portal`. Vigila la carpeta del canvas y los manifiestos compartidos de npm. La licencia del frontend está guardada como variable cifrada del build; el secreto de contraseñas permanece separado en el Worker. Los builds de otras ramas están desactivados para no usar los datos de producción en previews.

Los comandos y filtros están en [Publicación desde Git](apps/xp-canvas/PORTAL.md#publicación-desde-git).

Los filtros reducen builds, no aíslan datos ni sustituyen las pruebas. Si falla un despliegue, identificar el commit y la versión activa antes de reintentar. Revertir código no revierte migraciones ni escrituras de usuarios. No recrear buckets, bases o Durable Objects como parte de una reversión de código.

Referencias de configuración: [Vercel ignoreCommand](https://vercel.com/docs/project-configuration/vercel-json#ignorecommand) y [Cloudflare Build watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/).
