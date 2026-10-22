# Campus Virtual Tesla · Fase 1

Campus virtual para la I.E.P. Nikola Tesla. Usa la **misma base de Supabase** que Tesla Control Escolar y el mismo stack (React 18 + Vite + TypeScript + Tailwind + supabase-js), pero es una **app aparte** que se publica en otro sitio de Netlify.

## Qué incluye la Fase 1

| Módulo | Qué hace |
|---|---|
| Cuentas y roles | Alumnos y familias entran con su DNI; docentes y personal con su correo. Cambio de contraseña obligatorio en el primer ingreso. Creación masiva por aula con fichas imprimibles. |
| Aula virtual | Cada curso tiene novedades, materiales (archivos, enlaces y videos de YouTube) y tareas. |
| Tareas y entregas | El docente publica tareas con fecha límite; el alumno entrega texto y hasta 5 archivos; el docente califica con nota (0 a 20) o nivel de logro (AD, A, B, C), comenta o devuelve para corregir. |
| Panel de la familia | La semana del hijo en frases, asistencia del mes (datos de Tesla), tareas y notas, notificaciones del colegio, pensiones, avisos y el resumen semanal. |
| Anuncios | Para todo el colegio (dirección), para un aula (tutor) o para un curso (docente). |
| Resumen semanal | Se genera en la base de datos cada viernes (o con un botón) y la familia lo puede copiar para WhatsApp. |
| Seguridad | Reemplaza las políticas abiertas de Tesla por RLS por rol: cada persona ve solo lo que le corresponde. |

```
campus-tesla/
├── supabase/
│   ├── campus_01_roles_y_vinculos.sql   Roles, vínculo alumno/apoderado ↔ cuenta, funciones de seguridad
│   ├── campus_02_tablas_campus.sql      Cursos, anuncios, materiales, tareas, entregas, resúmenes
│   ├── campus_03_rls.sql                Políticas RLS de TODA la base (Tesla + campus)
│   ├── campus_04_storage.sql            Buckets privados de archivos
│   ├── campus_05_funciones.sql          Vincular cuentas, resumen semanal, revisión de funciones
│   ├── campus_06_piloto.sql             Áreas curriculares y cursos del aula piloto
│   └── functions/campus-accounts/       Edge Function para crear cuentas y restablecer claves
└── app/                                 La app del campus (Vite + React)
```

---

## Instalación paso a paso

### 1. Haz un respaldo

El script 03 **reemplaza todas las políticas de seguridad** de las tablas de Tesla. Antes de empezar, en Supabase ve a **Database → Backups** y confirma que tienes un respaldo reciente (o exporta la base con `pg_dump`).

### 2. Revisa los roles actuales

En **SQL Editor** ejecuta:

```sql
select role, count(*) from public.profiles group by role;
```

Solo deben aparecer `ADMIN`, `MANAGEMENT` y `AUXILIARY` (en mayúsculas o minúsculas, da igual). Si aparece otro valor, corrígelo antes de seguir; el script 01 se detiene si encuentra un rol desconocido para no dejar a nadie sin acceso.

### 3. Ejecuta los scripts SQL en orden

En **SQL Editor**, copia y ejecuta uno por uno:

1. `campus_01_roles_y_vinculos.sql`
2. `campus_02_tablas_campus.sql`
3. `campus_03_rls.sql` → al final muestra una lista de revisión; debe salir vacía.
4. `campus_04_storage.sql`
5. `campus_05_funciones.sql` → al final muestra las funciones de Tesla que debes proteger (paso 4).
6. `campus_06_piloto.sql` → carga las áreas curriculares. El bloque de cursos del piloto está comentado; también puedes crear los cursos desde la app (recomendado).

Todos los scripts se pueden volver a ejecutar sin problema.

### 4. Protege las funciones SECURITY DEFINER de Tesla

Tesla usa funciones como `get_student_case_file`, `get_school_report_summary` o `close_classroom_attendance`. Si son `SECURITY DEFINER`, **ignoran la seguridad por filas**: un alumno con sesión podría llamarlas y ver datos de todo el colegio.

El script 05 lista cuáles no están protegidas. Para cada una, abre su definición (**Database → Functions**) y agrega esta línea al inicio del cuerpo:

```sql
if not public.is_staff() then
  raise exception 'No autorizado';
end if;
```

Si la función está escrita en `language sql` (no plpgsql), agrega `where public.is_staff()` a su consulta principal. Si prefieres, envíame las definiciones y te devuelvo la versión protegida.

### 5. Parche para Tesla Control Escolar

Alumnos y familias ya no pueden modificar datos (lo impide la base), pero conviene que Tesla ni siquiera les deje entrar. En `src/App.tsx` de Tesla, dentro de `loadAuthenticatedWorkspace`, justo después de obtener el perfil:

```ts
// Justo después de:  if (!result.error && result.data) { profile = { ... } ... }
const CAMPUS_ONLY_ROLES = ['TEACHER', 'STUDENT', 'GUARDIAN']
if (profile && CAMPUS_ONLY_ROLES.includes(profile.role.toUpperCase())) {
  await supabase.auth.signOut()
  setAppError('Esta cuenta es del Campus Virtual. Ingresa desde el campus.')
  return
}
```

Y **mueve** la llamada `getClassrooms()` para que ocurra después de esa comprobación.

### 6. Configura Authentication en Supabase

En **Authentication → Providers → Email**:

- Desactiva **Allow new users to sign up**. Las cuentas solo las crea el colegio.
- Deja **Confirm email** como quieras: las cuentas creadas por el campus ya vienen confirmadas.
- Sube **Minimum password length** a 8.

En **Authentication → URL Configuration** agrega la URL del campus en *Redirect URLs*.

### 7. Despliega la Edge Function de cuentas

Con la [CLI de Supabase](https://supabase.com/docs/guides/cli) instalada y el proyecto vinculado (`supabase link`):

```bash
cd campus-tesla
supabase functions deploy campus-accounts
supabase secrets set LOGIN_DOMAIN=campus.tesla.edu.pe
supabase secrets set CAMPUS_ALLOWED_ORIGINS=https://TU-SITIO-DEL-CAMPUS.netlify.app,http://localhost:5173
```

`LOGIN_DOMAIN` es un dominio interno para las cuentas con DNI (por ejemplo `alumno.71234567@campus.tesla.edu.pe`). No se envían correos a ese dominio. Debe ser **igual** a `VITE_LOGIN_DOMAIN` de la app.

### 8. Levanta la app

```bash
cd campus-tesla/app
cp .env.example .env.local     # completa URL y anon key (las mismas de Tesla)
npm install
npm run dev                    # http://localhost:5173
```

Para publicarla, crea un **sitio nuevo en Netlify** apuntando a la carpeta `app/` con estas variables de entorno:

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | La misma de Tesla |
| `VITE_SUPABASE_ANON_KEY` | La misma de Tesla (publishable/anon, nunca la service_role) |
| `VITE_LOGIN_DOMAIN` | El mismo valor del secreto `LOGIN_DOMAIN` |

`netlify.toml` ya trae el build, la redirección para las rutas y las cabeceras de seguridad.

### 9. Arma el piloto

1. Ingresa al campus con una cuenta **ADMIN** o **MANAGEMENT** de Tesla (tu mismo correo y clave).
2. **Cuentas → Nueva cuenta de docente**: crea a los docentes del piloto. Anota o imprime sus claves temporales.
3. **Cursos por aula**: elige el aula piloto, asigna el tutor y agrega los cursos con su docente.
4. **Cuentas → Alumnos y familias por aula**: elige el aula piloto, marca *Incluir familias* y pulsa *Crear cuentas faltantes*. Imprime las fichas: cada una trae la dirección del campus, el DNI y la contraseña temporal.
5. Los alumnos o familias sin DNI en Tesla aparecen como *Falta DNI*. Complétalo en Tesla y vuelve a pulsar el botón; solo se crean las que faltan.

Si una familia olvida su clave, en la misma pantalla está **Nueva clave**.

---

## Cómo ingresa cada persona

| Quién | Pestaña | Usuario | Primera vez |
|---|---|---|---|
| Alumno | Alumno | Su DNI | Clave temporal de la ficha → crea su propia clave |
| Padre, madre o apoderado | Familia | Su DNI | Igual que el alumno |
| Docente | Docente | Su correo | Igual |
| Dirección / administración / auxiliar | Docente | Su correo de Tesla | Su clave de siempre |

Una familia con varios hijos en el colegio ve un selector para cambiar de hijo.

## Qué puede ver y hacer cada rol

| Rol | Tesla (asistencia, notificaciones…) | Campus |
|---|---|---|
| ADMIN / MANAGEMENT | Todo, como antes | Todo: cursos, cuentas, anuncios del colegio, calificar cualquier curso |
| AUXILIARY | Todo, como antes | Ve cursos y entregas; no edita |
| TEACHER | Lee asistencia, notificaciones y alertas de sus aulas | Gestiona sus cursos; si es tutor, publica avisos del aula |
| STUDENT | Lee solo su asistencia y notificaciones | Ve sus cursos, entrega tareas, ve sus notas |
| GUARDIAN | Lee la asistencia, notificaciones y pensiones de sus hijos | Ve cursos, tareas y notas de sus hijos (solo lectura) |

Reglas que la base hace cumplir aunque alguien manipule la app:

- Un alumno solo entrega sus propias tareas, no puede ponerse nota y no puede cambiar una entrega ya calificada.
- Un docente califica pero no puede alterar el trabajo del alumno, ni poner una nota mayor que la máxima.
- Las entregas tardías se marcan solas; si la tarea no las acepta, la base las rechaza.
- Nadie puede cambiarse el rol a sí mismo.
- Las notificaciones anuladas en Tesla no se muestran a las familias; las alertas internas nunca.
- Los archivos son privados y se abren con enlaces temporales de 10 minutos.

## Resumen semanal automático

Para generarlo cada viernes a las 5:00 p. m. (hora de Lima), activa la extensión **pg_cron** (Database → Extensions) y ejecuta:

```sql
select cron.schedule('campus-weekly-digest', '0 22 * * 5', $$select public.generate_weekly_digests()$$);
```

También se puede generar a mano desde **Cursos por aula → Generar resumen semanal**.

## Lista de prueba del piloto

- [ ] Un alumno entra con su DNI, cambia su clave y ve sus cursos.
- [ ] El docente publica un anuncio, sube un PDF y crea una tarea.
- [ ] El alumno entrega la tarea con una foto; el docente la ve en *Por revisar*.
- [ ] El docente califica; el alumno y su familia ven la nota y el comentario.
- [ ] La familia ve la asistencia del mes igual que en Tesla.
- [ ] Un alumno intenta abrir `/tarea/ID` de otra aula y no ve nada.
- [ ] Tesla sigue funcionando normal para auxiliares y dirección.

---

# Fase 2

| Módulo | Qué hace | Script |
|---|---|---|
| Notas por competencias | Registro por bimestre de las competencias del CNEB (AD, A, B, C) con conclusión descriptiva. Las tareas vinculadas a una competencia sugieren el nivel. Consolidado del aula, libreta en PDF y exportación CSV para el SIAGIE. | `campus_07_notas.sql` |
| Comunicados | Dirección (a todo el colegio, por nivel o por aula) o el tutor (a su aula) envían comunicados. Se ve quién leyó; opcionalmente piden “Autorizo / No autorizo” con firma dibujada. | `campus_08_comunicados.sql` |
| Mensajería | Chat docente ↔ familia por alumno. Horario de atención: fuera de horario el mensaje llega sin notificar. Dirección revisa conversaciones dejando registro del motivo. | `campus_09_mensajeria.sql` |
| Calendario y horario | Horario semanal por aula, calendario escolar (exámenes, feriados, actividades, reuniones) y agenda que junta tareas y eventos. Carga los feriados del Perú. | `campus_10_calendario.sql` |
| Notificaciones push | Tarea nueva, nota publicada, tardanza de Tesla, comunicado, mensaje y resumen del viernes (con botón de WhatsApp). | `campus_11_push.sql` + `functions/campus-push` |

## Instalación de la Fase 2

1. En **SQL Editor** ejecuta en orden `campus_07` → `campus_11`. Se pueden volver a ejecutar.
2. Notificaciones push:
   ```bash
   cd campus-tesla
   supabase functions deploy campus-push --no-verify-jwt
   supabase secrets set --env-file supabase/push-secrets.env
   ```
   Luego ejecuta en SQL Editor `supabase/push-config.local.sql` (URL de la función + secreto).
   `push-secrets.env` y `push-config.local.sql` están en `.gitignore`: **no los subas**. Para producción genera claves nuevas (`npx web-push generate-vapid-keys`) y un secreto nuevo.
3. Agrega en Netlify (y en `.env.local`) `VITE_VAPID_PUBLIC_KEY` con la clave pública VAPID.
4. (Opcional) Reintento de avisos cada 5 minutos con pg_cron: bloque comentado al final de `campus_11_push.sql`.

## Valores por defecto (se cambian sin tocar código)

| Qué | Valor | Dónde se cambia |
|---|---|---|
| Bimestres | I: 9 mar–8 may · II: 18 may–17 jul · III: 3 ago–2 oct · IV: 12 oct–18 dic | App → **Bimestres** |
| Escala tarea → nivel | 18–20 AD · 14–17 A · 11–13 B · 0–10 C | `levelFromScore` en `app/src/services/notas.ts` |
| Competencias | CNEB oficial de Primaria y Secundaria (sin competencias transversales) | Tabla `competencies` |
| Horario de atención | Lunes a viernes, 07:30–16:00 | Cada docente en **Mensajes → Horario de atención** |
| Feriados | Nacionales del Perú + vacaciones de medio año | App → **Agenda** (dirección) |

## Flujo de un bimestre

1. Los docentes registran en **Notas** (o desde el curso → *Registro de notas*). Al crear tareas marcan qué competencias evalúan.
2. El tutor revisa el **Consolidado**, escribe la apreciación de cada alumno e imprime las **Libretas del aula**.
3. Dirección en **Bimestres**: *Cerrar notas* y luego *Publicar libreta*. Las familias reciben la libreta en el campus.
4. **Exportar SIAGIE** descarga el CSV por área. Compáralo con la plantilla de importación del SIAGIE antes de cargarlo.

## Lista de prueba de la Fase 2

- [ ] El docente registra niveles, usa “Completar con sugeridos” y escribe conclusiones para B y C.
- [ ] Con el bimestre cerrado el docente no puede editar; dirección sí.
- [ ] La familia no ve notas hasta que se publica el bimestre; luego imprime su libreta.
- [ ] El tutor envía un comunicado con autorización; la familia firma desde el celular; el tutor ve la firma.
- [ ] La familia escribe a un docente fuera de su horario: el mensaje llega, sin notificación.
- [ ] Dirección revisa una conversación y queda en `conversation_access_log`.
- [ ] Una tardanza registrada en Tesla llega como notificación al celular de la familia.
- [ ] En iPhone: instalar el campus en inicio y activar notificaciones.



## Panel de dirección

Es el inicio de ADMIN, MANAGEMENT y AUXILIARY. Ejecuta antes `campus_12_panel_direccion.sql`. “Cursos por aula” pasa a `/admin/cursos`.

| Bloque | Qué mide |
|---|---|
| Indicadores | Asistencia registrada, puntualidad, tareas entregadas, logro A o AD, comunicados leídos y entregas sin calificar hace más de 7 días |
| Por aula | Los mismos indicadores por aula, ordenables; cada aula abre su consolidado |
| Rendimiento por área | Distribución AD/A/B/C del bimestre por área (todas las aulas o una) |
| Docentes | Entregas sin calificar y su antigüedad, demora promedio en calificar y avance del registro del bimestre |
| Familias | Alumnos cuyas familias no leen los comunicados o no responden autorizaciones; avisa si la familia no tiene cuenta y permite escribirle |

Filtros: bimestre o últimos 30 días, y nivel (Primaria/Secundaria). Las alertas usan umbrales del colegio en `THRESHOLDS` de `app/src/services/panel.ts` (por ejemplo, asistencia: atención bajo 85 %, crítico bajo 75 %). Los días de clase descuentan fines de semana y feriados del calendario. “Asistencia registrada” cuenta ingresos registrados en Tesla: un día sin registro no siempre es una falta.

## Administración sin entrar a la base

Ejecuta `campus_13_crear_usuarios.sql` y `campus_14_admin_cuentas.sql`. Desde entonces la Edge Function `campus-accounts` es opcional: todo se hace desde la plataforma con una cuenta ADMIN o MANAGEMENT.

| Pantalla | Qué hace |
|---|---|
| Cuentas → Alumnos y familias | Por aula: crea las cuentas que faltan e imprime las fichas. Los alumnos sin DNI reciben un código provisional (`A0000024`); cuando Tesla tenga su DNI, el mismo botón pasa su usuario al DNI sin cambiar la contraseña. Nueva clave y desactivar. |
| Cuentas → Docentes | Crear, editar nombre o correo, nueva clave, desactivar y saltar a sus cursos. |
| Cuentas → Personal | Cuentas de administración, dirección o auxiliar (solo consulta). |
| Cursos por aula → Por aula | Tutor, cursos y docente de cada aula; **Copiar a otras aulas** (por ejemplo 1.° A → 1.° B), con o sin docentes. |
| Cursos por aula → Por docente | Elige un docente y toca las áreas de cada aula para asignarlas, quitarlas o reasignarlas; también lo haces tutor. |

**Cuenta de una sola persona** (script 26, `campus_26_cuenta_individual.sql`): en **Cuentas → Alumnos y familias**, cada alumno o familia sin cuenta tiene su propio botón **Crear cuenta**, y un buscador por nombre o DNI para encontrarla. Crea solo esa cuenta y muestra su ficha imprimible; si ya tiene cuenta no la duplica, y a una familia sin DNI en Tesla no se le crea. Sin el script, la pantalla avisa que falta ejecutarlo. «Crear cuentas faltantes» sigue creando todas las del aula.

Una cuenta desactivada no puede iniciar sesión (ni en el campus ni en Tesla) y pierde sus permisos; reactivarla los devuelve.

## Experiencia de uso

- **Sincronización sola:** cada pantalla se actualiza en segundo plano cada 2 minutos, al volver a la pestaña y al recuperar internet. Solo se repinta lo que cambió. Si se publica una versión nueva del campus, se aplica en el siguiente cambio de pantalla (o con el aviso “Actualizar”).
- **Modo oscuro:** sigue al celular o computadora; se cambia con el botón de tema.
- **Búsqueda rápida (Ctrl + K):** docentes y dirección saltan a cualquier alumno (nombre o DNI), curso o tarea.
- **Archivos:** arrastrar y soltar, foto con la cámara del celular, miniaturas y vista previa de PDF e imágenes dentro del campus.
- **Celular primero:** las ventanas son paneles que suben desde abajo y se cierran deslizando; la agenda y el horario cambian de mes o día deslizando.
- **Recorrido de bienvenida** de 3 pasos en el primer ingreso (según el rol).

## Perfil Tesla (puntos, logros, personalización y canjes)

Ejecuta `campus_15_perfil_tesla.sql` (requiere del 01 al 14; se puede volver a ejecutar). No cambia ninguna tabla existente: solo agrega el tipo de aviso push `TESLA` y un trigger en `submissions` que **nunca bloquea** una entrega ni una calificación.

| Moneda | Para qué |
|---|---|
| **XP** | No se gasta. Define el nivel: nivel N empieza en `100 × N × (N−1) / 2` XP (nivel 2 = 100, 5 = 1000, 10 = 4500). |
| **Monedas** | Se ganan con las mismas acciones y se gastan en la tienda o en cosméticos. Al pedir un canje quedan reservadas. |

| Pantalla | Quién | Qué hace |
|---|---|---|
| `/perfil-tesla` | Alumno y familia | Portada (avatar con marco, tema, título, nivel, XP, monedas, racha, 3 insignias, bio), logros con progreso, historial de puntos, metas y ranking del aula, y **Personalizar** (solo el alumno). |
| `/perfil-tesla/ID` | Compañeros, docentes y personal | El mismo perfil. Los compañeros no ven monedas ni historial. Docentes y dirección pueden reconocer, otorgar logros y borrar una bio inapropiada (tutor o dirección). |
| `/tienda` | Alumno (canjea) y familia (consulta) | Catálogo, saldo, solicitudes y su estado; cancelar una pendiente. |
| `/tesla/aula` | Docentes y personal | Alumnos del aula con botón **Reconocer**, bandeja de canjes y metas cooperativas. |
| `/admin/recompensas` | ADMIN y MANAGEMENT | Canjes de todo el colegio; recompensas (precio, stock, imagen, límite, vigencia, nivel); logros; reglas, topes y cierre del mes; cosméticos. |

**Puntos automáticos** (se editan en Recompensas → Reglas y topes): tarea a tiempo (10 XP, 2 monedas), tarea con A/AD o desde 14/20 (15, 3), racha de 5 tareas seguidas a tiempo (30, 10), asistencia completa del mes (40, 15) y mes sin tardanzas con al menos 90 % de asistencia (40, 15). La asistencia sale de Tesla al **cerrar el mes**: con el botón de la pantalla de reglas o con pg_cron (bloque al final del script). Cerrar dos veces el mismo mes no duplica puntos.

**Reconocimientos**: categoría + motivo. Topes por defecto: 15 por docente al día, 3 por alumno al día y 1 del mismo docente al mismo alumno por día.

**Logros**: 16 iniciales (bronce, plata, oro y platino; 2 secretos, 1 de temporada por bimestre). Los automáticos se otorgan solos; los docentes solo otorgan los manuales (por ejemplo, *Corazón Tesla*) y dirección cualquiera.

**Canjes**: el alumno pide → monedas reservadas → el **tutor del aula** o dirección aprueba o rechaza (con motivo) → se marca **entregado**. Si se rechaza, se cancela o vence (7 días por defecto), se devuelven monedas y stock. Hay aviso push en cada cambio de estado; al tutor le llega cada solicitud nueva.

**Ranking**: solo de **constancia** (entregas a tiempo, rachas, asistencia y puntualidad del bimestre) o **mejora** frente al bimestre anterior. Nunca de notas. Se puede apagar para todo el colegio, y cada alumno puede ocultarse. Las familias solo ven la posición de su hijo.

Seguridad: los saldos y el historial solo se escriben con funciones de la base (nadie puede sumarse puntos editando tablas); las imágenes de la tienda van en el bucket privado `campus-rewards`.

### Fondos, banners animados y Estrellas Tesla

Ejecuta `campus_16_fondos_e_insignias.sql` después del 15 (se puede volver a ejecutar; si repites el 15, repite también el 16).

- **Fondo del perfil** (nuevo cosmético): ocupa toda la página del perfil, como en Steam. Hay 13 iniciales: 3 gratis (sin fondo, *Cuaderno*, *Cordillera*), 3 por nivel, 1 por logro y 6 en venta (*Sakura*, *Código*, *Aurora*, *Circuito*, *Synthwave* y *Bobina de Tesla*, la más cara).
- **Banners animados**: los banners pueden ser un degradado (como antes) o una escena. Se agregan 8 (1 gratis, 2 por nivel, 1 por logro y 4 en venta).
- **Escenas**: las dibuja la app con CSS y SVG (`src/components/scenes.tsx`), así que no dependen de imágenes con derechos de autor ni de la CSP. Las miniaturas solo se mueven al pasar el cursor, y todo queda quieto si el dispositivo pide reducir el movimiento.
- **Imágenes o videos propios**: en Recompensas → Cosméticos, dirección puede subir una imagen (JPG, PNG, WebP o GIF de hasta 4 MB) o un video en bucle (WebM o MP4 de hasta 12 MB) para un banner o un fondo. Se guardan en `campus-rewards/cosmetics/`.
- **Estrellas Tesla** (inspiradas en las *Stella* de SPY×FAMILY): reemplazan la idea de rango por metal. Bronce (nivel 2), Plata (5), Oro (8) y **Gran Estrella Tesla** (12); dentro de cada una se suman de 1 a 3 estrellitas. Los niveles se cambian en Reglas y topes. Cada Estrella es también un **pin físico**: al ganarla llega un aviso push, y el tutor o dirección registra la entrega en la pestaña **Estrellas** de `/tesla/aula` o de `/admin/recompensas`. El alumno ve en su perfil qué pines ya recibió.

### Perfil Tesla+ (efectos, retos, cofres y trayectoria)

Ejecuta `campus_17_perfil_tesla_plus.sql` después del 16 (se puede volver a ejecutar).

| Novedad | Qué hace |
|---|---|
| **Ceremonia** | Al entrar al campus después de subir de nivel, el alumno ve una animación a pantalla completa (confeti y el pin que cae si ganó una Estrella). Se recuerda en el dispositivo para no repetirla. |
| **Efectos del nombre y auras** | Dos cosméticos nuevos: el nombre puede ser dorado, hielo, neón, eléctrico, arcoíris, fuego o glitch, y el avatar puede llevar chispas, halo, órbita, plasma, pétalos, estelar o la Corona Tesla. Se ven en el perfil y en las tarjetas del aula. |
| **Perfil vivo** | El fondo se mueve un poco con el mouse o al inclinar el celular, los paneles se ven en vidrio sobre el fondo y la barra de XP toma los colores del fondo elegido. |
| **Vitrina** | El alumno elige hasta 4 bloques bajo su portada: racha, estadísticas, Estrellas, chispas y últimos logros. Solo se publica lo que elige. |
| **Chispas** | Un alumno le da una chispa a un compañero de su aula con un motivo positivo (me ayudó, trabajo en equipo…). Tiene 3 al día, una por compañero. Quien la recibe gana 5 XP y 1 moneda (máximo 3 al día) y le llega un aviso. Hay logros nuevos por recibir chispas. |
| **Misiones semanales** | 5 iniciales que se renuevan cada lunes. El alumno reclama el premio al cumplirlas. Se editan en Recompensas → Retos. |
| **Pase de temporada** | Cada bimestre, la XP ganada desbloquea 11 premios: monedas y cosméticos exclusivos (tipo «Pase de temporada»). Se pueden definir premios propios para un bimestre. |
| **Cofres sorpresa** | Se abren solo con monedas ganadas (nunca con dinero) y muestran sus probabilidades. Dan cosméticos de tipo «Cofres sorpresa»; si ya tiene todos, se devuelve la mitad del precio. |
| **Trayectoria** | Pestaña con los hitos del alumno: niveles, Estrellas, pines entregados, logros, chispas, premios de temporada y reconocimientos (estos últimos solo para quien puede ver los datos privados). |
| **Compartir** | El alumno o su familia descargan (o comparten desde el celular) una imagen del perfil lista para WhatsApp. Se genera en el navegador. |

## Campus completo (scripts 18, 19 y 20)

Ejecuta en orden `campus_18_aprendizaje.sql`, `campus_19_gestion.sql` y `campus_20_comunicacion.sql` (se pueden volver a ejecutar) **antes** de publicar la app: la app ya usa sus columnas y funciones.

### Aprendizaje (script 18)
| Novedad | Dónde |
|---|---|
| **Evaluaciones en línea**: opción múltiple, varias correctas, verdadero o falso, relacionar, respuesta corta y desarrollo. Corrección automática, tiempo límite, intentos, orden al azar, guardado automático y modo concentración. La nota pasa sola al registro (y al Perfil Tesla). | Curso → Nueva tarea o evaluación |
| **Banco de preguntas** compartido entre docentes («Al banco» / «Desde el banco»). | Evaluación · Recursos |
| **Rúbricas** con descriptores AD/A/B/C por criterio; al marcarlas, la nota sale sola. El alumno ve la rúbrica antes y después. | Tarea → Usar rúbrica · Recursos |
| **Unidades** con materiales y tareas en secuencia, avance por unidad para el alumno y orden con arrastrar y soltar. | Curso → Unidades |
| **Foro del curso** con mejor respuesta, temas fijados o cerrados y moderación. | Curso → Foro |
| **Tareas en grupo** (una entrega y una nota para todo el grupo, grupos al azar). | Tarea → Hacer en grupos |
| **Reentrega con historial de versiones**. | Tarea → Versiones anteriores |
| **Retroalimentación**: nota de voz, correcciones dibujadas sobre las fotos entregadas y comentarios guardados. | Calificar entrega |
| **Calificación rápida**: J / K (o deslizar) para pasar entre entregas. | Tarea (docente) |
| **Publicación programada** de tareas, materiales y anuncios. | Formularios de creación |
| **Videos con preguntas** intercaladas (YouTube). | Material de video |
| **Duplicar** una tarea a otras secciones y **traer contenido** de otro curso. | Tarea / Curso |
| **Portada animada** del curso (escenas del Perfil Tesla) y **búsqueda dentro del curso** (atajo «/»). | Curso |

### Gestión (script 19)
- **Alertas tempranas** (`/alertas`): tareas vencidas, faltas, tardanzas y notas B/C con puntaje de riesgo; botón para escribir a la familia y **observaciones privadas** (también en la libreta).
- **Panel de alertas del colegio** en el panel de dirección.
- **Citas** (`/citas`): el docente publica horarios y la familia reserva; se exportan al calendario.
- **Justificaciones** (`/justificaciones`): la familia envía el motivo y la constancia; el tutor o secretaría aprueba.
- **Encuestas** (`/encuestas`) con resultados en gráficos.
- **Sistema** (`/admin/sistema`, solo dirección): bitácora de auditoría (notas cambiadas, borrados, claves restablecidas, permisos), estadísticas de uso, errores de la app, **permisos** de coordinación, psicología y secretaría (sin tocar los roles de Tesla), **carga masiva por Excel** (docentes, cursos por aula y horario), **inicio de año escolar** y **respaldo** del año en un archivo.
- **Planificador** (`/planificador`) y **Recursos** (`/recursos`) para docentes; **exportar el registro a Excel** (niveles, conclusiones y competencias).
- **Comparación con el bimestre anterior** en la libreta (siempre contra uno mismo).

### Comunicación (script 20)
- **Avisos**: horario de silencio, fines de semana y elegir qué avisos recibir (`/ajustes`). Los avisos retenidos salen al terminar el silencio (para que salgan puntuales, activa el pg_cron del final del script).
- **Mensajes** con fotos, notas de voz, «escribiendo…» y «visto».
- **Grupos del aula** (`/grupos`) para alumnos o familias, solo docentes o conversación abierta.
- **Anuncios** con reacciones y confirmación de lectura.
- **Tutor IA** por curso (pestaña del curso): ayuda sin dar respuestas, con indicaciones y límite diario del docente. Requiere desplegar la Edge Function `campus-tutor` y el secreto `ANTHROPIC_API_KEY` (instrucciones en `supabase/functions/campus-tutor/index.ts`).

### Experiencia de uso
App instalable con invitación propia, aviso sin conexión y lectura sin conexión de los materiales ya abiertos; borradores automáticos (entregas, tareas y comunicados); «Deshacer» al borrar materiales; atajos de teclado (`?`); ajustes de texto grande, alto contraste y menos movimiento; saludo según la hora con decoración por fecha (inicio de clases, Fiestas Patrias, Canción Criolla, Navidad); transiciones entre pantallas; gráficos animados; pantalla de error amable que se reporta sola.

### Pruebas
`supabase/tests/campus_pruebas.sql`: pruebas de niveles, Estrellas, corrección de evaluaciones, libro de puntos, permisos de funciones, RLS y horario de silencio. Se ejecutan en el SQL Editor dentro de una transacción que se deshace (no cambia datos).

## Modo enlaces (sin subir archivos) · script 21

Con el plan gratuito de Supabase (1 GB de Storage y 500 MB de base de datos) el campus funciona en **modo enlaces**: ningún archivo se sube a Supabase. Los archivos se guardan en Google Drive (o en OneDrive, YouTube, Canva…) y en el campus solo se pega el enlace.

| Dónde | Modo enlaces | Modo archivos |
|---|---|---|
| Materiales del curso | «Documento o enlace» y «Video» | además, «Archivo» |
| Archivo de apoyo de una tarea | Enlace | Archivo de hasta 25 MB |
| Entrega del alumno | Hasta 5 enlaces | Hasta 5 archivos |
| Comunicados y justificaciones | Enlace del adjunto o de la constancia | Archivo |
| Mensajes y grupos | Solo texto (los enlaces se pueden tocar) | Fotos, PDF y notas de voz |
| Corrección del docente | Comentario escrito | Además, nota de voz y anotaciones sobre la imagen |
| Premios, banners y fondos | Ilustraciones y escenas del campus | Además, imágenes y videos propios |

Los enlaces de **Drive, Docs, Hojas de cálculo, Presentaciones, Formularios y YouTube** se ven dentro del campus. Los demás se abren en una pestaña nueva. Para que otros puedan abrirlos, el archivo de Drive debe estar compartido como **«Cualquier persona con el enlace»**; el campus lo recuerda junto a cada campo.

**Instalación:** ejecuta `campus_21_modo_enlaces.sql` en SQL Editor. Deja el campus en modo enlaces, bloquea las subidas a los buckets del campus (incluso por API) sin borrar nada y al final muestra el modo actual y el espacio usado. Si lo vuelves a ejecutar, conserva el modo elegido.

**Cambiar de modo** (por ejemplo, al pasar a un plan de pago): en el campus, con una cuenta ADMIN o MANAGEMENT, ve a **Sistema → Archivos** y elige *Modo enlaces* o *Modo archivos*. No hace falta tocar el SQL ni volver a publicar. La pantalla muestra cuánto espacio se usa frente al límite del plan gratuito, y cada cambio queda en la auditoría. La base hace cumplir el modo elegido, y quien ya tenga el campus abierto lo verá al cambiar de pantalla o al volver a abrirlo. Lo que se creó en un modo se sigue viendo en el otro, porque los dos conviven sin migrar datos.

`VITE_FILE_UPLOADS` solo se usa como respaldo mientras no se haya ejecutado el script 21.

## Perfil Tesla al estilo Steam · script 22

Ejecuta `campus_22_perfil_steam.sql` después del 21 (se puede volver a ejecutar). Si vuelves a ejecutar el 15, el 16 o el 17, ejecuta otra vez el 22 al final: esos scripts reemplazan funciones del perfil. La app nueva funciona también sin el script 22: oculta el muro, los temas y las vitrinas nuevas hasta que lo ejecutes.

Nada de esto sube archivos: temas, marcos, avatares animados, insignias y partículas se dibujan con CSS y SVG, así que funciona igual en modo enlaces y en modo archivos.

| Novedad | Qué hace |
|---|---|
| **Portada nueva** | Banner amplio, avatar grande que entra con animación, nombre con su efecto, bloque de nivel y una fila de estadísticas que cuentan hacia arriba (XP, monedas, racha, logros, chispas y cosméticos). La barra de XP se llena al entrar y lleva un brillo que la recorre. |
| **Dos columnas** | En computadora, el contenido va a la izquierda y a la derecha una barra lateral con el nivel y las Estrellas, la colección de insignias, el muro y los compañeros. En el celular va todo en una columna. |
| **Insignia de nivel** | Cambia de forma y color cada 10 niveles: círculo, hexágono, escudo, estrella, rombo, doble hexágono, engranaje, llama, corona y Estrella Tesla. Desde el nivel 30 brilla. La ceremonia de subida de nivel avisa cuando cambia. |
| **Temas del perfil** | Cosmético nuevo que cambia el color de todos los paneles: Clásico, Medianoche, Verano, Acero, Bosque, Cósmico, Sakura, Neón y Gran Estrella. |
| **Marcos y avatares animados** | 7 marcos (Cristal, Rayo, Circuito vivo, Holográfico, Llamas, Arcoíris y Galaxia) y 8 avatares animados (Robot Tesla, Rayo vivo, Átomo vivo, Búho sabio, Cohete turbo, Planeta, Bobina viva y Dragón de fuego). |
| **Vitrina de hasta 6 bloques** | A los 5 anteriores se suman la caja de texto, la vitrina de logros (elige 6), los logros más raros, la colección (8 cosméticos y el avance del inventario), el proyecto destacado (un enlace) y el curso favorito. Se ordenan arrastrando o con flechas. |
| **Rareza de los logros** | Cada logro muestra qué porcentaje del colegio lo tiene (por ejemplo, «2 % del colegio»). Solo se publican totales, nunca quién lo tiene. Las medallas de oro y platino tienen brillo holográfico y se inclinan con el cursor. |
| **Muro de felicitaciones** | El aula, la familia y los docentes del alumno dejan un sticker y una frase de una lista fija, sin texto libre. Se puede dejar 1 por día a cada alumno y 10 por día en total. Llega un aviso push. El alumno puede cerrar su muro y quitar cualquier mensaje; el autor, el tutor y la dirección también pueden quitarlo. |
| **Mini-perfil** | Al pasar el cursor (o mantener el dedo) sobre un compañero en *Mi aula*, el ranking, el muro o `/tesla/aula`, aparece su tarjeta con banner, avatar, nivel e insignias. |
| **Editor nuevo** | Vista previa fija, inventario por tipo con filtros (Todos, Tengo, Bloqueados, En venta), orden por rareza, nombre o precio, marca de «Nuevo» en lo recién desbloqueado y aviso de cambios sin guardar. |
| **Conjuntos** | Hasta 3 combinaciones guardadas de cosméticos para cambiar de estilo con un toque. |
| **Sonidos** | Suaves, al subir de nivel, abrir cofres, felicitar y equipar. Vienen apagados; cada alumno los activa en Personalizar, y se recuerda en el dispositivo. |
| **Moderación** | El tutor o la dirección pueden quitar la presentación, la caja de texto o el proyecto desde la portada del alumno. |
| **Fondo del mini-perfil** | Cosmético nuevo: la tarjeta que aparece al pasar el cursor se llena con un fondo animado propio (Noche estrellada, Bobina de Tesla, Aurora, Código, Synthwave, Mar profundo, Sakura y Fuegos artificiales, este último por el logro «Muro de la fama»). El editor muestra cómo queda. |
| **Probar antes de comprar** | En Personalizar, tocar un cosmético bloqueado lo muestra en tu portada, tu fondo y tu mini-perfil sin guardarlo. Si se compra, aparece un botón para comprarlo; si no, dice cómo se consigue. La tienda (`/tienda`) lista los cosméticos en venta con el botón «Probármelo». |
| **Nombre con efecto en todo el campus** | En grupos, mensajes, foro y anuncios, el nombre de un alumno lleva su efecto, su avatar e insignia de nivel, y abre su mini-perfil. Solo se ve si puedes ver su perfil (su aula, su familia, sus docentes y el personal). |
| **Logros nuevos** | Primera felicitación, Querido por todos (10) y Muro de la fama (50) por las felicitaciones del muro; Coleccionista (25 %), Gran coleccionista (50 %) y Colección completa (100 %) por los cosméticos; Nueva forma (nivel 20) e Insignia brillante (nivel 30). Se otorgan solos al recibir una felicitación, al conseguir un cosmético o al subir de nivel. |

Todo se queda quieto con **Ajustes → Menos movimiento** o si el dispositivo pide reducir el movimiento. Dirección agrega más temas, marcos y avatares animados en **Recompensas → Cosméticos**.

## Integridad académica · script 23

Ejecuta `campus_23_integridad.sql` después del 22 (se puede volver a ejecutar). Si vuelves a ejecutar el 18, ejecuta otra vez el 23: el 18 reemplaza las funciones del examen. Todo es SQL (gratis, sin servicios externos) y funciona igual en modo enlaces y en modo archivos. La app nueva también funciona sin el script: usa el examen anterior y oculta los reportes.

Son **señales para que el docente revise**, nunca una sanción automática: cada alerta explica sus motivos y el docente la marca como *Revisado*, *Falsa alarma* o *Confirmado*, con una nota privada.

**Evaluaciones en línea** (Preguntas → Configuración → Integridad, con niveles Libre, Estándar y Estricto):

| Función | Qué evita |
|---|---|
| **Respuestas correctas** | Por defecto se muestran después de la fecha límite, y nunca mientras al alumno le queden intentos. Tampoco ve qué preguntas acertó hasta entonces. |
| **Preguntas por alumno** | Cada alumno recibe N preguntas al azar de las que tenga la evaluación (usa el banco de preguntas). |
| **Una pregunta a la vez** | El servidor entrega la siguiente pregunta solo al responder la actual; no se puede volver ni ver las siguientes antes de tiempo. |
| **Código de acceso** | El docente lo dicta en clase; los alumnos no lo pueden leer en la app. Los intentos fallidos se frenan. |
| **Hora límite para empezar** | Nadie empieza después de esa hora (útil para tomarla en clase). |
| **Un solo dispositivo** | Si el intento se abre en otro equipo, queda bloqueado hasta que el docente lo libera desde Resultados. |
| **Al salir de la app** | Registrar, avisar al alumno o enviar la evaluación sola al llegar a N salidas (lo elige el docente). |
| **Modo examen** | Marca de agua con el nombre y la hora, pegar bloqueado (opcional), sin copiar las preguntas, pantalla completa en Android y computadoras, y un aviso previo al alumno con todo lo que se registra. |

**Monitoreo:** salidas de la app y cuánto tiempo, textos pegados, intentos de copiar, salidas de la pantalla completa, pantalla dividida, la evaluación abierta en otra pestaña, cortes de conexión, volver a abrir el intento y el tiempo en cada pregunta. Se envía en lotes y se guarda en el celular si no hay internet. En **Resultados** cada intento lleva un semáforo y, al abrirlo, la pestaña **Integridad** muestra los motivos y la línea de tiempo.

**Análisis después del examen:** parejas de alumnos con las **mismas respuestas incorrectas** o desarrollos casi iguales, preguntas acertadas en menos de 3 segundos, exámenes terminados demasiado rápido y notas muy por encima del promedio del alumno en el curso.

**Entregas de texto** (sección **Originalidad** al calificar):

- **Copia entre alumnos**: huella de cada texto (tramos de 5 palabras, como MOSS) comparada con todas las entregas del colegio, también de otras secciones y años anteriores. Lo que viene de las indicaciones no cuenta. **Comparar** muestra las dos entregas lado a lado con lo común resaltado; si la otra entrega es de un alumno que no tienes a cargo, solo ves la coincidencia.
- **Mismo archivo**: dos alumnos que entregan el mismo enlace de Drive o Docs.
- **Cómo se escribió**: la app registra cuánto se tecleó y cuánto se pegó, el tiempo escribiendo y las sesiones (funciona con los teclados del celular).
- **Indicios de IA**: frases típicas de un chat, caracteres invisibles, formato de chatbot, rayas largas, oraciones de largo muy parejo, exceso de conectores formales y, sobre todo, un **estilo muy distinto al de sus entregas anteriores**.
- Las entregas en grupo no se marcan entre los miembros del mismo grupo.

Ningún detector de IA es seguro: úsalo para conversar con el alumno (por ejemplo, pidiéndole que explique su trabajo en clase).

## Rendimiento en el celular

- **Arranque más liviano**: el inicio de cada rol, el Perfil Tesla, la búsqueda rápida y la bienvenida se descargan solo cuando hacen falta. `npm run build` falla si el primer arranque supera el presupuesto de `app/scripts/size-budget.mjs`.
- **Precarga inteligente**: con buena conexión, las pantallas que más usa cada rol se descargan en un momento libre.
- **Modo ahorro** (Ajustes → Ahorro de datos y batería): sin desenfoques ni animaciones infinitas y con datos actualizados cada 5 minutos. Se activa solo con el ahorro de datos del celular, en redes 2G o 3G o en equipos con poca memoria.
- **Sincronización que no gasta de más**: se pausa tras 5 minutos sin usar la app y durante los exámenes, y se pone al día con el siguiente toque.
- **Exámenes sin conexión**: las respuestas se guardan en el celular y se envían al volver internet, incluido el envío final.

## Retrato Tesla: el expediente de la familia · script 25

Ejecuta `campus_25_expediente.sql` después del 24 (se puede volver a ejecutar). Agrega una sola función de lectura, `child_overview(alumno)`, y no cambia datos ni permisos. Es **solo para la familia** (apoderado vinculado): el alumno, los docentes y la dirección no la abren. Sin el script, la pantalla avisa que todavía no está activada.

En **Retrato Tesla** (menú de la familia y banner en el inicio) se ve, en una sola pantalla y con animaciones propias en SVG y CSS:

| Bloque | Qué muestra |
|---|---|
| **Índice Tesla** | Un círculo animado de 0 a 100 que cambia de color según el rango (Sobresaliente, Muy bien, En buen camino, Podemos mejorar, Necesita apoyo; siempre con la palabra, nunca solo el color) y una frase para la familia. Al tocarlo se ve cómo se calculó. |
| **Cuatro anillos** | Rendimiento, Tareas, Asistencia y Constancia, cada uno con su color y su explicación. |
| **Para tener presente** | Avisos dichos con calma: comunicados por responder, tareas vencidas, tardanzas recientes, justificaciones en revisión y citas. |
| **Rendimiento por áreas** | Radar de las áreas, evolución por bimestre (solo contra el propio alumno) y tabla de niveles AD/A/B/C. |
| **Asistencia** | Conteos y calendario del año con puntuales, tardanzas, feriados y días sin registro. |
| **Tareas, Perfil Tesla y familia** | Tareas del año, nivel y logros recientes, próximos exámenes y actividades, comunicados y estado de las pensiones. |
| **Imprimir** | Una hoja limpia (A4) para guardar en PDF. |

**El índice es referencial y no oficial**: no reemplaza la libreta ni las notas del colegio, y nunca compara a un alumno con otros. Se calcula en la base con estos pesos. Se pueden cambiar sin publicar la app, en `campus_private.settings` (clave `expediente_pesos`); si falta una parte, el índice se recalcula con las demás.

| Parte | Peso | De dónde sale |
|---|---|---|
| Rendimiento | 45 | Niveles del último bimestre **publicado** (AD 100, A 85, B 65, C 40); si aún no hay bimestre publicado, el promedio de las tareas calificadas |
| Tareas | 20 | Entregadas a tiempo (completas) o tarde (60 %) frente a las vencidas del año |
| Asistencia | 20 | Puntual 100 %, tardanza 80 %, frente a los días de clase; las faltas justificadas y aprobadas no restan |
| Constancia | 15 | Racha de tareas a tiempo (60 %) y XP de los últimos 30 días (40 %); solo si existe el Perfil Tesla |

**¿Cómo subir el índice?** Cuatro ideas concretas con lo que pasaría: entregar a tiempo las próximas tareas, ponerse al día con las vencidas (si el docente todavía las recibe), cinco días puntuales, alargar la racha o subir de nivel el área más baja. Al pasar el cursor, enfocar o tocar una idea, el círculo dibuja hasta dónde llegaría; hay un botón para ver «todo junto». Usa las mismas fórmulas del índice y solo muestra mejoras de al menos 1 punto, y se aclara que es una simulación, no una promesa de nota.

**Hoy en el colegio:** el horario del día con la clase en curso resaltada (barra de avance y minutos que faltan), las clases ya terminadas, lo que toca mañana o el lunes y las tareas por vencer. Se actualiza solo cada medio minuto y avisa si hoy es feriado o no hay clases.

**Historial del índice** (script 27, `campus_27_historial_expediente.sql`, se puede volver a ejecutar): guarda una foto del índice por alumno y por semana (hora de Lima) y la app dibuja la línea de progreso con las franjas de cada rango. Empieza a guardarse al ejecutar el script (no reconstruye el pasado): la familia la guarda al abrir el Retrato, y para que no dependa de eso hay un bloque opcional con pg_cron al final del script (`expediente_snapshot_all()`). Cuando el índice **sube de rango** respecto de la última vez que se abrió en ese dispositivo, el Retrato lo celebra con confeti y el aviso «¡Sofía subió a Muy bien!». Sin el script 27, el historial se oculta y todo lo demás funciona.

Privacidad: las notas de un bimestre no se ven hasta que dirección lo publica, y no se muestran observaciones privadas ni datos de integridad o anti-trampa. No sube archivos, así que funciona igual en modo enlaces y en modo archivos. Con «Menos movimiento», el modo ahorro o la preferencia del dispositivo, todo queda quieto en su estado final.

## Qué sigue

Competencias transversales y comportamiento en la libreta, la plantilla oficial del SIAGIE (cuando el colegio comparta el formato exacto) y el campus en quechua.

## Panel anti-trampa · script 24

Ejecuta `campus_24_panel_antitrampa.sql` después del 23 (se puede volver a ejecutar). Agrega una sola función de lectura, `integrity_overview(días)`, y no cambia datos ni permisos.

En **Menú → Anti-trampa** (dirección y docentes) se ve:

- **Estado e indicadores** de los últimos 7, 30 o 90 días: evaluaciones protegidas, intentos monitoreados, salidas y pegados detectados, envíos automáticos, intentos desde otro dispositivo, entregas analizadas y alertas revisadas. Dirección ve todo el colegio; cada docente, solo sus evaluaciones y tareas.
- **Los 23 sistemas en cuatro capas** (antes de empezar, durante el examen, al corregir y tareas escritas), con su estado y cuántas veces actuó cada uno.
- **Laboratorio en vivo** para comprobar que funcionan, con el mismo código que protege las evaluaciones reales: un examen de prueba en modo estricto (salir de la pestaña, pegar, copiar, clic derecho, pantalla completa, pantalla dividida, otra pestaña, sin internet; a la tercera salida «se envía sola»), un cuadro de escritura que mide tecleado frente a pegado e indicios de IA, y una comparación de dos entregas que marca los tramos copiados. Nada de lo que se hace en el laboratorio se guarda.

Sin el script 24 la sección funciona igual, pero sin los números (muestra un aviso).
