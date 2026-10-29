import axiosClient from './axiosClient';

// Les médias sont sous /api/medias/ ; la base d'Arwa finit peut-être par /api/auth/
const racine = () => (axiosClient.defaults.baseURL || '').replace(/\/auth\/?$/, '');
const cfg = (extra = {}) => ({ baseURL: racine(), ...extra });

export const listerAnalyses = (params) => axiosClient.get('authenticite/', cfg({ params }));
export const detailAnalyse = (id) => axiosClient.get(`authenticite/${id}/`, cfg());
export const supprimerAnalyse = (id) => axiosClient.delete(`authenticite/${id}/`, cfg());
export const reanalyserAnalyse = (id) => axiosClient.post(`authenticite/${id}/reanalyser/`, null, cfg());
export const televerserAnalyse = (fichier) => {
  const form = new FormData();
  form.append('fichier', fichier);
  return axiosClient.post('authenticite/', form, cfg());   // faites comme televerserMedia
};

// ── Administrateur ──
export const adminListerAnalyses = (params) => axiosClient.get('authenticite/admin/', cfg({ params }));
export const adminDetailAnalyse = (id) => axiosClient.get(`authenticite/admin/${id}/`, cfg());
export const adminSupprimerAnalyse = (id) => axiosClient.delete(`authenticite/admin/${id}/`, cfg());
export const adminReanalyserAnalyse = (id) => axiosClient.post(`authenticite/admin/${id}/reanalyser/`, null, cfg());
export const adminStatsAnalyses = () => axiosClient.get('authenticite/admin/stats/', cfg());
export const verifierAuthenticiteMedia = (mediaId) =>
  axiosClient.post(`medias/${mediaId}/verifier-authenticite/`, null, cfg());