import React, { useState, useEffect } from 'react';
import Spline from '@splinetool/react-spline';
import AuthModal from './AuthModal.jsx';

export default function Landing({ onEnterApp }) {
  const [loading, setLoading] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [user, setUser] = useState(null);

  const handleEnterApp = () => {
    // Check if user is authenticated
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    
    setFadeOut(true);
    setTimeout(() => {
      onEnterApp(user);
    }, 800);
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    setShowAuthModal(false);
    // Auto-enter app after successful authentication
    setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        onEnterApp(userData);
      }, 800);
    }, 500);
  };

  const onSplineLoad = () => {
    setLoading(false);
  };

  // Check for existing user session
  useEffect(() => {
    const savedUser = localStorage.getItem('smartRoadSafety_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('smartRoadSafety_user');
      }
    }
  }, []);

  // Auto-enter after 15 seconds if user doesn't interact (but only if authenticated)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!fadeOut && user) {
        handleEnterApp();
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [fadeOut, user]);

  const styles = {
    container: {
      position: 'fixed',
      inset: 0,
      background: 'linear-gradient(135deg, #0f0f23 0%, #1a1045 50%, #220a5e 100%)',
      color: '#ffffff',
      fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      overflow: 'hidden',
      transition: 'opacity 0.8s ease-out',
      opacity: fadeOut ? 0 : 1,
    },
    splineContainer: {
      position: 'absolute',
      inset: 0,
      zIndex: 1,
    },
    overlay: {
      position: 'absolute',
      inset: 0,
      zIndex: 2,
      background: 'linear-gradient(180deg, rgba(15,15,35,0.3) 0%, rgba(15,15,35,0.8) 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    },
    title: {
      fontSize: 'clamp(2.5rem, 8vw, 5rem)',
      fontWeight: 900,
      textAlign: 'center',
      marginBottom: '1rem',
      background: 'linear-gradient(135deg, #00d4ff 0%, #ff0066 50%, #ffcc00 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      textShadow: '0 0 30px rgba(0, 212, 255, 0.5)',
      animation: 'glow 2s ease-in-out infinite alternate',
    },
    subtitle: {
      fontSize: 'clamp(1rem, 3vw, 1.5rem)',
      textAlign: 'center',
      marginBottom: '3rem',
      opacity: 0.9,
      maxWidth: '600px',
      lineHeight: 1.6,
    },
    enterButton: {
      padding: '16px 32px',
      fontSize: '1.2rem',
      fontWeight: 700,
      background: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
      border: 'none',
      borderRadius: '50px',
      color: 'white',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 0 30px rgba(0, 212, 255, 0.5), 0 10px 30px rgba(0, 0, 0, 0.3)',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      position: 'relative',
      overflow: 'hidden',
      minWidth: '200px',
      touchAction: 'manipulation',
    },
    enterButtonHover: {
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(0, 212, 255, 0.8), 0 15px 40px rgba(0, 0, 0, 0.4)',
    },
    features: {
      position: 'absolute',
      bottom: '120px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '1rem',
      flexWrap: 'wrap',
      justifyContent: 'center',
      maxWidth: '90%',
      zIndex: 3,
      padding: '0 20px',
    },
    feature: {
      background: 'rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '12px',
      padding: '12px 20px',
      fontSize: '0.9rem',
      fontWeight: 600,
      textAlign: 'center',
      minWidth: '120px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
    },
    loadingOverlay: {
      position: 'absolute',
      inset: 0,
      zIndex: 10,
      background: 'rgba(15, 15, 35, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '20px',
      transition: 'opacity 0.5s ease',
      opacity: loading ? 1 : 0,
      pointerEvents: loading ? 'auto' : 'none',
    },
    spinner: {
      width: '50px',
      height: '50px',
      border: '3px solid rgba(0, 212, 255, 0.3)',
      borderTop: '3px solid #00d4ff',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
    },
    mapPreview: {
      position: 'absolute',
      top: '80px',
      right: '20px',
      width: '100px',
      height: '60px',
      background: 'rgba(0, 0, 0, 0.5)',
      borderRadius: '8px',
      border: '2px solid rgba(0, 212, 255, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.7rem',
      opacity: 0.8,
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      zIndex: 3,
    },
  };

  const [buttonHover, setButtonHover] = useState(false);

  return (
    <div style={styles.container}>
      {/* Loading overlay */}
      <div style={styles.loadingOverlay}>
        <div style={styles.spinner}></div>
        <div>Loading 3D Experience...</div>
      </div>

      {/* Spline 3D Scene */}
      <div style={styles.splineContainer}>
        <Spline
          scene="https://prod.spline.design/TeZGKO1s2yip1kGz/scene.splinecode"
          onLoad={onSplineLoad}
        />
      </div>

      {/* Content overlay */}
      <div style={styles.overlay}>
        <h1 style={styles.title}>Smart Road Safety</h1>
        <p style={styles.subtitle}>
          AI-powered real-time navigation with intelligent hazard detection, 
          speed monitoring, and community-driven safety alerts. 
          Your journey, protected by technology.
        </p>
        
        <button
          style={{
            ...styles.enterButton,
            ...(buttonHover ? styles.enterButtonHover : {}),
          }}
          onMouseEnter={() => setButtonHover(true)}
          onMouseLeave={() => setButtonHover(false)}
          onClick={handleEnterApp}
        >
          {user ? `Welcome ${user.name.split(' ')[0]}! Enter App` : 'Sign In to Continue'}
        </button>

        {/* User info if logged in */}
        {user && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '20px',
            padding: '12px 20px',
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(10px)',
            borderRadius: '25px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
          }}>
            <img 
              src={user.avatar} 
              alt={user.name}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '2px solid rgba(0, 212, 255, 0.5)'
              }}
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{user.name}</div>
              <div style={{ fontSize: '12px', opacity: 0.7 }}>{user.email}</div>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('smartRoadSafety_user');
                setUser(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                fontSize: '12px'
              }}
              title="Sign out"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Map preview indicator */}
      <div 
        style={styles.mapPreview}
        onClick={handleEnterApp}
        title="Click to access live map"
      >
        🗺️ Live Map
      </div>

      {/* Feature highlights */}
      <div style={styles.features}>
        <div style={styles.feature}>🚨 Real-time Alerts</div>
        <div style={styles.feature}>📍 GPS Tracking</div>
        <div style={styles.feature}>⚡ Speed Monitor</div>
        <div style={styles.feature}>🌐 Community Reports</div>
        <div style={styles.feature}>🆘 Emergency SOS</div>
      </div>

      {/* Authentication Modal */}
      <AuthModal 
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
      />

      {/* CSS animations */}
      <style>{`
        @keyframes glow {
          0% { text-shadow: 0 0 30px rgba(0, 212, 255, 0.5); }
          100% { text-shadow: 0 0 50px rgba(0, 212, 255, 0.8), 0 0 80px rgba(255, 0, 102, 0.3); }
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .features {
            bottom: 80px !important;
            gap: 0.8rem !important;
            padding: 0 10px !important;
            max-width: 95% !important;
          }
          .feature {
            font-size: 0.75rem !important;
            padding: 6px 12px !important;
            min-width: 80px !important;
            flex: 1 1 auto;
          }
          .mapPreview {
            top: 60px !important;
            right: 10px !important;
            width: 80px !important;
            height: 50px !important;
            font-size: 0.6rem !important;
          }
          .enterButton {
            min-width: 180px !important;
            padding: 14px 28px !important;
            font-size: 1.1rem !important;
          }
        }
        
        @media (max-width: 480px) {
          .features {
            bottom: 60px !important;
            gap: 0.5rem !important;
            flex-direction: row !important;
            justify-content: space-between !important;
          }
          .feature {
            font-size: 0.7rem !important;
            padding: 4px 8px !important;
            min-width: 60px !important;
            flex: 1;
          }
          .mapPreview {
            display: none !important;
          }
          .enterButton {
            min-width: 160px !important;
            padding: 12px 24px !important;
            font-size: 1rem !important;
          }
        }
      `}</style>
    </div>
  );
}
