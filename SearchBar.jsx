import React, { useState, useRef, useEffect } from 'react';

// Simple geocoding using Nominatim (OpenStreetMap)
async function geocodeDestination(query) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=in`
    );
    const results = await response.json();
    return results.map(result => ({
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      display_name: result.display_name,
      place_id: result.place_id
    }));
  } catch (error) {
    console.error('Geocoding error:', error);
    return [];
  }
}

export default function SearchBar({ onDestinationSelect, onPlanRoute, onStartNavigation, isNavigating, currentDestination }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true);
      const results = await geocodeDestination(query);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setLoading(false);
    }, 500);

    return () => clearTimeout(searchTimeoutRef.current);
  }, [query]);

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion.display_name);
    setShowSuggestions(false);
    onDestinationSelect(suggestion);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      handleSuggestionClick(suggestions[0]);
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  const styles = {
    container: {
      position: 'relative',
      width: '100%',
      maxWidth: '400px',
    },
    searchInput: {
      width: '100%',
      padding: '12px 16px',
      fontSize: '16px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      borderRadius: '25px',
      background: 'rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      color: 'white',
      outline: 'none',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    },
    searchInputFocus: {
      borderColor: '#00d4ff',
      boxShadow: '0 0 20px rgba(0, 212, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
    },
    suggestions: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      zIndex: 1000,
      background: 'rgba(15, 15, 35, 0.95)',
      backdropFilter: 'blur(15px)',
      WebkitBackdropFilter: 'blur(15px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      marginTop: '4px',
      maxHeight: '300px',
      overflowY: 'auto',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
    },
    suggestion: {
      padding: '12px 16px',
      cursor: 'pointer',
      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      transition: 'background 0.2s ease',
      fontSize: '14px',
      lineHeight: '1.4',
    },
    suggestionHover: {
      background: 'rgba(0, 212, 255, 0.1)',
    },
    loadingSpinner: {
      position: 'absolute',
      right: '16px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '16px',
      height: '16px',
      border: '2px solid rgba(255, 255, 255, 0.3)',
      borderTop: '2px solid #00d4ff',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
    },
    buttonGroup: {
      display: 'flex',
      gap: '8px',
      marginTop: '12px',
    },
    button: {
      padding: '10px 20px',
      borderRadius: '20px',
      border: 'none',
      background: 'rgba(255, 255, 255, 0.08)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      color: 'white',
      fontSize: '14px',
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      minWidth: '100px',
      touchAction: 'manipulation',
    },
    planButton: {
      background: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
      boxShadow: '0 0 20px rgba(0, 212, 255, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
    },
    navButton: {
      background: isNavigating 
        ? 'linear-gradient(135deg, #ff0066 0%, #cc0044 100%)'
        : 'linear-gradient(135deg, #00ff99 0%, #00cc77 100%)',
      boxShadow: isNavigating
        ? '0 0 20px rgba(255, 0, 102, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)'
        : '0 0 20px rgba(0, 255, 153, 0.3), 0 4px 12px rgba(0, 0, 0, 0.3)',
    },
    placeholder: {
      color: 'rgba(255, 255, 255, 0.6)',
    }
  };

  return (
    <div style={styles.container}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyPress}
        onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder="Search destination..."
        style={{
          ...styles.searchInput,
          ...(showSuggestions ? styles.searchInputFocus : {}),
        }}
      />
      
      {loading && <div style={styles.loadingSpinner}></div>}
      
      {showSuggestions && suggestions.length > 0 && (
        <div style={styles.suggestions}>
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.place_id || index}
              style={styles.suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              onMouseEnter={(e) => e.target.style.background = 'rgba(0, 212, 255, 0.1)'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                {suggestion.display_name.split(',')[0]}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                {suggestion.display_name.split(',').slice(1, 3).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.buttonGroup}>
        <button
          style={{ ...styles.button, ...styles.planButton }}
          onClick={onPlanRoute}
          disabled={!currentDestination}
        >
          Plan Route
        </button>
        <button
          style={{ ...styles.button, ...styles.navButton }}
          onClick={onStartNavigation}
          disabled={!currentDestination}
        >
          {isNavigating ? 'Stop Navigation' : 'Start Navigation'}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: translateY(-50%) rotate(0deg); }
          100% { transform: translateY(-50%) rotate(360deg); }
        }
        
        input::placeholder {
          color: rgba(255, 255, 255, 0.6);
        }
      `}</style>
    </div>
  );
}
