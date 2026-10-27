# Alerta Phase 2 — copy-ready files

This folder contains files extracted from the supplied Phase 2 installer:
- OpenCV floor-plan analysis (uses already-converted images)
- Budget-constrained CCTV placement optimizer
- Django API/model/serializer integration snippets
- React API helper and display components
- Initial tests and a migration template

## Important: integrate safely

This is **not a complete replacement repository**. Copy the new files into the matching paths in your existing Alerta repository, but do not overwrite your existing `models.py`, `views.py`, `serializers.py`, `urls.py`, or `requirements.txt`.

### 1. Copy new files
Copy the contents of `alerta-backend` and `alerta-frontend` into the matching directories in your project. These are new files; merge if a path already exists.

### 2. Merge integration snippets
Open the files under `INTEGRATION_SNIPPETS` and merge their code into the corresponding existing Django files:
- `models_phase2.txt` → `alerta-backend/planner/models.py`
- `serializers_phase2.txt` → `alerta-backend/planner/serializers.py`
- `views_phase2.txt` → `alerta-backend/planner/views.py`
- `urls_phase2.txt` → `alerta-backend/planner/urls.py`
- `requirements_phase2.txt` → `alerta-backend/requirements.txt`

Avoid duplicate imports and verify model/field names against your actual project before saving.

### 3. Fix the migration dependency
`alerta-backend/planner/migrations/0003_phase2_analysis_optimization.py` currently depends on a placeholder migration name `0002_previous`, because the supplied script did not include your repository's real migration history. Change that dependency to the latest existing migration for the `planner` app. Verify the `Project` and `FloorPlan` model names and their table references.

### 4. Connect the frontend page
`PlannerPhase2Page.jsx` is a standalone page component, not automatically registered in your app. Add it to your existing routing and pass the actual `floorPlanId` and image URL from your existing project workflow. Check the API base URL and authentication token key in `src/api/plannerPhase2.js` against your current frontend settings.

### 5. Dependencies and checks
From `alerta-backend`, install the dependencies listed in the integration snippet, then create/verify migrations and run tests:

```bash
pip install opencv-python-headless numpy
python manage.py makemigrations planner
python manage.py migrate
python manage.py test planner
```

Do not run `makemigrations` blindly if you are using the provided migration; first ensure the migration matches your existing schema and avoid duplicate migrations.

## Known limitations of the supplied implementation
- Basic OpenCV detection is approximate; doors/windows are not reliably detected.
- Distances are in image pixels unless a real-world scale is calibrated.
- Camera candidate generation and viewing geometry are initial approximations and should be validated on real floor plans.
- The included tests and endpoints assume the existing app has `Project`, `FloorPlan`, `FloorPlan.image`, and `project.user`; adapt if your actual model differs.
- The code was syntax-checked for Python files in an isolated scaffold, not tested against your actual repository or database.
