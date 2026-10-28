import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import axiosClient from '../api/axiosClient';
import AdminDashboard from './AdminDashboard';
import UserSettings from '../components/UserSettings';
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
  const isAdmin = user?.role === 'admin';

  // Onglet actif : 'accueil', 'parametres'
  const [activeTab, setActiveTab] = useState('accueil');

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
    if (isAdmin) {
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

  if (isAdmin) {
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
            <Medias onGoZones={() => setActiveTab('zones')} />
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
    </div>
  );
}
