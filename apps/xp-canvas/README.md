# XP Canvas

Canvas infinito colaborativo para dibujar desde un iPad con Apple Pencil. Usa tldraw 5.4.0, un Cloudflare Worker, Durable Objects con SQLite y R2 para los archivos y la biblioteca de recursos.

La primera pantalla es un administrador de canvases con carpetas anidadas, favoritos y miniaturas. Cada canvas tiene su propio documento persistente y una URL `/board/<id>`. El canvas original permanece en `/board/principal`, con sus objetos y archivos intactos.

El administrador requiere el código de editor. Quien tenga el enlace directo de un canvas puede observarlo y ver cursores en vivo, pero necesita el código para dibujar. La papelera es reversible y no borra los documentos.

## Desarrollo local

Desde la raíz del monorepo:

Primero copia `apps/xp-canvas/.dev.vars.example` a `apps/xp-canvas/.dev.vars` y define un código de editor y un secreto de sesión distintos. Si el archivo ya existe, conserva sus valores. Git ignora este archivo.

```bash
npm install
npm run dev:xp-canvas
```

Abre `http://localhost:5174` e introduce el código que definiste en `.dev.vars`.

El canvas se ejecuta localmente. Subir esta rama a GitHub no publica el servicio ni sus datos. El `vercel.json` de la raíz desactiva los despliegues automáticos de `codex/tldraw-canvas`, sin cambiar los de `main`.

Para probar desde un iPad en la misma red, abre la dirección LAN que imprime Vite. Safari permite dibujar con Pencil sobre HTTP en desarrollo, pero algunas funciones del navegador, como copiar al portapapeles, pueden exigir HTTPS.

En iPads compatibles, Safari también muestra un aro en la posición de hover del Apple Pencil antes de tocar la pantalla. La opción **Ajustes > Apple Pencil > Hover** debe estar activa. La web recibe la posición, pero no la distancia física entre el Pencil y la pantalla.

## Acceso

El código se envía una vez al Worker. Si es correcto, el servidor crea una cookie firmada, `HttpOnly` y `SameSite=Strict`, válida por 12 horas. El código y la cookie no se guardan en `localStorage` ni forman parte de la URL.

El Worker decide el permiso de cada WebSocket. Un cliente modificado no puede convertir una sesión de espectador en editor. Las sesiones de espectador reciben presencia y cambios del documento, pero tldraw sync descarta sus intentos de escritura.

Las variables de `.dev.vars` tienen esta forma:

```dotenv
EDITOR_CODE="un-codigo-privado"
EDITOR_SESSION_SECRET="otro-secreto-largo-y-distinto"
```

## Copiar canvases

En el menú de tres puntos de cada canvas, **Duplicar canvas** crea **Copia de …** en la misma carpeta. Copia todas las páginas, objetos, grupos, conexiones, recortes del borrador y miniatura. El nuevo canvas tiene su propia URL y documento; los cambios posteriores en uno no afectan al otro. Los archivos de imágenes y videos se reutilizan, sin añadir entradas repetidas a Recursos.

Solo los editores pueden duplicar. Los canvases de la papelera deben restaurarse primero. La copia aparece en el administrador cuando termina de guardarse y no hereda la marca de favorito.

## Recursos

Entra como editor y pulsa **Recursos** en la cabecera o en la barra del iPad.

- **Subir archivos** guarda imágenes, GIFs, videos, audio y documentos. La biblioteca es compartida entre tus canvases y conserva los recursos anteriores.
- Toca un archivo para insertarlo o arrastra su tarjeta al lienzo. La lista carga más archivos al desplazarte. No tiene buscador, filtros, contadores ni opciones para guardar selecciones.
- El icono de carpeta con un signo + crea carpetas y subcarpetas. El menú de cada archivo permite moverlo a otra carpeta. También puedes arrastrarlo sobre una carpeta. Las cargas van a la carpeta abierta y la organización no modifica los archivos ni sus copias en los canvases.
- El menú de cada archivo también tiene **Eliminar**. Pide confirmación y lo retira de Recursos. Conserva el archivo y las copias ya colocadas en los canvases, incluido Deshacer. No vacía carpetas ni borra objetos del lienzo.
- Las tarjetas muestran el tipo de archivo. Los videos tienen miniaturas. Al abrir Recursos, los videos antiguos sin miniatura se procesan uno por uno y conservan el fotograma generado para las siguientes visitas.
- Las miniaturas de video se capturan cuando el navegador entrega un fotograma, antes de pausar el decodificador. Si sale negro, se prueban hasta cuatro momentos del clip; una captura vacía no se guarda como imagen válida. Al abrir un canvas se actualizan también las miniaturas que hayan sido reparadas en Recursos.
- Soltar o pegar un archivo directamente sobre el lienzo también lo añade a Recursos.
- **Emojis** tiene su propio botón en la barra. Abre el catálogo completo por categorías y toca para insertar. No hace falta guardar el emoji como recurso. Los emojis que ya estaban en tus canvases se conservan.

Las imágenes y los videos usan las figuras de tldraw. Los emojis nuevos son imágenes PNG transparentes; los emojis antiguos de un solo símbolo ya no abren el editor de texto. Los documentos y el audio aparecen como tarjetas que pueden moverse, redimensionarse, rotarse, agruparse, duplicarse, conectarse con flechas y deshacerse. Cada video muestra su miniatura y un botón de reproducción en una esquina. El reproductor se crea al tocar Play, sin entrar en edición ni hacer doble clic. Empieza con sonido y se detiene al terminar, sin loop. Puedes volver a reproducirlo con Play. La miniatura permanece encima hasta que el navegador entrega el primer fotograma, sin una transición ni un cambio de tamaño. Al reproducir, desaparece el botón Play. Los controles nativos aparecen cuando tocas el video y permiten pausarlo o silenciarlo. Al pausar conserva el fotograma actual. No empieza a reproducirse por abrir el canvas. Los documentos se abren o descargan mediante un enlace, no se editan dentro del canvas.

Al seleccionar objetos aparece una papelera encima de la selección. En imágenes y videos comparte la toolbar existente. Los elimina del canvas, no de Recursos. Deshacer los recupera. Los objetos bloqueados mantienen su protección.

El borrador recorta por zona los trazos, resaltados, líneas y figuras de QuickShape sin reconstruir ni mover su contorno. Guarda los recortes como máscaras transparentes junto al objeto y los conserva al mover, girar, redimensionar o exportar a SVG. Una pasada se deshace como una sola acción. No recorta imágenes ni videos. La papelera aparece encima de la selección, dentro de la toolbar existente para imágenes y videos.

El recorte se actualiza dentro del SVG del trazo. No sustituye el trazo ni genera una imagen de máscara en cada movimiento. Las máscaras guardadas por la versión anterior siguen siendo compatibles.

Las miniaturas de los boards se generan después de soltar el dedo o terminar el movimiento de cámara. Los videos sin reproducir usan una imagen ligera. El perfil sintético con 210 trazos no reprodujo los tirones a 800% en Chromium; el rendimiento físico en Safari queda pendiente de comprobar.

Formatos y límites:

- Imágenes de hasta 10 MB: PNG, JPEG, GIF, WebP, APNG y AVIF.
- Videos de hasta 50 MB: MP4, WebM y MOV. La reproducción depende de los códecs que soporte el navegador.
- Audio de hasta 50 MB: MP3, M4A, OGG, WAV y WebM.
- Documentos de hasta 50 MB: PDF, Word, Excel, PowerPoint, TXT, Markdown, CSV, JSON y ZIP.
- Hasta 20 archivos por carga. Se procesan uno por uno para limitar la memoria usada en el iPad.

El Worker comprueba permisos, tamaño, tipo MIME y cabecera binaria. Los documentos se entregan como descargas con `nosniff` y una política que impide ejecutar su contenido. Los espectadores pueden ver o descargar los archivos colocados en el canvas, pero no listar ni modificar la biblioteca. No uses la biblioteca como almacén de documentos confidenciales frente a personas con acceso a la URL del canvas.

Los recursos se guardan en R2. En desarrollo, R2 y el documento se conservan en `.wrangler/state`; no borres esa carpeta para reiniciar el servidor. Las copias `.tldr` incluyen los assets nativos de imágenes y videos, pero las tarjetas de documentos y audio conservan sus enlaces al servidor. No son un respaldo independiente de esos archivos.

## Rendimiento y correcciones

QuickShape identifica el trazo recién creado mediante un evento, sin recorrer todas las figuras en cada contacto del Pencil. La previsualización de hover lee el tamaño del lienzo como máximo una vez por frame y actualiza su posición sin renders de React.

La biblioteca se carga al abrirla. Las imágenes grandes y los GIFs subidos por esta ruta usan miniaturas estáticas en el panel; el original se conserva para el lienzo. Las copias de un recurso reutilizan su archivo. Las descargas admiten caché, validación por ETag y rangos de bytes para adelantar videos o audio. El Worker transmite las cargas por streaming sin mantener dos copias completas de un video en memoria.

Un `pointercancel` del Pencil cancela también el trazo de tldraw para que no quede activo. La interfaz comprueba la caducidad de la sesión al volver a la pestaña y cada minuto. Un fallo de red no se interpreta como cerrar sesión. Los errores al exportar o salir de edición se muestran en pantalla.

## Dedo y Pencil

El Pencil usa la herramienta elegida. Un dedo sobre una figura la selecciona y permite moverla; sobre el fondo desplaza el lienzo. El siguiente contacto del Pencil recupera la herramienta de dibujo sin tener que cambiar de modo. Puedes añadir un segundo dedo durante el desplazamiento para hacer zoom y levantar uno para seguir desplazándote. No hay una ventana de tiempo entre los contactos ni un filtro de tamaño que descarte el pulgar. Mientras el Pencil dibuja, se ignoran los contactos de la palma sobre el lienzo.

El seguimiento táctil actualiza la cámara directamente, sin transiciones ni renders de React por cada movimiento. La validación automatizada usa eventos táctiles y de lápiz de Chromium. Queda pendiente comprobar la sensación y la secuencia física en Safari con Apple Pencil.

## QuickShape

QuickShape muestra una figura fantasma cuando el Apple Pencil permanece quieto al final del trazo durante unos 500 ms. El dibujo original sigue ahí mientras mantienes el contacto. Al soltar, se sustituye por la figura y Deshacer elimina el gesto completo en un paso. Si vuelves a mover el Pencil o se cancela el contacto, desaparece la previsualización. Reconoce solo resultados claros:

- línea;
- círculo o elipse;
- rectángulo;
- triángulo.

Si el trazo es ambiguo, pequeño o se cruza consigo mismo, conserva el dibujo original. El control de la cabecera permite desactivarlo.

El clasificador tolera una abertura pequeña, una cola corta o un lado que sobresalga. Para enderezar el resultado, mantén presionado **Snap** con un dedo mientras terminas el trazo con el Pencil. Las figuras se alinean al múltiplo de 90° más cercano y las líneas quedan horizontales o verticales. Un teclado físico puede usar **Shift** en el momento de la conversión.

El clasificador tiene pruebas automatizadas. El tiempo de espera y la tolerancia al movimiento todavía deben ajustarse con un Apple Pencil físico antes del despliegue.

## Comandos

```bash
npm run typecheck:xp-canvas
npm run test:xp-canvas
npm run build:xp-canvas
npm run smoke:xp-canvas
npm run smoke:resources --workspace=apps/xp-canvas
npm run smoke:redesign --workspace=apps/xp-canvas
npm run smoke:corrections --workspace=apps/xp-canvas
npm run smoke:refinements --workspace=apps/xp-canvas
```

El smoke test necesita que `npm run dev:xp-canvas` siga abierto en otra terminal. Abre dos clientes reales contra el servidor local y comprueba permisos, presencia, cursores suavizados, hover del Pencil, Snap, sincronización, persistencia, imágenes, QuickShape y Undo.

El smoke de recursos necesita Chromium y FFmpeg. Prueba cargas, miniaturas, reproducción y avance de videos, permisos, arrastre con zoom, inserción táctil sintética, emojis directos, reutilización, Deshacer/Rehacer, flechas, grupos, persistencia y sincronización. Usa una página temporal propia y la elimina al terminar.

El smoke del rediseño comprueba administrador, carpetas anidadas, aislamiento entre documentos, permisos, carga de archivos, reproducción con un toque, emojis, selección y desplazamiento con un dedo, vuelta al Pencil, zoom de dos dedos, previsualización QuickShape y miniaturas persistentes. Crea datos de prueba, por lo que debe ejecutarse contra un servidor aislado. Por ejemplo, desde `apps/xp-canvas`:

```bash
XP_CANVAS_STATE_PATH=$(mktemp -d /tmp/xp-canvas-qa.XXXXXX) npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

El smoke de correcciones también usa el servidor aislado. Comprueba carpetas de recursos, permisos, miniaturas de videos nuevos y antiguos, controles de reproducción sin duplicar y el paso de uno a dos dedos con contactos de pulgar de 60px y demoras de 0, 250 y 1200ms.

El smoke de refinamientos comprueba emojis PNG, doble clic sin edición, papelera, borrado por zona, Deshacer/Rehacer, cancelación, bloqueo, giro, escala, zoom y persistencia entre dos clientes. También requiere datos aislados. `npm run profile:pan --workspace=apps/xp-canvas` crea un board sintético y compara desplazamientos a 100% y 800%, con y sin promoción de capa. No captura pantallas ni demuestra el rendimiento de Safari.

`npm run smoke:eraser --workspace=apps/xp-canvas` verifica la identidad del SVG y del trazo durante una pasada, la ausencia de imágenes de máscara regeneradas y los píxeles del recorte a 1× y 8×. Usa datos aislados en el puerto 5175. Esta regresión no sustituye una prueba física de Safari con Apple Pencil.

`npm run smoke:video --workspace=apps/xp-canvas` bloquea la descarga del video y retrasa la notificación de su primer fotograma para comprobar que la miniatura siga visible y no cambie de tamaño. Verifica sonido por defecto, parada al terminar, repetición manual, pausa, reanudación y silencio manual. Requiere el servidor aislado en 5175, Chromium y FFmpeg.

`npm run smoke:board-copy --workspace=apps/xp-canvas` comprueba el menú de duplicación, reintento tras error, carpetas anidadas, copia completa del documento y miniatura, permisos, cambios independientes, persistencia y reutilización de archivos. Usa datos de prueba en el servidor aislado de 5175.

`npm run smoke:video-preview --workspace=apps/xp-canvas` simula una copia negra si se captura antes de un fotograma disponible. Comprueba los píxeles de las miniaturas, clips con inicio negro, rechazo de capturas vacías, cancelación y sustitución de una miniatura reparada en Recursos y en dos clientes del canvas. Usa medios sintéticos y datos aislados en 5175.

`npm run smoke:resource-delete --workspace=apps/xp-canvas` comprueba confirmación, cancelación, reintento tras error, eliminación en Recursos y dentro de carpetas, permisos y persistencia. Verifica que las copias del canvas y sus archivos sigan intactos. Solo elimina entradas de prueba en el servidor aislado de 5175.

Los scripts aceptan `BASE_URL`, `EDITOR_CODE` y `CHROMIUM_PATH`. Si no defines `EDITOR_CODE` en el entorno, lo leen del archivo local `.dev.vars`. El smoke general y el de recursos usan 5174 por defecto; los demás usan 5175. Para ejecutar los anteriores contra los datos aislados, establece `BASE_URL=http://127.0.0.1:5175`. Ninguno sustituye una prueba física con Safari y Apple Pencil.

`npm run build:site` verifica por separado que la página personal siga compilando.

El build local copia `.dev.vars` dentro de `dist/xp_canvas` para que `vite preview` pueda arrancar el Worker. Ambas rutas están ignoradas por Git. No publiques ni archives la carpeta `dist` completa. Usa Wrangler para desplegar, ya que excluye ese archivo del Worker y de los assets.

## Preparación para Cloudflare

El despliegue no forma parte de esta primera implementación. Cuando toque hacerlo:

1. Crea el bucket R2 `xp-canvas-assets`.
2. Guarda `EDITOR_CODE` y `EDITOR_SESSION_SECRET` con `wrangler secret put`.
3. Añade la licencia Hobby de tldraw como `VITE_TLDRAW_LICENSE_KEY` durante el build.
4. Ejecuta primero `wrangler deploy --dry-run`.
5. Configura el dominio solo después de verificar el Worker publicado.

La clave de licencia de tldraw vive en el frontend por diseño. Debe autorizar el dominio final. Nunca uses el código de editor como clave de sesión o licencia.

## Archivos principales

- `client/pages/Room.tsx`: interfaz, conexión y controles de la sala.
- `client/pages/BoardManager.tsx`: administrador de canvases y carpetas.
- `worker/BoardCatalog.ts`: metadatos persistentes de canvases y carpetas.
- `client/ipad/installFingerInput.ts`: selección táctil, desplazamiento y zoom.
- `client/emojis/`: catálogo Unicode y panel de inserción directa.
- `client/quickShape/`: gesto y clasificador de figuras.
- `worker/worker.ts`: rutas, sesión de editor y conexión WebSocket.
- `worker/TldrawDurableObject.ts`: sincronización y persistencia de la sala.
- `worker/assetUploads.ts`: carga por streaming, validación y descarga de archivos.
- `worker/resources.ts`: biblioteca compartida y permisos.
- `client/resources/`: panel, arrastre, inserción y tarjetas de documentos/audio.
- `shared/resourceShape.ts`: esquema de tarjetas usado por cliente y servidor.

El starter de sincronización conserva su licencia MIT en `LICENSE.md`. El SDK de tldraw usa su propia licencia. El desarrollo local funciona sin clave; un dominio público necesita una licencia Trial, Hobby o comercial válida.
