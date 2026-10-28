import axiosClient from './axiosClient';

// Les médias sont sous /api/medias/ ; la base d'Arwa finit peut-être par /api/auth/
const racine = () => (axiosClient.defaults.baseURL || '').replace(/\/auth\/?$/, '');
const cfg = (extra = {}) => ({ baseURL: racine(), ...extra });

// ── Utilisateur ──
export const listerMedias = (zoneId) =>
  axiosClient.get('medias/', cfg({ params: { zone: zoneId } }));

export const detailMedia = (id) => axiosClient.get(`medias/${id}/`, cfg());

export const supprimerMedia = (id) => axiosClient.delete(`medias/${id}/`, cfg());

export const reanalyserMedia = (id) => axiosClient.post(`medias/${id}/reanalyser/`, null, cfg());

export const televerserMedia = (zoneId, fichier) => {
  const donnees = new FormData();
  donnees.append('zone', zoneId);
  donnees.append('fichier', fichier);
  return axiosClient.post('medias/', donnees, cfg({ headers: { 'Content-Type': 'multipart/form-data' } }));
};

// ── Administrateur ──
export const adminListerMedias = (params) => axiosClient.get('medias/admin/', cfg({ params }));
export const adminDetailMedia = (id) => axiosClient.get(`medias/admin/${id}/`, cfg());
export const adminSupprimerMedia = (id) => axiosClient.delete(`medias/admin/${id}/`, cfg());
export const adminReanalyserMedia = (id) => axiosClient.post(`medias/admin/${id}/reanalyser/`, null, cfg());
export const adminStatsMedias = () => axiosClient.get('medias/admin/stats/', cfg());