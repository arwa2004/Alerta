import { useState, useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // État pour le challenge 2FA lors du login
  const [is2FARequired, setIs2FARequired] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorDevCode, setTwoFactorDevCode] = useState(null);

  const { login, verify2FALogin } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      const res = await login(email, password);
      if (res && res.requires_2fa) {
        setIs2FARequired(true);
        setTempToken(res.temp_token);
        if (res.dev_code) setTwoFactorDevCode(res.dev_code);
      }
    } catch (err) {
      const detail =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        err.response?.data?.non_field_errors?.[0] ||
        "Identifiants incorrects ou compte désactivé.";
      setErrorMsg(detail);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle2FASubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      await verify2FALogin(tempToken, twoFactorCode);
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || "Code de vérification 2FA invalide ou expiré.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-[#F4F6F8]">
      <div className="w-full max-w-[392px] bg-white border border-[#D8DEE4] rounded-[16px] p-8 text-center shadow-[0_8px_26px_rgba(11,31,58,0.07)]">
        {/* Logo officiel du template */}
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

        {!is2FARequired ? (
          <>
            <h2 className="text-[19px] font-semibold text-[#0B1F3A] mb-1">Connexion</h2>
            <p className="text-[13px] text-[#4A5568] mb-6">Accédez à votre espace de surveillance.</p>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#E63946] text-xs text-left">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="text-left space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5" htmlFor="login-email">Adresse e-mail</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                  placeholder="amina@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-[#0B1F3A]" htmlFor="login-password">Mot de passe</label>
                  <Link to="/forgot-password" className="text-[11.5px] text-[#00838F] font-semibold hover:underline">
                    Mot de passe oublié ?
                  </Link>
                </div>
                <input
                  id="login-password"
                  type="password"
                  required
                  className="w-full px-3.5 py-2.5 border border-[#D8DEE4] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <label className="text-[13px] text-[#4A5568] flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-[#00838F] accent-[#00838F]"
                />
                Se souvenir de moi
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-[#00C2CB] hover:bg-[#00838F] text-[#0B1F3A] hover:text-white font-bold text-sm rounded-xl transition cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isSubmitting ? 'Connexion en cours...' : 'Se connecter'}
              </button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <span className="h-[1px] bg-[#E7EBEF] flex-1"></span>
              <span className="text-[11.5px] text-[#4A5568]">ou</span>
              <span className="h-[1px] bg-[#E7EBEF] flex-1"></span>
            </div>

            <div className="text-[12.5px] text-[#4A5568]">
              Pas encore de compte ?{' '}
              <Link to="/register" className="text-[#00838F] font-semibold hover:underline">
                Créer un compte
              </Link>
            </div>
          </>
        ) : (
          /* ── Écran Challenge 2FA ── */
          <div>
            <div className="w-12 h-12 rounded-2xl bg-[#E4F8F9] text-[#00838F] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>

            <h2 className="text-[19px] font-semibold text-[#0B1F3A] mb-1">Double Authentification (2FA)</h2>
            <p className="text-[13px] text-[#4A5568] mb-5">
              Un code de sécurité à 6 chiffres a été envoyé à <strong className="text-[#0B1F3A]">{email}</strong>.
            </p>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-[#E63946] text-xs text-left">
                {errorMsg}
              </div>
            )}

            {twoFactorDevCode && (
              <div className="mb-4 p-2.5 rounded-xl bg-[#E4F8F9] border border-[#00C2CB]/30 text-[#00838F] text-xs font-semibold">
                Code 2FA (dev) : <span className="tracking-widest font-mono text-sm">{twoFactorDevCode}</span>
              </div>
            )}

            <form onSubmit={handle2FASubmit} className="text-left space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0B1F3A] mb-1.5">Code à 6 chiffres</label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  className="w-full px-3.5 py-3 border border-[#D8DEE4] rounded-xl text-center text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#00C2CB] bg-[#F9FAFB]"
                  placeholder="123456"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || twoFactorCode.length !== 6}
                className="w-full py-3 px-4 bg-[#00C2CB] hover:bg-[#00838F] text-[#0B1F3A] hover:text-white font-bold text-sm rounded-xl transition cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {isSubmitting ? 'Vérification...' : 'Valider et accéder'}
              </button>

              <button
                type="button"
                onClick={() => { setIs2FARequired(false); setTwoFactorCode(''); setErrorMsg(''); }}
                className="w-full text-xs text-[#4A5568] hover:text-[#0B1F3A] text-center cursor-pointer pt-2"
              >
                ← Retour à la connexion classique
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
