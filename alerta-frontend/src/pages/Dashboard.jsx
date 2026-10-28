import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import axiosClient from '../api/axiosClient';
import eventsApi from '../api/eventsApi';
import AdminDashboard from './AdminDashboard';
import UserSettings from '../components/UserSettings';
import EventDetailModal from '../components/EventDetailModal';
import RecognitionModule from '../components/recognition/RecognitionModule';
import Medias from './Medias';
export default function Dashboard({ initialTab = 'accueil' }) {
  const {
    user,
    logout,
    updateProfile,
    changePassword,
    request2FAEnable,
    confirm2FAEnable,
    disable2FA,
    deleteAccount,
  } = useContext(AuthContext);
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  // Onglet actif : 'accueil', 'parametres'
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // ─── Module 3 : Dashboard Événements & Stats ──────────────────────────────
  const [eventsStats, setEventsStats] = useState({
    total_evenements: 0,
    evenements_aujourdhui: 0,
    inconnus_count: 0,
    visages_connus_count: 0,
    mouvements_count: 0,
    critiques_count: 0,
    alertes_count: 0,
    derniers_evenements: [],
  });
  const [selectedEventModal, setSelectedEventModal] = useState(null);
  const [isSimulatingEvent, setIsSimulatingEvent] = useState(false);

  const fetchEventsStats = async () => {
    try {
      const data = await eventsApi.getDashboardStats();
      setEventsStats(data);
    } catch (err) {
      console.error('Erreur chargement dashboard stats', err);
    }
  };

  useEffect(() => {
    fetchEventsStats();
  }, []);

  const handleQuickSimulate = async (scenario = 'inconnu') => {
    setIsSimulatingEvent(true);
    try {
      const newEv = await eventsApi.simulateEvenement(scenario);
      await fetchEventsStats();
      setSelectedEventModal(newEv);
    } catch (err) {
      console.error('Erreur simulation', err);
    } finally {
      setIsSimulatingEvent(false);
    }
  };

  // ─── Profil ───────────────────────────────────────────────────────────────
  const [profileData, setProfileData] = useState({ first_name: user?.first_name || '', last_name: user?.last_name || '' });
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // ─── Mot de passe ─────────────────────────────────────────────────────────
  const [passwordData, setPasswordData] = useState({ old_password: '', new_password: '', new_password_confirm: '' });
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // ─── Admin Dashboard ──────────────────────────────────────────────────────
  const [adminStats, setAdminStats] = useState({
    total_users: 0,
    active_users: 0,
    inactive_users: 0,
    admin_users: 0,
    standard_users: 0,
  });
  const [usersList, setUsersList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all'); // 'all', 'admin', 'user'
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'inactive'
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [adminActionMsg, setAdminActionMsg] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) setProfileData({ first_name: user.first_name || '', last_name: user.last_name || '' });
  }, [user]);

  // Chargement des données du Dashboard Admin
  const fetchAdminData = async () => {
    if (!isAdmin) return;
    setIsLoadingUsers(true);
    try {
      // 1. Stats réelles depuis Django
      const statsRes = await axiosClient.get('stats/');
      setAdminStats(statsRes.data);

      // 2. Utilisateurs filtrés
      let url = `users/?search=${encodeURIComponent(searchQuery)}`;
      if (filterRole !== 'all') url += `&role=${filterRole}`;
      if (filterStatus === 'active') url += `&is_active=true`;
      if (filterStatus === 'inactive') url += `&is_active=false`;

      const usersRes = await axiosClient.get(url);
      setUsersList(usersRes.data);
    } catch (err) {
      console.error('Erreur admin dashboard:', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'admin_dashboard') {
      fetchAdminData();
    }
  }, [isAdmin, filterRole, filterStatus]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: '', text: '' });
    setIsUpdatingProfile(true);
    try {
      await updateProfile(profileData);
      setProfileMsg({ type: 'success', text: 'Profil mis à jour avec succès.' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.detail || 'Erreur lors de la mise à jour.' });
    } finally { setIsUpdatingProfile(false); }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMsg({ type: '', text: '' });
    if (passwordData.new_password !== passwordData.new_password_confirm) {
      setPasswordMsg({ type: 'error', text: 'Les deux mots de passe ne correspondent pas.' });
      return;
    }
    setIsChangingPassword(true);
    try {
      await changePassword(passwordData.old_password, passwordData.new_password, passwordData.new_password_confirm);
      setPasswordMsg({ type: 'success', text: 'Mot de passe modifié avec succès.' });
      setPasswordData({ old_password: '', new_password: '', new_password_confirm: '' });
    } catch (err) {
      const d = err.response?.data;
      setPasswordMsg({ type: 'error', text: d?.old_password?.[0] || d?.new_password?.[0] || d?.detail || 'Erreur.' });
    } finally { setIsChangingPassword(false); }
  };

  const handleToggleUserStatus = async (userId) => {
    setAdminActionMsg({ type: '', text: '' });
    try {
      const res = await axiosClient.post(`users/${userId}/toggle-status/`);
      setAdminActionMsg({ type: 'success', text: res.data.message });
      fetchAdminData();
    } catch (err) {
      setAdminActionMsg({ type: 'error', text: err.response?.data?.error || 'Action impossible.' });
    }
  };

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.email?.split('@')[0] || 'Utilisateur';

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  if (isAdmin && activeTab === 'admin_dashboard') {
    return (
      <AdminDashboard
        user={user}
        adminStats={adminStats}
        usersList={usersList}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterRole={filterRole}
        setFilterRole={setFilterRole}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        isLoadingUsers={isLoadingUsers}
        adminActionMsg={adminActionMsg}
        handleToggleUserStatus={handleToggleUserStatus}
        fetchAdminData={fetchAdminData}
        updateProfile={updateProfile}
        changePassword={changePassword}
        request2FAEnable={request2FAEnable}
        confirm2FAEnable={confirm2FAEnable}
        disable2FA={disable2FA}
        deleteAccount={deleteAccount}
        onLogout={logout}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F6F8]">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* ═══════════════════════ ONGLET 1 : ACCUEIL ════════════════════════════════════ */}
      {activeTab === 'accueil' && (
        <div className="flex-1">

          {/* Hero — bannière d'accueil avec contraste parfait */}
          <div className="bg-[#0B1F3A] relative overflow-hidden">
            <div className="absolute inset-0 opacity-15 pointer-events-none">
              <div className="absolute -top-20 -right-20 w-[420px] h-[420px] rounded-full bg-[#00C2CB] blur-3xl" />
              <div className="absolute bottom-0 left-1/4 w-[350px] h-[350px] rounded-full bg-[#00838F] blur-2xl" />
            </div>

            <div className="relative max-w-6xl mx-auto px-8 md:px-12 py-16">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#00C2CB]/15 border border-[#00C2CB]/30 text-[#00C2CB] text-xs font-bold tracking-widest uppercase mb-5">
                <span className="w-2 h-2 rounded-full bg-[#00C2CB] animate-pulse" />
                La plateforme Alerta
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.15] mb-5 tracking-tight" style={{ color: '#FFFFFF' }}>
                <span style={{ color: '#FFFFFF' }}>Surveillance intelligente</span><br />
                <span style={{ color: '#00C2CB' }}>propulsée par l'IA</span>
              </h1>

              <p className="text-lg sm:text-xl leading-relaxed max-w-2xl" style={{ color: '#B8C7D9' }}>
                Alerta combine caméras, reconnaissance faciale et détection vocale pour
                détecter, enregistrer et alerter en temps réel sur tout événement suspect.
              </p>
            </div>
          </div>

          {/* ── Section : Compteurs & Dernières Détections (Module 3) ── */}
          <div className="max-w-6xl mx-auto px-8 md:px-12 -mt-8 relative z-10 mb-12">
            {/* 3 Compteurs Clés */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Compteur 1 : Total */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Détections</p>
                  <p className="text-3xl font-extrabold text-[#0B1F3A]">{eventsStats.total_evenements || 0}</p>
                  <span className="text-[11px] text-cyan-700 font-semibold mt-1 inline-block">
                    ● {eventsStats.evenements_aujourdhui || 0} aujourd'hui
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>

              {/* Compteur 2 : Inconnus & Alertes Critiques (Rouge) */}
              <div className="bg-white rounded-2xl p-6 border border-rose-100 shadow-lg flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inconnus & Alertes</p>
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  </div>
                  <p className="text-3xl font-extrabold text-rose-600">
                    {(eventsStats.inconnus_count || 0) + (eventsStats.mouvements_count || 0)}
                  </p>
                  <span className="text-[11px] text-rose-600 font-semibold mt-1 inline-block">
                    {eventsStats.critiques_count || 0} critiques (ML)
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
              </div>

              {/* Compteur 3 : Visages Reconnus (Vert) */}
              <div className="bg-white rounded-2xl p-6 border border-emerald-100 shadow-lg flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Visages Identifiés</p>
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  </div>
                  <p className="text-3xl font-extrabold text-emerald-600">
                    {eventsStats.visages_connus_count || 0}
                  </p>
                  <span className="text-[11px] text-emerald-700 font-semibold mt-1 inline-block">
                    Membres autorisés
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Carte des Derniers Événements avec pastilles */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden p-6 md:p-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-[#0B1F3A]">Dernières Détections Alerta</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-100 text-cyan-800">Module 3</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pastilles colorées : Vert = Visage Connu, Rouge = Mouvement / Inconnu
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleQuickSimulate('inconnu')}
                    disabled={isSimulatingEvent}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                  >
                    <span>⚡ Simuler Détection</span>
                  </button>
                  <button
                    onClick={() => navigate('/events')}
                    className="px-3.5 py-2 text-xs font-bold rounded-xl bg-cyan-50 text-cyan-700 hover:bg-cyan-100 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Tout voir</span>
                    <span>→</span>
                  </button>
                </div>
              </div>

              {/* Liste des 5 événements */}
              {!eventsStats.derniers_evenements || eventsStats.derniers_evenements.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Aucun événement récent enregistré.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {eventsStats.derniers_evenements.slice(0, 5).map((ev) => {
                    const isKnown = ev.type === 'visage_connu';
                    return (
                      <div
                        key={ev.id}
                        onClick={() => setSelectedEventModal(ev)}
                        className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 rounded-xl px-3 transition cursor-pointer"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {/* Pastille colorée conforme à la règle */}
                          <span
                            className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${
                              isKnown ? 'bg-emerald-500 shadow-emerald-500/30' : 'bg-rose-500 shadow-rose-500/30'
                            } shadow-md`}
                            title={isKnown ? 'Visage connu' : 'Mouvement ou Inconnu'}
                          ></span>

                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {ev.description || `${ev.type_display} - ${ev.zone_nom}`}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                              <span>📍 {ev.zone_nom || ev.zone_nom_fallback}</span>
                              <span>•</span>
                              <span>
                                {new Date(ev.date_heure).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                              ev.niveau_criticite === 'eleve'
                                ? 'bg-rose-100 text-rose-700'
                                : ev.niveau_criticite === 'moyen'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            Score: {Math.round(ev.score_criticite * 100)}%
                          </span>
                          <span className="text-slate-400 text-xs">Détails →</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Section : Ce qu'Alerta fait pour vous (3 technologies clés) ── */}
          <div className="max-w-6xl mx-auto px-8 md:px-12 py-14">
            <div className="text-center mb-12">
              <p className="text-xs font-bold text-[#00838F] tracking-widest uppercase mb-2.5">Fonctionnalités avancées</p>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#0B1F3A] mb-3">Trois technologies, une seule plateforme</h2>
              <p className="text-[#4A5568] text-base sm:text-lg max-w-2xl mx-auto">
                Alerta surveille votre environnement en continu, détecte les menaces et réagit en temps réel — sans intervention humaine.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
              {/* Carte 1 — Surveillance Caméra */}
              <div className="group relative bg-white rounded-3xl border border-[#D8DEE4] shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 overflow-hidden text-center p-8 flex flex-col justify-between">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#00C2CB]" />

                <div>
                  <div className="w-20 h-20 rounded-2xl bg-[#E4F8F9] flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                    <svg className="w-10 h-10 text-[#00838F]" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                    </svg>
                  </div>

                  <h3 className="text-xl font-bold text-[#0B1F3A] mb-3">Surveillance par caméra</h3>
                  <p className="text-[#4A5568] text-sm leading-relaxed mb-6">
                    Les caméras connectées analysent en permanence le flux vidéo. Dès qu'un mouvement suspect ou une intrusion survient, une alerte est déclenchée et la séquence vidéo est enregistrée.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2 pt-4 border-t border-[#E7EBEF]">
                  <span className="text-xs font-semibold px-3 py-1 bg-[#E4F8F9] text-[#00838F] rounded-full">Détection de mouvement</span>
                  <span className="text-xs font-semibold px-3 py-1 bg-[#E4F8F9] text-[#00838F] rounded-full">Enregistrement vidéo</span>
                  <span className="text-xs font-semibold px-3 py-1 bg-[#E4F8F9] text-[#00838F] rounded-full">Temps réel</span>
                </div>
              </div>

              {/* Carte 2 — Reconnaissance Faciale */}
              <div className="group relative bg-white rounded-3xl border border-[#D8DEE4] shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 overflow-hidden text-center p-8 flex flex-col justify-between">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-purple-500" />

                <div>
                  <div className="w-20 h-20 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                    <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>

                  <h3 className="text-xl font-bold text-[#0B1F3A] mb-3">Reconnaissance faciale</h3>
                  <p className="text-[#4A5568] text-sm leading-relaxed mb-6">
                    Le moteur d'intelligence artificielle compare en temps réel les visages captés avec votre base de personnes autorisées. Toute personne inconnue déclenche immédiatement une notification.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2 pt-4 border-t border-[#E7EBEF]">
                  <span className="text-xs font-semibold px-3 py-1 bg-purple-50 text-purple-600 rounded-full">IA embarquée</span>
                  <span className="text-xs font-semibold px-3 py-1 bg-purple-50 text-purple-600 rounded-full">Base de visages</span>
                  <span className="text-xs font-semibold px-3 py-1 bg-purple-50 text-purple-600 rounded-full">Identification</span>
                </div>
              </div>

              {/* Carte 3 — Détection Vocale */}
              <div className="group relative bg-white rounded-3xl border border-[#D8DEE4] shadow-sm hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 overflow-hidden text-center p-8 flex flex-col justify-between">
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-blue-500" />

                <div>
                  <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300 shadow-sm">
                    <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>

                  <h3 className="text-xl font-bold text-[#0B1F3A] mb-3">Détection vocale</h3>
                  <p className="text-[#4A5568] text-sm leading-relaxed mb-6">
                    Le microphone analyse en continu l'environnement sonore. La détection de mots-clés d'urgence ou de bruits anormaux (bris de verre, cris) déclenche une alerte instantanée.
                  </p>
                </div>

                <div className="flex flex-wrap justify-center gap-2 pt-4 border-t border-[#E7EBEF]">
                  <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">Mots-clés</span>
                  <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">Analyse sonore</span>
                  <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">Alertes instantanées</span>
                </div>
              </div>
            </div>

            {/* Bannière comment ça fonctionne */}
            <div className="bg-[#0B1F3A] rounded-3xl p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl">
              <div className="flex-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#00C2CB]/20 text-[#00C2CB] text-xs font-bold tracking-widest uppercase mb-3">
                  Fonctionnement
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">Un cycle de surveillance 100% automatisé</h3>
                <p className="text-[#B8C7D9] text-base leading-relaxed max-w-xl">
                  Les capteurs collectent les signaux vidéo et audio en continu. Les algorithmes d'IA isolent les anomalies et déclenchent des alertes enrichies directement sur votre plateforme.
                </p>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                {[
                  { label: 'Capture', icon: '📡' },
                  { label: 'Analyse IA', icon: '🧠' },
                  { label: 'Alerte', icon: '🔔' },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-3xl mb-2 backdrop-blur-sm">
                        {step.icon}
                      </div>
                      <p className="text-white text-xs font-bold tracking-wide uppercase">{step.label}</p>
                    </div>
                    {i < 2 && (
                      <svg className="w-6 h-6 text-[#00C2CB] flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
{activeTab === 'zones' && (
  <div className="flex-1 py-8">
    <div className="max-w-6xl mx-auto px-6">
      <RecognitionModule />
    </div>
  </div>
)}
      {activeTab === 'medias' && (
        <div className="flex-1 py-8">
          <div className="max-w-6xl mx-auto px-6">
            <Medias onGoZones={() => navigate('/zones')} />
          </div>
        </div>
      )}

      {/* ═══════════════════════ ONGLET 2 : PARAMÈTRES DU COMPTE ═════════════════════════ */}
      {activeTab === 'parametres' && (
        <div className="flex-1 py-8">
          <div className="max-w-5xl mx-auto px-6">
            <UserSettings
              user={user}
              updateProfile={updateProfile}
              changePassword={changePassword}
              request2FAEnable={request2FAEnable}
              confirm2FAEnable={confirm2FAEnable}
              disable2FA={disable2FA}
              deleteAccount={deleteAccount}
            />
          </div>
        </div>
      )}
      {/* Modal de Détail Événement */}
      {selectedEventModal && (
        <EventDetailModal
          event={selectedEventModal}
          onClose={() => setSelectedEventModal(null)}
        />
      )}
    </div>
  );
}
