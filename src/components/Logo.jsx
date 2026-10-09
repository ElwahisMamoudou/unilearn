/** Logo UniLearn : rond bleu avec un chapeau de diplômé (utilisé par la barre de navigation, la connexion et l'accueil). */
export default function Logo({ size = 36 }) {
  return (
    <span className="brand-logo" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 9 12 4 2 9l10 5 10-5Z" />
        <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
        <path d="M22 9v6" />
      </svg>
    </span>
  )
}
