/** Couleurs, dégradés et icônes partagés par plusieurs pages. */

// Couleur d'un niveau d'études (Licence 1, Master 2, ...)
export const LEVEL_COLORS = {
  'Licence 1': '#3b82f6', 'Licence 2': '#06b6d4', 'Licence 3': '#10b981',
  'Master 1':  '#f59e0b', 'Master 2':  '#ef4444', 'Doctorat':  '#8b5cf6',
}
export const lvlColor = l => LEVEL_COLORS[l] || '#6366f1'

// Dégradé d'une catégorie de cours, choisi d'après son id
export const CAT_GRADIENTS = [
  ['#1e3a5f', '#0ea5e9'], ['#1a2e1a', '#22c55e'], ['#2e1a1a', '#ef4444'],
  ['#2e2a1a', '#f59e0b'], ['#1a1a2e', '#8b5cf6'], ['#1a2e2e', '#14b8a6'],
]
export const catGrad = id => CAT_GRADIENTS[(id || 0) % CAT_GRADIENTS.length]

// Icône d'une catégorie de cours, choisie d'après son nom
export const catIcon = (name = '') => {
  const l = name.toLowerCase()
  if (l.includes('info') || l.includes('prog') || l.includes('algo')) return '💻'
  if (l.includes('math')) return '📐'
  if (l.includes('phys')) return '⚛️'
  if (l.includes('chim')) return '🧪'
  if (l.includes('bio')) return '🧬'
  if (l.includes('meca') || l.includes('tim')) return '⚙️'
  if (l.includes('elec')) return '⚡'
  return '📚'
}
