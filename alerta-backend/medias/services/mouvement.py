import cv2


def detecter_mouvements(chemin, echantillon_fps=2.0, seuil=25, ratio=0.01, max_instants=200):
    """Compare des images successives : un instant est noté si plus de 1 % des pixels changent."""
    capture = cv2.VideoCapture(chemin)
    if not capture.isOpened():
        raise ValueError("Impossible d'ouvrir la vidéo.")

    fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
    pas = max(1, int(fps / echantillon_fps))
    precedente, instants, i = None, [], 0
    try:
        while True:
            if not capture.grab():
                break
            if i % pas == 0:
                ok, image = capture.retrieve()
                if ok:
                    petite = cv2.resize(image, (320, 180))
                    gris = cv2.GaussianBlur(cv2.cvtColor(petite, cv2.COLOR_BGR2GRAY), (21, 21), 0)
                    if precedente is not None:
                        _, masque = cv2.threshold(cv2.absdiff(precedente, gris), seuil, 255, cv2.THRESH_BINARY)
                        if cv2.countNonZero(masque) / masque.size > ratio:
                            instants.append(round(i / fps, 1))
                    precedente = gris
            i += 1
    finally:
        capture.release()

    return {"detecte": bool(instants), "instants": instants[:max_instants]}