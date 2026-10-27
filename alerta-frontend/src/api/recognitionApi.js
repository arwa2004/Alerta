import axiosClient from './axiosClient';

// axiosClient pointe sur /api/auth/ : on change juste la baseURL pour ce module
// (les intercepteurs JWT et le rafraîchissement du token continuent de s'appliquer).
const cfg = (extra = {}) => ({ baseURL: 'http://127.0.0.1:8000/api/recognition/', ...extra });
const data = (promise) => promise.then((r) => r.data);

/** Transforme une erreur DRF / Django en texte lisible (une ligne par message). */
export function extractError(err, fallback = 'Une erreur est survenue.') {
  if (!err) return fallback;
  if (!err.response) return err.message || fallback;

  const d = err.response.data;
  const status = err.response.status;

  if (!d) return `${fallback} (Erreur HTTP ${status})`;

  // Si Django renvoie une page d'erreur HTML (ex: 500)
  if (typeof d === 'string') {
    const excMatch = d.match(/<pre class="exception_value">([\s\S]*?)<\/pre>/i) ||
                     d.match(/<th>Exception Value:<\/th>\s*<td><pre>([\s\S]*?)<\/pre>/i) ||
                     d.match(/<title>([\s\S]*?)<\/title>/i);
    if (excMatch) {
      return `Erreur serveur (${status}) : ${excMatch[1].replace(/<[^>]+>/g, '').trim()}`;
    }
    return d.length < 250 ? d : `${fallback} (Erreur serveur HTTP ${status})`;
  }

  if (d.detail) return d.detail;

  // Si c'est un tableau d'erreurs (ex: erreurs sur le lot d'images)
  if (Array.isArray(d)) {
    return d.map((m) => (typeof m === 'string' ? m : JSON.stringify(m))).join('\n');
  }

  // Si c'est un dictionnaire de champs DRF { images: [...], zones: [...] }
  if (typeof d === 'object') {
    const lines = Object.entries(d).flatMap(([field, val]) => {
      const fieldPrefix = field === 'non_field_errors' || field === 'detail' ? '' : `${field} : `;
      if (Array.isArray(val)) {
        return val.map((m) => `${fieldPrefix}${typeof m === 'string' ? m : JSON.stringify(m)}`);
      }
      return [`${fieldPrefix}${typeof val === 'string' ? val : JSON.stringify(val)}`];
    });
    return lines.length ? lines.join('\n') : fallback;
  }

  return fallback;
}

export const zonesApi = {
  list: () => data(axiosClient.get('zones/', cfg())),
  create: (payload) => data(axiosClient.post('zones/', payload, cfg())),
  update: (id, payload) => data(axiosClient.patch(`zones/${id}/`, payload, cfg())),
  remove: (id) => axiosClient.delete(`zones/${id}/`, cfg()),
  identify: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('image', file);
    return data(axiosClient.post(`zones/${id}/identify/`, fd, cfg()));
  },
};

export const personsApi = {
  list: (params) => data(axiosClient.get('persons/', cfg({ params }))),
  create: (formData) => data(axiosClient.post('persons/', formData, cfg())),
  update: (id, payload) => data(axiosClient.patch(`persons/${id}/`, payload, cfg())),
  remove: (id) => axiosClient.delete(`persons/${id}/`, cfg()),
  addFaces: (id, files) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    return data(axiosClient.post(`persons/${id}/faces/`, fd, cfg()));
  },
  removeFace: (id, faceId) => axiosClient.delete(`persons/${id}/faces/${faceId}/`, cfg()),
};

/** Les photos sont protégées : on les récupère avec le jeton JWT (blob). */
export const fetchImageBlob = (url) =>
  axiosClient.get(url, { responseType: 'blob' }).then((r) => URL.createObjectURL(r.data));
