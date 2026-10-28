import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserSettings from '../components/UserSettings';
import RecognitionModule from '../components/recognition/RecognitionModule';
import AdminMedias from '../components/admin/AdminMedias'; // MODIF a : import ajouté

export default function AdminDashboard({
  user,
  adminStats,
  usersList,
  searchQuery,
  setSearchQuery,
  filterRole,
  setFilterRole,
  filterStatus,
  setFilterStatus,
  isLoadingUsers,
  adminActionMsg,
  handleToggleUserStatus,
  fetchAdminData,
  updateProfile,
  changePassword,
  request2FAEnable,
  confirm2FAEnable,
  disable2FA,
  deleteAccount,
  onLogout,
}) {
  const [activeAdminNav, setActiveAdminNav] = useState('overview'); // 'overview' | 'users' | 'medias' | 'recognition' | 'settings'
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const navigate = useNavigate();

  const currentDate = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const getInitials = () => {
    if (user?.first_name && user?.last_name)
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    if (user?.email) return user.email.slice(0, 2).toUpperCase();
    return 'AD';
  };

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.email?.split('@')[0] || 'Administrateur';

  return (
    <div className="min-h-screen flex bg-[#F4F6F8] text-[#0B1F3A]">

      {/* ═══════════════════════ SIDEBAR GAUCHE (Style Sitemark / Aura) ═══════════════════════ */}
      <aside className="w-64 bg-white border-r border-[#E5E7EB] flex flex-col flex-shrink-0 min-h-screen sticky top-0 h-screen">

        {/* En-tête Sidebar : Logo & Application */}
        <div className="p-5 border-b border-[#F0F2F5] flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveAdminNav('overview')}>
            <svg width="30" height="30" viewBox="0 0 64 64" className="flex-shrink-0">
              <rect width="64" height="64" rx="16" fill="#0B1F3A" />
              <path d="M8 32Q32 10 56 32Q32 54 8 32Z" fill="none" stroke="#00C2CB" strokeWidth="4" strokeLinejoin="round" />
              <circle cx="32" cy="32" r="10" fill="#00C2CB" />
              <rect x="26.8" y="28" width="2.6" height="8" rx="1.3" fill="#0B1F3A" />
              <rect x="30.7" y="24.5" width="2.6" height="15" rx="1.3" fill="#0B1F3A" />
              <rect x="34.6" y="28" width="2.6" height="8" rx="1.3" fill="#0B1F3A" />
            </svg>
            <div>
              <span className="font-poppins font-bold text-lg text-[#0B1F3A] tracking-tight block leading-none">
                Aler<i className="not-italic text-[#00838F]">ta</i>
              </span>
              <span className="text-[11px] text-[#4A5568] font-medium">Administration</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E4F8F9] text-[#00838F]">
            v1.0
          </span>
        </div>

        {/* Navigation principale de la Sidebar */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6">

          {/* Groupe 1 : Administration */}
          <div>
            <p className="px-3 text-[11px] font-bold text-[#8FA3B8] uppercase tracking-wider mb-2">
              Menu Principal
            </p>
            <nav className="space-y-1">
              <button
                onClick={() => setActiveAdminNav('overview')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer text-left ${
                  activeAdminNav === 'overview'
                    ? 'bg-[#E4F8F9] text-[#00838F]'
                    : 'text-[#4A5568] hover:bg-gray-100 hover:text-[#0B1F3A]'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                Vue d'ensemble
              </button>

              <button
                onClick={() => setActiveAdminNav('users')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer text-left ${
                  activeAdminNav === 'users'
                    ? 'bg-[#E4F8F9] text-[#00838F]'
                    : 'text-[#4A5568] hover:bg-gray-100 hover:text-[#0B1F3A]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  Utilisateurs &amp; Comptes
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-bold">
                  {adminStats.total_users}
                </span>
              </button>
            </nav>
          </div>

          {/* Groupe 2 : Modules Alerta */}
          <div>
            <p className="px-3 text-[11px] font-bold text-[#8FA3B8] uppercase tracking-wider mb-2">
              Modules Équipe
            </p>
            <nav className="space-y-1 text-sm">

              {/* MODIF b : le placeholder « Événements / M2 » est remplacé par le bouton Médias */}
              <button
                onClick={() => setActiveAdminNav('medias')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer text-left ${
                  activeAdminNav === 'medias' ? 'bg-[#E4F8F9] text-[#00838F]' : 'text-[#4A5568] hover:bg-gray-100 hover:text-[#0B1F3A]'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
                Médias
              </button>

              <button
                onClick={() => setActiveAdminNav('recognition')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer text-left ${
                  activeAdminNav === 'recognition' ? 'bg-[#E4F8F9] text-[#00838F]' : 'text-[#4A5568] hover:bg-gray-100 hover:text-[#0B1F3A]'
                }`}
              >
                Zones &amp; Visages
              </button>


              {/* M3 — Actif et interactif ! */}
              <button
                onClick={() => navigate('/events')}
                className="w-full flex items-center justify-between px-3.5 py-2 text-cyan-600 bg-cyan-50/60 hover:bg-cyan-100/80 rounded-lg transition text-left font-semibold cursor-pointer"
              >
                <span className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Événements &amp; IA
                </span>
                <span className="text-[10px] bg-cyan-200 text-cyan-800 px-1.5 py-0.5 rounded font-bold">M3</span>
              </button>

              <div className="flex items-center justify-between px-3.5 py-2 text-gray-400 rounded-lg">
                <span className="flex items-center gap-3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7" /></svg>
                  Voix &amp; Alarmes
                </span>
                <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-400 font-bold">M4</span>
              </div>
            </nav>
          </div>

          {/* Groupe 3 : Liens système */}
          <div>
            <p className="px-3 text-[11px] font-bold text-[#8FA3B8] uppercase tracking-wider mb-2">
              Système
            </p>
            <nav className="space-y-1">
              <button
                onClick={() => setActiveAdminNav('settings')}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer text-left ${
                  activeAdminNav === 'settings'
                    ? 'bg-[#E4F8F9] text-[#00838F]'
                    : 'text-[#4A5568] hover:bg-gray-100 hover:text-[#0B1F3A]'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Paramètres &amp; Sécurité
              </button>
            </nav>
          </div>
        </div>

        {/* Profil administrateur en bas de la Sidebar (comme Sitemark) */}
        <div className="p-4 border-t border-[#F0F2F5] bg-[#FBFBFC] flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-[#0B1F3A] flex-shrink-0"
              style={{ background: '#00C2CB' }}
            >
              {getInitials()}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#0B1F3A] truncate">{displayName}</p>
              <p className="text-[11px] text-[#4A5568] truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => setShowLogoutModal(true)}
            title="Déconnexion"
            className="p-1.5 rounded-lg text-gray-400 hover:text-[#E63946] hover:bg-red-50 transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H9" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ═══════════════════════ ZONE PRINCIPALE (CONTENU À DROITE) ═══════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">

        {/* Top Header Bar (Breadcrumb, Search, Date, Actions) */}
        <header className="h-16 bg-white border-b border-[#E5E7EB] px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          {/* Fil d'Ariane (Breadcrumbs) */}
          <div className="flex items-center gap-2 text-sm text-[#8FA3B8]">
            <span className="hover:text-[#0B1F3A] cursor-pointer" onClick={() => setActiveAdminNav('overview')}>Alerta</span>
            <span>/</span>
            <span>Dashboard Administrateur</span>
            <span>/</span>
            {/* MODIF c : branche « Médias » ajoutée en premier */}
            <span className="font-semibold text-[#0B1F3A]">
              {activeAdminNav === 'medias' ? 'Médias'
                : activeAdminNav === 'recognition' ? 'Zones & Visages'
                : activeAdminNav === 'settings' ? 'Paramètres & Sécurité'
                : activeAdminNav === 'users' ? 'Utilisateurs & Comptes'
                : "Vue d'ensemble"}
            </span>
          </div>

          {/* Outils d'en-tête : Date, Recherche, Bouton */}
          <div className="flex items-center gap-3.5">
            {/* Date du jour */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-[#4A5568] bg-[#F4F6F8] border border-[#E5E7EB] px-3 py-1.5 rounded-xl">
              <svg className="w-4 h-4 text-[#8FA3B8]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
              </svg>
              <span>{currentDate}</span>
            </div>

            <button
              onClick={fetchAdminData}
              title="Rafraîchir les données"
              className="p-2 rounded-xl border border-[#E5E7EB] hover:bg-gray-50 text-[#4A5568] transition cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </header>

        {/* Corps principal */}
        <main className="p-8 space-y-8">

          {/* Notification feedback */}
          {adminActionMsg.text && (
            <div className={`p-4 rounded-2xl text-sm font-semibold flex items-center gap-3 ${
              adminActionMsg.type === 'success'
                ? 'bg-[#2BB673]/12 text-[#1D8A57] border border-[#2BB673]/30'
                : 'bg-red-50 text-[#C22B36] border border-red-200'
            }`}>
              {adminActionMsg.text}
            </div>
          )}

          {/* ════════════ MODIF d : chaîne conditionnelle, branche « medias » ajoutée au début ════════════ */}
          {activeAdminNav === 'medias' ? (
            <AdminMedias />
          ) : activeAdminNav === 'recognition' ? (
            <RecognitionModule />
          ) : activeAdminNav === 'settings' ? (
            <UserSettings
              user={user}
              updateProfile={updateProfile}
              changePassword={changePassword}
              request2FAEnable={request2FAEnable}
              confirm2FAEnable={confirm2FAEnable}
              disable2FA={disable2FA}
              deleteAccount={deleteAccount}
            />
          ) : (
            <>
              {/* ════════════ SECTION 1 : VUE D'ENSEMBLE (KPI METRICS avec sparklines) ════════════ */}
              {activeAdminNav === 'overview' && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-bold text-[#0B1F3A]">Vue d'ensemble</h2>
                      <span className="text-xs text-[#8FA3B8] font-medium">Données réelles de la plateforme</span>
                    </div>

                    {/* 4 Cartes KPI avec sparklines courbes (style Sitemark / Aura) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

                      {/* KPI 1 : Total Utilisateurs */}
                      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-xs flex flex-col justify-between hover:border-[#00C2CB]/50 transition">
                        <div className="flex items-center justify-between text-xs text-[#8FA3B8] font-semibold mb-2">
                          <span>UTILISATEURS TOTAUX</span>
                          <span className="text-[#1D8A57] bg-green-50 px-2 py-0.5 rounded-full font-bold">+100%</span>
                        </div>
                        <div className="text-3xl font-extrabold text-[#0B1F3A] mb-3">{adminStats.total_users}</div>
                        <svg className="w-full h-8 text-[#2BB673]" viewBox="0 0 100 25" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M0 20 Q 25 15, 50 18 T 100 5" strokeLinecap="round" />
                        </svg>
                      </div>

                      {/* KPI 2 : Comptes Actifs */}
                      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-xs flex flex-col justify-between hover:border-[#00C2CB]/50 transition">
                        <div className="flex items-center justify-between text-xs text-[#8FA3B8] font-semibold mb-2">
                          <span>COMPTES ACTIFS</span>
                          <span className="text-[#00838F] bg-[#E4F8F9] px-2 py-0.5 rounded-full font-bold">Actifs</span>
                        </div>
                        <div className="text-3xl font-extrabold text-[#1D8A57] mb-3">{adminStats.active_users}</div>
                        <svg className="w-full h-8 text-[#00C2CB]" viewBox="0 0 100 25" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M0 18 Q 30 8, 60 14 T 100 4" strokeLinecap="round" />
                        </svg>
                      </div>

                      {/* KPI 3 : Comptes Inactifs */}
                      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-xs flex flex-col justify-between hover:border-red-200 transition">
                        <div className="flex items-center justify-between text-xs text-[#8FA3B8] font-semibold mb-2">
                          <span>COMPTES DÉSACTIVÉS</span>
                          <span className="text-[#C22B36] bg-red-50 px-2 py-0.5 rounded-full font-bold">Inactifs</span>
                        </div>
                        <div className="text-3xl font-extrabold text-[#C22B36] mb-3">{adminStats.inactive_users}</div>
                        <svg className="w-full h-8 text-[#E63946]" viewBox="0 0 100 25" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M0 10 Q 30 20, 60 15 T 100 22" strokeLinecap="round" />
                        </svg>
                      </div>

                      {/* KPI 4 : Administrateurs */}
                      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-xs flex flex-col justify-between hover:border-[#0B1F3A]/30 transition">
                        <div className="flex items-center justify-between text-xs text-[#8FA3B8] font-semibold mb-2">
                          <span>ADMINISTRATEURS</span>
                          <span className="text-[#0B1F3A] bg-gray-100 px-2 py-0.5 rounded-full font-bold">Privilèges</span>
                        </div>
                        <div className="text-3xl font-extrabold text-[#0B1F3A] mb-3">{adminStats.admin_users}</div>
                        <svg className="w-full h-8 text-[#0B1F3A]" viewBox="0 0 100 25" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M0 15 Q 25 5, 50 10 T 100 8" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* ════════════ SECTION 2 : GRANDE CARTE GRAPHIQUE + SIDEBAR INFO (Style Aura) ════════════ */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Graphique d'activité / Répartition visuelle */}
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-xs">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-base font-bold text-[#0B1F3A]">Répartition &amp; État des Comptes</h3>
                          <p className="text-xs text-[#8FA3B8]">Suivi de la disponibilité des accès utilisateurs Alerta</p>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#E4F8F9] text-[#00838F]">
                          Mise à jour directe
                        </span>
                      </div>

                      {/* Graphique SVG aire dégradée */}
                      <div className="h-44 w-full relative pt-2">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="adminGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                              <stop offset="0%" stopColor="#00C2CB" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="#00C2CB" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>
                          <line x1="0" y1="30" x2="500" y2="30" stroke="#F0F2F5" strokeDasharray="3 3" />
                          <line x1="0" y1="80" x2="500" y2="80" stroke="#F0F2F5" strokeDasharray="3 3" />
                          <line x1="0" y1="130" x2="500" y2="130" stroke="#F0F2F5" strokeDasharray="3 3" />

                          <path
                            d="M 0,130 Q 80,110 150,70 T 300,50 T 420,30 T 500,45 L 500,150 L 0,150 Z"
                            fill="url(#adminGradient)"
                          />
                          <path
                            d="M 0,130 Q 80,110 150,70 T 300,50 T 420,30 T 500,45"
                            fill="none"
                            stroke="#00838F"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                          />
                          <circle cx="150" cy="70" r="4.5" fill="#00C2CB" stroke="#FFFFFF" strokeWidth="2" />
                          <circle cx="300" cy="50" r="4.5" fill="#00C2CB" stroke="#FFFFFF" strokeWidth="2" />
                          <circle cx="420" cy="30" r="4.5" fill="#00C2CB" stroke="#FFFFFF" strokeWidth="2" />
                        </svg>

                        <div className="flex justify-between text-[11px] text-[#8FA3B8] font-medium pt-3">
                          <span>Inscription</span>
                          <span>Authentification</span>
                          <span>Actifs ({adminStats.active_users})</span>
                          <span>Rôles Admin ({adminStats.admin_users})</span>
                        </div>
                      </div>
                    </div>

                    {/* Carte latérale : Résumé des actions */}
                    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-xs flex flex-col justify-between">
                      <div>
                        <div className="w-10 h-10 rounded-xl bg-[#E4F8F9] text-[#00838F] flex items-center justify-center mb-4">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                          </svg>
                        </div>
                        <h3 className="text-base font-bold text-[#0B1F3A] mb-1">Module 1 : Comptes</h3>
                        <p className="text-xs text-[#8FA3B8] mb-4">Contrôle des accès utilisateurs</p>

                        <div className="space-y-3 text-xs">
                          <div className="flex justify-between py-2 border-b border-[#F0F2F5]">
                            <span className="text-[#4A5568]">Comptes opérationnels</span>
                            <span className="font-bold text-[#1D8A57]">{adminStats.active_users}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-[#F0F2F5]">
                            <span className="text-[#4A5568]">Comptes suspendus</span>
                            <span className="font-bold text-[#C22B36]">{adminStats.inactive_users}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-[#F0F2F5]">
                            <span className="text-[#4A5568]">Sécurité JWT</span>
                            <span className="font-bold text-[#00838F]">Active</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const tableElem = document.getElementById('admin-table');
                          if (tableElem) tableElem.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="w-full mt-5 py-2.5 px-4 rounded-xl border border-[#00C2CB] text-[#00838F] hover:bg-[#E4F8F9] font-bold text-xs transition cursor-pointer text-center"
                      >
                        Gérer les comptes ci-dessous ↓
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ════════════ SECTION 3 : TABLE DE GESTION (Style Details / Recent orders) ════════════ */}
              <div id="admin-table" className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
                {/* Barre de recherche et filtres */}
                <div className="p-6 border-b border-[#F0F2F5] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-[#0B1F3A]">Liste des Utilisateurs Alerta</h3>
                    <p className="text-xs text-[#8FA3B8]">Activez ou désactivez les comptes en 1 clic</p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Champ recherche */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Rechercher nom, email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && fetchAdminData()}
                        className="pl-9 pr-4 py-2 border border-[#E5E7EB] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#00C2CB] w-56 bg-[#FBFBFC]"
                      />
                      <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                      </svg>
                    </div>

                    {/* Filtre Rôle */}
                    <select
                      value={filterRole}
                      onChange={(e) => setFilterRole(e.target.value)}
                      className="px-3 py-2 border border-[#E5E7EB] rounded-xl text-xs font-medium text-[#0B1F3A] bg-[#FBFBFC] focus:outline-none focus:ring-2 focus:ring-[#00C2CB]"
                    >
                      <option value="all">Tous les rôles</option>
                      <option value="admin">Administrateurs</option>
                      <option value="user">Utilisateurs</option>
                    </select>

                    {/* Filtre Statut */}
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="px-3 py-2 border border-[#E5E7EB] rounded-xl text-xs font-medium text-[#0B1F3A] bg-[#FBFBFC] focus:outline-none focus:ring-2 focus:ring-[#00C2CB]"
                    >
                      <option value="all">Tous les statuts</option>
                      <option value="active">Actifs</option>
                      <option value="inactive">Désactivés</option>
                    </select>

                    <button
                      onClick={fetchAdminData}
                      className="px-4 py-2 bg-[#00C2CB] hover:bg-[#00838F] text-[#0B1F3A] hover:text-white font-bold text-xs rounded-xl transition cursor-pointer"
                    >
                      Filtrer
                    </button>
                  </div>
                </div>

                {/* Tableau */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#FBFBFC] border-b border-[#F0F2F5] text-[#8FA3B8] uppercase font-bold tracking-wider">
                        <th className="px-6 py-3.5">Utilisateur</th>
                        <th className="px-6 py-3.5">Rôle</th>
                        <th className="px-6 py-3.5">Date Inscription</th>
                        <th className="px-6 py-3.5">Statut Compte</th>
                        <th className="px-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F2F5]">
                      {isLoadingUsers ? (
                        <tr><td colSpan="5" className="text-center py-10 text-gray-400">Chargement des comptes...</td></tr>
                      ) : usersList.length === 0 ? (
                        <tr><td colSpan="5" className="text-center py-10 text-gray-400">Aucun utilisateur trouvé.</td></tr>
                      ) : usersList.map((u) => (
                        <tr key={u.id} className="hover:bg-[#FBFBFC] transition">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#E4F8F9] text-[#00838F] flex items-center justify-center font-bold text-xs flex-shrink-0">
                                {u.first_name?.[0]?.toUpperCase() || u.email[0].toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-[#0B1F3A]">
                                  {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}` : '—'}
                                </p>
                                <p className="text-[11px] text-[#8FA3B8]">{u.email}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                              u.role === 'admin'
                                ? 'bg-[#0B1F3A] text-[#00C2CB]'
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {u.role === 'admin' ? '🛡️ Admin' : '👤 Utilisateur'}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-[#4A5568]">
                            {u.date_inscription ? new Date(u.date_inscription).toLocaleDateString('fr-FR') : '—'}
                          </td>

                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                              u.is_active
                                ? 'bg-green-50 text-[#1D8A57]'
                                : 'bg-red-50 text-[#C22B36]'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-[#2BB673]' : 'bg-red-400'}`} />
                              {u.is_active ? 'Actif' : 'Désactivé'}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-right">
                            {u.id === user.id ? (
                              <span className="text-[11px] text-gray-400 italic font-medium px-2.5 py-1 bg-gray-50 rounded-lg">Votre compte</span>
                            ) : (
                              <button
                                onClick={() => handleToggleUserStatus(u.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                                  u.is_active
                                    ? 'border-red-200 text-[#C22B36] hover:bg-red-50'
                                    : 'border-green-200 text-[#1D8A57] hover:bg-green-50'
                                }`}
                              >
                                {u.is_active ? 'Désactiver' : 'Activer'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

        </main>
      </div>

      {/* ── Modale de confirmation de déconnexion Administrateur ── */}
      {showLogoutModal && (
        <div className="fixed inset-0 bg-[#0B1F3A]/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-[#D8DEE4] p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-[#E63946] flex items-center justify-center mx-auto mb-4 shadow-xs">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H9" />
              </svg>
            </div>

            <h3 className="text-lg font-bold text-[#0B1F3A] mb-1.5">Confirmation de déconnexion</h3>
            <p className="text-xs text-[#4A5568] mb-6 leading-relaxed">
              Êtes-vous sûr de vouloir vous déconnecter de votre session Administrateur ?
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 py-2.5 px-4 border border-[#D8DEE4] rounded-xl text-xs font-bold text-[#4A5568] hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => { setShowLogoutModal(false); onLogout(); }}
                className="flex-1 py-2.5 px-4 bg-[#E63946] hover:bg-red-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}