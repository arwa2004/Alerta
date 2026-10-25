import { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function ForgotPassword() {
  const { requestPasswordReset, confirmPasswordReset } = useContext(AuthContext);
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1: Email, 2: Code + Nouveau mot de passe
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devCode, setDevCode] = useState(null);

  // Étape 1 : Demande de code OTP
  const handleRequestReset = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsSubmitting(true);

    try {
      const res = await requestPasswordReset(email);
      setSuccessMsg(res.message || "Code de vérification envoyé.");
      if (res.dev_code) setDevCode(res.dev_code);
      setStep(2);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Erreur lors de la demande de réinitialisation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Étape 2 : Confirmation avec code et nouveau mot de passe
  const handleConfirmReset = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword !== newPasswordConfirm) {
      setErrorMsg("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await confirmPasswordReset({
        email,
        code,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      setSuccessMsg(res.message || "Mot de passe réinitialisé avec succès !");
      setTimeout(() => {
        navigate('/login');
      }, 2500);
    } catch (err) {
      const d = err.response?.data;
      setErrorMsg(
        d?.detail ||
        d?.code?.[0] ||
        d?.new_password?.[0] ||
        d?.new_password_confirm?.[0] ||
        "Erreur lors de la réinitialisation."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-[#F4F6F8]">
      <div className="w-full max-w-[420px] bg-white border border-[#D8DEE4] rounded-[16px] p-8 text-center shadow-[0_8px_26px_rgba(11,31,58,0.07)]">
        
        {/* Logo Alerta */}
        <div className="flex items-center justify-center gap-2.5 mb-5">
          <svg width="32" height="32" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="16" fill="#0B1F3A" />
            <path
              d="M8 32Q32 10 56 32Q32 54 8 32Z"
              fill="none"
              stroke="#00C2CB"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
            <circle cx="32" cy="32" r="10" fill="#00C2CB" />
            <rect x="26.8" y="28" width="2.6" height="8" rx="1.3" fill="#0B1F3A" />
            <rect x="30.7" y="24.5" width="2.6" height="15" rx="1.3" fill="#0B1F3A" />
            <rect x="34.6" y="28" width="2.6" height="8" rx="1.3" fill="#0B1F3A" />
          </svg>
          <span className="font-poppins font-bold text-xl text-[#0B1F3A]">
            Aler<i className="not-italic text-[#00838F]">ta</i>
          </span>
        </div>

        <h2 className="text-[19px] font-semibold text-[#0B1F3A] mb-1">
          {step === 1 ? "Mot de passe oublié" : "Nouveau mot de passe"}
        </h2>
        <p className="text-[13px] text-[#4A5568] mb-6">
          {step === 1
            ? "Entrez votre email pour recevoir un code de sécurité à 6 chiffres."
            : `Un code a été envoyé à ${email}.`}
        </p>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#E63946] text-xs text-left">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-[#2BB673]/12 border border-[#2BB673]/30 text-[#1D8A57] text-xs text-left font-medium">
            {successMsg}
          </div>
        )}

        {/* Info code de test rapide en mode dev */}
        {devCode && step === 2 && (
          <div className="mb-4 p-2.5 rounded-xl bg-[#E4F8F9] border border-[#00C2CB]/30 text-[#00838F] text-xs text-left font-semibold">
            Code OTP détecté : <span className="tracking-widest font-mono text-sm">{devCode}</span>
          </div>
        )}

        {/* ── Formulaire Étape 1 : Saisie de l'email ── */}
        {step === 1 && (
          <form onSubmit={handleRequestReset} className="text-left space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Adresse e-mail</label>
              <input
                type="email"
                required
                className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                placeholder="votre.email@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-[#00C2CB] hover:bg-[#00838F] text-[#0B1F3A] hover:text-white font-bold text-sm rounded-xl transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isSubmitting ? "Envoi du code..." : "Recevoir mon code"}
            </button>
          </form>
        )}

        {/* ── Formulaire Étape 2 : Code OTP + Nouveau mot de passe ── */}
        {step === 2 && (
          <form onSubmit={handleConfirmReset} className="text-left space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Code à 6 chiffres</label>
              <input
                type="text"
                required
                maxLength={6}
                className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Nouveau mot de passe</label>
              <input
                type="password"
                required
                className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                placeholder="Minimum 8 caractères"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Confirmer le nouveau mot de passe</label>
              <input
                type="password"
                required
                className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                placeholder="••••••••••••"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-[#0B1F3A] hover:bg-[#16345C] text-white font-bold text-sm rounded-xl transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isSubmitting ? "Réinitialisation..." : "Changer le mot de passe"}
            </button>

            <button
              type="button"
              onClick={() => { setStep(1); setErrorMsg(''); setSuccessMsg(''); }}
              className="w-full text-xs text-[#00838F] hover:underline text-center cursor-pointer pt-1"
            >
              ← Modifier l'adresse e-mail
            </button>
          </form>
        )}

        <div className="flex items-center gap-3 my-5">
          <span className="h-[1px] bg-[#E7EBEF] flex-1"></span>
        </div>

        <div className="text-[12.5px] text-[#4A5568]">
          Vous vous souvenez de votre mot de passe ?{' '}
          <Link to="/login" className="text-[#00838F] font-semibold hover:underline">
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}
