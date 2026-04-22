# ─────────────────────────────────────────────────────────────────
# À AJOUTER dans routes/admin.py
# Endpoint pour uploader une image (thumbnail) sur un cours
# ─────────────────────────────────────────────────────────────────
#
# 1. Ajouter en haut du fichier si pas déjà présent :
#    import os, uuid, shutil
#    from fastapi import UploadFile, File
#
# 2. Coller cette fonction dans le router admin :

@router.post("/courses/{course_id}/thumbnail")
async def upload_course_thumbnail(
    course_id: int,
    file: UploadFile = File(...),
    db:   Session    = Depends(get_db),
    me:   User       = Depends(require_admin),
):
    """Upload une image de couverture pour un cours."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    # Vérifier le type de fichier
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"Type non supporté. Utilisez : JPG, PNG, WebP")

    # Vérifier la taille (max 5 Mo)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image trop lourde (max 5 Mo)")

    # Créer le dossier thumbnails
    thumb_dir = os.path.join(os.path.dirname(__file__), "..", "uploads", "thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)

    # Supprimer l'ancienne thumbnail si elle existe
    if course.thumbnail:
        old_path = os.path.join(os.path.dirname(__file__), "..", "uploads", "thumbnails",
                                os.path.basename(course.thumbnail.split("/thumbnails/")[-1]))
        if os.path.exists(old_path):
            os.remove(old_path)

    # Sauvegarder le nouveau fichier
    ext      = os.path.splitext(file.filename or "image.jpg")[1].lower() or ".jpg"
    filename = f"thumb_{course_id}_{uuid.uuid4().hex[:8]}{ext}"
    dest     = os.path.join(thumb_dir, filename)

    with open(dest, "wb") as f:
        f.write(contents)

    # Mettre à jour le cours
    course.thumbnail = f"/uploads/thumbnails/{filename}"
    db.commit()

    return {"thumbnail": course.thumbnail, "ok": True}


@router.delete("/courses/{course_id}/thumbnail", status_code=204)
def delete_course_thumbnail(
    course_id: int,
    db:        Session = Depends(get_db),
    me:        User    = Depends(require_admin),
):
    """Supprime la thumbnail d'un cours."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(404, "Cours introuvable")

    if course.thumbnail:
        path = os.path.join(os.path.dirname(__file__), "..", course.thumbnail.lstrip("/"))
        if os.path.exists(path):
            os.remove(path)
        course.thumbnail = None
        db.commit()
