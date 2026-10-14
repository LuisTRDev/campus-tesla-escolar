# CLAUDE.md

Este archivo orienta a Claude Code (claude.ai/code) cuando trabaja con el código de este repositorio.

## Idioma

Responde **siempre en español** al usuario. Los textos de la interfaz, los comentarios, los identificadores SQL y las rutas de la app también están en español: mantenlo así.

## Qué es

Campus Virtual de la I.E.P. Nikola Tesla (Perú). Es una SPA de React independiente que comparte el **mismo proyecto de Supabase** que la app "Tesla Control Escolar". Las tablas como `students`, `classrooms`, `profiles`, asistencia, notificaciones y pensiones son de Tesla; el campus agrega sus propias tablas encima.

Estructura de la carpeta padre `campus-tesla/`:
- `app/`: esta app con Vite + React 18 + TypeScript + Tailwind (se publica como un sitio propio en Netlify).
- `../supabase/campus_NN_*.sql`: scripts SQL numerados e idempotentes que se ejecutan a mano en el SQL Editor de Supabase, en orden (01 → 21). Definen los roles, las tablas del campus, las políticas RLS de toda la base (incluidas las tablas de Tesla), los buckets de archivos y las funciones RPC que usa la app. No hay herramienta de migraciones.
- `../supabase/functions/`: Edge Functions `campus-accounts` (crear cuentas y restablecer claves; ahora es opcional porque los scripts 13 y 14 traen RPC equivalentes) y `campus-push` (notificaciones push).
- `../README.md`: guía completa de instalación y descripción de los módulos. Léelo para conocer las reglas del negocio.

## Comandos

Se ejecutan desde `app/`:
- `npm run dev`: servidor de desarrollo en http://localhost:5173
- `npm run build`: `tsc -b && vite build` (es también la única revisión de tipos)
- `npm run preview`: sirve la carpeta `dist/` ya compilada

No hay pruebas automáticas ni linter. `tsconfig.app.json` tiene `strict`, `noUnusedLocals` y `noUnusedParameters`, así que un import sin usar rompe el build.

Variables de entorno (`.env.local`, ver `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (solo la anon/publishable), `VITE_LOGIN_DOMAIN` (debe ser igual al secreto `LOGIN_DOMAIN` de la Edge Function) y `VITE_VAPID_PUBLIC_KEY`. `../supabase/push-secrets.env` y `push-config.local.sql` tienen secretos y están en `.gitignore`.

## Arquitectura

**La seguridad vive en la base de datos.** Las políticas RLS y las funciones RPC `SECURITY DEFINER` de los scripts SQL deciden qué puede ver y hacer cada rol; las restricciones de rutas en `src/App.tsx` son solo de experiencia de uso. Las reglas que se incumplen lanzan errores desde Postgres con mensajes en español (`RAISE EXCEPTION`, código `P0001`), y `toMessage` en `src/lib/errors.ts` los muestra tal cual. Si una funcionalidad cambia permisos o reglas de datos, el cambio normalmente va en un script SQL (uno nuevo `campus_NN_*.sql` o una edición idempotente), no solo en la app.

**Roles** (`profiles.role`): `ADMIN`, `MANAGEMENT` y `AUXILIARY` (personal de Tesla), `TEACHER`, `STUDENT` y `GUARDIAN`. `isAdmin` es ADMIN o MANAGEMENT. Alumnos y familias ingresan con su DNI, que se convierte en un correo interno armado en `src/pages/Login.tsx` (por ejemplo `alumno.71234567@LOGIN_DOMAIN`); el personal usa su correo real. `user_metadata.must_change_password` obliga a pasar por la pantalla `ChangePassword`.

**Arranque:** `src/main.tsx` revisa las variables de entorno (si faltan, muestra una página de error), registra el service worker (`public/sw.js`, para push) y carga de forma diferida `src/bootstrap.tsx`, que monta los providers: `BrowserRouter` → `ToastProvider` → `AuthProvider` → `PreviewProvider` → `App`. `AuthProvider` carga el perfil y el contexto según el rol (`selfStudent` para STUDENT; `children`/`activeChild` para GUARDIAN, con el hijo elegido guardado en localStorage; `tutorClassrooms` para TEACHER). `App.tsx` tiene todas las rutas y elige el inicio según el rol (el personal va a `DirectorDashboard`).

**Capa de datos:** `src/services/*.ts` son los únicos archivos que hablan con Supabase (`supabase.from(...)`, `supabase.rpc(...)`, storage). Validan y limpian las entradas con las funciones de `src/lib/security.ts` (`positiveInteger`, `cleanText`, `cleanSingleLine`, `safeFileName`, `validIsoDate`) y lanzan `UserError` para los mensajes de validación del lado del cliente. Los tipos compartidos están en `src/types.ts`. Se agrupan por tema: `campus` (cursos, materiales, tareas, entregas, anuncios, asistencia y notificaciones de Tesla), `notas` (notas por competencias del CNEB, `levelFromScore`), `comunicados`, `mensajes`, `calendario`, `panel` (panel de dirección, `THRESHOLDS`), `cuentas` (RPC de administración de cuentas) y `tesla` (puntos, logros y tienda del "Perfil Tesla").

**Las páginas cargan datos con `useAsync`** (`src/lib/useAsync.ts`), que se suscribe al bus de sincronización en segundo plano de `src/lib/sync.ts` (recarga cada 2 minutos, al volver a la pestaña y al recuperar internet; las recargas silenciosas solo repintan si los datos cambiaron, según `sameData`). Usa `{ live: false }` en pantallas donde el usuario edita los datos cargados. `mutate` permite cambios optimistas y devuelve una función para deshacerlos. `sync.ts` también detecta versiones nuevas publicadas comparando el bundle con hash de `/index.html`.

**Archivos (dos modos, `FILE_UPLOADS` en `src/lib/links.ts`):** la dirección elige el modo en **Sistema → Archivos**. Se guarda en la base (`campus_private.settings`, clave `file_uploads`; se lee con `campus_file_uploads()` y se cambia con `set_campus_file_uploads()`, ambas del script 21). La app lo lee en `bootstrap.tsx` antes de montar (y lo guarda en localStorage) y en cada sincronización. `FILE_UPLOADS` es un `export let` que siempre tiene el valor actual; usa `useFileUploads()` si un componente tiene que repintarse al cambiar. `VITE_FILE_UPLOADS` es solo el respaldo si falta el script 21. Por defecto es el **modo enlaces** (plan gratuito de Supabase): nada se sube a Storage; materiales, adjuntos, entregas y constancias son enlaces de Drive, Docs, YouTube, etc., guardados en las mismas columnas de ruta (`attachment_path`, `files[].path` con `type: 'link'`). Regla: una ruta que empieza con `https://` es un enlace externo (`isExternal`); `signedUrl`, `PreviewProvider` y `StoredFileCard` ya la manejan, y la vista previa incrusta Drive, Docs y YouTube. En modo enlaces se ocultan las notas de voz, las fotos del chat, las anotaciones sobre imágenes y las imágenes de premios, y cada servicio de subida llama a `assertUploads()`. Las políticas restrictivas de `campus_21_modo_enlaces.sql` también bloquean las subidas en la base mientras `campus_file_uploads()` sea falso. En modo archivos se usan buckets privados (`campus-materials`, `campus-submissions`, `campus-rewards`, etc.) que se abren con enlaces firmados de corta duración. Cualquier subida nueva debe respetar ambos modos.

**Interfaz:** los componentes base están en `src/components/ui/index.tsx` (Button, campos, Empty, Loading, paneles que suben desde abajo, etc.) y el marco y menú de la app en `src/components/layout/Shell.tsx`. Diseño pensado primero para celular. Usa el alias `@/` para `src/`.

**Temas:** los colores de Tailwind son variables CSS definidas en `src/index.css` (formato `R G B`) con valores para modo claro y oscuro; el modo oscuro es la clase `dark`, que `public/theme-init.js` aplica antes de pintar. Usa los nombres semánticos (`tinta`, `chispa`, `papel`, `superficie`, `linea`, `texto`/`texto-suave`, `estado-ok|tarde|alerta|info`) en vez de los colores de Tailwind por defecto. Ojo: `text-tinta` usa su propia variable `--tinta-ink` para aclararse en modo oscuro, mientras que `bg-tinta` sigue siendo azul oscuro.

**Publicación:** Netlify (`netlify.toml`): redirección de SPA, Node 20 y una CSP estricta. Cualquier origen externo nuevo (scripts, imágenes, iframes, llamadas a APIs) debe agregarse a la CSP ahí o se bloqueará en producción. Por ahora solo se permiten `*.supabase.co`, los videos de `youtube-nocookie.com` y los iframes de `drive.google.com` y `docs.google.com` (vista previa del modo enlaces).
