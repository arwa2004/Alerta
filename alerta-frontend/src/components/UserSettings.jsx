import { useState, useRef } from 'react';

export default function UserSettings({
  user,
  updateProfile,
  changePassword,
  request2FAEnable,
  confirm2FAEnable,
  disable2FA,
  deleteAccount,
}) {
  // ── 1. État Profil & Photo ────────────────────────────────────────────────
  const [profileData, setProfileData] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone_number: user?.phone_number || '',
  });
  const [previewImage, setPreviewImage] = useState(user?.profile_picture_url || user?.profile_picture || null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [profileMsg, setProfileMsg] = useState({ type: '', text: '' });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const fileInputRef = useRef(null);

  // ── 2. État Mot de passe ──────────────────────────────────────────────────
  const [passwordData, setPasswordData] = useState({
    old_password: '',
    new_password: '',
    new_password_confirm: '',
  });
  const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // ── 3. État 2FA ───────────────────────────────────────────────────────────
  const [is2FAEnabled, setIs2FAEnabled] = useState(user?.is_2fa_enabled || false);
  const [show2FAVerifyModal, setShow2FAVerifyModal] = useState(false);
  const [show2FADisableModal, setShow2FADisableModal] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorMsg, setTwoFactorMsg] = useState({ type: '', text: '' });
  const [devCode2FA, setDevCode2FA] = useState(null);
  const [is2FALoading, setIs2FALoading] = useState(false);

  // ── 4. État Suppression de compte ─────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Gestion Photo de profil ──────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewImage(URL.createObjectURL(file));
    }
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileMsg({ type: '', text: '' });
    setIsUpdatingProfile(true);

    try {
      if (selectedFile) {
        const formData = new FormData();
        formData.append('first_name', profileData.first_name);
        formData.append('last_name', profileData.last_name);
        formData.append('phone_number', profileData.phone_number);
        formData.append('profile_picture', selectedFile);
        await updateProfile(formData);
      } else {
        await updateProfile(profileData);
      }
      setProfileMsg({ type: 'success', text: 'Profil mis à jour avec succès.' });
      setSelectedFile(null);
    } catch (err) {
      setProfileMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Erreur lors de la mise à jour du profil.'
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // ── Gestion Mot de passe ─────────────────────────────────────────────────
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMsg({ type: '', text: '' });

    if (passwordData.new_password !== passwordData.new_password_confirm) {
      setPasswordMsg({ type: 'error', text: 'Les deux nouveaux mots de passe ne correspondent pas.' });
      return;
    }

    setIsChangingPassword(true);
    try {
      await changePassword(
        passwordData.old_password,
        passwordData.new_password,
        passwordData.new_password_confirm
      );
      setPasswordMsg({ type: 'success', text: 'Mot de passe modifié avec succès.' });
      setPasswordData({ old_password: '', new_password: '', new_password_confirm: '' });
    } catch (err) {
      const d = err.response?.data;
      setPasswordMsg({
        type: 'error',
        text: d?.old_password?.[0] || d?.new_password?.[0] || d?.detail || 'Erreur lors du changement de mot de passe.'
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // ── Gestion 2FA : Activer ────────────────────────────────────────────────
  const handleRequestEnable2FA = async () => {
    setTwoFactorMsg({ type: '', text: '' });
    setIs2FALoading(true);
    try {
      const res = await request2FAEnable();
      if (res.dev_code) setDevCode2FA(res.dev_code);
      setShow2FAVerifyModal(true);
    } catch (err) {
      setTwoFactorMsg({
        type: 'error',
        text: err.response?.data?.detail || "Impossible d'initier l'activation 2FA."
      });
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleConfirmEnable2FA = async (e) => {
    e.preventDefault();
    setTwoFactorMsg({ type: '', text: '' });
    setIs2FALoading(true);
    try {
      await confirm2FAEnable(twoFactorCode);
      setIs2FAEnabled(true);
      setShow2FAVerifyModal(false);
      setTwoFactorCode('');
      setDevCode2FA(null);
      setTwoFactorMsg({ type: 'success', text: 'Double authentification (2FA) activée avec succès !' });
    } catch (err) {
      setTwoFactorMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Code 2FA incorrect ou expiré.'
      });
    } finally {
      setIs2FALoading(false);
    }
  };

  // ── Gestion 2FA : Désactiver ─────────────────────────────────────────────
  const handleDisable2FA = async (e) => {
    e.preventDefault();
    setTwoFactorMsg({ type: '', text: '' });
    setIs2FALoading(true);
    try {
      await disable2FA(twoFactorPassword);
      setIs2FAEnabled(false);
      setShow2FADisableModal(false);
      setTwoFactorPassword('');
      setTwoFactorMsg({ type: 'success', text: 'Double authentification (2FA) désactivée.' });
    } catch (err) {
      setTwoFactorMsg({
        type: 'error',
        text: err.response?.data?.detail || 'Mot de passe incorrect.'
      });
    } finally {
      setIs2FALoading(false);
    }
  };

  // ── Gestion Suppression Compte ───────────────────────────────────────────
  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteError('');
    setIsDeleting(true);
    try {
      await deleteAccount(deletePassword);
    } catch (err) {
      setDeleteError(err.response?.data?.detail || 'Mot de passe incorrect ou action refusée.');
      setIsDeleting(false);
    }
  };

  const getInitials = () => {
    if (user?.first_name && user?.last_name)
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    if (user?.email) return user.email.slice(0, 2).toUpperCase();
    return 'AL';
  };

  return (
    <div className="space-y-8">

      {/* ════════════ EN-TÊTE PROFIL & PHOTO (Style Sitemark / Alerta) ════════════ */}
      <div className="bg-white rounded-3xl border border-[#D8DEE4] p-8 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="relative group">
            {previewImage ? (
              <img
                src={previewImage}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover border-2 border-[#00C2CB] shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#E4F8F9] text-[#00838F] font-bold text-2xl flex items-center justify-center border-2 border-[#00C2CB] shadow-sm">
                {getInitials()}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Changer la photo"
              className="absolute inset-0 bg-[#0B1F3A]/60 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold transition cursor-pointer"
            >
              Modifier
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-[#0B1F3A]">
                {user?.first_name || user?.last_name
                  ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                  : user?.email}
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                user?.role === 'admin'
                  ? 'bg-[#0B1F3A] text-[#00C2CB]'
                  : 'bg-[#E4F8F9] text-[#00838F]'
              }`}>
                {user?.role === 'admin' ? '🛡️ Administrateur' : '👤 Utilisateur'}
              </span>
            </div>
            <p className="text-xs text-[#4A5568] mt-1">{user?.email}</p>
            <div className="flex items-center gap-4 text-[11px] text-[#8FA3B8] font-medium mt-2">
              <span>Membre depuis : {user?.date_inscription ? new Date(user.date_inscription).toLocaleDateString('fr-FR') : '—'}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${user?.is_active ? 'bg-[#2BB673]' : 'bg-red-400'}`}></span>
                {user?.is_active ? 'Compte actif' : 'Compte suspendu'}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2.5 border border-[#D8DEE4] rounded-xl text-xs font-bold text-[#0B1F3A] hover:bg-gray-50 transition cursor-pointer"
        >
          📷 Mettre à jour la photo
        </button>
      </div>

      {/* ════════════ GRILLE 2 COLONNES : INFORMATIONS PERSONNELLES & MOT DE PASSE ════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

        {/* ── Carte 1 : Informations personnelles ── */}
        <div className="bg-white rounded-3xl border border-[#D8DEE4] shadow-xs p-8">
          <div className="flex items-center gap-3.5 pb-5 mb-5 border-b border-[#E7EBEF]">
            <div className="w-10 h-10 rounded-xl bg-[#E4F8F9] text-[#00838F] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B1F3A]">Informations du profil</h3>
              <p className="text-xs text-[#8FA3B8]">Mettez à jour vos coordonnées personnelles</p>
            </div>
          </div>

          {profileMsg.text && (
            <div className={`mb-5 p-3.5 rounded-xl text-xs font-semibold ${
              profileMsg.type === 'success'
                ? 'bg-[#2BB673]/12 text-[#1D8A57] border border-[#2BB673]/30'
                : 'bg-red-50 text-[#C22B36] border border-red-200'
            }`}>
              {profileMsg.text}
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Prénom</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                  value={profileData.first_name}
                  placeholder="Votre prénom"
                  onChange={(e) => setProfileData({ ...profileData, first_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Nom</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                  value={profileData.last_name}
                  placeholder="Votre nom"
                  onChange={(e) => setProfileData({ ...profileData, last_name: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Numéro de téléphone</label>
              <input
                type="tel"
                className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                value={profileData.phone_number}
                placeholder="+216 99 123 456"
                onChange={(e) => setProfileData({ ...profileData, phone_number: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Adresse e-mail</label>
              <input
                disabled
                className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm text-gray-500 bg-gray-50 cursor-not-allowed"
                value={user?.email || ''}
              />
              <p className="text-[11px] text-gray-400 mt-1">Identifiant unique de connexion, non modifiable.</p>
            </div>

            <button
              type="submit"
              disabled={isUpdatingProfile}
              className="w-full py-3 px-4 bg-[#00C2CB] hover:bg-[#00838F] text-[#0B1F3A] hover:text-white font-bold text-sm rounded-xl transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isUpdatingProfile ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </form>
        </div>

        {/* ── Carte 2 : Sécurité & Mot de passe ── */}
        <div className="bg-white rounded-3xl border border-[#D8DEE4] shadow-xs p-8">
          <div className="flex items-center gap-3.5 pb-5 mb-5 border-b border-[#E7EBEF]">
            <div className="w-10 h-10 rounded-xl bg-[#0B1F3A]/10 text-[#0B1F3A] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B1F3A]">Sécurité du mot de passe</h3>
              <p className="text-xs text-[#8FA3B8]">Changez régulièrement votre mot de passe</p>
            </div>
          </div>

          {passwordMsg.text && (
            <div className={`mb-5 p-3.5 rounded-xl text-xs font-semibold ${
              passwordMsg.type === 'success'
                ? 'bg-[#2BB673]/12 text-[#1D8A57] border border-[#2BB673]/30'
                : 'bg-red-50 text-[#C22B36] border border-red-200'
            }`}>
              {passwordMsg.text}
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Mot de passe actuel</label>
              <input
                type="password"
                required
                className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                value={passwordData.old_password}
                placeholder="••••••••••••"
                onChange={(e) => setPasswordData({ ...passwordData, old_password: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Nouveau mot de passe</label>
              <input
                type="password"
                required
                className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                value={passwordData.new_password}
                placeholder="Minimum 8 caractères"
                onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Confirmer le nouveau mot de passe</label>
              <input
                type="password"
                required
                className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                value={passwordData.new_password_confirm}
                placeholder="••••••••••••"
                onChange={(e) => setPasswordData({ ...passwordData, new_password_confirm: e.target.value })}
              />
            </div>

            <button
              type="submit"
              disabled={isChangingPassword}
              className="w-full py-3 px-4 bg-[#0B1F3A] hover:bg-[#16345C] text-white font-bold text-sm rounded-xl transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isChangingPassword ? 'Modification...' : 'Modifier le mot de passe'}
            </button>
          </form>
        </div>

      </div>

      {/* ════════════ SECTION 3 : AUTHENTIFICATION À DEUX FACTEURS (2FA) ════════════ */}
      <div className="bg-white rounded-3xl border border-[#D8DEE4] shadow-xs p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#E7EBEF]">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              is2FAEnabled ? 'bg-green-50 text-[#1D8A57]' : 'bg-[#E4F8F9] text-[#00838F]'
            }`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-[#0B1F3A]">Authentification à deux facteurs (2FA)</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  is2FAEnabled ? 'bg-[#2BB673]/15 text-[#1D8A57]' : 'bg-gray-100 text-gray-500'
                }`}>
                  {is2FAEnabled ? '● Activée' : '○ Désactivée'}
                </span>
              </div>
              <p className="text-xs text-[#4A5568] mt-1 max-w-2xl leading-relaxed">
                Renforcez la sécurité de votre compte Alerta. Lorsqu'elle est activée, un code de sécurité à 6 chiffres vous est automatiquement envoyé par e-mail lors de chaque connexion.
              </p>
            </div>
          </div>

          <div>
            {is2FAEnabled ? (
              <button
                type="button"
                onClick={() => { setShow2FADisableModal(true); setTwoFactorMsg({ type: '', text: '' }); }}
                className="px-5 py-2.5 border border-red-200 text-[#C22B36] hover:bg-red-50 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Désactiver le 2FA
              </button>
            ) : (
              <button
                type="button"
                disabled={is2FALoading}
                onClick={handleRequestEnable2FA}
                className="px-5 py-2.5 bg-[#00C2CB] hover:bg-[#00838F] text-[#0B1F3A] hover:text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {is2FALoading ? 'Envoi du code...' : 'Activer le 2FA maintenant'}
              </button>
            )}
          </div>
        </div>

        {twoFactorMsg.text && (
          <div className={`mt-4 p-3.5 rounded-xl text-xs font-semibold ${
            twoFactorMsg.type === 'success'
              ? 'bg-[#2BB673]/12 text-[#1D8A57] border border-[#2BB673]/30'
              : 'bg-red-50 text-[#C22B36] border border-red-200'
          }`}>
            {twoFactorMsg.text}
          </div>
        )}
      </div>

      {/* ════════════ MODAL ACTIVATION 2FA ════════════ */}
      {show2FAVerifyModal && (
        <div className="fixed inset-0 bg-[#0B1F3A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-[#D8DEE4] p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-[#0B1F3A] mb-2">Confirmer l'activation du 2FA</h3>
            <p className="text-xs text-[#4A5568] mb-4">
              Un code de sécurité à 6 chiffres a été envoyé à <strong>{user?.email}</strong>. Entrez-le ci-dessous pour valider l'activation.
            </p>

            {devCode2FA && (
              <div className="mb-4 p-2.5 rounded-xl bg-[#E4F8F9] border border-[#00C2CB]/30 text-[#00838F] text-xs font-semibold">
                Code dev : <span className="font-mono tracking-widest">{devCode2FA}</span>
              </div>
            )}

            <form onSubmit={handleConfirmEnable2FA} className="space-y-4">
              <input
                type="text"
                required
                maxLength={6}
                placeholder="123456"
                className="w-full px-4 py-3 border border-[#D8DEE4] rounded-xl text-center text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShow2FAVerifyModal(false)}
                  className="flex-1 py-2.5 border border-[#D8DEE4] rounded-xl text-xs font-bold text-[#4A5568] hover:bg-gray-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={is2FALoading || twoFactorCode.length !== 6}
                  className="flex-1 py-2.5 bg-[#00C2CB] hover:bg-[#00838F] text-[#0B1F3A] hover:text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {is2FALoading ? 'Validation...' : 'Valider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════ MODAL DÉSACTIVATION 2FA ════════════ */}
      {show2FADisableModal && (
        <div className="fixed inset-0 bg-[#0B1F3A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-[#D8DEE4] p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-[#0B1F3A] mb-2">Désactiver le 2FA</h3>
            <p className="text-xs text-[#4A5568] mb-4">
              Pour des raisons de sécurité, veuillez saisir votre mot de passe actuel pour désactiver la protection à deux facteurs.
            </p>

            <form onSubmit={handleDisable2FA} className="space-y-4">
              <input
                type="password"
                required
                placeholder="Votre mot de passe"
                className="w-full px-4 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                value={twoFactorPassword}
                onChange={(e) => setTwoFactorPassword(e.target.value)}
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShow2FADisableModal(false)}
                  className="flex-1 py-2.5 border border-[#D8DEE4] rounded-xl text-xs font-bold text-[#4A5568] hover:bg-gray-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={is2FALoading}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {is2FALoading ? 'Désactivation...' : 'Confirmer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════ SECTION 4 : ZONE DE DANGER (SUPPRESSION DE COMPTE) ════════════ */}
      <div className="bg-white rounded-3xl border border-red-200 shadow-xs p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-base font-bold text-[#C22B36] flex items-center gap-2">
              <svg className="w-5 h-5 text-[#C22B36]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              Zone de danger : Suppression définitive du compte
            </h3>
            <p className="text-xs text-[#4A5568] mt-1 max-w-xl">
              La suppression de votre compte est irréversible. Toutes vos données, configurations de surveillance et accès seront définitivement effacés de la plateforme Alerta.
            </p>
          </div>

          <button
            type="button"
            onClick={() => { setShowDeleteModal(true); setDeleteError(''); }}
            className="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-[#C22B36] border border-red-300 font-bold text-xs rounded-xl transition cursor-pointer self-start md:self-auto"
          >
            Supprimer mon compte
          </button>
        </div>
      </div>

      {/* ════════════ MODAL SUPPRESSION DE COMPTE ════════════ */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-[#0B1F3A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border border-red-200 p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-[#C22B36] mb-2">Êtes-vous absolument certain ?</h3>
            <p className="text-xs text-[#4A5568] mb-4">
              Cette action est irréversible. Entrez votre mot de passe pour confirmer la suppression définitive de votre compte Alerta.
            </p>

            {deleteError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#C22B36] text-xs">
                {deleteError}
              </div>
            )}

            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <input
                type="password"
                required
                placeholder="Votre mot de passe actuel"
                className="w-full px-4 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-[#F9FAFB]"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 py-2.5 border border-[#D8DEE4] rounded-xl text-xs font-bold text-[#4A5568] hover:bg-gray-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? 'Suppression...' : 'Supprimer définitivement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
