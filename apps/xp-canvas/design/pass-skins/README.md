# Arte para los pases de XP

Selección inicial del 16 de septiembre de 2026. Leo pidió usar imágenes reales de los juegos, no ilustraciones genéricas inspiradas en sus colores. Estos originales se descargaron sin modificar y se inspeccionaron visualmente. No se utilizó ImageGen.

El onboarding importa 25 archivos seleccionados de esta carpeta. Vite los incluye en el build del portal. Las imágenes sustituidas permanecen como referencia, pero ya no se importan. Ninguno incluye datos de alumnos. El catálogo se publica en el portal; los nombres, matrículas y mensajes se guardan aparte en su base de datos privada.

## Imágenes proporcionadas por Leo

Estas cinco imágenes sustituyen las portadas anteriores de XP, Slime Rancher, Valorant, Destiny 2 y Marvel Rivals. Se copiaron de los adjuntos de la conversación sin modificar sus píxeles. No se conoce su fuente original ni se ha confirmado una licencia de publicación.

| Archivo | Imagen | Tamaño |
| --- | --- | --- |
| `xp-logo.png` | Logotipo blanco sobre transparencia | 3859 × 1876 |
| `slime-rancher-aurora.png` | Beatrix y slimes bajo un cielo iluminado | 736 × 1104 |
| `valorant-agents.png` | Collage vertical de agentes | 736 × 1308 |
| `destiny-traveler.png` | El Viajero | 2160 × 3840 |
| `marvel-rivals-team.png` | Storm, Iron Man, Rocket y Loki | 736 × 1308 |

Las nuevas portadas de juegos usan máscaras trazadas en sus propias coordenadas. El logotipo XP utiliza la transparencia del PNG y se muestra completo sobre un fondo oscuro. El archivo de Destiny conserva sus 12,8 MB originales; conviene preparar una copia optimizada antes de publicar, manteniendo este original.

## Fuentes iniciales

| Archivo | Imagen | Página fuente | Tamaño |
| --- | --- | --- | --- |
| `the-long-dark-aurora.jpg` | Captura del juego con aurora, vías de tren y antorcha | [Hinterland, Survival Mode](https://www.thelongdark.com/survival-mode/) | 961 × 536 |
| `slime-rancher-key-art.jpg` | Arte promocional del primer Slime Rancher con Beatrix y slimes | [PlayStation, Slime Rancher](https://www.playstation.com/en-us/games/slime-rancher/) | 1024 × 1024 |
| `halo-infinite-key-art.jpg` | Arte de campaña con Master Chief en Zeta Halo | [Halo Waypoint, Welcome to Halo Infinite](https://www.halowaypoint.com/news/welcome-to-halo-infinite) | 1024 × 576 |
| `the-long-dark-cabin.jpg` | Cabaña nevada bajo una aurora, elegida para sustituir la captura rechazada | [GamesRadar, artículo sobre The Long Dark](https://www.gamesradar.com/the-perfect-game-for-the-longest-night-of-the-year-heres-how-the-long-dark-got-early-access-right/) | 1280 × 720 |
| `valorant.jpg` | Arte de Iso | [Riot, Media](https://playvalorant.com/en-us/media/) | 1920 × 1080 |
| `destiny-2.jpg` | Arte panorámico de Guardianes | [Steam, Destiny 2](https://store.steampowered.com/app/1085660/Destiny_2/) | 1920 × 620 |
| `fortnite.jpg` | Portada de Battle Royale distribuida por Xbox | [Xbox, Fortnite](https://www.xbox.com/en-nz/play/games/fortnite-battle-royale/9P6LNN3KZ75R) | 1440 × 2160 |
| `ultimate-custom-night.jpg` | Mosaico de personajes | [Steam, Ultimate Custom Night](https://store.steampowered.com/app/871720/Ultimate_Custom_Night/) | 1920 × 620 |
| `marvel-rivals.jpg` | Arte panorámico de Marvel Rivals | [Steam, Marvel Rivals](https://store.steampowered.com/app/2767030/Marvel_Rivals/) | 1920 × 620 |
| `deltarune.jpg` | Siluetas de los tres protagonistas | [Steam, Deltarune](https://store.steampowered.com/app/1671210/DELTARUNE/) | 1920 × 620 |

URLs exactas de descarga:

- The Long Dark: https://www.thelongdark.com/img/survival-mode-carousel-screenshot-comp-6.jpg
- Slime Rancher: https://image.api.playstation.com/vulcan/ap/rnd/202010/0220/w5OuzDEu6HNzT2K4e5HRI7vJ.png
- Halo Infinite: https://wpassets.halowaypoint.com/wp-content/2021/12/HaloInfinite_CampaignKeyArt_CLEAN_1920x1080-1024x576.jpg
- The Long Dark, cabaña: https://cdn.mos.cms.futurecdn.net/HopkzVfMTf5uLfJ9p7A839.jpg
- Valorant: https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/083baed63d306ee9ba41df4971ac0f6bb0222032-1920x1080.jpg
- Destiny 2: https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1085660/library_hero.jpg
- Fortnite: https://store-images.s-microsoft.com/image/apps.1338.14622094146520822.ebbacb9f-7c43-40fd-9299-ce9ded8ed3cb.8cd2db59-8c04-41ef-a482-d5ae24788086
- Ultimate Custom Night: https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/871720/library_hero.jpg
- Marvel Rivals: https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2767030/library_hero.jpg
- Deltarune: https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1671210/library_hero.jpg

El servidor de PlayStation entrega JPEG aunque su URL termine en `.png`; el archivo local usa la extensión correspondiente a su contenido. El press kit antiguo de Monomi Park no estaba disponible durante esta consulta, por eso se eligió su arte distribuido por PlayStation.

## Composición implementada

- Mantener los originales intactos. Probar el encuadre con CSS sobre una tarjeta vertical, sin estirar la imagen.
- Separar ilustración, nombre, marca XP, stickers y acabado holográfico en capas. El nombre y los controles deben seguir siendo texto real.
- The Long Dark: cabaña centrada, con el techo y la aurora visibles. La captura con las vías se conserva solo como referencia descartada.
- Slime Rancher: la nueva imagen vertical llena el pase. Las máscaras siguen a Beatrix y los slimes del arte proporcionado por Leo.
- Halo Infinite: mantener el casco y el cuerpo de Master Chief visibles, con el nombre debajo. Infinite es una selección provisional de arte para representar Halo; no implica que sea la entrega favorita del alumno.
- Si el encuadre final necesita extensión o adaptación raster, usar ImageGen en modo de edición sobre una copia, con personajes, estilo y detalles reconocibles como invariantes. Registrar cualquier versión derivada separadamente.

## Publicación y créditos

The Long Dark pertenece a Hinterland; Slime Rancher a Monomi Park; Halo a Microsoft. Encontrar una imagen en una fuente oficial no equivale a obtener una licencia general de reutilización. La procedencia queda registrada, pero las condiciones aplicables a su publicación en el portal siguen pendientes de revisión. No presentar estas tarjetas como pases oficiales o productos avalados por esos estudios.

La misma limitación se aplica a los assets de Riot, Bungie, Epic, Scott Cawthon, Marvel/NetEase y Toby Fox. La imagen de la cabaña procede de una publicación periodística, no de una licencia abierta. Las portadas de las tiendas corresponden a su material promocional actual; no representan una entrega, temporada o personaje preferido confirmado por cada alumno.

## Portadas añadidas el 17 de septiembre

Quince originales descargados e inspeccionados sin modificar sus píxeles. Se usan portadas verticales cuando existen. Las entregas que aparecen debajo son selecciones de arte para representar el juego o la serie, no preferencias de edición confirmadas. En particular, no se deduce que quien dijo Tetris, Smash, Doom, Baldur's Gate, Helldivers, Kingdom Hearts o Dark Souls haya elegido esta entrega concreta.

| Archivo | Arte elegido | Fuente |
| --- | --- | --- |
| `minecraft.jpg` | Personajes en el mundo de Minecraft | [Mojang, Key art update](https://www.minecraft.net/en-us/article/key-art-update) |
| `rocket-league.jpg` | Rocket League | [Steam](https://store.steampowered.com/app/252950/) |
| `tetris.jpg` | Tetris Effect: Connected | [Steam](https://store.steampowered.com/app/1003590/) |
| `terraria.jpg` | Terraria | [Steam](https://store.steampowered.com/app/105600/) |
| `smash-key-art.jpg` | Super Smash Bros. Ultimate | [Nintendo](https://www.nintendo.com/en-gb/Games/Nintendo-Switch-games/Super-Smash-Bros-Ultimate-1395713.html) |
| `doom.jpg` | DOOM + DOOM II | [Steam](https://store.steampowered.com/app/2280/) |
| `roblox-poster.jpg` | Mosaico de experiencias de Roblox | [Xbox](https://www.xbox.com/en-US/games/store/roblox/BQ1TN1T79V9K) |
| `hades.jpg` | Hades | [Steam](https://store.steampowered.com/app/1145360/) |
| `factorio.jpg` | Factorio | [Steam](https://store.steampowered.com/app/427520/) |
| `baldurs-gate.jpg` | Baldur's Gate 3 | [Steam](https://store.steampowered.com/app/1086940/) |
| `elden-ring.jpg` | Elden Ring | [Steam](https://store.steampowered.com/app/1245620/) |
| `helldivers.jpg` | Helldivers 2 | [Steam](https://store.steampowered.com/app/553850/) |
| `kingdom-hearts.jpg` | HD 1.5 + 2.5 ReMIX | [Steam](https://store.steampowered.com/app/2552430/) |
| `dark-souls.jpg` | Dark Souls: Remastered | [Steam](https://store.steampowered.com/app/570940/) |
| `cult-of-the-lamb.jpg` | Cult of the Lamb: Unholy Alliance | [Steam](https://store.steampowered.com/app/1313140/) |

Para las doce imágenes de Steam, la URL exacta de cada original es `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/ID/library_600x900.jpg`, donde ID es el de su enlace en la tabla. El nombre del producto se comprobó también con la API pública de la tienda.

Las otras tres descargas son:

- Minecraft: https://www.minecraft.net/content/dam/minecraftnet/games/minecraft/key-art/NewKeyArt_Header.jpg
- Smash: https://www.nintendo.com/eu/media/images/10_share_images/games_15/nintendo_switch_4/H2x1_NSwitch_SuperSmashBrosUltimate_02_image1280w.jpg
- Roblox: https://store-images.s-microsoft.com/image/apps.3683.68327322396008232.ddd32983-30da-4856-a0ef-70bb8840e88d.cb3ff148-2c1f-4b84-9eea-ff80eda50c2d

Las máscaras adicionales están en `additionalHologramSubjects.ts`. Seleccionan personajes, bloques, runas o paneles según la composición. El complemento cubre el fondo. Las fuentes oficiales no conceden por sí solas una licencia de reutilización; se mantiene la advertencia de derechos anterior.
