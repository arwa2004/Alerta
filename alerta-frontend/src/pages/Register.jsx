import { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function Register() {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirm: '',
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError('');
    setFieldErrors({});

    if (formData.password !== formData.password_confirm) {
      setFieldErrors({ password_confirm: 'Les mots de passe ne correspondent pas.' });
      return;
    }

    setIsSubmitting(true);
    try {
      await register(formData);
      alert('Compte Alerta créé avec succès ! Connectez-vous.');
      navigate('/login');
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const errors = {};
        for (const [key, val] of Object.entries(data)) {
          errors[key] = Array.isArray(val) ? val.join(' ') : val;
        }
        setFieldErrors(errors);
        if (errors.detail || errors.non_field_errors) {
          setGeneralError(errors.detail || errors.non_field_errors);
        }
      } else {
        setGeneralError("Une erreur est survenue lors de l'inscription.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-[#F4F6F8]">
      <div className="w-full max-w-[440px] bg-white border border-[#D8DEE4] rounded-[14px] p-8 text-center shadow-[0_8px_26px_rgba(11,31,58,0.07)]">
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

        <h2 className="text-[19px] font-semibold text-[#0B1F3A] mb-1">Créer un compte</h2>
        <p className="text-[13px] text-[#4A5568] mb-6">Rejoignez la surveillance intelligente Alerta.</p>

        {generalError && (
          <div className="mb-4 p-2.5 rounded-lg bg-red-50 border border-red-200 text-[#E63946] text-xs text-left">
            {generalError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="text-left">
          <div className="grid grid-cols-2 gap-3 mb-3.5">
            <div>
              <label className="lb" htmlFor="first_name">Prénom</label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                className="inp"
                placeholder="Amina"
                value={formData.first_name}
                onChange={handleChange}
              />
              {fieldErrors.first_name && (
                <p className="text-xs text-[#E63946] mt-1">{fieldErrors.first_name}</p>
              )}
            </div>

            <div>
              <label className="lb" htmlFor="last_name">Nom</label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                className="inp"
                placeholder="Ben Youssef"
                value={formData.last_name}
                onChange={handleChange}
              />
              {fieldErrors.last_name && (
                <p className="text-xs text-[#E63946] mt-1">{fieldErrors.last_name}</p>
              )}
            </div>
          </div>

          <div className="fld">
            <label className="lb" htmlFor="reg_email">Adresse e-mail <span className="text-[#E63946]">*</span></label>
            <input
              id="reg_email"
              name="email"
              type="email"
              required
              className="inp"
              placeholder="amina@exemple.com"
              value={formData.email}
              onChange={handleChange}
            />
            {fieldErrors.email && (
              <p className="text-xs text-[#E63946] mt-1">{fieldErrors.email}</p>
            )}
          </div>

          <div className="fld">
            <label className="lb" htmlFor="reg_password">Mot de passe (min 8 caractères) <span className="text-[#E63946]">*</span></label>
            <input
              id="reg_password"
              name="password"
              type="password"
              required
              className="inp"
              placeholder="••••••••••••"
              value={formData.password}
              onChange={handleChange}
            />
            {fieldErrors.password && (
              <p className="text-xs text-[#E63946] mt-1">{fieldErrors.password}</p>
            )}
          </div>

          <div className="fld">
            <label className="lb" htmlFor="reg_password_confirm">Confirmer le mot de passe <span className="text-[#E63946]">*</span></label>
            <input
              id="reg_password_confirm"
              name="password_confirm"
              type="password"
              required
              className="inp"
              placeholder="••••••••••••"
              value={formData.password_confirm}
              onChange={handleChange}
            />
            {fieldErrors.password_confirm && (
              <p className="text-xs text-[#E63946] mt-1">{fieldErrors.password_confirm}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn-alerta b-pri mt-2"
          >
            {isSubmitting ? 'Création en cours...' : "S'inscrire"}
          </button>
        </form>

        <div className="text-[12.5px] text-[#4A5568] mt-5 pt-4 border-t border-[#E7EBEF]">
          Vous avez déjà un compte ?{' '}
          <Link to="/login" className="text-[#00838F] font-medium hover:underline">
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}
