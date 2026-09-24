# XP Canvas

Canvas infinito colaborativo para dibujar desde un iPad con Apple Pencil. Este README explica su uso y desarrollo local. El diseño técnico está en [ARCHITECTURE.md](../../ARCHITECTURE.md) y el mapa del código en [AGENTS.md](../../AGENTS.md).

La primera pantalla es un administrador de canvases con carpetas anidadas, favoritos y miniaturas. Cada canvas tiene su propio documento persistente y una URL `/board/<id>`. El canvas original permanece en `/board/principal`, con sus objetos y archivos intactos.

El modo local habitual no pide contraseña. Cualquier persona que pueda acceder a ese servidor puede administrar canvases, dibujar y modificar recursos. La papelera es reversible y no borra los documentos.

Para las cuentas de alumnos, el entorno QA y la publicación, consulta [PORTAL.md](PORTAL.md).

## Desarrollo local

Desde la raíz del monorepo:

Usa Node.js 24 LTS y npm. No necesitas credenciales de Cloudflare ni un archivo `.dev.vars` para el desarrollo local con edición abierta. Si ese archivo ya existe, conserva sus valores.

```bash
npm ci
npm run dev:xp-canvas
```

Abre `http://localhost:5174`. Entras directamente al administrador.

En macOS se usan los mismos comandos, desde esta rama. Instala las dependencias allí con `npm ci`, no copies `node_modules` desde Linux. Wrangler requiere macOS 13.5 o posterior y admite Apple Silicon. Para acceder desde el iPad, usa la IP LAN o Tailscale de la Mac con el puerto 5174; el firewall debe permitirlo y la Mac debe permanecer despierta.

Antes de copiar o compartir una instancia, consulta [Entornos y validación](../../ARCHITECTURE.md#entornos-y-validación). Para trabajar con los datos de otro equipo sin migrarlos, abre la dirección de su servidor.

Para probar desde un iPad en la misma red, abre la dirección LAN que imprime Vite. Safari permite dibujar con Pencil sobre HTTP en desarrollo, pero algunas funciones del navegador, como copiar al portapapeles, pueden exigir HTTPS.

En iPads compatibles, Safari también muestra un aro en la posición de hover del Apple Pencil antes de tocar la pantalla. La opción **Ajustes > Apple Pencil > Hover** debe estar activa. La web recibe la posición, pero no la distancia física entre el Pencil y la pantalla.

## Acceso

El modo local permite edición abierta; no lo expongas a Internet. Para exigir contraseña, cambia `EDITOR_AUTH_REQUIRED` a `"true"` en `wrangler.toml` y prepara `.dev.vars` según [.dev.vars.example](.dev.vars.example), conservando sus valores existentes.

La diferencia entre este acceso y las cuentas del portal se explica en [Cuentas y secretos](../../ARCHITECTURE.md#cuentas-y-secretos).

## Preguntas interactivas

En el portal, pulsa **Pregunta** en la cabecera para escribir un enunciado y cuatro respuestas. Marca una como correcta y añade la tarjeta al canvas. Puedes moverla como cualquier otra figura. El icono de lápiz permite cambiar su contenido o **Reiniciar respuestas** para borrar los colores.

El profesor y los alumnos ven la misma sidebar de alumnos conectados, con manos levantadas. Cada alumno también aparece en su propia lista. Quien tiene permiso se distingue por toda su fila azul y el icono de cursor. Solo el profesor puede cambiar los permisos.

Los alumnos comienzan con la herramienta Mano y el cursor bloqueado. Después de que levanten la mano, pulsa el icono de cursor **Permitir responder** en su fila del panel de alumnos conectados. El permiso se conserva hasta volver a pulsar el cursor para **Retirar permiso**, incluso si el alumno recarga. Al dar permiso se activa el cursor. El alumno puede alternar entre el cursor, para responder, y la mano, para desplazarse. Pasar el cursor sobre una respuesta la resalta; el clic envía la elección. Retirar el permiso bloquea el cursor y vuelve a activar la mano. El permiso se aplica a las preguntas y máquinas de ese canvas y no permite dibujar ni editar otros elementos.

Una respuesta elegida queda roja si es incorrecta y verde si es correcta, con una etiqueta que también identifica el resultado. Todos ven el cambio. Un acierto hace rebotar ligeramente el botón y deja caer confeti y emojis que se acumulan abajo; a los tres segundos comienzan a desvanecerse. Una respuesta incorrecta sacude el botón hacia los lados. Con movimiento reducido, el resultado usa un cambio de opacidad y emojis estáticos. Cada opción se puede elegir una vez hasta que el maestro reinicie o edite la pregunta. El permiso sigue activo después de responder. Los aciertos confirmados reproducen al mismo tiempo `correct.mp3`, `1gift-confetti.mp3` y `confetti-pop-sound.mp3`; los errores usan el sonido de Leapster. Se reproducen en las pestañas visibles que tengan el audio habilitado por el navegador. Si está bloqueado, un toque o una tecla dentro del canvas lo habilita para los siguientes resultados. Recargar no vuelve a reproducir respuestas anteriores. Los archivos originales están documentados en [Sonidos de las preguntas](design/question-sounds/README.md).

El botón de dados a la derecha de **Alumnos conectados** sortea entre los alumnos presentes. La selección recorre sus filas y suena en cada paso, cada vez más despacio, hasta marcar al elegido. Al iniciar el sorteo, el panel de alumnos se abre de inmediato para todos los presentes, aunque lo hubieran cerrado. Todos ven el mismo resultado; el profesor decide después si le da permiso. Durante el sorteo no puede empezar otro. Con movimiento reducido se muestra únicamente la selección final. Recargar no repite el sorteo.

Al crear o editar una pregunta puedes elegir su premio en **Puntos por respuesta correcta**. El valor inicial es 100. El alumno que acierta recibe el premio y todos ven `+puntos` encima de la pregunta. Los errores no restan puntos. Reintentar o deshacer una respuesta ya premiada no concede otro premio; reiniciar o editar la pregunta inicia una nueva ronda que sí puede premiarse.

Los alumnos empiezan con 0 y solo ven su total en **Mi perfil**. El profesor puede consultar los totales en **Alumnos**. Los premios ya ganados se conservan aunque se borre la pregunta o el canvas.

El contrato y la validación del servidor están en [Arquitectura](../../ARCHITECTURE.md#worker-y-persistencia). La prueba completa usa el [portal QA aislado](PORTAL.md#desarrollo-y-pruebas):

```bash
BASE_URL=http://127.0.0.1:5177 node apps/xp-canvas/scripts/questions-smoke.mjs
```

Crea cuentas y canvases ficticios. Comprueba autoría, bloqueo, permiso individual, colores compartidos, recarga, varias pestañas, reinicio y rechazo de escrituras directas. La emulación táctil de Chromium no demuestra el comportamiento físico de Safari o Apple Pencil.

## Gachapon

En el portal, pulsa **Gachapon** en la cabecera. Selecciona las tarjetas del set 1 y del set 2, los alumnos habilitados y el **Costo por tirada**. Puedes combinar tarjetas de ambos sets; las máquinas nuevas empiezan con el set 1 seleccionado. 0 puntos significa gratis. Puedes filtrar por grupo; solo aparecen alumnos con acceso al canvas. El engranaje de la máquina vuelve a abrir estos ajustes.

Para girar, el alumno necesita estar seleccionado en esa máquina, tener permiso de interacción y usar el cursor. Pasar el cursor sobre la máquina muestra sus premios; en pantalla táctil usa el icono del ojo. La perilla saca una cápsula y revela la tarjeta a todos los presentes. Con movimiento reducido aparece directamente la tarjeta. El premio se añade a las portadas de **Mi perfil**.

Cada alumno tiene una tirada hasta que pulses **Reiniciar tiradas**. Guardar ajustes conserva las tiradas usadas. Si faltan puntos, no se cobra ni se consume el turno. Todas las tarjetas seleccionadas tienen la misma probabilidad y pueden repetirse; una repetida también cuesta los puntos indicados.

El contrato de premios y cobros está en [Arquitectura](../../ARCHITECTURE.md#gachapon-y-tarjetas-desbloqueadas). Prueba en un portal QA aislado:

```bash
BASE_URL=http://127.0.0.1:5177 node apps/xp-canvas/scripts/gachapon-smoke.mjs
```

## Copiar canvases

En el menú de tres puntos de cada canvas, **Duplicar canvas** crea **Copia de …** en la misma carpeta. Copia todas las páginas, objetos, grupos, conexiones, recortes del borrador y miniatura. El nuevo canvas tiene su propia URL y documento; los cambios posteriores en uno no afectan al otro. Los archivos de imágenes y videos se reutilizan, sin añadir entradas repetidas a Recursos.

Solo los editores pueden duplicar. Los canvases de la papelera deben restaurarse primero. La copia aparece en el administrador cuando termina de guardarse y no hereda la marca de favorito.

## Recursos

Entra como editor y pulsa **Recursos** en la barra izquierda. El escritorio y el iPad comparten esta barra; en pantallas menores de 600 px, Recursos aparece en la cabecera.

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

El alcance de los permisos y las descargas está en [Worker y persistencia](../../ARCHITECTURE.md#worker-y-persistencia). Las limitaciones de las copias `.tldr` están en [Entornos y validación](../../ARCHITECTURE.md#entornos-y-validación).

## Rendimiento y correcciones

QuickShape identifica el trazo recién creado mediante un evento, sin recorrer todas las figuras en cada contacto del Pencil. La previsualización de hover lee el tamaño del lienzo como máximo una vez por frame y actualiza su posición sin renders de React.

La biblioteca se carga al abrirla. Las imágenes grandes y los GIFs usan miniaturas estáticas en el panel; el original se conserva para el lienzo.

Un `pointercancel` del Pencil cancela también el trazo de tldraw para que no quede activo. La interfaz comprueba la caducidad de la sesión al volver a la pestaña y cada minuto. Un fallo de red no se interpreta como cerrar sesión. Los errores al exportar o salir de edición se muestran en pantalla.

## Dedo y Pencil

El Pencil usa la herramienta elegida. Un dedo sobre una figura la selecciona y permite moverla; sobre el fondo desplaza el lienzo. El siguiente contacto del Pencil recupera la herramienta de dibujo sin tener que cambiar de modo. Puedes añadir un segundo dedo durante el desplazamiento para hacer zoom y levantar uno para seguir desplazándote. No hay una ventana de tiempo entre los contactos ni un filtro de tamaño que descarte el pulgar. Mientras el Pencil dibuja, se ignoran los contactos de la palma sobre el lienzo.

El seguimiento táctil actualiza la cámara directamente, sin transiciones ni renders de React por cada movimiento. La validación automatizada usa eventos táctiles y de lápiz de Chromium. Queda pendiente comprobar la sensación y la secuencia física en Safari con Apple Pencil.

## Puntero láser

Selecciona **Puntero láser** en la barra izquierda, junto al borrador, y señala con el Apple Pencil o el ratón. También puedes activarlo con la tecla **K**. El trazo es temporal, lo ven los demás participantes del canvas y desaparece después de soltar. No añade objetos al documento ni al historial de Deshacer. El dedo conserva la selección y el desplazamiento del lienzo.

`npm run smoke:laser --workspace=apps/xp-canvas` comprueba selección desde la barra, Pencil, visibilidad en otro cliente, desaparición del trazo, ausencia de cambios en el documento y atajo de teclado. Usa un servidor aislado en 5175.

## QuickShape

QuickShape muestra una figura fantasma cuando el Apple Pencil permanece quieto al final del trazo durante unos 500 ms. El dibujo original sigue ahí mientras mantienes el contacto. Al soltar, se sustituye por la figura y Deshacer elimina el gesto completo en un paso. Si vuelves a mover el Pencil o se cancela el contacto, desaparece la previsualización. Reconoce solo resultados claros:

- línea;
- círculo o elipse;
- rectángulo;
- triángulo.

Si el trazo es ambiguo, pequeño o se cruza consigo mismo, conserva el dibujo original. El control QuickShape de la barra permite desactivarlo.

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

`npm run smoke:open-editing --workspace=apps/xp-canvas` prueba el modo actual sin contraseña. Comprueba entrada directa, edición entre dos clientes sin cookies, persistencia, cargas, duplicación, papelera y rechazo de escrituras desde otro origen. Usa un servidor con datos aislados en otra terminal, desde `apps/xp-canvas`:

```bash
XP_CANVAS_STATE_PATH=$(mktemp -d /tmp/xp-canvas-open-qa.XXXXXX) npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

Los smokes anteriores conservan pruebas de permisos del modo con contraseña. Para ejecutarlos, usa `vite.auth-qa.config.ts`, que exige una carpeta de estado aislada y activa la contraseña sin cambiar la configuración del servidor habitual. Define el código y el secreto en `.dev.vars`, sin `EDITOR_AUTH_REQUIRED`, y usa este servidor:

```bash
XP_CANVAS_STATE_PATH=$(mktemp -d /tmp/xp-canvas-auth-qa.XXXXXX) npm run dev -- --config vite.auth-qa.config.ts --host 127.0.0.1 --port 5176 --strictPort
```

Ejecuta esos smokes con `BASE_URL=http://127.0.0.1:5176`. El smoke general abre dos clientes contra el servidor local y comprueba permisos, presencia, cursores suavizados, hover del Pencil, Snap, sincronización, persistencia, imágenes, QuickShape y Undo.

El smoke de recursos necesita Chromium y FFmpeg. Prueba cargas, miniaturas, reproducción y avance de videos, permisos, arrastre con zoom, inserción táctil sintética, emojis directos, reutilización, Deshacer/Rehacer, flechas, grupos, persistencia y sincronización. Usa una página temporal propia y la elimina al terminar.

El smoke del rediseño comprueba administrador, carpetas anidadas, aislamiento entre documentos, permisos, carga de archivos, reproducción con un toque, emojis, selección y desplazamiento con un dedo, vuelta al Pencil, zoom de dos dedos, previsualización QuickShape y miniaturas persistentes. Crea datos de prueba, por lo que debe ejecutarse contra el servidor aislado con contraseña.

El smoke de correcciones también usa el servidor aislado. Comprueba carpetas de recursos, permisos, miniaturas de videos nuevos y antiguos, controles de reproducción sin duplicar y el paso de uno a dos dedos con contactos de pulgar de 60px y demoras de 0, 250 y 1200ms.

El smoke de refinamientos comprueba emojis PNG, doble clic sin edición, papelera, borrado por zona, Deshacer/Rehacer, cancelación, bloqueo, giro, escala, zoom y persistencia entre dos clientes. También requiere datos aislados. `npm run profile:pan --workspace=apps/xp-canvas` crea un board sintético y compara desplazamientos a 100% y 800%, con y sin promoción de capa. No captura pantallas ni demuestra el rendimiento de Safari.

`npm run smoke:eraser --workspace=apps/xp-canvas` verifica la identidad del SVG y del trazo durante una pasada, la ausencia de imágenes de máscara regeneradas y los píxeles del recorte a 1× y 8×. Usa datos aislados en el puerto 5175. Esta regresión no sustituye una prueba física de Safari con Apple Pencil.

`npm run smoke:video --workspace=apps/xp-canvas` bloquea la descarga del video y retrasa la notificación de su primer fotograma para comprobar que la miniatura siga visible y no cambie de tamaño. Verifica sonido por defecto, parada al terminar, repetición manual, pausa, reanudación y silencio manual. Requiere el servidor aislado en 5175, Chromium y FFmpeg.

`npm run smoke:board-copy --workspace=apps/xp-canvas` comprueba el menú de duplicación, reintento tras error, carpetas anidadas, copia completa del documento y miniatura, permisos, cambios independientes, persistencia y reutilización de archivos. Usa datos de prueba en el servidor aislado de 5175.

`npm run smoke:video-preview --workspace=apps/xp-canvas` simula una copia negra si se captura antes de un fotograma disponible. Comprueba los píxeles de las miniaturas, clips con inicio negro, rechazo de capturas vacías, cancelación y sustitución de una miniatura reparada en Recursos y en dos clientes del canvas. Usa medios sintéticos y datos aislados en 5175.

`npm run smoke:resource-delete --workspace=apps/xp-canvas` comprueba confirmación, cancelación, reintento tras error, eliminación en Recursos y dentro de carpetas, permisos y persistencia. Verifica que las copias del canvas y sus archivos sigan intactos. Solo elimina entradas de prueba en el servidor aislado de 5175.

Los scripts aceptan `BASE_URL`, `EDITOR_CODE` y `CHROMIUM_PATH`. Si no defines `EDITOR_CODE` en el entorno, lo leen del archivo local `.dev.vars`; el smoke de edición abierta no necesita código. El smoke general y el de recursos usan 5174 por defecto; los demás usan 5175. Establece siempre `BASE_URL` al puerto del servidor aislado correspondiente. Ninguno sustituye una prueba física con Safari y Apple Pencil.

## Publicación y código

La publicación del portal se realiza con el [procedimiento de PORTAL.md](PORTAL.md#publicación-y-comprobaciones). Para localizar un componente, consulta el [mapa de AGENTS.md](../../AGENTS.md#dónde-buscar).

El starter de sincronización conserva su licencia MIT en `LICENSE.md`. El SDK de tldraw usa su propia licencia. El desarrollo local funciona sin clave; un dominio público necesita una licencia Trial, Hobby o comercial válida.
