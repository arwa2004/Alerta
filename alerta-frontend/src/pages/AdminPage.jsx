import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import axiosClient from '../api/axiosClient';
import eventsApi from '../api/eventsApi';
import UserSettings from '../components/UserSettings';
import EventDetailModal from '../components/EventDetailModal';

// ─── Helpers ────────────────────────────────────────────────────────────────
const CRITICITE_LABELS = {
  critique: { label: 'Critique', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  elevee: { label: 'Élevée', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
  moderee: { label: 'Modérée', color: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-400' },
  faible: { label: 'Faible', color: 'bg-green-100 text-green-700', dot: 'bg-green-400' },
};

const TYPE_LABELS = {
  visage_inconnu: 'Visage Inconnu',
  visage_connu: 'Visage Connu',
  mouvement: 'Mouvement',
  autre: 'Autre',
};

export default function AdminPage() {
  const {
    user, logout,
    updateProfile, changePassword,
    request2FAEnable, confirm2FAEnable, disable2FA, deleteAccount,
  } = useContext(AuthContext);
  const navigate = useNavigate();

  // Redirect non-admins
  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const [activeNav, setActiveNav] = useState('overview'); // 'overview' | 'users' | 'events' | 'settings'
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // ── Admin Stats (Users) ──────────────────────────────────────────────────
  const [adminStats, setAdminStats] = useState({
    total_users: 0,
    active_users: 0,
    admin_users: 0,
    new_users_month: 0,
  });
  const [usersList, setUsersList] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [adminActionMsg, setAdminActionMsg] = useState('');

  // ── Events Stats ─────────────────────────────────────────────────────────
  const [eventsStats, setEventsStats] = useState({
    total_evenements: 0,
    evenements_aujourdhui: 0,
    critiques_count: 0,
    alertes_count: 0,
    derniers_evenements: [],
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [simulating, setSimulating] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.email?.split('@')[0] || 'Administrateur';

  const getInitials = () => {
    if (user?.first_name && user?.last_name)
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    return user?.email?.slice(0, 2).toUpperCase() || 'AD';
  };

  const currentDate = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Fetch Admin Data ──────────────────────────────────────────────────────
  const fetchAdminData = async () => {
    setIsLoadingUsers(true);
    try {
      const [statsRes, usersRes] = await Promise.all([
        axiosClient.get('stats/'),
        axiosClient.get('users/'),
      ]);
      setAdminStats(statsRes.data);
      setUsersList(usersRes.data);
    } catch (err) {
      console.error('Erreur chargement données admin', err);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const fetchEventsStats = async () => {
    try {
      const data = await eventsApi.getDashboardStats();
      setEventsStats(data);
    } catch (err) {
      console.error('Erreur stats événements', err);
    }
  };

  useEffect(() => {
    fetchAdminData();
    fetchEventsStats();
  }, []);

  // ── User Management ───────────────────────────────────────────────────────
  const handleToggleUserStatus = async (userId) => {
    try {
      await axiosClient.patch(`users/${userId}/toggle-status/`);
      setAdminActionMsg('Statut mis à jour avec succès.');
      setTimeout(() => setAdminActionMsg(''), 3000);
      fetchAdminData();
    } catch (err) {
      setAdminActionMsg('Erreur lors de la mise à jour.');
      setTimeout(() => setAdminActionMsg(''), 3000);
    }
  };

  const filteredUsers = usersList.filter((u) => {
    const matchSearch =
      !searchQuery ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.last_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = filterRole === 'all' || u.role === filterRole;
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && u.is_active) ||
      (filterStatus === 'inactive' && !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  // ── Simulate Event ────────────────────────────────────────────────────────
  const handleSimulate = async (scenario = 'inconnu') => {
    setSimulating(true);
    try {
      const newEv = await eventsApi.simulateEvenement(scenario);
      await fetchEventsStats();
      setSelectedEvent(newEv);
    } catch (err) {
      console.error('Erreur simulation', err);
    } finally {
      setSimulating(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SIDEBAR NAV ITEMS
  // ─────────────────────────────────────────────────────────────────────────
  const navItems = [
    {
      id: 'overview',
      label: 'Vue d\'ensemble',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
    },
    {
      id: 'users',
      label: 'Utilisateurs',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    },
    {
      id: 'events',
      label: 'Événements',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Mon Compte',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex bg-[#F4F6F8] text-[#0B1F3A]">

      {/* ════════════════════════════════ SIDEBAR ════════════════════════════ */}
      <aside className="w-64 bg-white border-r border-[#E5E7EB] flex flex-col flex-shrink-0 min-h-screen sticky top-0 h-screen">

        {/* Logo */}
        <div className="p-5 border-b border-[#F0F2F5] flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveNav('overview')}>
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
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E4F8F9] text-[#00838F]">v1.0</span>
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-1">
          <p className="px-3 text-[11px] font-bold text-[#8FA3B8] uppercase tracking-wider mb-2">Menu Principal</p>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer text-left ${
                activeNav === item.id
                  ? 'bg-[#E4F8F9] text-[#00838F]'
                  : 'text-[#4A5568] hover:bg-gray-100 hover:text-[#0B1F3A]'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          {/* Lien vers dashboard utilisateur */}
          <div className="pt-4 border-t border-[#F0F2F5] mt-4">
            <p className="px-3 text-[11px] font-bold text-[#8FA3B8] uppercase tracking-wider mb-2">Navigation</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-[#4A5568] hover:bg-gray-100 hover:text-[#0B1F3A] transition cursor-pointer text-left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              Vue Utilisateur
            </button>
            <button
              onClick={() => navigate('/events')}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-[#4A5568] hover:bg-gray-100 hover:text-[#0B1F3A] transition cursor-pointer text-left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Historique Complet
            </button>
          </div>
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-[#F0F2F5]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-[#0B1F3A] flex items-center justify-center text-[#00C2CB] font-bold text-sm flex-shrink-0">
              {getInitials()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#0B1F3A] truncate">{displayName}</p>
              <p className="text-[11px] text-[#8FA3B8] truncate">{user?.email}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#0B1F3A] text-[#00C2CB] mb-3">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            Administrateur
          </span>
          <button
            onClick={() => setShowLogoutModal(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-[#C22B36] hover:bg-red-50 transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H9" />
            </svg>
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ════════════════════════════════ MAIN CONTENT ════════════════════════ */}
      <main className="flex-1 overflow-y-auto">

        {/* Top Bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-[#E5E7EB] px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0B1F3A]">
              {activeNav === 'overview' && 'Vue d\'ensemble'}
              {activeNav === 'users' && 'Gestion des Utilisateurs'}
              {activeNav === 'events' && 'Surveillance Événements'}
              {activeNav === 'settings' && 'Mon Compte'}
            </h1>
            <p className="text-xs text-[#8FA3B8] mt-0.5">{currentDate}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[#1D8A57] bg-green-50 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2BB673] animate-pulse" />
              Système actif
            </span>
          </div>
        </div>

        <div className="p-8">
          {/* ─── VUE D'ENSEMBLE ─────────────────────────────────────────────── */}
          {activeNav === 'overview' && (
            <div className="space-y-8">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                  {
                    label: 'Total Utilisateurs',
                    value: adminStats.total_users,
                    icon: '👥',
                    color: 'bg-blue-50 text-blue-700',
                    sub: `${adminStats.active_users ?? 0} actifs`,
                  },
                  {
                    label: 'Administrateurs',
                    value: adminStats.admin_users ?? 0,
                    icon: '🛡️',
                    color: 'bg-[#E4F8F9] text-[#00838F]',
                    sub: 'Accès complet',
                  },
                  {
                    label: 'Événements Totaux',
                    value: eventsStats.total_evenements,
                    icon: '📹',
                    color: 'bg-purple-50 text-purple-700',
                    sub: `${eventsStats.evenements_aujourdhui ?? 0} aujourd'hui`,
                  },
                  {
                    label: 'Alertes Critiques',
                    value: eventsStats.critiques_count ?? 0,
                    icon: '🚨',
                    color: 'bg-red-50 text-red-700',
                    sub: `${eventsStats.alertes_count ?? 0} alarmes M4`,
                  },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-sm">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${kpi.color}`}>
                      {kpi.icon}
                    </div>
                    <p className="text-2xl font-bold text-[#0B1F3A]">{kpi.value}</p>
                    <p className="text-sm font-semibold text-[#4A5568] mt-0.5">{kpi.label}</p>
                    <p className="text-xs text-[#8FA3B8] mt-1">{kpi.sub}</p>
                  </div>
                ))}
              </div>

              {/* Derniers utilisateurs + Derniers événements */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Derniers utilisateurs */}
                <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-[#0B1F3A]">Derniers Utilisateurs</h2>
                    <button
                      onClick={() => setActiveNav('users')}
                      className="text-xs font-bold text-[#00838F] hover:underline cursor-pointer"
                    >
                      Voir tout →
                    </button>
                  </div>
                  {isLoadingUsers ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-[#00C2CB] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {usersList.slice(0, 5).map((u) => (
                        <div key={u.id} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[#E4F8F9] flex items-center justify-center text-xs font-bold text-[#00838F]">
                            {u.first_name?.[0] || u.email?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#0B1F3A] truncate">
                              {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
                            </p>
                            <p className="text-xs text-[#8FA3B8] truncate">{u.email}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            u.role === 'admin' ? 'bg-[#0B1F3A] text-[#00C2CB]' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {u.role === 'admin' ? 'Admin' : 'User'}
                          </span>
                        </div>
                      ))}
                      {usersList.length === 0 && (
                        <p className="text-sm text-[#8FA3B8] text-center py-4">Aucun utilisateur</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Derniers événements */}
                <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold text-[#0B1F3A]">Dernières Détections</h2>
                    <button
                      onClick={() => navigate('/events')}
                      className="text-xs font-bold text-[#00838F] hover:underline cursor-pointer"
                    >
                      Historique →
                    </button>
                  </div>
                  <div className="space-y-3">
                    {(eventsStats.derniers_evenements || []).slice(0, 5).map((ev) => {
                      const crit = CRITICITE_LABELS[ev.score_criticite] || CRITICITE_LABELS.faible;
                      return (
                        <div
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="flex items-center gap-3 cursor-pointer group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-[#F4F6F8] flex items-center justify-center text-sm flex-shrink-0">
                            {ev.type_evenement === 'visage_inconnu' ? '👤' :
                             ev.type_evenement === 'visage_connu' ? '✅' :
                             ev.type_evenement === 'mouvement' ? '🔦' : '📹'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#0B1F3A] group-hover:text-[#00838F] truncate">
                              {TYPE_LABELS[ev.type_evenement] || ev.type_evenement}
                            </p>
                            <p className="text-xs text-[#8FA3B8]">{ev.zone_nom || 'Zone inconnue'}</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${crit.color}`}>
                            {crit.label}
                          </span>
                        </div>
                      );
                    })}
                    {(eventsStats.derniers_evenements || []).length === 0 && (
                      <p className="text-sm text-[#8FA3B8] text-center py-4">Aucun événement</p>
                    )}
                  </div>

                  {/* Quick Simulate */}
                  <div className="mt-5 pt-4 border-t border-[#F0F2F5]">
                    <p className="text-xs font-bold text-[#8FA3B8] uppercase mb-2">Simulation rapide</p>
                    <div className="flex gap-2 flex-wrap">
                      {['inconnu', 'connu', 'mouvement'].map((sc) => (
                        <button
                          key={sc}
                          onClick={() => handleSimulate(sc)}
                          disabled={simulating}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#E4F8F9] text-[#00838F] hover:bg-[#00C2CB]/20 transition disabled:opacity-50 cursor-pointer"
                        >
                          {simulating ? '...' : sc}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─── GESTION UTILISATEURS ──────────────────────────────────────── */}
          {activeNav === 'users' && (
            <div className="space-y-6">
              {adminActionMsg && (
                <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm font-medium text-[#1D8A57]">
                  {adminActionMsg}
                </div>
              )}

              {/* Filtres */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 shadow-sm">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="relative flex-1 min-w-48">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8FA3B8]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Rechercher un utilisateur..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:border-[#00C2CB]"
                    />
                  </div>
                  <select
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="px-3 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:border-[#00C2CB] bg-white cursor-pointer"
                  >
                    <option value="all">Tous les rôles</option>
                    <option value="admin">Admin</option>
                    <option value="user">Utilisateur</option>
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:border-[#00C2CB] bg-white cursor-pointer"
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="active">Actifs</option>
                    <option value="inactive">Désactivés</option>
                  </select>
                  <button
                    onClick={fetchAdminData}
                    className="px-4 py-2.5 bg-[#E4F8F9] text-[#00838F] rounded-xl text-sm font-bold hover:bg-[#00C2CB]/20 transition cursor-pointer"
                  >
                    Actualiser
                  </button>
                </div>
              </div>

              {/* Tableau utilisateurs */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-[#F0F2F5] flex items-center justify-between">
                  <h2 className="font-bold text-[#0B1F3A]">
                    Utilisateurs ({filteredUsers.length})
                  </h2>
                </div>
                {isLoadingUsers ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-3 border-[#00C2CB] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[#8FA3B8]">
                    <p className="font-medium">Aucun utilisateur trouvé</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#F0F2F5]">
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#8FA3B8] uppercase tracking-wider">Utilisateur</th>
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#8FA3B8] uppercase tracking-wider">Rôle</th>
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#8FA3B8] uppercase tracking-wider">Inscription</th>
                          <th className="px-6 py-3.5 text-left text-xs font-bold text-[#8FA3B8] uppercase tracking-wider">Statut</th>
                          <th className="px-6 py-3.5 text-right text-xs font-bold text-[#8FA3B8] uppercase tracking-wider">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F2F5]">
                        {filteredUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-[#F8FAFC] transition">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#E4F8F9] flex items-center justify-center text-xs font-bold text-[#00838F]">
                                  {u.first_name?.[0] || u.email?.[0]?.toUpperCase() || '?'}
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
                              {u.date_inscription
                                ? new Date(u.date_inscription).toLocaleDateString('fr-FR')
                                : '—'}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                                u.is_active ? 'bg-green-50 text-[#1D8A57]' : 'bg-red-50 text-[#C22B36]'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-[#2BB673]' : 'bg-red-400'}`} />
                                {u.is_active ? 'Actif' : 'Désactivé'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {u.id === user?.id ? (
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
                )}
              </div>
            </div>
          )}

          {/* ─── SURVEILLANCE ÉVÉNEMENTS ────────────────────────────────────── */}
          {activeNav === 'events' && (
            <div className="space-y-6">
              {/* Stats rapides */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total', value: eventsStats.total_evenements, color: 'text-[#0B1F3A]', bg: 'bg-white' },
                  { label: "Aujourd'hui", value: eventsStats.evenements_aujourdhui ?? 0, color: 'text-purple-700', bg: 'bg-purple-50' },
                  { label: 'Critiques', value: eventsStats.critiques_count ?? 0, color: 'text-red-700', bg: 'bg-red-50' },
                  { label: 'Alarmes M4', value: eventsStats.alertes_count ?? 0, color: 'text-orange-700', bg: 'bg-orange-50' },
                ].map((s) => (
                  <div key={s.label} className={`${s.bg} rounded-2xl border border-[#E5E7EB] p-5 shadow-sm`}>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-sm text-[#4A5568] font-medium mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Liste des derniers événements */}
              <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-bold text-[#0B1F3A]">Dernières Détections</h2>
                  <div className="flex gap-2">
                    {['inconnu', 'connu', 'mouvement'].map((sc) => (
                      <button
                        key={sc}
                        onClick={() => handleSimulate(sc)}
                        disabled={simulating}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#E4F8F9] text-[#00838F] hover:bg-[#00C2CB]/20 transition disabled:opacity-50 cursor-pointer"
                      >
                        {simulating ? '...' : `+ ${sc}`}
                      </button>
                    ))}
                    <button
                      onClick={() => navigate('/events')}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#0B1F3A] text-white hover:bg-[#1a3a5e] transition cursor-pointer"
                    >
                      Historique →
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {(eventsStats.derniers_evenements || []).map((ev) => {
                    const crit = CRITICITE_LABELS[ev.score_criticite] || CRITICITE_LABELS.faible;
                    return (
                      <div
                        key={ev.id}
                        onClick={() => setSelectedEvent(ev)}
                        className="flex items-center gap-4 p-4 rounded-xl border border-[#F0F2F5] hover:border-[#00C2CB]/30 hover:bg-[#F8FAFC] cursor-pointer transition"
                      >
                        <div className="w-10 h-10 rounded-xl bg-[#F4F6F8] flex items-center justify-center text-lg flex-shrink-0">
                          {ev.type_evenement === 'visage_inconnu' ? '👤' :
                           ev.type_evenement === 'visage_connu' ? '✅' :
                           ev.type_evenement === 'mouvement' ? '🔦' : '📹'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-[#0B1F3A]">{TYPE_LABELS[ev.type_evenement] || ev.type_evenement}</p>
                          <p className="text-xs text-[#8FA3B8]">{ev.zone_nom || 'Zone inconnue'}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${crit.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${crit.dot}`} />
                            {crit.label}
                          </span>
                          {ev.alerte_module4 && (
                            <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">ALERTE</span>
                          )}
                          <p className="text-xs text-[#8FA3B8]">
                            {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {(eventsStats.derniers_evenements || []).length === 0 && (
                    <div className="text-center py-12 text-[#8FA3B8]">
                      <p className="text-lg mb-2">📹</p>
                      <p className="font-medium">Aucun événement détecté</p>
                      <p className="text-sm">Utilisez la simulation pour tester</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── MON COMPTE ─────────────────────────────────────────────────── */}
          {activeNav === 'settings' && (
            <UserSettings
              user={user}
              updateProfile={updateProfile}
              changePassword={changePassword}
              request2FAEnable={request2FAEnable}
              confirm2FAEnable={confirm2FAEnable}
              disable2FA={disable2FA}
              deleteAccount={deleteAccount}
            />
          )}
        </div>
      </main>

      {/* ════════════════════════════════ MODALS ══════════════════════════════ */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEventUpdated={(updated) => {
            if (updated) setSelectedEvent(updated);
            fetchEventsStats();
          }}
        />
      )}

      {showLogoutModal && (
        <div className="fixed inset-0 bg-[#0B1F3A]/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-[#D8DEE4] p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-[#E63946] flex items-center justify-center mx-auto mb-4 shadow-sm">
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
                onClick={() => setShowLogoutModal(false)}
                className="flex-1 py-2.5 px-4 border border-[#D8DEE4] rounded-xl text-xs font-bold text-[#4A5568] hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => { setShowLogoutModal(false); logout(); }}
                className="flex-1 py-2.5 px-4 bg-[#E63946] hover:bg-red-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-sm"
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
