import axiosClient from './axiosClient';

// Réutilise axiosClient (JWT + refresh automatique) en changeant seulement la base d'URL.
const PLANNER_BASE = `${import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'}/planner/`;
const opts = (extra = {}) => ({ baseURL: PLANNER_BASE, ...extra });

export const listProjects = () => axiosClient.get('projects/', opts()).then((r) => r.data);

export const createProject = (payload) =>
  axiosClient.post('projects/', payload, opts()).then((r) => r.data);

export const listFloorPlans = (projectId) =>
  axiosClient.get(`projects/${projectId}/floor-plans/`, opts()).then((r) => r.data);

export const uploadFloorPlan = (projectId, file, page = 1) => {
  const form = new FormData();
  form.append('file', file);
  form.append('page', String(page));
  return axiosClient
    .post(`projects/${projectId}/floor-plans/`, form, opts({ headers: { 'Content-Type': 'multipart/form-data' } }))
    .then((r) => r.data);
};

// L'image est privée : on la récupère avec le JWT puis on l'affiche via un blob local.
export const fetchFloorPlanImage = (floorPlanId) =>
  axiosClient.get(`floor-plans/${floorPlanId}/image/`, opts({ responseType: 'blob' })).then((r) => r.data);

// Extrait un message lisible d'une erreur DRF.
export const apiErrorMessage = (err, fallback = 'Une erreur est survenue.') => {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return fallback;
  if (data.detail) return data.detail;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? first[0] : String(first || fallback);
};
