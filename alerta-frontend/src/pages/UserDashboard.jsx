import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import eventsApi from '../api/eventsApi';
import EventDetailModal from '../components/EventDetailModal';
import UserSettings from '../components/UserSettings';

export default function UserDashboard() {
  const {
    user, logout,
    updateProfile, changePassword,
    request2FAEnable, confirm2FAEnable, disable2FA, deleteAccount,
  } = useContext(AuthContext);
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('accueil');
  const [stats, setStats] = useState({
    total_evenements: 0,
    evenements_aujourdhui: 0,
    inconnus_count: 0,
    visages_connus_count: 0,
    mouvements_count: 0,
    critiques_count: 0,
    alertes_count: 0,
    derniers_evenements: [],
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.email?.split('@')[0] || 'Utilisateur';

  const getInitials = () => {
    if (user?.first_name && user?.last_name)
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    return user?.email?.slice(0, 2).toUpperCase() || 'AL';
  };

  const fetchStats = async () => {
    try {
      const data = await eventsApi.getDashboardStats();
      setStats(data);
    } catch (e) {
      console.error('Erreur stats dashboard', e);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const handleSimulate = async (scenario = 'inconnu') => {
    setSimulating(true);
    try {
      const ev = await eventsApi.simulateEvenement(scenario);
      await fetchStats();
      setSelectedEvent(ev);
    } catch (e) {
      console.error('Erreur simulation', e);
    } finally {
      setSimulating(false);
    }
  };

  // ── Pastilles colorées ─────────────────────────────────────────────────────
  const getTypeDot = (type) =>
    type === 'visage_connu' ? 'bg-emerald-500' : 'bg-rose-500';

  const getCriticiteStyle = (niveau) => {
    if (niveau === 'eleve') return 'bg-rose-100 text-rose-700';
    if (niveau === 'moyen') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">

      {/* ══════════════════ NAVBAR UTILISATEUR ══════════════════════════════ */}
      <nav className="bg-[#0B1F3A] h-16 sticky top-0 z-50 shadow-md border-b border-white/10 flex-none">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">

          {/* Logo */}
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setActiveTab('accueil')}
          >
            <svg width="30" height="30" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="14" fill="#0B1F3A" />
              <path d="M8 32Q32 10 56 32Q32 54 8 32Z" fill="none" stroke="#00C2CB" strokeWidth="4" strokeLinejoin="round" />
              <circle cx="32" cy="32" r="10" fill="#00C2CB" />
              <rect x="26.8" y="28" width="2.6" height="8" rx="1.3" fill="#0B1F3A" />
              <rect x="30.7" y="24.5" width="2.6" height="15" rx="1.3" fill="#0B1F3A" />
              <rect x="34.6" y="28" width="2.6" height="8" rx="1.3" fill="#0B1F3A" />
            </svg>
            <span className="font-bold text-xl text-white tracking-tight">
              Aler<i className="not-italic text-[#00C2CB]">ta</i>
            </span>
          </div>

          {/* Navigation centrale */}
          <div className="flex items-center gap-1">
            {[
              { id: 'accueil', label: 'Tableau de bord' },
              { id: 'parametres', label: 'Mon Compte' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#00C2CB] text-[#0B1F3A]'
                    : 'text-[#B8C7D9] hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => navigate('/events')}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-[#B8C7D9] hover:bg-white/10 hover:text-white transition cursor-pointer flex items-center gap-2"
            >
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              Événements
            </button>
          </div>

          {/* Profil + déconnexion */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-white leading-tight">{displayName}</p>
              <p className="text-[11px] text-[#00C2CB]">Utilisateur</p>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-[#0B1F3A] cursor-pointer"
              style={{ background: '#00C2CB' }}
              onClick={() => setActiveTab('parametres')}
              title="Mon compte"
            >
              {getInitials()}
            </div>
            <button
              onClick={() => setShowLogoutModal(true)}
              className="p-2 rounded-xl text-[#B8C7D9] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
              title="Se déconnecter"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {/* ══════════════════ CONTENU PRINCIPAL ═══════════════════════════════ */}
      {activeTab === 'accueil' && (
        <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-10 py-10 space-y-10">

          {/* Bannière de bienvenue */}
          <div className="bg-gradient-to-br from-[#0B1F3A] to-[#0d2d4a] rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl overflow-hidden relative">
            <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full bg-[#00C2CB]/10 blur-3xl pointer-events-none" />
            <div className="relative">
              <span className="text-xs font-bold text-[#00C2CB] tracking-widest uppercase">
                ● Surveillance Active — Alerta
              </span>
              <h1 className="text-3xl md:text-4xl font-extrabold text-white mt-2 mb-1">
                Bonjour, {user?.first_name || displayName} 👋
              </h1>
              <p className="text-[#B8C7D9] text-base max-w-lg">
                Voici l'état en temps réel de votre système de surveillance intelligente.
                Vos caméras analysent et protègent votre espace en continu.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => handleSimulate('inconnu')}
                disabled={simulating}
                className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold transition shadow-lg disabled:opacity-50 cursor-pointer"
              >
                {simulating ? '⏳ Simulation...' : '⚡ Simuler Détection'}
              </button>
              <button
                onClick={() => navigate('/events')}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold border border-white/20 transition cursor-pointer"
              >
                Voir tout →
              </button>
            </div>
          </div>

          {/* ── Compteurs KPI ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              {
                label: 'Total détections',
                value: stats.total_evenements,
                sub: `${stats.evenements_aujourdhui} aujourd'hui`,
                icon: '📷',
                accent: 'border-cyan-200',
                subColor: 'text-cyan-700',
              },
              {
                label: 'Personnes inconnues',
                value: stats.inconnus_count,
                sub: `${stats.critiques_count} critiques (ML)`,
                icon: '⚠️',
                accent: 'border-rose-200',
                subColor: 'text-rose-600',
              },
              {
                label: 'Visages reconnus',
                value: stats.visages_connus_count,
                sub: 'Membres autorisés',
                icon: '✅',
                accent: 'border-emerald-200',
                subColor: 'text-emerald-700',
              },
              {
                label: 'Mouvements suspects',
                value: stats.mouvements_count,
                sub: `${stats.alertes_count} alertes M4`,
                icon: '🏃',
                accent: 'border-amber-200',
                subColor: 'text-amber-700',
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className={`bg-white rounded-2xl p-6 border-2 ${kpi.accent} shadow-sm hover:shadow-md transition`}
              >
                <div className="text-3xl mb-2">{kpi.icon}</div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{kpi.label}</p>
                <p className="text-3xl font-extrabold text-slate-800">{kpi.value}</p>
                <p className={`text-xs font-semibold mt-1 ${kpi.subColor}`}>{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Dernières détections avec pastilles ─────────────────────────── */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Dernières Détections</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                    Vert = Visage connu
                  </span>
                  {' · '}
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                    Rouge = Inconnu / Mouvement
                  </span>
                </p>
              </div>
              <button
                onClick={() => navigate('/events')}
                className="text-sm font-semibold text-cyan-600 hover:text-cyan-700 hover:underline cursor-pointer"
              >
                Voir l'historique complet →
              </button>
            </div>

            {stats.derniers_evenements.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <div className="text-5xl mb-3">🎥</div>
                <p className="text-base font-medium">Aucune détection enregistrée.</p>
                <p className="text-sm mt-1 mb-6">Lancez une simulation pour voir le système en action.</p>
                <button
                  onClick={() => handleSimulate('inconnu')}
                  disabled={simulating}
                  className="px-5 py-2 bg-[#0B1F3A] text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition cursor-pointer"
                >
                  ⚡ Simuler une détection
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.derniers_evenements.slice(0, 6).map((ev) => (
                  <div
                    key={ev.id}
                    onClick={() => setSelectedEvent(ev)}
                    className="flex items-center justify-between gap-4 px-8 py-4 hover:bg-slate-50 transition cursor-pointer group"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Pastille colorée */}
                      <span
                        className={`w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-md ${getTypeDot(ev.type)}`}
                        title={ev.type === 'visage_connu' ? 'Visage connu' : 'Inconnu / Mouvement'}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate max-w-sm">
                          {ev.description || `${ev.type_display} — ${ev.zone_nom}`}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                          <span>📍 {ev.zone_nom || ev.zone_nom_fallback}</span>
                          {ev.personne_nom && <span>👤 {ev.personne_nom}</span>}
                          <span>🕐 {new Date(ev.date_heure).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getCriticiteStyle(ev.niveau_criticite)}`}>
                        {Math.round(ev.score_criticite * 100)}%
                      </span>
                      {ev.alerte_declenchee && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Alerte M4 déclenchée" />
                      )}
                      <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Boutons de simulation rapide ─────────────────────────────────── */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Simuler un scénario de détection</h3>
            <p className="text-sm text-slate-400 mb-6">
              Testez le pipeline complet : détection → scoring ML → description Gemini → image Hugging Face → alerte.
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { scenario: 'inconnu', label: '🚨 Intrusion Inconnue', cls: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' },
                { scenario: 'visage_connu', label: '✅ Visage Autorisé', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
                { scenario: 'mouvement', label: '🏃 Mouvement Suspect', cls: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
              ].map((s) => (
                <button
                  key={s.scenario}
                  onClick={() => handleSimulate(s.scenario)}
                  disabled={simulating}
                  className={`px-5 py-3 rounded-xl text-sm font-bold border-2 transition cursor-pointer disabled:opacity-50 ${s.cls}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* ══════════════════ ONGLET MON COMPTE ════════════════════════════════ */}
      {activeTab === 'parametres' && (
        <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-800">Mon Compte</h1>
            <p className="text-slate-500 text-sm mt-1">Gérez votre profil, sécurité et préférences.</p>
          </div>
          <UserSettings
            user={user}
            updateProfile={updateProfile}
            changePassword={changePassword}
            request2FAEnable={request2FAEnable}
            confirm2FAEnable={confirm2FAEnable}
            disable2FA={disable2FA}
            deleteAccount={deleteAccount}
          />
        </main>
      )}

      {/* ── Modal Détail Événement ─────────────────────────────────────────── */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEventUpdated={(updated) => {
            setSelectedEvent(updated);
            fetchStats();
          }}
        />
      )}

      {/* ── Modal Confirmation Déconnexion ─────────────────────────────────── */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-rose-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Se déconnecter ?</h3>
            <p className="text-slate-500 text-sm mb-6">Vous allez quitter votre session Alerta. Vos données restent sauvegardées.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => { setShowLogoutModal(false); logout(); }}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition cursor-pointer"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
