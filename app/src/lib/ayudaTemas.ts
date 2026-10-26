import type { HelpGroup } from '@/lib/ayuda'

// Textos de «¿Cómo se hace?». Vive aparte para que no pese en el primer arranque:
// solo lo carga el panel de ayuda.

export type HelpTopic = {
  /** Clave estable: también es la clave del video en la base (minúsculas, números y guiones). */
  id: string
  title: string
  /** Una línea que dice para qué sirve. */
  summary: string
  groups: HelpGroup[]
  steps: string[]
  /** Atajo a la pantalla donde se hace. */
  to?: { label: string; path: string }
  /** Consejo extra, por ejemplo qué hacer si algo no aparece. */
  tip?: string
}

const INSTALL_STEPS = [
  'En Android con Chrome: toque los tres puntos de arriba a la derecha y elija «Instalar aplicación» o «Agregar a la pantalla principal».',
  'En iPhone con Safari: toque el botón Compartir (el cuadrado con una flecha) y elija «Añadir a pantalla de inicio».',
  'Desde ahora abrirá el campus tocando su ícono, como cualquier otra aplicación.',
]

export const HELP_TOPICS: HelpTopic[] = [
  // ---- Familias ----
  {
    id: 'familia-notas', title: 'Ver las notas de mi hijo', summary: 'La libreta con las notas de cada bimestre.', groups: ['GUARDIAN'],
    steps: ['Toque «Más» (abajo a la derecha) y luego «Libreta».', 'Elija el bimestre que quiere ver.', 'Si tiene varios hijos, cambie de hijo con el selector de arriba.'],
    to: { label: 'Abrir la libreta', path: '/libreta' },
    tip: 'La libreta aparece cuando el colegio la publica al cierre de cada bimestre. Antes de eso no habrá notas que ver.',
  },
  {
    id: 'familia-comunicados', title: 'Leer y responder un comunicado', summary: 'Reemplaza a la agenda: se lee y se firma desde el celular.', groups: ['GUARDIAN'],
    steps: ['Toque «Comunicados» (en «Más»).', 'Toque el comunicado para leerlo completo.', 'Si pide su respuesta, elija «Autorizo» o «No autorizo», firme con el dedo y toque «Enviar respuesta».'],
    to: { label: 'Abrir comunicados', path: '/comunicados' },
  },
  {
    id: 'justificar', title: 'Justificar una falta o tardanza', summary: 'Avise al colegio por qué su hijo faltó o llegó tarde.', groups: ['GUARDIAN'],
    steps: ['Toque «Más» y luego «Justificaciones».', 'Elija «Falta» o «Tardanza».', 'Ponga la fecha («Desde» y «Hasta») y escriba el motivo con sus palabras.', 'Si tiene un certificado o una foto, agregue el enlace (es opcional).', 'Toque «Enviar justificación». El tutor la revisa y verá aquí si fue aprobada.'],
    to: { label: 'Ir a Justificaciones', path: '/justificaciones' },
  },
  {
    id: 'familia-mensaje', title: 'Escribir a un docente', summary: 'Mensajes con el colegio sin dar su número de WhatsApp.', groups: ['GUARDIAN'],
    steps: ['Toque «Mensajes» en la barra de abajo.', 'Toque «Nueva».', 'Elija el docente y el motivo, escriba su mensaje y envíelo.', 'La respuesta le llegará como aviso al celular.'],
    to: { label: 'Abrir mensajes', path: '/mensajes' },
  },
  {
    id: 'familia-hijos', title: 'Cambiar entre mis hijos', summary: 'Si tiene más de un hijo en el colegio.', groups: ['GUARDIAN'],
    steps: ['Arriba, debajo del nombre del campus, verá los nombres de sus hijos.', 'Toque el nombre del hijo que quiere ver.', 'Todo el campus (notas, tareas, asistencia) cambia a ese hijo.'],
  },
  // ---- Alumnos ----
  {
    id: 'entregar-tarea', title: 'Entregar una tarea', summary: 'Responder y enviar la tarea a tu profesor.', groups: ['STUDENT'],
    steps: ['Toca «Tareas» en la barra de abajo.', 'Toca la tarea que quieres hacer.', 'Escribe tu respuesta en el cuadro «Tu respuesta». Se guarda sola mientras escribes.', 'Si te piden un archivo, pega el enlace de Google Drive.', 'Toca «Entregar tarea» antes de la fecha límite.'],
    to: { label: 'Ver mis tareas', path: '/tareas' },
    tip: 'Puedes volver a abrir la tarea y tocar «Editar entrega» mientras tu profesor no la haya calificado.',
  },
  {
    id: 'alumno-notas', title: 'Ver mis notas', summary: 'Tus calificaciones y comentarios del profesor.', groups: ['STUDENT'],
    steps: ['Toca «Más» y luego «Libreta» para ver tus notas del bimestre.', 'En cada tarea calificada verás el comentario de tu profesor.'],
    to: { label: 'Abrir mi libreta', path: '/libreta' },
  },
  // ---- Docentes ----
  {
    id: 'crear-tarea', title: 'Crear una tarea', summary: 'Publicar una tarea para todo un curso.', groups: ['TEACHER'],
    steps: ['Toque «Mis cursos» y abra el curso.', 'Toque «Nueva tarea o evaluación».', 'Escriba el título, la indicación y la fecha límite.', 'Si es un archivo, pegue el enlace de Google Drive (vea «Compartir un archivo de Google Drive»).', 'Toque «Publicar». Si todavía no está lista, use «Guardar borrador».'],
    to: { label: 'Ir a Mis cursos', path: '/cursos' },
  },
  {
    id: 'revisar-entregas', title: 'Calificar las entregas', summary: 'Revisar lo que enviaron los alumnos y ponerles nota.', groups: ['TEACHER'],
    steps: ['Abra el curso y toque la tarea.', 'Elija una entrega de la lista.', 'Escriba la nota o el nivel de logro y un comentario para el alumno.', 'Toque «Guardar calificación». Con «Devolver» el alumno puede corregir y volver a entregar.'],
    to: { label: 'Ir a Mis cursos', path: '/cursos' },
  },
  {
    id: 'subir-notas', title: 'Registrar las notas del bimestre', summary: 'Poner el nivel de logro de cada alumno por competencia.', groups: ['TEACHER'],
    steps: ['Toque «Notas» y elija el curso.', 'Verá a sus alumnos en filas y las competencias en columnas. Toque cada casilla para poner el nivel.', 'Para ahorrar tiempo, use «Completar con sugeridos»: el campus propone el nivel según las entregas.', 'Toque «Guardar». El botón muestra cuántos cambios tiene pendientes.'],
    to: { label: 'Ir a Notas', path: '/notas' },
    tip: 'Nada se pierde si sale sin guardar: el campus le avisa antes de salir.',
  },
  {
    id: 'compartir-drive', title: 'Compartir un archivo de Google Drive', summary: 'Cómo conseguir el enlace que se pega en el campus.', groups: ['TEACHER', 'STUDENT', 'STAFF'],
    steps: ['Abra Google Drive y busque su archivo.', 'Toque los tres puntos del archivo y elija «Compartir».', 'En «Acceso general» elija «Cualquier persona con el enlace».', 'Toque «Copiar enlace».', 'Vuelva al campus y pegue el enlace en el campo que dice «enlace».'],
    tip: 'Si el enlace queda como «Restringido», nadie más podrá abrirlo.',
  },
  {
    id: 'docente-justificaciones', title: 'Revisar justificaciones', summary: 'Aprobar las faltas y tardanzas que justifican las familias.', groups: ['TEACHER'],
    steps: ['Toque «Justificaciones» (aparece si usted es tutor).', 'Abra una justificación «Por revisar».', 'Lea el motivo y el adjunto, y apruébela o no la apruebe.'],
    to: { label: 'Ir a Justificaciones', path: '/justificaciones' },
  },
  // ---- Dirección y personal ----
  {
    id: 'crear-cuentas', title: 'Crear cuentas de alumnos y familias', summary: 'Dar acceso con el DNI.', groups: ['STAFF'],
    steps: ['Vaya a «Cuentas».', 'Cree la cuenta de una persona o cargue una lista completa.', 'Entregue a cada familia su usuario (el DNI) y su clave inicial; el campus le pedirá crear una propia al entrar.'],
    to: { label: 'Ir a Cuentas', path: '/admin/cuentas' },
  },
  {
    id: 'enviar-comunicado', title: 'Enviar un comunicado', summary: 'Avisar a las familias, con confirmación de lectura o firma.', groups: ['STAFF'],
    steps: ['Vaya a «Comunicados» y toque el botón para crear uno nuevo.', 'Elija a quiénes va dirigido (todo el colegio o un aula).', 'Escriba el mensaje; si necesita autorización, active la respuesta.', 'Envíelo. Luego verá quién lo leyó.'],
    to: { label: 'Ir a Comunicados', path: '/comunicados' },
  },
  // ---- Para todos ----
  {
    id: 'avisos', title: 'Recibir avisos en el celular', summary: 'Le avisamos de tardanzas, comunicados, notas y mensajes.', groups: ['GUARDIAN', 'STUDENT', 'TEACHER', 'STAFF'],
    steps: ['Toque la campana «Avisos» (arriba).', 'Toque «Activar notificaciones» y, cuando el celular pregunte, elija «Permitir».', 'En iPhone primero hay que poner el campus en la pantalla de inicio (vea «Poner el campus en mi celular»).'],
    to: { label: 'Activar avisos', path: '/notificaciones' },
  },
  {
    id: 'instalar', title: 'Poner el campus en mi celular', summary: 'Un ícono propio en la pantalla, sin buscar en el navegador.', groups: ['GUARDIAN', 'STUDENT', 'TEACHER', 'STAFF'], steps: INSTALL_STEPS,
  },
  {
    id: 'clave', title: 'Cambiar mi contraseña', summary: 'Elegir una clave que solo usted conozca.', groups: ['GUARDIAN', 'STUDENT', 'TEACHER', 'STAFF'],
    steps: ['Toque «Más» y luego «Contraseña».', 'Escriba la contraseña nueva: mínimo 8 caracteres, con letras y números.', 'Repítala y toque «Guardar contraseña».'],
    to: { label: 'Cambiar contraseña', path: '/cambiar-clave' },
    tip: 'Si olvidó su clave, pídala al colegio: se la restablecen en un momento.',
  },
]

export const topicsFor = (group: HelpGroup) => HELP_TOPICS.filter((t) => t.groups.includes(group))
export const topicById = (id: string) => HELP_TOPICS.find((t) => t.id === id)
