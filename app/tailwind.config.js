/** @type {import('tailwindcss').Config} */

// Los colores salen de variables CSS (src/index.css) para tener modo claro y oscuro
// con las mismas clases. Formato "R G B" para que funcionen las opacidades (bg-tinta/40).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Titulares: sans extendida, como el banner del patio. Cintas, sellos e insignias: slab, como el escudo.
        display: ['"Archivo Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        slab: ['"Roboto Slab Variable"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Atkinson Hyperlegible"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Identidad del colegio (mismos tonos que Tesla Control Escolar)
        tinta: { DEFAULT: v('tinta'), 700: v('tinta-700'), 500: v('tinta-500') },
        chispa: { DEFAULT: v('chispa'), 600: v('chispa-600'), 100: v('chispa-100') },
        // Rojo de la T del escudo y de la franja del buzo. Es marca, no error (para eso está estado-alerta).
        rojo: { DEFAULT: v('rojo'), 600: v('rojo-600'), 100: v('rojo-100') },
        papel: v('papel'),
        superficie: v('superficie'),
        linea: v('linea'),
        texto: { DEFAULT: v('texto'), suave: v('texto-suave') },
        estado: { ok: v('estado-ok'), tarde: v('estado-tarde'), alerta: v('estado-alerta'), info: v('estado-info') },
      },
      // "text-tinta" usa su propia variable: en modo oscuro el texto tinta se aclara,
      // pero los fondos tinta siguen siendo azul oscuro.
      textColor: {
        tinta: { DEFAULT: v('tinta-ink'), 700: v('tinta-700'), 500: v('tinta-500') },
        // El dorado como texto sobre blanco no se lee: text-chispa-600 se oscurece en modo claro.
        chispa: { DEFAULT: v('chispa'), 600: v('chispa-ink'), 100: v('chispa-100') },
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
      maxWidth: { prosa: '68ch' },
      // Movimiento: tres duraciones y dos curvas para toda la app (variables en src/index.css).
      transitionDuration: { rapido: 'var(--dur-1)', medio: 'var(--dur-2)', lento: 'var(--dur-3)' },
      transitionTimingFunction: { salida: 'var(--ease-out)', resorte: 'var(--ease-spring)' },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
}
