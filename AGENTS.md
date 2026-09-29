# Mapa para trabajar en leosanxyz

Este repositorio contiene el sitio personal de Leo y XP Canvas, un canvas tldraw para sus clases. Mantén los cambios simples y limitados a lo que pide la tarea.

Para trabajar en XP Canvas, lee primero [apps/xp-canvas/AGENTS.md](apps/xp-canvas/AGENTS.md). Sus reglas se suman a las de este archivo.

## Sitio personal

| Trabajo | Punto de entrada |
| --- | --- |
| Páginas, layout y estilos | `src/app/`, `src/app/layout.tsx`, `src/app/globals.css` |
| Componentes y utilidades | `src/app/components/`, `src/hooks/`, `src/utils/`, `src/data/` |
| Textos, GIFs y archivos públicos | `content/`, `public/` |
| APIs | `src/app/api/` |
| Publicación en Vercel | `vercel.json`, `scripts/vercel-ignore.mjs` |

Desarrollo con `npm run dev:site`; valida con `npm run build:site`. Si cambias el filtro de Vercel, ejecuta `node --test scripts/vercel-ignore.test.mjs`.

## Dónde documentar cada tema

| Documento | Responsabilidad |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Componentes, almacenamiento, permisos técnicos, contratos de datos, secretos y separación de entornos y despliegues. |
| [apps/xp-canvas/AGENTS.md](apps/xp-canvas/AGENTS.md) | Mapa del canvas, validación y documentos propios de esa app. |

Cada explicación tiene un documento responsable. En los demás, enlaza la sección; no copies su contenido. El README de la raíz es el perfil público de GitHub de Leo, no el manual del proyecto.

## Límites que debes conservar

- Revisa `git status` antes de editar. Conserva cambios ajenos a la tarea y añade a Git solo rutas revisadas.
- Antes de tocar persistencia, acceso o despliegues, consulta [ARCHITECTURE.md](ARCHITECTURE.md). No debilites permisos para resolver una prueba o una publicación.
- No publiques secretos, sesiones, datos personales ni respaldos. Revisa tanto los archivos que añadirás a Git como los assets del build.
- Si un cambio solo puede comprobarse en un dispositivo físico o en un servicio remoto, dilo y pide a Leo que lo verifique; no lo presentes como probado.

## Flujo de cambios

`main` es la rama estable para ambas aplicaciones. Trabaja en ramas cortas con el prefijo del agente que hace los cambios, por ejemplo `codex/<cambio>` o `claude/<cambio>`. Después de fusionar una rama en `main`, bórrala en local y en GitHub; no borres ramas con commits sin fusionar sin preguntar. Valida la app afectada; cuando cambien dependencias o configuración compartidas, valida ambas. Publicar, desplegar y migrar datos son acciones distintas: informa cuál se ha verificado realmente.

Las skills del proyecto están en `.agents/skills/`; `.claude/skills` es un enlace a esa carpeta para que Claude use las mismas. Añade o edita skills solo en `.agents/skills/`.

Mantén estos mapas y `ARCHITECTURE.md` actualizados cuando cambien carpetas, almacenamiento, comandos o publicación. Los mapas nombran carpetas y puntos de entrada, no cada archivo. Documenta el funcionamiento vigente; retira planes ya ejecutados, bitácoras de migración y resultados puntuales de pruebas. El historial de Git conserva ese contexto. Mantén las notas de compatibilidad mientras protejan datos existentes. No guardes aquí contraseñas ni inventarios personales.
