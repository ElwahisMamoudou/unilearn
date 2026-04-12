// ════════════════════════════════════════════════════════════
// CORRECTIF — ExamPage.jsx
// Remplace la fonction togglePublish existante par celle-ci
// ════════════════════════════════════════════════════════════

// AVANT (à supprimer) :
// ──────────────────────────────────────────────────────────
// const togglePublish = async (exam) => {
//   try {
//     const { data } = await api.patch(`/exams/${exam.id}/visibility`, { is_published: !exam.is_published })
//     flash(data.message)
//     loadExams()          ← PROBLÈME : recharge TOUS les examens
//   } catch { flash('Erreur', 'error') }
// }


// APRÈS (à coller à la place) :
// ──────────────────────────────────────────────────────────
const togglePublish = async (exam) => {
  const newVal = !exam.is_published

  // ✅ Mise à jour immédiate et LOCALE : seul CET examen change
  setExams(prev => prev.map(e =>
    e.id === exam.id ? { ...e, is_published: newVal } : e
  ))

  try {
    const { data } = await api.patch(`/exams/${exam.id}/visibility`, { is_published: newVal })
    flash(data.message)
    // ✅ PAS de loadExams() ici — on ne recharge pas toute la liste
  } catch (err) {
    // ✅ Annulation du changement local si erreur serveur
    setExams(prev => prev.map(e =>
      e.id === exam.id ? { ...e, is_published: !newVal } : e
    ))
    flash(err.response?.data?.detail || 'Erreur lors de la publication', 'error')
  }
}
