import { useState } from 'react'
import { useFocusStudent } from '@/auth/AuthProvider'
import { Empty, ErrorBox, Loading, PageHeader, Panel, Segmented } from '@/components/ui'
import { TaskRow } from '@/components/course'
import { useStudentWork, type StudentTask } from '@/services/useStudentWork'

type Filter = 'todo' | 'done' | 'all'

function TaskList({ title, tasks, tone }: { title: string; tasks: StudentTask[]; tone?: 'alert' }) {
  if (!tasks.length) return null
  return (
    <Panel title={<span className={tone === 'alert' ? 'text-estado-alerta' : undefined}>{title}</span>} bodyClassName="py-2">
      <div className="divide-y divide-linea">
        {tasks.map((t) => <TaskRow key={t.id} assignment={t} offering={t.offering} state={t.state} submission={t.submission} to={`/tarea/${t.id}`} />)}
      </div>
    </Panel>
  )
}

export default function TasksPage() {
  const student = useFocusStudent()
  const [filter, setFilter] = useState<Filter>('todo')
  const { loading, error, reload, groups } = useStudentWork(student)

  const done = [...groups.graded, ...groups.delivered]
  const nothing = filter === 'todo'
    ? groups.overdue.length + groups.todo.length === 0
    : filter === 'done' ? done.length === 0
    : groups.overdue.length + groups.todo.length + done.length + groups.missing.length === 0

  return (
    <>
      <PageHeader
        title="Tareas"
        subtitle={student ? `De ${student.first_name ?? 'tu hijo'}.` : undefined}
        action={
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[{ value: 'todo', label: 'Por hacer' }, { value: 'done', label: 'Entregadas' }, { value: 'all', label: 'Todas' }]}
          />
        }
      />
      {error && <ErrorBox message={error} onRetry={() => void reload()} />}
      {loading ? <Loading /> : (
        <div className="space-y-6">
          {nothing && <Empty title={filter === 'done' ? 'Todavía no hay entregas' : 'No hay tareas pendientes'} />}
          {(filter === 'todo' || filter === 'all') && (
            <>
              <TaskList title="Atrasadas" tasks={groups.overdue} tone="alert" />
              <TaskList title="Por entregar" tasks={groups.todo} />
            </>
          )}
          {(filter === 'done' || filter === 'all') && (
            <>
              <TaskList title="Entregadas, en revisión" tasks={groups.delivered} />
              <TaskList title="Calificadas" tasks={groups.graded} />
            </>
          )}
          {filter === 'all' && <TaskList title="No entregadas" tasks={groups.missing} tone="alert" />}
        </div>
      )}
    </>
  )
}
