import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Eraser } from 'lucide-react'

/**
 * Firma dibujada con el dedo o el mouse. Devuelve un PNG en base64
 * (o null si está vacía) cada vez que se termina un trazo.
 */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)
  const hasInk = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0B1D33'
  }, [])

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height }
  }

  function down(e: PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = point(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (!hasInk.current) { hasInk.current = true; setEmpty(false) }
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    if (hasInk.current) onChange(canvasRef.current!.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    hasInk.current = false
    setEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-lg border-2 border-dashed border-linea bg-white">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="block h-40 w-full touch-none cursor-crosshair"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          aria-label="Área para firmar"
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-texto-suave">Firma aquí con el dedo o el mouse</span>}
        <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-texto-suave/30" />
      </div>
      <button type="button" onClick={clear} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-texto-suave hover:text-texto">
        <Eraser className="h-4 w-4" />Borrar firma
      </button>
    </div>
  )
}
