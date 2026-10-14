/** Texto con los enlaces https:// convertidos en vínculos (en modo enlaces es la forma de compartir archivos). */
export function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https:\/\/[^\s<>"]+)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part
        const trailing = part.match(/[.,;:!?)]+$/)?.[0] ?? ''
        const url = trailing ? part.slice(0, -trailing.length) : part
        return (
          <span key={i}>
            <a href={url} target="_blank" rel="noopener noreferrer" className="break-all font-bold underline" onClick={(e) => e.stopPropagation()}>{url}</a>
            {trailing}
          </span>
        )
      })}
    </>
  )
}
