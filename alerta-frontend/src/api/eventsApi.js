import axios from 'axios';

const BASE_URL = 'http://127.0.0.1:8000/api/';

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const eventsApi = {
  // Statistiques consolidées Dashboard
  getDashboardStats: async () => {
    const res = await axios.get(`${BASE_URL}dashboard/`, {
      headers: getAuthHeaders(),
    });
    return res.data;
  },

  // Liste paginée et filtrée des événements
  getEvenements: async (params = {}) => {
    const res = await axios.get(`${BASE_URL}evenements/`, {
      headers: getAuthHeaders(),
      params,
    });
    return res.data;
  },

  // Détail d'un événement
  getEvenementDetail: async (id) => {
    const res = await axios.get(`${BASE_URL}evenements/${id}/`, {
      headers: getAuthHeaders(),
    });
    return res.data;
  },

  // Suppression d'un événement
  deleteEvenement: async (id) => {
    const res = await axios.delete(`${BASE_URL}evenements/${id}/`, {
      headers: getAuthHeaders(),
    });
    return res.data;
  },

  // Déclencheur de simulation en direct (très utile pour la démo)
  simulateEvenement: async (scenario = 'inconnu') => {
    const res = await axios.post(
      `${BASE_URL}evenements/simulate/`,
      { scenario },
      { headers: getAuthHeaders() }
    );
    return res.data;
  },

  // Liste des zones
  getZones: async () => {
    const res = await axios.get(`${BASE_URL}zones/`, {
      headers: getAuthHeaders(),
    });
    return res.data;
  },
};

export default eventsApi;
