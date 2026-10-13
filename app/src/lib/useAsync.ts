import { useCallback, useEffect, useRef, useState } from 'react'
import { toMessage } from '@/lib/errors'
import { onRefresh, sameData } from '@/lib/sync'

type Options = {
  /**
   * Recargar en segundo plano con la sincronización global (por defecto sí).
   * Desactívalo en pantallas donde el usuario edita sobre los datos cargados.
   */
  live?: boolean
}

/** Carga datos asíncronos con estados de carga/error, recarga manual y sincronización en segundo plano. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], options: Options = {}) {
  const { live = true } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const counter = useRef(0)
  const dataRef = useRef<T | null>(null)
  const inFlight = useRef(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const reload = useCallback(async (silent = false) => {
    const id = ++counter.current
    if (!silent) setLoading(true)
    if (!silent) setError('')
    inFlight.current = true
    try {
      const result = await run()
      if (id === counter.current) {
        // En recargas silenciosas solo se actualiza si algo cambió (evita repintar y perder el foco).
        if (!silent || !sameData(result, dataRef.current)) {
          dataRef.current = result
          setData(result)
        }
        setError('')
      }
    } catch (err) {
      // Un fallo en segundo plano (p. ej. sin señal) no reemplaza la pantalla con un error.
      if (id === counter.current && !silent) setError(toMessage(err, 'No se pudo cargar la información.'))
    } finally {
      if (id === counter.current) {
        setLoading(false)
        inFlight.current = false
      }
    }
  }, [run])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!live) return
    return onRefresh(() => {
      if (!inFlight.current) void reload(true)
    })
  }, [live, reload])

  /** Cambio optimista: actualiza la pantalla al instante; devuelve cómo deshacerlo si el servidor falla. */
  const mutate = useCallback((updater: (current: T | null) => T | null) => {
    const previous = dataRef.current
    const next = updater(previous)
    dataRef.current = next
    setData(next)
    return () => {
      dataRef.current = previous
      setData(previous)
    }
  }, [])

  const setDataTracked = useCallback((value: T | null) => {
    dataRef.current = value
    setData(value)
  }, [])

  return { data, loading, error, reload, setData: setDataTracked, mutate }
}
