import React, { useState } from 'react';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
    setError(''); // Clear error when user types
  };

  const validateForm = () => {
    if (!formData.email || !formData.password) {
      setError('Email and password are required');
      return false;
    }
    
    if (mode === 'signup') {
      if (!formData.name) {
        setError('Name is required');
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        return false;
      }
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters');
        return false;
      }
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock authentication success
      const userData = {
        id: Date.now(),
        name: formData.name || formData.email.split('@')[0],
        email: formData.email,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.name || formData.email)}&background=00d4ff&color=fff`
      };
      
      // Store in localStorage (in real app, use proper token management)
      localStorage.setItem('smartRoadSafety_user', JSON.stringify(userData));
      
      onAuthSuccess(userData);
      onClose();
    } catch (err) {
      setError('Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Simulate Google OAuth
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const userData = {
        id: 'google_' + Date.now(),
        name: 'Google User',
        email: 'user@gmail.com',
        avatar: 'https://ui-avatars.com/api/?name=Google+User&background=4285f4&color=fff',
        provider: 'google'
      };
      
      localStorage.setItem('smartRoadSafety_user', JSON.stringify(userData));
      onAuthSuccess(userData);
      onClose();
    } catch (err) {
      setError('Google login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError('');
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      name: ''
    });
  };

  if (!isOpen) return null;

  const styles = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px',
    },
    modal: {
      background: 'rgba(15, 15, 35, 0.95)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '20px',
      padding: '40px',
      width: '100%',
      maxWidth: '400px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
      color: 'white',
      position: 'relative',
    },
    closeButton: {
      position: 'absolute',
      top: '15px',
      right: '20px',
      background: 'none',
      border: 'none',
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: '24px',
      cursor: 'pointer',
      padding: '5px',
      borderRadius: '50%',
      width: '35px',
      height: '35px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.3s ease',
    },
    title: {
      fontSize: '28px',
      fontWeight: 800,
      marginBottom: '10px',
      textAlign: 'center',
      background: 'linear-gradient(135deg, #00d4ff 0%, #ff0066 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    },
    subtitle: {
      fontSize: '14px',
      opacity: 0.8,
      textAlign: 'center',
      marginBottom: '30px',
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
    },
    inputGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    },
    label: {
      fontSize: '14px',
      fontWeight: 600,
      opacity: 0.9,
    },
    input: {
      padding: '12px 16px',
      borderRadius: '12px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      background: 'rgba(255, 255, 255, 0.05)',
      color: 'white',
      fontSize: '16px',
      outline: 'none',
      transition: 'all 0.3s ease',
    },
    inputFocus: {
      borderColor: '#00d4ff',
      boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
    },
    button: {
      padding: '14px 20px',
      borderRadius: '12px',
      border: 'none',
      background: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
      color: 'white',
      fontSize: '16px',
      fontWeight: 700,
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      minHeight: '50px',
    },
    googleButton: {
      background: 'linear-gradient(135deg, #4285f4 0%, #34a853 100%)',
      boxShadow: '0 0 20px rgba(66, 133, 244, 0.3)',
    },
    switchButton: {
      background: 'none',
      border: 'none',
      color: '#00d4ff',
      cursor: 'pointer',
      fontSize: '14px',
      textDecoration: 'underline',
      padding: '10px',
    },
    error: {
      background: 'rgba(255, 0, 102, 0.1)',
      border: '1px solid rgba(255, 0, 102, 0.3)',
      borderRadius: '8px',
      padding: '12px',
      color: '#ff0066',
      fontSize: '14px',
      textAlign: 'center',
    },
    divider: {
      display: 'flex',
      alignItems: 'center',
      gap: '15px',
      margin: '20px 0',
    },
    dividerLine: {
      flex: 1,
      height: '1px',
      background: 'rgba(255, 255, 255, 0.2)',
    },
    dividerText: {
      fontSize: '12px',
      opacity: 0.6,
    },
    spinner: {
      width: '20px',
      height: '20px',
      border: '2px solid rgba(255, 255, 255, 0.3)',
      borderTop: '2px solid white',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
    },
  };

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={styles.modal}>
        <button 
          style={styles.closeButton}
          onClick={onClose}
          onMouseEnter={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.1)'}
          onMouseLeave={(e) => e.target.style.background = 'none'}
        >
          ×
        </button>
        
        <h2 style={styles.title}>
          {mode === 'login' ? 'Welcome Back' : 'Join Smart Road Safety'}
        </h2>
        <p style={styles.subtitle}>
          {mode === 'login' 
            ? 'Sign in to access your safety dashboard' 
            : 'Create your account to get started'}
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form style={styles.form} onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Full Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your full name"
                style={styles.input}
                onFocus={(e) => Object.assign(e.target.style, styles.inputFocus)}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.target.style.boxShadow = 'none';
                }}
                disabled={loading}
              />
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="Enter your email"
              style={styles.input}
              onFocus={(e) => Object.assign(e.target.style, styles.inputFocus)}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.target.style.boxShadow = 'none';
              }}
              disabled={loading}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              style={styles.input}
              onFocus={(e) => Object.assign(e.target.style, styles.inputFocus)}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                e.target.style.boxShadow = 'none';
              }}
              disabled={loading}
            />
          </div>

          {mode === 'signup' && (
            <div style={styles.inputGroup}>
              <label style={styles.label}>Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Confirm your password"
                style={styles.input}
                onFocus={(e) => Object.assign(e.target.style, styles.inputFocus)}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  e.target.style.boxShadow = 'none';
                }}
                disabled={loading}
              />
            </div>
          )}

          <button 
            type="submit" 
            style={styles.button}
            disabled={loading}
            onMouseEnter={(e) => !loading && (e.target.style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => !loading && (e.target.style.transform = 'translateY(0)')}
          >
            {loading ? (
              <div style={styles.spinner}></div>
            ) : (
              mode === 'login' ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        <div style={styles.divider}>
          <div style={styles.dividerLine}></div>
          <span style={styles.dividerText}>OR</span>
          <div style={styles.dividerLine}></div>
        </div>

        <button 
          style={{...styles.button, ...styles.googleButton}}
          onClick={handleGoogleLogin}
          disabled={loading}
          onMouseEnter={(e) => !loading && (e.target.style.transform = 'translateY(-2px)')}
          onMouseLeave={(e) => !loading && (e.target.style.transform = 'translateY(0)')}
        >
          {loading ? (
            <div style={styles.spinner}></div>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="white" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="white" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="white" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <span style={{ opacity: 0.7, fontSize: '14px' }}>
            {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button style={styles.switchButton} onClick={switchMode} disabled={loading}>
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>
  );
}
