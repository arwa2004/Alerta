import { useContext, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function Navbar({ activeTab = 'accueil', setActiveTab }) {
  const { user, logout } = useContext(AuthContext);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const dropdownRef = useRef(null);

  const getInitials = () => {
    if (user?.first_name && user?.last_name)
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    if (user?.email) return user.email.slice(0, 2).toUpperCase();
    return 'AL';
  };

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.email?.split('@')[0] || 'Utilisateur';

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="bg-[#0B1F3A] h-16 flex-none sticky top-0 z-50 shadow-md border-b border-white/10">
      <div className="w-full max-w-7xl mx-auto px-6 h-full flex items-center justify-between">

        {/* ── GAUCHE : Logo Alerta ── */}
        <div
          className="flex items-center gap-3 cursor-pointer select-none"
          onClick={() => setActiveTab && setActiveTab('accueil')}
        >
          <svg width="32" height="32" viewBox="0 0 64 64" className="flex-shrink-0">
            <rect width="64" height="64" rx="16" fill="#0B1F3A" />
            <path d="M8 32Q32 10 56 32Q32 54 8 32Z" fill="none" stroke="#00C2CB" strokeWidth="4" strokeLinejoin="round" />
            <circle cx="32" cy="32" r="10" fill="#00C2CB" />
            <rect x="26.8" y="28" width="2.6" height="8" rx="1.3" fill="#0B1F3A" />
            <rect x="30.7" y="24.5" width="2.6" height="15" rx="1.3" fill="#0B1F3A" />
            <rect x="34.6" y="28" width="2.6" height="8" rx="1.3" fill="#0B1F3A" />
          </svg>
          <span className="font-poppins font-bold text-xl tracking-tight text-white">
            Aler<i className="not-italic text-[#00C2CB]">ta</i>
          </span>
        </div>

        {/* ── CENTRE : Navigation selon le rôle ── */}
        <div className="flex items-center gap-2">
          {/* Bouton Accueil pour tout le monde */}
          <button
            onClick={() => setActiveTab && setActiveTab('accueil')}
            className={`px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer text-sm font-semibold ${
              activeTab === 'accueil'
                ? 'bg-[#00C2CB] text-[#0B1F3A] shadow-xs'
                : 'text-[#B8C7D9] hover:bg-white/10 hover:text-white'
            }`}
          >
            Accueil
          </button>

          {/* Planificateur de caméras (Phase 1) */}
          <Link
            to="/planner"
            className={`px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer text-sm font-semibold ${
              activeTab === 'planner'
                ? 'bg-[#00C2CB] text-[#0B1F3A] shadow-xs'
                : 'text-[#B8C7D9] hover:bg-white/10 hover:text-white'
            }`}
          >
            Planificateur
          </Link>

          {/* Bouton Dashboard Admin UNIQUEMENT visible par les administrateurs */}
          {isAdmin && (
            <button
              onClick={() => setActiveTab && setActiveTab('admin_dashboard')}
              className={`px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer text-sm font-semibold flex items-center gap-2 ${
                activeTab === 'admin_dashboard'
                  ? 'bg-[#00C2CB] text-[#0B1F3A] shadow-xs'
                  : 'text-[#B8C7D9] hover:bg-white/10 hover:text-white'
              }`}
            >
              <svg className="w-4 h-4 text-[#00C2CB]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span>Dashboard Admin</span>
            </button>
          )}
        </div>

        {/* ── DROITE : Profil utilisateur & Dropdown ── */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((p) => !p)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer group"
          >
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-[#0B1F3A] flex-shrink-0 shadow-xs"
              style={{ background: '#00C2CB' }}
            >
              {getInitials()}
            </span>
            <div className="text-left hidden sm:block">
              <span className="text-sm font-semibold text-white block leading-tight">{displayName}</span>
              <span className="text-[11px] text-[#00C2CB] font-medium block">
                {isAdmin ? '🛡️ Admin' : '👤 Utilisateur'}
              </span>
            </div>
            <svg
              className={`w-3.5 h-3.5 text-[#B8C7D9] group-hover:text-white transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Menu déroulant */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-[#D8DEE4] overflow-hidden z-50">
              {/* En-tête du menu */}
              <div className="px-5 py-3.5 border-b border-[#E7EBEF] bg-[#F4F6F8]">
                <p className="text-sm font-bold text-[#0B1F3A] truncate">{displayName}</p>
                <p className="text-xs text-[#4A5568] truncate mt-0.5">{user?.email}</p>
                <span className={`inline-block mt-2 text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  isAdmin ? 'bg-[#0B1F3A] text-[#00C2CB]' : 'bg-[#E4F8F9] text-[#00838F]'
                }`}>
                  {isAdmin ? '🛡️ Administrateur' : '👤 Utilisateur'}
                </span>
              </div>

              {/* Raccourci Dashboard Admin si l'utilisateur est admin */}
              {isAdmin && (
                <button
                  onClick={() => { setDropdownOpen(false); setActiveTab && setActiveTab('admin_dashboard'); }}
                  className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#E4F8F9] hover:text-[#00838F] transition-colors cursor-pointer text-left border-b border-[#E7EBEF]"
                >
                  <svg className="w-4 h-4 flex-shrink-0 text-[#00838F]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                  Dashboard Administrateur
                </button>
              )}

              {/* Bouton Profil & Paramètres */}
              <button
                onClick={() => { setDropdownOpen(false); setActiveTab && setActiveTab('parametres'); }}
                className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#E4F8F9] hover:text-[#00838F] transition-colors cursor-pointer text-left"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-[#00838F]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                Mon profil &amp; Sécurité
              </button>

              <div className="border-t border-[#E7EBEF]" />

              {/* Déconnexion avec vérification */}
              <button
                onClick={() => { setDropdownOpen(false); setShowLogoutModal(true); }}
                className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-semibold text-[#E63946] hover:bg-red-50 transition-colors cursor-pointer text-left"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l3 3m0 0l-3 3m3-3H9" />
                </svg>
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modale de confirmation de déconnexion ── */}
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
              Êtes-vous sûr de vouloir vous déconnecter de votre compte Alerta ?
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
                onClick={() => { setShowLogoutModal(false); logout(); }}
                className="flex-1 py-2.5 px-4 bg-[#E63946] hover:bg-red-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
