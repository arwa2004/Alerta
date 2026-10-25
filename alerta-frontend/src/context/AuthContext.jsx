import { createContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { jwtDecode } from 'jwt-decode';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Chargement initial du profil au montage
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('access_token');
      const savedUser = localStorage.getItem('user_data');

      if (token) {
        try {
          if (savedUser) {
            setUser(JSON.parse(savedUser));
          } else {
            const decoded = jwtDecode(token);
            setUser({
              id: decoded.id || decoded.user_id,
              email: decoded.email,
              role: decoded.role || 'user',
              first_name: decoded.first_name || '',
              last_name: decoded.last_name || '',
              is_2fa_enabled: !!decoded.is_2fa_enabled,
            });
          }
          // On rafraîchit les infos avec l'API profile
          const res = await axiosClient.get('profile/');
          setUser(res.data);
          localStorage.setItem('user_data', JSON.stringify(res.data));
        } catch (err) {
          console.warn('Session expirée ou invalide', err);
          logout();
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    const response = await axiosClient.post('login/', { email, password });
    
    // Cas où 2FA est requis
    if (response.data.requires_2fa) {
      return response.data; // renvoie { requires_2fa: true, email, temp_token, dev_code }
    }

    // Cas connexion directe
    const { access, refresh, user: userData } = response.data;
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('user_data', JSON.stringify(userData));

    setUser(userData);
    navigate('/dashboard');
    return response.data;
  };

  const verify2FALogin = async (temp_token, code) => {
    const response = await axiosClient.post('2fa/login-verify/', { temp_token, code });
    const { access, refresh, user: userData } = response.data;

    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('user_data', JSON.stringify(userData));

    setUser(userData);
    navigate('/dashboard');
    return response.data;
  };

  const register = async (formData) => {
    const response = await axiosClient.post('register/', formData);
    return response.data;
  };

  const logout = async () => {
    const refresh = localStorage.getItem('refresh_token');
    if (refresh) {
      try {
        await axiosClient.post('logout/', { refresh });
      } catch (err) {
        console.warn('Erreur lors du blacklist côté serveur:', err);
      }
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
    setUser(null);
    navigate('/login');
  };

  const updateProfile = async (formDataOrData) => {
    // Prend en charge soit un objet JSON, soit un FormData (pour upload photo)
    const isFormData = formDataOrData instanceof FormData;
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    
    const response = await axiosClient.patch('profile/', formDataOrData, config);
    setUser(response.data);
    localStorage.setItem('user_data', JSON.stringify(response.data));
    return response.data;
  };

  const changePassword = async (old_password, new_password, new_password_confirm) => {
    const response = await axiosClient.post('change-password/', {
      old_password,
      new_password,
      new_password_confirm,
    });
    return response.data;
  };

  // Demande de réinitialisation mot de passe oublié
  const requestPasswordReset = async (email) => {
    const response = await axiosClient.post('password-reset/request/', { email });
    return response.data;
  };

  // Confirmation de réinitialisation mot de passe oublié
  const confirmPasswordReset = async (data) => {
    const response = await axiosClient.post('password-reset/confirm/', data);
    return response.data;
  };

  // Demande d'activation 2FA
  const request2FAEnable = async () => {
    const response = await axiosClient.post('2fa/enable-request/');
    return response.data;
  };

  // Confirmation d'activation 2FA avec code
  const confirm2FAEnable = async (code) => {
    const response = await axiosClient.post('2fa/enable-confirm/', { code });
    if (user) {
      const updated = { ...user, is_2fa_enabled: true };
      setUser(updated);
      localStorage.setItem('user_data', JSON.stringify(updated));
    }
    return response.data;
  };

  // Désactivation 2FA
  const disable2FA = async (password) => {
    const response = await axiosClient.post('2fa/disable/', { password });
    if (user) {
      const updated = { ...user, is_2fa_enabled: false };
      setUser(updated);
      localStorage.setItem('user_data', JSON.stringify(updated));
    }
    return response.data;
  };

  // Suppression définitive de compte
  const deleteAccount = async (password) => {
    const response = await axiosClient.post('delete-account/', { password });
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_data');
    setUser(null);
    navigate('/login');
    return response.data;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        verify2FALogin,
        register,
        logout,
        updateProfile,
        changePassword,
        requestPasswordReset,
        confirmPasswordReset,
        request2FAEnable,
        confirm2FAEnable,
        disable2FA,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
