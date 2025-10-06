import React, { useEffect, useMemo, useRef, useState } from "react";
import SearchBar from './SearchBar.jsx';
import RoutingService from './RoutingService.js';
import HazardService, { HAZARD_CONFIG } from './HazardService.js';
import NavigationController from './NavigationController.js';

// Single-file React component with inline styles and CDN-loaded Leaflet
// Production-focused: handles permission denial, loading states, fallbacks, and efficient updates

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

// Utility: Haversine distance (meters)
function haversineDistanceMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

// Utility: Simple audio beep via WebAudio
function playBeep({ frequency = 880, durationMs = 200, volume = 0.05 } = {}) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, durationMs);
  } catch (e) {
    // ignore audio errors
  }
}

// Mock Indian city data around Mumbai center
const MUMBAI_CENTER = { lat: 19.076, lng: 72.8777 };
const BLACKSPOTS = [
  { name: "Sion Circle", lat: 19.0436, lng: 72.8649, risk: "high" },
  { name: "Kurla Junction", lat: 19.0656, lng: 72.8795, risk: "high" },
  { name: "Andheri MIDC", lat: 19.1176, lng: 72.8697, risk: "medium" },
  { name: "Bandra Kurla Complex", lat: 19.0607, lng: 72.8679, risk: "medium" },
  { name: "Dadar TT Circle", lat: 19.0186, lng: 72.8443, risk: "high" },
  { name: "Wadala Truck Terminus", lat: 19.0161, lng: 72.8670, risk: "high" },
  { name: "JVLR Powai", lat: 19.1172, lng: 72.9053, risk: "medium" },
  { name: "Saki Naka Junction", lat: 19.1041, lng: 72.8876, risk: "high" },
  { name: "Chembur Naka", lat: 19.0625, lng: 72.9006, risk: "medium" },
  { name: "Mulund Check Naka", lat: 19.1712, lng: 72.9567, risk: "high" },
  { name: "Thane Ghodbunder", lat: 19.2620, lng: 72.9673, risk: "medium" },
  { name: "Vikhroli Godrej", lat: 19.1024, lng: 72.9279, risk: "medium" },
  { name: "Kanjurmarg", lat: 19.1242, lng: 72.9353, risk: "medium" },
  { name: "Ghatkopar LBS", lat: 19.0867, lng: 72.9106, risk: "high" },
  { name: "Eastern Freeway Entry", lat: 18.9894, lng: 72.8539, risk: "high" },
];

// Hazard icon lookup (simple emoji markers)
const HAZARD_TYPES = ["Accident", "Pothole", "Fog", "Construction", "Police"];
const HAZARD_EMOJI = {
  Accident: "💥",
  Pothole: "🕳️",
  Fog: "🌫️",
  Construction: "🚧",
  Police: "🚓",
};

// Weather simulation states with realistic data
const WEATHER_STATES = [
  { status: "Clear", visibilityM: 4000, recommendedLimit: 60, description: "Good visibility" },
  { status: "Fog", visibilityM: 400, recommendedLimit: 30, description: "Reduced visibility" },
  { status: "Rain", visibilityM: 1500, recommendedLimit: 40, description: "Wet conditions" },
  { status: "Heavy Rain", visibilityM: 800, recommendedLimit: 25, description: "Poor visibility" },
  { status: "Light Fog", visibilityM: 1200, recommendedLimit: 45, description: "Slightly reduced visibility" },
];

// Speed limits by context with realistic validation
function getDynamicSpeedLimit({ inHighRisk, inMedRisk, weather }) {
  const base = inHighRisk ? 30 : inMedRisk ? 40 : 60; // city vs highway
  // weather based reduction: take min with recommended
  const weatherLimit = weather?.recommendedLimit ?? 60;
  const finalLimit = Math.min(base, weatherLimit);
  
  // Validate speed limit is realistic
  return clamp(finalLimit, 15, 80); // Minimum 15 kmph, maximum 80 kmph
}

// Simple RNG helpers
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default function SmartRoadSafety({ user }) {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const userPulseRef = useRef(null);
  const dangerLayersRef = useRef([]);
  const hazardMarkersRef = useRef([]);
  const fogLayersRef = useRef([]);
  const leafletLoadedRef = useRef(false);
  const watchIdRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const lastPosRef = useRef(null);
  const lastUpdateTsRef = useRef(0);
  const flashRef = useRef(null);
  const speedNeedleRef = useRef(null);
  const alertDragRef = useRef({ id: null, startX: 0, swiped: false });

  // New refs for routing and navigation
  const routePolylineRef = useRef(null);
  const destinationMarkerRef = useRef(null);
  const hazardMarkersMapRef = useRef(new Map());
  const riskAreaLayersRef = useRef([]);

  // UI and data state
  const [loading, setLoading] = useState(true);
  const [geoError, setGeoError] = useState(null);
  const [position, setPosition] = useState(MUMBAI_CENTER);
  const [speedKmph, setSpeedKmph] = useState(0);
  const [useMph, setUseMph] = useState(false);
  const [weather, setWeather] = useState(WEATHER_STATES[0]);
  const [visibilityM, setVisibilityM] = useState(4000);
  const [alerts, setAlerts] = useState([]); // {id, type, message, ts}
  const [hazards, setHazards] = useState([]); // {id, type, lat, lng, ts}
  const [showStats, setShowStats] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [startDriveTs] = useState(Date.now());
  const [alertsCount, setAlertsCount] = useState(0);
  const [safetyScore, setSafetyScore] = useState(100);
  const [activeUsers, setActiveUsers] = useState(75); // Start with realistic number
  const [speedLimit, setSpeedLimit] = useState(60);
  const [distanceToNearestHazardM, setDistanceToNearestHazardM] = useState(null);
  const [sosOpen, setSosOpen] = useState(false);

  // Navigation and routing state
  const [destination, setDestination] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [navigationStats, setNavigationStats] = useState(null);
  const [routeHazards, setRouteHazards] = useState([]);
  const [allHazards, setAllHazards] = useState([]);
  const [showAllHazards, setShowAllHazards] = useState(true);

  // Inject Leaflet CDN once with robust error handling
  useEffect(() => {
    const ensureLeaflet = async () => {
      if (leafletLoadedRef.current) return true;
      
      try {
        // Check if Leaflet is already loaded
        if (window.L) {
          leafletLoadedRef.current = true;
          return true;
        }
        
        // Load CSS first
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = LEAFLET_CSS;
        css.crossOrigin = "anonymous";
        document.head.appendChild(css);

        // Wait for CSS to load
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Load JavaScript
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = LEAFLET_JS;
          s.async = true;
          s.crossOrigin = "anonymous";
          s.onload = () => {
            // Verify Leaflet loaded correctly
            if (window.L && window.L.map) {
              leafletLoadedRef.current = true;
              resolve();
            } else {
              reject(new Error('Leaflet did not load properly'));
            }
          };
          s.onerror = () => reject(new Error('Failed to load Leaflet script'));
          document.body.appendChild(s);
          
          // Timeout after 10 seconds
          setTimeout(() => {
            if (!leafletLoadedRef.current) {
              reject(new Error('Leaflet loading timeout'));
            }
          }, 10000);
        });
        
        return true;
      } catch (error) {
        console.error('Leaflet loading error:', error);
        throw error;
      }
    };

    ensureLeaflet()
      .then(() => {
        setLoading(false);
        initMap();
      })
      .catch((error) => {
        console.error('Map initialization failed:', error);
        setGeoError(`Failed to load map: ${error.message}`);
        setLoading(false);
      });

    return () => {
      // Cleanup geolocation
      try {
        if (watchIdRef.current != null && navigator.geolocation) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      } catch {}
      // Cleanup device motion
      window.removeEventListener("devicemotion", onDeviceMotion);
      
      // Cleanup navigation
      NavigationController.stopNavigation();
      NavigationController.removeListener(handleNavigationEvent);
      HazardService.removeListener(handleHazardEvent);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize map and layers with comprehensive error handling
  function initMap() {
    try {
      // eslint-disable-next-line no-undef
      const L = window.L;
      if (!mapContainerRef.current || !L) {
        throw new Error('Map container or Leaflet not available');
      }
      
      // Create map with error handling for tile loading
      const map = L.map(mapContainerRef.current, {
        center: [MUMBAI_CENTER.lat, MUMBAI_CENTER.lng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true, // Better performance
        renderer: L.canvas(), // Use canvas renderer
      });
      
      // Add tile layer with fallback
      const darkTiles = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { 
          attribution: "©OpenStreetMap, ©Carto",
          maxZoom: 18,
          subdomains: ['a', 'b', 'c', 'd'],
          errorTileUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjU2IiBoZWlnaHQ9IjI1NiIgZmlsbD0iIzMzMzMzMyI+PC9zdmc+'
        }
      );
      
      // Handle tile loading errors
      darkTiles.on('tileerror', (e) => {
        console.warn('Tile loading error:', e);
      });
      
      darkTiles.addTo(map);
      mapRef.current = map;

      // Add zoom controls for accessibility
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Create user pulsing marker
      const userDiv = L.divIcon({
        className: "user-pulse",
        html: '<div class="pulse-outer"><div class="pulse-inner"></div></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const userMarker = L.marker([MUMBAI_CENTER.lat, MUMBAI_CENTER.lng], {
        icon: userDiv,
      }).addTo(map);
      userMarkerRef.current = userMarker;
      userPulseRef.current = userDiv;

      // Danger zones with error handling
      dangerLayersRef.current = BLACKSPOTS.map((spot) => {
        try {
          const radius = spot.risk === "high" ? 200 : 150;
          const color = spot.risk === "high" ? "#ff0066" : "#ffcc00";
          const circle = L.circle([spot.lat, spot.lng], {
            radius,
            color,
            weight: 2,
            fillColor: color,
            fillOpacity: 0.2,
          }).addTo(map);
          circle.bindPopup(`<b>${spot.name}</b><br/>Risk: ${spot.risk}`);
          return circle;
        } catch (e) {
          console.error('Error creating danger zone:', e);
          return null;
        }
      }).filter(Boolean);

      // Event handlers for long-press hazard report
      const startLongPress = (e) => {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
          try {
            const latlng = e.latlng || map.getCenter();
            addHazard({ lat: latlng.lat, lng: latlng.lng, type: randomChoice(HAZARD_TYPES) });
            addAlert({ type: "info", message: "Hazard reported via long-press" });
          } catch (error) {
            console.error('Error adding hazard:', error);
            addAlert({ type: "info", message: "Failed to report hazard" });
          }
        }, 700);
      };
      const cancelLongPress = () => clearTimeout(longPressTimerRef.current);
      
      map.on("mousedown", startLongPress);
      map.on("mouseup", cancelLongPress);
      map.on("touchstart", startLongPress);
      map.on("touchend", cancelLongPress);

      // Handle map errors
      map.on('error', (e) => {
        console.error('Map error:', e);
        addAlert({ type: "info", message: "Map error occurred" });
      });

      // GPS tracking
      startGeolocation();

      // Periodic simulations
      startSimulations();
      
      // Start hazard cleanup every 2 minutes
      setInterval(cleanupOldHazards, 2 * 60 * 1000);

      // Shake detection
      window.addEventListener("devicemotion", onDeviceMotion);

      // Initialize hazards and navigation
      initializeHazardsAndNavigation();

      addAlert({ type: "info", message: "Map initialized successfully" });
      
    } catch (e) {
      console.error('Map initialization error:', e);
      setGeoError(`Failed to initialize map: ${e.message}`);
      addAlert({ type: "info", message: "Map initialization failed. Please refresh the page." });
    }
  }

  // Initialize hazards and navigation
  function initializeHazardsAndNavigation() {
    // Load initial hazards
    const hazards = HazardService.getAllHazards();
    setAllHazards(hazards);
    
    // Show only hazards within 1km radius initially
    const nearbyHazards = HazardService.getHazardsWithinRadius(position, 1000);
    renderHazardOverlays(nearbyHazards);

    // Start hazard simulation
    HazardService.startSimulation();

    // Add event listeners
    NavigationController.addListener(handleNavigationEvent);
    HazardService.addListener(handleHazardEvent);
  }

  // Handle navigation events with UI synchronization
  function handleNavigationEvent(event, data) {
    switch (event) {
      case 'navigationStarted':
        setCurrentRoute(data.route);
        setIsNavigating(true);
        renderRouteOnMap(data.route);
        updateHazardVisibility(true);
        // Update hazard feed title
        break;
      case 'navigationStopped':
        setIsNavigating(false);
        setCurrentRoute(null);
        setNavigationStats(null);
        clearRouteFromMap();
        updateHazardVisibility(false);
        // Reset hazard feed to show all hazards
        break;
      case 'positionUpdated':
        setNavigationStats(data.stats);
        // Sync speed and safety score updates
        if (data.stats) {
          // Update any stats that might have changed during navigation
        }
        break;
      case 'routeUpdated':
        setCurrentRoute(data.route);
        renderRouteOnMap(data.route);
        updateHazardVisibility(true);
        if (data.reason === 'deviation') {
          addAlert({ type: 'info', message: 'Route updated due to deviation' });
        }
        break;
      case 'rerouting':
        addAlert({ type: 'info', message: 'Recalculating route...' });
        break;
      case 'destinationReached':
        addAlert({ type: 'info', message: 'Destination reached!' });
        playBeep({ frequency: 660, durationMs: 800, volume: 0.08 });
        // Update safety score for completing navigation
        setSafetyScore((s) => clamp(s + 5, 0, 100));
        break;
    }
  }

  // Handle hazard events with UI synchronization
  function handleHazardEvent(event, data) {
    if (event === 'hazardAdded') {
      setAllHazards(prev => {
        // Avoid duplicates
        if (prev.some(h => h.id === data.id)) {
          return prev;
        }
        return [...prev, data];
      });
      
      // Update hazards state for main display
      setHazards(prev => {
        const newHazard = {
          id: data.id,
          lat: data.geometry.coordinates[1],
          lng: data.geometry.coordinates[0],
          type: data.type,
          ts: new Date(data.properties.updatedAt).getTime()
        };
        
        // Check for duplicates
        if (prev.some(h => h.id === newHazard.id)) {
          return prev;
        }
        
        return [newHazard, ...prev].slice(0, 30);
      });
      
      if (showAllHazards || isNavigating) {
        renderSingleHazard(data);
      }
    } else if (event === 'hazardRemoved') {
      setAllHazards(prev => prev.filter(h => h.id !== data.id));
      setHazards(prev => prev.filter(h => h.id !== data.id));
      removeSingleHazard(data.id);
    }
  }

  // Render hazard overlays on map
  function renderHazardOverlays(hazards) {
    try {
      // eslint-disable-next-line no-undef
      const L = window.L;
      if (!L || !mapRef.current) return;

      // Clear existing hazard markers
      hazardMarkersMapRef.current.forEach(marker => marker.remove());
      hazardMarkersMapRef.current.clear();
      riskAreaLayersRef.current.forEach(layer => layer.remove());
      riskAreaLayersRef.current = [];

      hazards.forEach(hazard => {
        renderSingleHazard(hazard);
      });
    } catch (error) {
      console.error('Error rendering hazard overlays:', error);
    }
  }

  // Render single hazard
  function renderSingleHazard(hazard) {
    try {
      // eslint-disable-next-line no-undef
      const L = window.L;
      if (!L || !mapRef.current) return;

      const config = HAZARD_CONFIG[hazard.type];
      if (!config) return;

      if (hazard.geometry.type === 'Point') {
        const [lng, lat] = hazard.geometry.coordinates;
        const icon = L.divIcon({
          className: 'hazard-marker',
          html: `<div class="hazard-icon" style="background: ${config.color}">${config.icon}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([lat, lng], { icon }).addTo(mapRef.current);
        marker.bindPopup(`
          <div style="font-weight: bold; margin-bottom: 4px;">${config.name}</div>
          <div style="font-size: 12px; opacity: 0.9;">${hazard.properties.description || 'No description'}</div>
          <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">Severity: ${hazard.properties.severity || 1}/3</div>
        `);

        hazardMarkersMapRef.current.set(hazard.id, marker);
      } else if (hazard.geometry.type === 'Polygon') {
        const coords = hazard.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
        const polygon = L.polygon(coords, {
          color: config.strokeColor || config.color,
          weight: 2,
          fillColor: config.fillColor || config.color,
          fillOpacity: 0.3,
          dashArray: '5,5'
        }).addTo(mapRef.current);

        polygon.bindPopup(`
          <div style="font-weight: bold; margin-bottom: 4px;">${config.name}</div>
          <div style="font-size: 12px; opacity: 0.9;">${hazard.properties.description || 'No description'}</div>
          <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">Severity: ${hazard.properties.severity || 1}/3</div>
        `);

        riskAreaLayersRef.current.push(polygon);
      }
    } catch (error) {
      console.error('Error rendering single hazard:', error);
    }
  }

  // Remove single hazard
  function removeSingleHazard(hazardId) {
    const marker = hazardMarkersMapRef.current.get(hazardId);
    if (marker) {
      marker.remove();
      hazardMarkersMapRef.current.delete(hazardId);
    }
  }

  // Update hazard visibility based on navigation mode
  function updateHazardVisibility(navigationMode) {
    if (navigationMode && currentRoute) {
      // Show only route hazards
      const routeHazards = HazardService.filterHazardsByRoute(currentRoute, 100);
      setRouteHazards(routeHazards);
      setShowAllHazards(false);
      
      // Hide all hazards first
      hazardMarkersMapRef.current.forEach(marker => marker.remove());
      riskAreaLayersRef.current.forEach(layer => layer.remove());
      hazardMarkersMapRef.current.clear();
      riskAreaLayersRef.current = [];
      
      // Show only route hazards
      renderHazardOverlays(routeHazards);
    } else {
      // Show hazards within 1km radius only
      setShowAllHazards(true);
      const nearbyHazards = HazardService.getHazardsWithinRadius(position, 1000);
      updateHazardDisplay(nearbyHazards);
    }
  }

  // Helper function to update hazard display
  function updateHazardDisplay(hazards) {
    // Clear existing hazards
    hazardMarkersMapRef.current.forEach(marker => marker.remove());
    riskAreaLayersRef.current.forEach(layer => layer.remove());
    hazardMarkersMapRef.current.clear();
    riskAreaLayersRef.current = [];
    
    renderHazardOverlays(hazards);
  }

  // Render route on map
  function renderRouteOnMap(route) {
    try {
      // eslint-disable-next-line no-undef
      const L = window.L;
      if (!L || !mapRef.current || !route) return;

      // Validate coordinates before rendering
      const hasCoords = Array.isArray(route.coordinates) && route.coordinates.length >= 2;
      if (!hasCoords) return;

      // Clear existing route
      clearRouteFromMap();

      // Draw route polyline
      const coords = route.coordinates
        .filter(coord => coord && typeof coord.lat === 'number' && typeof coord.lng === 'number')
        .map(coord => [coord.lat, coord.lng]);
      if (coords.length < 2) return;
      const polyline = L.polyline(coords, {
        color: '#00d4ff',
        weight: 6,
        opacity: 0.8,
        dashArray: '10,5'
      }).addTo(mapRef.current);

      polyline.bindPopup(`
        <div style="font-weight: bold; margin-bottom: 4px;">Route Information</div>
        <div style="font-size: 12px;">Distance: ${(route.distance / 1000).toFixed(1)} km</div>
        <div style="font-size: 12px;">Duration: ${Math.round(route.duration / 60)} min</div>
        <div style="font-size: 12px;">Safety Score: ${route.safetyScore.toFixed(1)}</div>
      `);

      routePolylineRef.current = polyline;

      // Fit map to route bounds
      mapRef.current.fitBounds(polyline.getBounds(), { padding: [20, 20] });
    } catch (error) {
      console.error('Error rendering route:', error);
    }
  }

  // Clear route from map
  function clearRouteFromMap() {
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }
  }

  // Handle destination selection
  function handleDestinationSelect(dest) {
    setDestination(dest);
    
    try {
      // eslint-disable-next-line no-undef
      const L = window.L;
      if (!L || !mapRef.current) return;

      // Clear existing destination marker
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.remove();
      }

      // Add destination marker
      const icon = L.divIcon({
        className: 'destination-marker',
        html: '<div class="dest-icon">🎯</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([dest.lat, dest.lng], { icon }).addTo(mapRef.current);
      marker.bindPopup(`<b>Destination</b><br/>${dest.display_name}`);
      
      destinationMarkerRef.current = marker;

      // Pan to destination
      mapRef.current.setView([dest.lat, dest.lng], 14);
    } catch (error) {
      console.error('Error setting destination marker:', error);
    }
  }

  // Handle route planning with live GPS and validation
  async function handlePlanRoute() {
    if (!destination) {
      addAlert({ type: 'info', message: 'Please select a destination first' });
      return;
    }

    if (!position) {
      addAlert({ type: 'info', message: 'Waiting for GPS location...' });
      return;
    }
    
    // Validate destination coordinates
    if (!destination.lat || !destination.lng || 
        isNaN(destination.lat) || isNaN(destination.lng)) {
      addAlert({ type: 'info', message: 'Invalid destination coordinates. Please search again.' });
      return;
    }
    
    // Check if destination is too far (more than 100km)
    const distanceToDest = haversineDistanceMeters(position, destination);
    if (distanceToDest > 100000) { // 100km
      addAlert({ type: 'info', message: 'Destination too far (over 100km). Please choose a closer location.' });
      return;
    }

    setIsPlanning(true);
    addAlert({ type: 'info', message: 'Planning route with safety optimization...' });
    
    try {
      // Use current live GPS position for route planning
      const currentPos = { lat: position.lat, lng: position.lng };
      const hazards = HazardService.getAllHazards();
      const route = await RoutingService.getBestRoute(currentPos, destination, hazards);
      
      if (route && route.coordinates && route.coordinates.length >= 2) {
        setCurrentRoute(route);
        renderRouteOnMap(route);
        
        // Show route hazards preview
        const routeHazards = HazardService.filterHazardsByRoute(route, 100);
        const hazardCount = routeHazards.length;
        
        addAlert({ 
          type: 'info', 
          message: `Route planned: ${(route.distance / 1000).toFixed(1)} km, ${Math.round(route.duration / 60)} min${hazardCount > 0 ? `, ${hazardCount} hazards detected` : ', clear route'}` 
        });
        
        // Play confirmation sound
        playBeep({ frequency: 660, durationMs: 300, volume: 0.06 });
      } else {
        addAlert({ type: 'info', message: 'Could not calculate route. Try a different destination.' });
      }
    } catch (error) {
      console.error('Route planning error:', error);
      if (error.message.includes('network') || error.message.includes('fetch')) {
        addAlert({ type: 'info', message: 'Network error. Check your internet connection.' });
      } else if (error.message.includes('API')) {
        addAlert({ type: 'info', message: 'Routing service temporarily unavailable. Please try again.' });
      } else {
        addAlert({ type: 'info', message: 'Route planning failed. Please try a different destination.' });
      }
    } finally {
      setIsPlanning(false);
    }
  }

  // Handle navigation start/stop with validation
  async function handleStartNavigation() {
    if (isNavigating) {
      NavigationController.stopNavigation();
      addAlert({ type: 'info', message: 'Navigation stopped' });
      playBeep({ frequency: 440, durationMs: 200, volume: 0.05 });
      return;
    }

    if (!destination) {
      addAlert({ type: 'info', message: 'Please select a destination first' });
      return;
    }

    if (!position) {
      addAlert({ type: 'info', message: 'Waiting for GPS location...' });
      return;
    }
    
    // Validate GPS accuracy
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const accuracy = pos.coords.accuracy;
          if (accuracy > 100) { // More than 100m accuracy
            addAlert({ type: 'info', message: 'GPS accuracy is low. Navigation may be imprecise.' });
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    if (!currentRoute) {
      // Auto-plan route if not already planned
      addAlert({ type: 'info', message: 'Planning route before navigation...' });
      await handlePlanRoute();
      if (!currentRoute) {
        addAlert({ type: 'info', message: 'Please plan a route first' });
        return;
      }
    }

    try {
      // Use current live GPS position for navigation start
      const currentPos = { lat: position.lat, lng: position.lng };
      await NavigationController.startNavigation(destination, currentPos);
      addAlert({ type: 'info', message: 'Live navigation started - following your GPS' });
      playBeep({ frequency: 880, durationMs: 400, volume: 0.06 });
      
      // Update safety score for starting navigation
      setSafetyScore((s) => clamp(s + 1, 0, 100)); // Small bonus for using navigation
      
    } catch (error) {
      console.error('Navigation start error:', error);
      if (error.message.includes('permission')) {
        addAlert({ type: 'info', message: 'GPS permission denied. Please enable location access.' });
      } else if (error.message.includes('timeout')) {
        addAlert({ type: 'info', message: 'GPS timeout. Please try again in a better location.' });
      } else {
        addAlert({ type: 'info', message: 'Failed to start navigation. Please check GPS settings.' });
      }
    }
  }

  function onDeviceMotion(event) {
    // Simple shake detection using acceleration
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;
    const magnitude = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
    if (magnitude > 25) {
      // Simulate crash detection
      addAlert({ type: "sos", message: "Possible crash detected! Initiating SOS." });
      setSosOpen(true);
      playBeep({ frequency: 300, durationMs: 600, volume: 0.08 });
    }
  }

  // Geolocation and speed
  function startGeolocation() {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported");
      return;
    }
    try {
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = pos.coords;
          const now = performance.now();
          // Debounce frequent updates to ~250ms
          if (now - lastUpdateTsRef.current < 250) return;
          lastUpdateTsRef.current = now;

          const next = { lat: coords.latitude, lng: coords.longitude };
          setPosition(next);
          updateUserMarker(next);

          // Follow smoothly
          if (mapRef.current) {
            // eslint-disable-next-line no-undef
            window.L && mapRef.current.panTo([next.lat, next.lng], { animate: true });
          }

          // Improved speed calculation with smoothing
          let speedMS = coords.speed != null && !Number.isNaN(coords.speed) && coords.speed >= 0 ? coords.speed : null;
          
          if (speedMS == null && lastPosRef.current) {
            const dt = (pos.timestamp - lastPosRef.current.ts) / 1000;
            if (dt > 0.5 && dt < 10) { // Only calculate if reasonable time difference
              const d = haversineDistanceMeters(lastPosRef.current.p, next);
              speedMS = d / dt;
              
              // Apply smoothing to reduce GPS noise
              if (lastPosRef.current.speed != null) {
                speedMS = lastPosRef.current.speed * 0.7 + speedMS * 0.3;
              }
            } else {
              speedMS = lastPosRef.current.speed || 0;
            }
          }
          
          lastPosRef.current = { p: next, ts: pos.timestamp, speed: speedMS };
          const kmph = clamp(Math.round(((speedMS || 0) * 3.6) * 10) / 10, 0, 120); // Max realistic speed 120 kmph
          setSpeedKmph(kmph);
          
          // Update nearby hazards when position changes significantly
          if (!lastPosRef.current.lastHazardUpdate || 
              haversineDistanceMeters(next, lastPosRef.current.lastHazardUpdate) > 500) {
            if (!isNavigating) {
              const nearbyHazards = HazardService.getHazardsWithinRadius(next, 1000);
              updateHazardDisplay(nearbyHazards);
            }
            lastPosRef.current.lastHazardUpdate = next;
          }

          // Update speed limit based on zones and weather
          const inHigh = isInsideRiskZone(next, "high");
          const inMed = isInsideRiskZone(next, "medium");
          const limit = getDynamicSpeedLimit({ inHighRisk: inHigh, inMedRisk: inMed, weather });
          setSpeedLimit(limit);

          // Warnings with dynamic safety score updates
          if (kmph > limit + 10) {
            addAlert({ type: "speed", message: `Overspeeding! Limit ${limit} kmph` });
            screenFlash();
            playBeep({ frequency: 880, durationMs: 200, volume: 0.07 });
            setSafetyScore((s) => {
              const newScore = clamp(s - 2, 0, 100); // More penalty for severe overspeeding
              return newScore;
            });
          } else if (kmph > limit) {
            addAlert({ type: "speed", message: `Over limit by ${Math.round(kmph - limit)} kmph` });
            setSafetyScore((s) => {
              const newScore = clamp(s - 1, 0, 100); // Minor penalty for slight overspeeding
              return newScore;
            });
          } else if (kmph <= limit && kmph > 0) {
            // Reward good driving behavior
            setSafetyScore((s) => {
              const newScore = clamp(s + 0.1, 0, 100); // Gradual improvement for good driving
              return Math.round(newScore * 10) / 10; // Round to 1 decimal place
            });
          }

          // Approaching danger zone alert within 500m with dynamic stats
          const nearestBlackspot = nearestPoint(next, BLACKSPOTS.map((b) => ({ lat: b.lat, lng: b.lng, name: b.name })));
          if (nearestBlackspot && nearestBlackspot.distanceM <= 500) {
            addAlert({ type: "danger", message: `Approaching ${nearestBlackspot.point.name} (${Math.round(nearestBlackspot.distanceM)}m)` });
            // Slight penalty for entering danger zones
            setSafetyScore((s) => clamp(s - 0.5, 0, 100));
          }
          
          // Update driving time dynamically
          const drivingTime = Date.now() - startDriveTs;
          if (drivingTime % 60000 < 1000) { // Update every minute
            // Check for fatigue after 2 hours
            if (drivingTime > 2 * 60 * 60 * 1000) {
              setSafetyScore((s) => clamp(s - 0.2, 0, 100)); // Gradual fatigue penalty
            }
          }

          // Update nearest hazard distance
          updateNearestHazardDistance(next);
        },
        (err) => {
          setGeoError(err.message || "Location permission denied");
          // Fallback: simulate gentle movement around Mumbai
          simulateMovementFallback();
        },
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );
      watchIdRef.current = id;
    } catch (e) {
      setGeoError("Failed to start geolocation");
    }
  }

  function updateUserMarker(p) {
    try {
      if (!userMarkerRef.current) return;
      userMarkerRef.current.setLatLng([p.lat, p.lng]);
    } catch {}
  }

  function isInsideRiskZone(p, risk) {
    const spots = BLACKSPOTS.filter((s) => s.risk === risk);
    for (const s of spots) {
      const radius = risk === "high" ? 200 : 150;
      const d = haversineDistanceMeters(p, { lat: s.lat, lng: s.lng });
      if (d <= radius) return true;
    }
    return false;
  }

  function nearestPoint(origin, points) {
    if (!points || points.length === 0) return null;
    let best = null;
    for (const pt of points) {
      const d = haversineDistanceMeters(origin, { lat: pt.lat, lng: pt.lng });
      if (!best || d < best.distanceM) {
        best = { point: pt, distanceM: d };
      }
    }
    return best;
  }

  function updateNearestHazardDistance(p) {
    const pts = hazards.map((h) => ({ lat: h.lat, lng: h.lng }));
    const n = nearestPoint(p, pts);
    setDistanceToNearestHazardM(n ? Math.round(n.distanceM) : null);
  }

  // Fallback movement if permission denied
  function simulateMovementFallback() {
    let angle = 0;
    setInterval(() => {
      angle += 0.02;
      const r = 0.01; // ~1km radius circle
      const p = { lat: MUMBAI_CENTER.lat + r * Math.cos(angle), lng: MUMBAI_CENTER.lng + r * Math.sin(angle) };
      setPosition(p);
      updateUserMarker(p);
      setSpeedKmph(25 + Math.round(10 * Math.sin(angle * 2)));
      const inHigh = isInsideRiskZone(p, "high");
      const inMed = isInsideRiskZone(p, "medium");
      const limit = getDynamicSpeedLimit({ inHighRisk: inHigh, inMedRisk: inMed, weather });
      setSpeedLimit(limit);
      updateNearestHazardDistance(p);
    }, 1000);
  }

  // Simulations: hazards, weather, active users with proper synchronization
  function startSimulations() {
    // Random hazard every 30s with proper deduplication
    setInterval(() => {
      try {
        const base = mapRef.current?.getCenter();
        const lat = (base?.lat ?? MUMBAI_CENTER.lat) + (Math.random() - 0.5) * 0.02;
        const lng = (base?.lng ?? MUMBAI_CENTER.lng) + (Math.random() - 0.5) * 0.02;
        const type = randomChoice(HAZARD_TYPES);
        
        // Check for nearby hazards to avoid duplicates
        const existingHazard = hazards.find(h => 
          haversineDistanceMeters({ lat, lng }, { lat: h.lat, lng: h.lng }) < 100
        );
        
        if (!existingHazard) {
          addHazard({ lat, lng, type });
          addAlert({ type: "info", message: `Community reported: ${type}` });
        }
      } catch (error) {
        console.error('Error in hazard simulation:', error);
      }
    }, 30000);

    // Weather every 2 minutes with proper state synchronization
    setInterval(() => {
      try {
        const next = randomChoice(WEATHER_STATES);
        
        // Only update if weather actually changed
        if (next.status !== weather.status) {
          setWeather(next);
          setVisibilityM(next.visibilityM);
          
          // Update speed limit based on new weather
          const inHigh = isInsideRiskZone(position, "high");
          const inMed = isInsideRiskZone(position, "medium");
          const newLimit = getDynamicSpeedLimit({ inHighRisk: inHigh, inMedRisk: inMed, weather: next });
          setSpeedLimit(newLimit);
          
          // Update fog layers immediately when weather changes
          updateFogLayers(next);
          
          addAlert({ type: "weather", message: `Weather update: ${next.status} - Visibility: ${next.visibilityM}m` });
          playBeep({ frequency: 520, durationMs: 300, volume: 0.05 });
        }
      } catch (error) {
        console.error('Error in weather simulation:', error);
      }
    }, 120000);

    // Active users with realistic fluctuations based on time of day
    setInterval(() => {
      setActiveUsers((u) => {
        const hour = new Date().getHours();
        let baseCount = 75;
        
        // Adjust base count based on time of day
        if (hour >= 6 && hour <= 9) baseCount = 120; // Morning rush
        else if (hour >= 17 && hour <= 20) baseCount = 140; // Evening rush
        else if (hour >= 22 || hour <= 5) baseCount = 35; // Night time
        else if (hour >= 10 && hour <= 16) baseCount = 85; // Day time
        
        // Add small random variation
        const variation = Math.round((Math.random() - 0.5) * 8);
        const newCount = clamp(baseCount + variation, 20, 160);
        
        return newCount;
      });
    }, 30000); // Update every 30 seconds

    // Night mode check every hour
    setInterval(() => {
      const hour = new Date().getHours();
      const shouldBeNight = hour >= 19 || hour < 6;
      if (shouldBeNight !== nightMode) {
        setNightMode(shouldBeNight);
        addAlert({ type: "info", message: shouldBeNight ? "Night mode activated" : "Day mode activated" });
      }
    }, 60 * 60 * 1000);
    
    // Initial night mode check
    const hour = new Date().getHours();
    setNightMode(hour >= 19 || hour < 6);

    // Break reminders every 2 hours
    setInterval(() => {
      addAlert({ type: "fatigue", message: "2 hours driving. Consider a break." });
      playBeep({ frequency: 440, durationMs: 600, volume: 0.06 });
    }, 2 * 60 * 60 * 1000);
  }
  
  // Helper function to update fog layers when weather changes
  function updateFogLayers(newWeather) {
    try {
      // eslint-disable-next-line no-undef
      const L = window.L;
      if (!mapRef.current || !L) return;

      // Clear existing fog layers
      fogLayersRef.current.forEach((c) => c.remove());
      fogLayersRef.current = [];

      if (newWeather.status === "Fog") {
        // Select a few spots to mark as fog zones
        const spots = BLACKSPOTS.slice(0);
        const picks = new Set();
        while (picks.size < 4 && picks.size < spots.length) {
          picks.add(Math.floor(Math.random() * spots.length));
        }
        picks.forEach((idx) => {
          const s = spots[idx];
          const circle = L.circle([s.lat, s.lng], {
            radius: 350,
            color: "#cccccc",
            weight: 1,
            fillColor: "#cccccc",
            fillOpacity: 0.15,
            dashArray: "4,4",
          }).addTo(mapRef.current);
          circle.bindPopup(`<b>Fog Zone</b><br/>Reduced visibility: ${newWeather.visibilityM}m`);
          fogLayersRef.current.push(circle);
        });
      }
    } catch (error) {
      console.error('Error updating fog layers:', error);
    }
  }

  // Fog zones management based on weather - now handled in updateFogLayers function
  useEffect(() => {
    // This effect is now handled by the updateFogLayers function called from weather simulation
    // Keeping this for initial setup only
    if (weather.status === "Fog" && fogLayersRef.current.length === 0) {
      updateFogLayers(weather);
    }
  }, [weather.status]);

  // Alerts management with dynamic stats updates
  function addAlert({ type, message }) {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setAlerts((arr) => [{ id, type, message, ts: Date.now() }, ...arr].slice(0, 6));
    setAlertsCount((c) => c + 1);
    
    // Update safety score based on alert type
    if (type === "speed" || type === "danger") {
      setSafetyScore((s) => clamp(s - 1, 0, 100));
    }
    
    // Auto-dismiss after 5s
    setTimeout(() => {
      setAlerts((arr) => arr.filter((a) => a.id !== id));
    }, 5000);
    
    // Sounds per type
    if (type === "speed") playBeep({ frequency: 880 });
    if (type === "danger") playBeep({ frequency: 660 });
    if (type === "weather") playBeep({ frequency: 520 });
    if (type === "fatigue") playBeep({ frequency: 440, durationMs: 600 });
    if (type === "sos") playBeep({ frequency: 300, durationMs: 700, volume: 0.09 });
  }

  function screenFlash() {
    if (!flashRef.current) return;
    flashRef.current.style.opacity = "0.8";
    setTimeout(() => (flashRef.current.style.opacity = "0"), 180);
  }

  // Hazards management with proper deduplication and cleanup
  function addHazard({ lat, lng, type }) {
    const id = `hz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const h = { id, lat, lng, type, ts: Date.now() };
    
    // Check for duplicates within 50m radius
    const isDuplicate = hazards.some(existingHazard => {
      const distance = haversineDistanceMeters(
        { lat, lng }, 
        { lat: existingHazard.lat, lng: existingHazard.lng }
      );
      return distance < 50 && existingHazard.type === type;
    });
    
    if (isDuplicate) {
      console.log('Duplicate hazard detected, skipping');
      return;
    }
    
    setHazards((list) => {
      // Add new hazard and sort by timestamp (newest first)
      const newList = [h, ...list].sort((a, b) => b.ts - a.ts);
      // Keep only last 30 hazards to prevent memory issues
      return newList.slice(0, 30);
    });
    
    try {
      // eslint-disable-next-line no-undef
      const L = window.L;
      if (!L || !mapRef.current) return;
      const icon = L.divIcon({
        className: "hazard-icon",
        html: `<div class="hazard-badge">${HAZARD_EMOJI[type] || "⚠️"}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([lat, lng], { icon }).addTo(mapRef.current);
      marker.bindPopup(`<b>${type}</b><br/>${new Date(h.ts).toLocaleTimeString()}<br/>Reported by community`);
      hazardMarkersRef.current.push({ id, marker });
      updateNearestHazardDistance(position);
    } catch (error) {
      console.error('Error adding hazard marker:', error);
    }
  }
  
  // Cleanup old hazards automatically
  function cleanupOldHazards() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    
    setHazards((list) => {
      const filtered = list.filter(hazard => {
        const age = now - hazard.ts;
        if (age > maxAge) {
          // Remove marker from map
          const markerIndex = hazardMarkersRef.current.findIndex(m => m.id === hazard.id);
          if (markerIndex >= 0) {
            try {
              hazardMarkersRef.current[markerIndex].marker.remove();
              hazardMarkersRef.current.splice(markerIndex, 1);
            } catch (error) {
              console.error('Error removing old hazard marker:', error);
            }
          }
          return false; // Remove from list
        }
        return true; // Keep in list
      });
      
      if (filtered.length !== list.length) {
        console.log(`Cleaned up ${list.length - filtered.length} old hazards`);
      }
      
      return filtered;
    });
  }

  function clearHazardMarker(id) {
    try {
      const idx = hazardMarkersRef.current.findIndex((m) => m.id === id);
      if (idx >= 0) {
        hazardMarkersRef.current[idx].marker.remove();
        hazardMarkersRef.current.splice(idx, 1);
      }
    } catch {}
  }

  // Speed gauge needle effect
  useEffect(() => {
    if (!speedNeedleRef.current) return;
    const maxAngle = 220; // degrees sweep
    // map 0..180 kmph to -110..+110 deg
    const angle = clamp((speedKmph / 180) * maxAngle - maxAngle / 2, -110, 110);
    speedNeedleRef.current.style.transform = `translate(-50%, -100%) rotate(${angle}deg)`;
  }, [speedKmph]);

  // Distance to nearest hazard recompute when hazards change
  useEffect(() => {
    updateNearestHazardDistance(position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hazards]);

  // Focus mode: hide UI distractions
  const uiHidden = focusMode;

  // Formatters
  const speedDisplay = useMemo(() => {
    const val = useMph ? speedKmph * 0.621371 : speedKmph;
    return Math.round(val);
  }, [speedKmph, useMph]);

  const speedLimitDisplay = useMemo(() => (useMph ? Math.round(speedLimit * 0.621371) : speedLimit), [speedLimit, useMph]);

  const speedColor = useMemo(() => {
    if (speedKmph <= speedLimit) return "#00ff99"; // greenish
    if (speedKmph <= speedLimit + 10) return "#ffcc00"; // yellow
    return "#ff0066"; // red
  }, [speedKmph, speedLimit]);

  // Swipe to dismiss alerts
  const onAlertTouchStart = (id) => (e) => {
    alertDragRef.current = { id, startX: e.touches?.[0]?.clientX || 0, swiped: false };
  };
  const onAlertTouchMove = (id) => (e) => {
    if (alertDragRef.current.id !== id) return;
    const x = e.touches?.[0]?.clientX || 0;
    const dx = x - alertDragRef.current.startX;
    if (Math.abs(dx) > 80) {
      alertDragRef.current.swiped = true;
      setAlerts((arr) => arr.filter((a) => a.id !== id));
    }
  };

  // SOS actions with proper feedback
  function shareLocationWithContacts() {
    const coordsText = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
    const msg = `SOS! I need help. My location: ${coordsText}`;
    try {
      if (navigator.share) {
        navigator.share({ title: "SOS", text: msg })
          .then(() => {
            addAlert({ type: "info", message: "Location shared successfully" });
          })
          .catch(() => {
            addAlert({ type: "info", message: "Sharing cancelled" });
          });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(msg)
          .then(() => {
            addAlert({ type: "info", message: "Location copied to clipboard" });
          })
          .catch(() => {
            addAlert({ type: "info", message: "Failed to copy location" });
          });
      } else {
        const result = window.prompt("Copy this location:", msg);
        if (result !== null) {
          addAlert({ type: "info", message: "Location ready to share" });
        }
      }
    } catch (error) {
      console.error('Share location error:', error);
      addAlert({ type: "info", message: "Failed to share location" });
    }
  }

  function simulateCall() {
    addAlert({ type: "sos", message: "Dialing emergency services..." });
    playBeep({ frequency: 350, durationMs: 700, volume: 0.09 });
    
    // Simulate call progress
    setTimeout(() => {
      addAlert({ type: "sos", message: "Emergency services connected" });
    }, 3000);
  }
  
  // Clear all alerts function
  function clearAllAlerts() {
    setAlerts([]);
    addAlert({ type: "info", message: "All alerts cleared" });
  }
  
  // Clear all hazards function
  function clearAllHazards() {
    setHazards([]);
    // Clear hazard markers from map
    hazardMarkersRef.current.forEach(({ marker }) => {
      try {
        marker.remove();
      } catch (error) {
        console.error('Error removing hazard marker:', error);
      }
    });
    hazardMarkersRef.current = [];
    addAlert({ type: "info", message: "All hazards cleared" });
  }

  // UI styles (inline)
  const styles = {
    app: {
      position: "fixed",
      inset: 0,
      background: "linear-gradient(135deg, #0f0f23 0%, #1a1045 50%, #220a5e 100%)",
      color: "#ffffff",
      fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      overflow: "hidden",
    },
    map: {
      position: "absolute",
      inset: 0,
      zIndex: 1,
    },
    glassCard: {
      background: "rgba(255,255,255,0.08)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 16,
      boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
    },
    searchBar: {
      position: "absolute",
      top: 70,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 6,
      width: "90%",
      maxWidth: "400px",
    },
    speedPanel: {
      position: "absolute",
      top: 120,
      right: 12,
      zIndex: 5,
      padding: 12,
      minWidth: 140,
      touchAction: "manipulation",
    },
    speedNumber: {
      fontSize: 44,
      lineHeight: "44px",
      fontWeight: 800,
      textShadow: "0 0 10px rgba(0, 212, 255, 0.6)",
      cursor: "pointer",
      userSelect: "none",
      textAlign: "right",
    },
    speedSub: { fontSize: 12, opacity: 0.85, textAlign: "right" },
    gauge: {
      position: "relative",
      width: 120,
      height: 60,
      marginTop: 8,
    },
    needle: {
      position: "absolute",
      left: "50%",
      top: "100%",
      width: 2,
      height: 58,
      background: "#00d4ff",
      boxShadow: "0 0 12px #00d4ff",
      transformOrigin: "50% 100%",
      transition: "transform 100ms linear",
    },
    alertsPanel: {
      position: "absolute",
      left: 12,
      top: 180,
      zIndex: 6,
      display: uiHidden ? "none" : "flex",
      flexDirection: "column",
      gap: 8,
      maxHeight: "35vh",
      overflowY: "auto",
      maxWidth: "280px",
    },
    alertCard: (type) => ({
      padding: 12,
      minWidth: 220,
      borderLeft: `4px solid ${type === "speed" ? "#ff0066" : type === "danger" ? "#ffcc00" : type === "weather" ? "#00d4ff" : type === "fatigue" ? "#ffcc00" : "#00d4ff"}`,
      boxShadow: `0 0 16px ${type === "speed" ? "rgba(255,0,102,0.5)" : type === "danger" ? "rgba(255,204,0,0.5)" : type === "weather" ? "rgba(0,212,255,0.5)" : type === "fatigue" ? "rgba(255,204,0,0.5)" : "rgba(0,212,255,0.5)"}`,
    }),
    sosButton: {
      position: "absolute",
      right: 12,
      bottom: 180,
      zIndex: 6,
      width: 80,
      height: 80,
      background: "radial-gradient(circle, #ff3355, #ff0066)",
      borderRadius: 40,
      border: "2px solid rgba(255,255,255,0.3)",
      boxShadow: "0 0 20px rgba(255,0,102,0.6), 0 0 40px rgba(255,0,102,0.3)",
      color: "white",
      fontWeight: 900,
      fontSize: 18,
      display: uiHidden ? "none" : "flex",
      alignItems: "center",
      justifyContent: "center",
      touchAction: "manipulation",
      cursor: "pointer",
      userSelect: "none",
    },
    toolbar: {
      position: "absolute",
      bottom: 24,
      left: 12,
      right: 100, // Leave space for SOS button
      display: uiHidden ? "none" : "flex",
      gap: 8,
      zIndex: 6,
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
    },
    button: {
      padding: "12px 16px",
      minWidth: 48,
      minHeight: 48,
      borderRadius: 12,
      color: "white",
      border: "1px solid rgba(255,255,255,0.15)",
      background: "rgba(255,255,255,0.08)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
      cursor: "pointer",
      touchAction: "manipulation",
      userSelect: "none",
    },
    weatherBar: {
      position: "absolute",
      top: 12,
      left: 12,
      zIndex: 5,
      padding: "8px 14px",
      display: uiHidden ? "none" : "flex",
      gap: 14,
      alignItems: "center",
    },
    sidebar: {
      position: "absolute",
      right: 12,
      bottom: 280,
      width: 240,
      maxHeight: 200,
      overflowY: "auto",
      zIndex: 5,
      display: uiHidden ? "none" : "block",
    },
    stats: {
      position: "absolute",
      left: 12,
      bottom: 100,
      zIndex: 6,
      padding: 12,
      minWidth: 220,
      maxWidth: "300px",
      display: showStats && !uiHidden ? "block" : "none",
    },
    flash: {
      position: "absolute",
      inset: 0,
      background: "radial-gradient(circle at center, rgba(255,255,255,0.8), rgba(255,255,255,0))",
      pointerEvents: "none",
      zIndex: 10,
      transition: "opacity 150ms ease",
      opacity: 0,
    },
    legend: {
      position: "absolute",
      left: 12,
      bottom: 24,
      zIndex: 4,
      padding: 8,
      display: uiHidden ? "none" : "flex",
      gap: 10,
      alignItems: "center",
    },
    navigationBanner: {
      position: "absolute",
      bottom: 100,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 7,
      padding: "12px 20px",
      minWidth: 280,
      maxWidth: "90%",
      display: isNavigating && navigationStats ? "block" : "none",
      textAlign: "center",
    },
  };

  // Render
  return (
    <div style={styles.app}>
      {/* Night mode overlay */}
      {nightMode && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 50% 20%, rgba(0,0,40,0.25), rgba(0,0,0,0.5))",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}

      {/* Screen flash overlay */}
      <div ref={flashRef} style={styles.flash} />

      {/* Map container */}
      <div ref={mapContainerRef} id="map" style={styles.map} />

      {/* Search bar */}
      <div style={styles.searchBar}>
        <SearchBar
          onDestinationSelect={handleDestinationSelect}
          onPlanRoute={handlePlanRoute}
          onStartNavigation={handleStartNavigation}
          isNavigating={isNavigating}
          currentDestination={destination}
        />
      </div>

      {/* Weather bar */}
      <div style={{ ...styles.glassCard, ...styles.weatherBar }}>
        <span style={{ fontWeight: 700 }}>{weather.status}</span>
        <span style={{ opacity: 0.9 }}>Visibility: {Math.round(visibilityM)} m</span>
        <span style={{ opacity: 0.9 }}>Users: {activeUsers}</span>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
            <img 
              src={user.avatar} 
              alt={user.name}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: '1px solid rgba(0, 212, 255, 0.5)'
              }}
            />
            <span style={{ fontSize: '12px', opacity: 0.9 }}>{user.name ? user.name.split(' ')[0] : 'User'}</span>
          </div>
        )}
      </div>

      {/* Speed panel */}
      <div style={{ ...styles.glassCard, ...styles.speedPanel }}>
        <div
          onClick={() => setUseMph((v) => !v)}
          title="Tap to toggle kmph/mph"
          style={{ ...styles.speedNumber, color: speedColor }}
        >
          {loading ? "--" : speedDisplay}
        </div>
        <div style={styles.speedSub}>{useMph ? "mph" : "kmph"} • Limit {speedLimitDisplay} {useMph ? "mph" : "kmph"}</div>
        {/* Gauge */}
        <div style={styles.gauge}>
          <svg width="120" height="60" viewBox="0 0 120 60">
            <path d="M10,58 A50,50 0 0,1 110,58" stroke="#333" strokeWidth="6" fill="none" />
            <path d="M10,58 A50,50 0 0,1 110,58" stroke="#00d4ff" strokeWidth="4" fill="none" opacity="0.3" />
          </svg>
          <div ref={speedNeedleRef} style={styles.needle} />
        </div>
      </div>

      {/* Navigation banner */}
      <div style={{ ...styles.glassCard, ...styles.navigationBanner }}>
        {navigationStats && (
          <>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Navigation Active</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 14 }}>
              <div>
                <div style={{ opacity: 0.8 }}>Distance</div>
                <div style={{ fontWeight: 700 }}>{(navigationStats.distanceRemaining / 1000).toFixed(1)} km</div>
              </div>
              <div>
                <div style={{ opacity: 0.8 }}>Time</div>
                <div style={{ fontWeight: 700 }}>{Math.round(navigationStats.timeRemaining / 60)} min</div>
              </div>
              <div>
                <div style={{ opacity: 0.8 }}>Progress</div>
                <div style={{ fontWeight: 700 }}>{Math.round(navigationStats.routeProgress * 100)}%</div>
              </div>
            </div>
            {navigationStats.nextTurn && (
              <div style={{ marginTop: 8, padding: 8, background: "rgba(0,212,255,0.1)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, opacity: 0.8 }}>Next Turn</div>
                <div style={{ fontWeight: 600 }}>{navigationStats.nextTurn.instruction}</div>
                <div style={{ fontSize: 12 }}>in {navigationStats.nextTurn.distance}m</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Alerts panel */}
      <div style={styles.alertsPanel}>
        {alerts.map((a) => (
          <div
            key={a.id}
            style={{ ...styles.glassCard, ...styles.alertCard(a.type) }}
            onTouchStart={onAlertTouchStart(a.id)}
            onTouchMove={onAlertTouchMove(a.id)}
            onClick={() => setAlerts((arr) => arr.filter((x) => x.id !== a.id))}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {a.type === "speed" && "Speed Warning"}
              {a.type === "danger" && "Danger Zone"}
              {a.type === "weather" && "Weather"}
              {a.type === "fatigue" && "Fatigue"}
              {a.type === "sos" && "SOS"}
              {a.type === "info" && "Info"}
            </div>
            <div style={{ fontSize: 14, opacity: 0.95 }}>{a.message}</div>
          </div>
        ))}
      </div>

      {/* Sidebar: Community hazard feed */}
      <div style={{ ...styles.glassCard, ...styles.sidebar }}>
        <div style={{ padding: 12, fontWeight: 800, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          {isNavigating ? "Route Hazards" : "Live Hazard Feed"}
        </div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {(isNavigating ? routeHazards : hazards).slice(0, 12).map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{HAZARD_EMOJI[h.type] || "⚠️"}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{h.type}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {isNavigating && h.distanceToRoute !== undefined 
                    ? `${Math.round(h.distanceToRoute)}m from route`
                    : new Date(h.ts).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          {(isNavigating ? routeHazards : hazards).length === 0 && (
            <div style={{ opacity: 0.8 }}>No hazards detected</div>
          )}
        </div>
      </div>

      {/* Stats overlay */}
      <div style={{ ...styles.glassCard, ...styles.stats }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Driving Stats</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
          <div>Speed</div>
          <div style={{ textAlign: "right" }}>{Math.round(speedKmph)} kmph</div>
          <div>Next Hazard</div>
          <div style={{ textAlign: "right" }}>{distanceToNearestHazardM != null ? `${distanceToNearestHazardM} m` : "--"}</div>
          <div>Driving Time</div>
          <div style={{ textAlign: "right" }}>{formatDuration(Date.now() - startDriveTs)}</div>
          <div>Alerts</div>
          <div style={{ textAlign: "right" }}>{alertsCount}</div>
          <div>Safety Score</div>
          <div style={{ textAlign: "right", color: safetyScore > 70 ? "#00ff99" : safetyScore > 40 ? "#ffcc00" : "#ff0066" }}>{safetyScore}</div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ ...styles.glassCard, ...styles.legend }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: "#ff0066", marginRight: 6 }} />
        <span style={{ marginRight: 12, fontSize: 12 }}>High Risk</span>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: "#ffcc00", marginRight: 6 }} />
        <span style={{ fontSize: 12 }}>Medium Risk</span>
      </div>

      {/* Bottom toolbar */}
      <div style={styles.toolbar}>
        <button
          style={{ ...styles.button, boxShadow: "0 0 16px rgba(0,212,255,0.3)", fontSize: "12px", padding: "8px 12px" }}
          onClick={() => {
            addHazard({ lat: position.lat, lng: position.lng, type: randomChoice(HAZARD_TYPES) });
            addAlert({ type: "info", message: "Hazard reported at your location" });
          }}
          title="Report a hazard at your current location"
        >
          Report Hazard
        </button>
        <button
          style={{ ...styles.button, boxShadow: "0 0 16px rgba(255,204,0,0.3)", fontSize: "12px", padding: "8px 12px" }}
          onClick={() => {
            setFocusMode((v) => !v);
            addAlert({ type: "info", message: focusMode ? "Focus mode disabled" : "Focus mode enabled" });
          }}
          title={focusMode ? "Exit focus mode" : "Enter focus mode to hide distractions"}
        >
          {focusMode ? "Exit Focus" : "Focus"}
        </button>
        <button 
          style={{ ...styles.button, fontSize: "12px", padding: "8px 12px" }} 
          onClick={() => {
            setShowStats((s) => !s);
            addAlert({ type: "info", message: showStats ? "Stats hidden" : "Stats displayed" });
          }}
          title={showStats ? "Hide driving statistics" : "Show driving statistics"}
        >
          {showStats ? "Hide Stats" : "Stats"}
        </button>
        <button 
          style={{ ...styles.button, fontSize: "12px", padding: "8px 12px" }} 
          onClick={clearAllAlerts}
          title="Clear all alerts"
        >
          Clear
        </button>
        <button 
          style={{ ...styles.button, fontSize: "12px", padding: "8px 12px" }} 
          onClick={shareLocationWithContacts}
          title="Share your current location"
        >
          Share
        </button>
      </div>

      {/* SOS button */}
      <div style={styles.sosButton} onClick={() => setSosOpen(true)}>
        SOS
      </div>

      {/* SOS modal */}
      {sosOpen && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ ...styles.glassCard, padding: 20, width: 320 }}>
            <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 12 }}>Emergency</div>
            <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 12 }}>
              Location: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button style={styles.button} onClick={simulateCall}>Call 112 (simulate)</button>
              <button style={styles.button} onClick={shareLocationWithContacts}>Share Location</button>
              <button style={styles.button} onClick={() => setSosOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Loading / Error toasts */}
      {loading && (
        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 30, ...styles.glassCard, padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            Initializing map...
          </div>
        </div>
      )}
      {geoError && (
        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 30, ...styles.glassCard, padding: 10, borderLeft: "4px solid #ff0066" }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>⚠️ Map Error</div>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>{geoError}</div>
          <button 
            style={{ marginTop: '8px', padding: '4px 8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', fontSize: '10px', cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Inline CSS for pulsing marker and neon animations */}
      <style>{`
        .user-pulse .pulse-outer {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(0, 212, 255, 0.6);
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.9), 0 0 40px rgba(0, 212, 255, 0.5);
          position: relative;
          transform: translate(-2px, -2px);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .user-pulse .pulse-inner {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #00d4ff;
          box-shadow: 0 0 12px #00d4ff;
          animation: pulse 1.6s ease-in-out infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          70% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(1); opacity: 0; }
        }
        .hazard-icon .hazard-badge {
          width: 28px; height: 28px; border-radius: 14px;
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.25);
          backdrop-filter: blur(6px);
          color: #fff; display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 16px rgba(255,255,255,0.15);
        }
        .hazard-marker .hazard-icon {
          width: 32px; height: 32px; border-radius: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          backdrop-filter: blur(8px);
          color: #fff; display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: bold;
          box-shadow: 0 0 20px rgba(0,0,0,0.5);
        }
        .destination-marker .dest-icon {
          width: 32px; height: 32px; border-radius: 16px;
          background: rgba(0, 212, 255, 0.8);
          border: 2px solid rgba(255,255,255,0.5);
          backdrop-filter: blur(8px);
          color: #fff; display: flex; align-items: center; justify-content: center;
          font-size: 18px; font-weight: bold;
          box-shadow: 0 0 25px rgba(0, 212, 255, 0.8);
          animation: pulse-dest 2s ease-in-out infinite;
        }
        @keyframes pulse-dest {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        #map .leaflet-control-zoom a { width: 44px; height: 44px; line-height: 44px; font-size: 18px; }
        #map .leaflet-control-zoom { border-radius: 12px; overflow: hidden; }
        @media (max-width: 600px) {
          /* Make controls bigger on mobile */
          #map .leaflet-control-zoom a { width: 52px; height: 52px; line-height: 52px; font-size: 20px; }
        }
      `}</style>
    </div>
  );

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${h}h ${m}m ${ss}s`;
  }
}
