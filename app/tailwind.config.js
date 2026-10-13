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
        display: ['"Bricolage Grotesque Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Atkinson Hyperlegible"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Identidad del colegio (mismos tonos que Tesla Control Escolar)
        tinta: { DEFAULT: v('tinta'), 700: v('tinta-700'), 500: v('tinta-500') },
        chispa: { DEFAULT: v('chispa'), 600: v('chispa-600'), 100: v('chispa-100') },
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
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
      maxWidth: { prosa: '68ch' },
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
