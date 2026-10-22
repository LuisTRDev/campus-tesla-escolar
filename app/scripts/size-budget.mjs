// Presupuesto de tamaño del primer arranque (lo que descarga un celular al abrir
// el campus). Se ejecuta después de `vite build`; si se pasa, el build falla.
// Lee el manifiesto de Vite: el punto de entrada, src/bootstrap.tsx (siempre se
// carga) y todo lo que importan de forma estática. Las fuentes no se cuentan.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const BUDGET_JS_KB = 180 // gzip
const BUDGET_CSS_KB = 20 // gzip

const dist = path.resolve('dist')
const manifestPath = path.join(dist, '.vite', 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

const seen = new Set()
const files = new Set()
function walk(key) {
  if (seen.has(key)) return
  seen.add(key)
  const entry = manifest[key]
  if (!entry) return
  files.add(entry.file)
  for (const css of entry.css ?? []) files.add(css)
  for (const dep of entry.imports ?? []) walk(dep)
}
walk('index.html')
// src/main.tsx siempre importa src/bootstrap.tsx (de forma diferida, pero al arrancar).
for (const key of manifest['index.html'].dynamicImports ?? []) if (/bootstrap/.test(key)) walk(key)

const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(dist, f))).length / 1024
let js = 0
let css = 0
for (const f of files) {
  if (f.endsWith('.js')) js += gz(f)
  else if (f.endsWith('.css')) css += gz(f)
}
fs.rmSync(path.join(dist, '.vite'), { recursive: true, force: true }) // no se publica

const line = (name, v, max) => `${v <= max ? '✔' : '✘'} ${name}: ${v.toFixed(1)} KB gzip (máximo ${max} KB)`
console.log('\nPrimer arranque')
console.log(line('JavaScript', js, BUDGET_JS_KB))
console.log(line('CSS', css, BUDGET_CSS_KB))
if (js > BUDGET_JS_KB || css > BUDGET_CSS_KB) {
  console.error('\nEl primer arranque superó el presupuesto. Carga lo nuevo de forma diferida (lazy) o sube el límite en scripts/size-budget.mjs si es inevitable.')
  process.exit(1)
}
