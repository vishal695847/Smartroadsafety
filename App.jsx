import React, { useState, useEffect } from 'react';
import Landing from './Landing.jsx';
import SmartRoadSafety from './SmartRoadSafetyWithRouting.jsx';

export default function App() {
  const [currentView, setCurrentView] = useState('landing');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [user, setUser] = useState(null);

  const handleEnterApp = (userData) => {
    setUser(userData);
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentView('app');
      setIsTransitioning(false);
    }, 300);
  };

  const handleBackToLanding = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentView('landing');
      setIsTransitioning(false);
    }, 300);
  };

  // Add keyboard shortcut to go back to landing (Escape key)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape' && currentView === 'app') {
        handleBackToLanding();
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentView]);

  const styles = {
    container: {
      position: 'fixed',
      inset: 0,
      overflow: 'hidden',
    },
    transition: {
      position: 'absolute',
      inset: 0,
      background: 'radial-gradient(circle at center, rgba(0, 212, 255, 0.8), rgba(15, 15, 35, 0.9))',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: '1.5rem',
      fontWeight: 700,
      opacity: isTransitioning ? 1 : 0,
      transition: 'opacity 0.3s ease',
      pointerEvents: isTransitioning ? 'auto' : 'none',
    },
    backButton: {
      position: 'fixed',
      top: '20px',
      left: '20px',
      zIndex: 50,
      padding: '12px 20px',
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '25px',
      color: 'white',
      fontSize: '0.9rem',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      display: currentView === 'app' ? 'flex' : 'none',
      alignItems: 'center',
      gap: '8px',
      touchAction: 'manipulation',
      userSelect: 'none',
    },
  };

  return (
    <div style={styles.container}>
      {/* Back to landing button (only visible in app view) */}
      <button
        style={styles.backButton}
        onClick={handleBackToLanding}
        title="Back to landing page (or press Escape)"
      >
        ← Landing
      </button>

      {/* Transition overlay */}
      <div style={styles.transition}>
        {isTransitioning && (
          <>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              border: '3px solid rgba(255,255,255,0.3)',
              borderTop: '3px solid white',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginRight: '15px'
            }}></div>
            {currentView === 'landing' ? 'Loading Safety Dashboard...' : 'Returning to Landing...'}
          </>
        )}
      </div>

      {/* Render current view */}
      {currentView === 'landing' && (
        <Landing onEnterApp={handleEnterApp} />
      )}
      
      {currentView === 'app' && (
        <SmartRoadSafety user={user} />
      )}

      {/* Global animations */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
