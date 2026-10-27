# Alerta — Surveillance intelligente propulsée par l'IA

> **Projet Applications Web Avancées (5TWIN - ESPRIT 2026-2027)**  
> *« La plateforme où votre caméra comprend ce qu'elle voit »*

Ce dépôt contient le socle commun de la plateforme Alerta ainsi que le **Module 1 : Authentification, Gestion des Utilisateurs & Dashboard Administrateur**.

---

## 🛠️ Stack Technique

- **Backend** : Django 6.1, Django REST Framework, SimpleJWT (authentification par jeton JWT), CORS Headers, Pillow.
- **Frontend** : React 19, Vite, Tailwind CSS 4, Axios, React Router v7.

---

## 🚀 Installation & Démarrage

### 1. Backend (Django)

```bash
cd alerta-backend

# Créer et activer l'environnement virtuel
python -m venv venv
# Windows :
.\venv\Scripts\activate
# Linux/Mac :
source venv/bin/activate

# Installer les dépendances
pip install -r requirements.txt

# Appliquer les migrations de la base de données
python manage.py migrate

# Lancer le serveur Django
python manage.py runserver
```

L'API est accessible sur : `http://127.0.0.1:8000/api/auth/`  
L'administration Django : `http://127.0.0.1:8000/admin/`

---

### 2. Frontend (React + Vite)

```bash
cd alerta-frontend

# Installer les packages
npm install

# Démarrer le serveur de développement
npm run dev
```

L'application web est accessible sur : `http://localhost:5173/`

---

## 🛡️ Fonctionnalités incluses (Module 1 - Auth & Administration)

1. **Authentification JWT complète** : Inscription, Connexion, Rafraîchissement de token, Déconnexion sécurisée (Blacklist).
2. **Double Authentification (2FA par e-mail)** : Activation, confirmation par code OTP 6 chiffres, challenge à la connexion.
3. **Mot de passe oublié** : Réinitialisation autonome par code OTP sécurisé envoyé par e-mail.
4. **Gestion du profil** : Mise à jour des coordonnées, téléphone, upload de photo de profil, changement de mot de passe, suppression de compte.
5. **Dashboard Administrateur** :
   - Vue d'ensemble avec métriques KPIs réelles et mini-courbes (sparklines).
   - Graphique d'aire de suivi d'activité.
   - Tableau de contrôle des utilisateurs avec recherche, filtres (Rôle, Statut) et bouton d'activation/désactivation de compte en 1 clic.

---

## 📐 Module Planificateur de caméras — Phase 1 (projets + import de plan PDF)

- API (JWT requis, chaque utilisateur ne voit que ses projets) : `/api/planner/`
  - `GET/POST projects/`, `GET projects/<id>/`
  - `GET/POST projects/<id>/floor-plans/` (POST multipart : `file` PDF, `page` optionnel, défaut 1)
  - `GET floor-plans/<id>/` (métadonnées), `GET floor-plans/<id>/image/` (PNG rendu, privé)
- Stockage **privé** dans `alerta-backend/private_media/` (jamais servi via `/media/`).
- Variables d'environnement : copier `alerta-backend/.env.example` en `.env`. SQLite par défaut ; `DB_ENGINE=postgres` pour PostgreSQL.
- Frontend : page `/planner` (lien « Planificateur » dans la barre de navigation).
- Tests : `python manage.py test planner`
