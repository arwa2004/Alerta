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

  // Analyse et description générée à la demande via Google Gemini
  analyserAvecGemini: async (id) => {
    const res = await axios.post(
      `${BASE_URL}evenements/${id}/analyser-gemini/`,
      {},
      { headers: getAuthHeaders() }
    );
    return res.data;
  },

  // Suppression d'un événement
  deleteEvenement: async (id) => {
    const res = await axios.delete(`${BASE_URL}evenements/${id}/`, {
      headers: getAuthHeaders(),
    });
    return res.data;
  },

  // Déclencheur de simulation en direct (avec support photo optionnelle)
  simulateEvenement: async (scenarioOrOptions = 'inconnu') => {
    let payload;
    let headers = getAuthHeaders();

    if (typeof scenarioOrOptions === 'object' && scenarioOrOptions !== null) {
      const fd = new FormData();
      if (scenarioOrOptions.type || scenarioOrOptions.scenario) {
        fd.append('type', scenarioOrOptions.type || scenarioOrOptions.scenario);
        fd.append('scenario', scenarioOrOptions.type || scenarioOrOptions.scenario);
      }
      if (scenarioOrOptions.zone) fd.append('zone', scenarioOrOptions.zone);
      if (scenarioOrOptions.photo_capturee || scenarioOrOptions.photo) {
        fd.append('photo_capturee', scenarioOrOptions.photo_capturee || scenarioOrOptions.photo);
      }
      payload = fd;
    } else {
      payload = { scenario: scenarioOrOptions };
    }

    const res = await axios.post(
      `${BASE_URL}evenements/simulate/`,
      payload,
      { headers }
    );
    return res.data;
  },

  // Génération (ou régénération) de l'image de reconstitution depuis la description IA actuelle
  genererImage: async (id) => {
    const res = await axios.post(
      `${BASE_URL}evenements/${id}/generer-image/`,
      {},
      { headers: getAuthHeaders() }
    );
    return res.data;
  },

  // Liste des zones de surveillance
  getZones: async () => {
    const res = await axios.get(`${BASE_URL}zones/`, {
      headers: getAuthHeaders(),
    });
    return res.data;
  },

  // Module 4 - Voix & Alarme (Whisper Hugging Face)
  getAlarmeStatus: async () => {
    const res = await axios.get(`${BASE_URL}alarme/`, {
      headers: getAuthHeaders(),
    });
    return res.data;
  },

  setAlarmeAction: async (action) => {
    const res = await axios.post(
      `${BASE_URL}alarme/`,
      { action },
      { headers: getAuthHeaders() }
    );
    return res.data;
  },

  envoyerCommandeVocale: async (payload) => {
    const headers = getAuthHeaders();
    let data;
    if (payload instanceof FormData) {
      data = payload;
    } else if (typeof payload === 'string') {
      data = { texte: payload };
    } else {
      const fd = new FormData();
      fd.append('audio', payload, 'commande.webm');
      data = fd;
    }
    const res = await axios.post(`${BASE_URL}alarme/commande-vocale/`, data, {
      headers,
    });
    return res.data;
  },
};

export default eventsApi;
