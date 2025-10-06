import React, { useEffect, useMemo, useRef, useState } from "react";

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

// Weather simulation states
const WEATHER_STATES = [
  { status: "Clear", visibilityM: 4000, recommendedLimit: 60 },
  { status: "Fog", visibilityM: 400, recommendedLimit: 30 },
  { status: "Rain", visibilityM: 1500, recommendedLimit: 40 },
];

// Speed limits by context
function getDynamicSpeedLimit({ inHighRisk, inMedRisk, weather }) {
  const base = inHighRisk ? 30 : inMedRisk ? 40 : 60; // city vs highway
  // weather based reduction: take min with recommended
  const weatherLimit = weather?.recommendedLimit ?? 60;
  return Math.min(base, weatherLimit);
}

// Simple RNG helpers
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export default function SmartRoadSafety() {
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
  const [activeUsers, setActiveUsers] = useState(47 + Math.floor(Math.random() * 30));
  const [speedLimit, setSpeedLimit] = useState(60);
  const [distanceToNearestHazardM, setDistanceToNearestHazardM] = useState(null);
  const [sosOpen, setSosOpen] = useState(false);

  // Inject Leaflet CDN once
  useEffect(() => {
    const ensureLeaflet = async () => {
      if (leafletLoadedRef.current) return true;
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = LEAFLET_CSS;
      document.head.appendChild(css);

      // Wait for CSS to load (best-effort)
      await new Promise((res) => setTimeout(res, 50));

      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = LEAFLET_JS;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = reject;
        document.body.appendChild(s);
      });
      leafletLoadedRef.current = true;
      return true;
    };

    ensureLeaflet()
      .then(() => initMap())
      .catch(() => setGeoError("Failed to load map library"));

    return () => {
      // Cleanup geolocation
      try {
        if (watchIdRef.current != null && navigator.geolocation) {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      } catch {}
      // Cleanup device motion
      window.removeEventListener("devicemotion", onDeviceMotion);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize map and layers
  function initMap() {
    try {
      // eslint-disable-next-line no-undef
      const L = window.L;
      if (!mapContainerRef.current || !L) return;
      const darkTiles = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { attribution: "©OpenStreetMap, ©Carto" }
      );
      const map = L.map(mapContainerRef.current, {
        center: [MUMBAI_CENTER.lat, MUMBAI_CENTER.lng],
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
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

      // Danger zones
      dangerLayersRef.current = BLACKSPOTS.map((spot) => {
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
      });

      // Event handlers for long-press hazard report
      const startLongPress = (e) => {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
          const latlng = e.latlng || map.getCenter();
          addHazard({ lat: latlng.lat, lng: latlng.lng, type: randomChoice(HAZARD_TYPES) });
          addAlert({ type: "info", message: "Hazard reported via long-press" });
        }, 700);
      };
      const cancelLongPress = () => clearTimeout(longPressTimerRef.current);
      map.on("mousedown", startLongPress);
      map.on("mouseup", cancelLongPress);
      map.on("touchstart", startLongPress);
      map.on("touchend", cancelLongPress);

      // GPS tracking
      startGeolocation();

      // Periodic simulations
      startSimulations();

      // Shake detection
      window.addEventListener("devicemotion", onDeviceMotion);

      setLoading(false);
    } catch (e) {
      setGeoError("Failed to initialize map");
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

          // Speed calculation: prefer device speed
          let speedMS = coords.speed != null && !Number.isNaN(coords.speed) ? coords.speed : null;
          if (speedMS == null && lastPosRef.current) {
            const dt = (pos.timestamp - lastPosRef.current.ts) / 1000;
            if (dt > 0) {
              const d = haversineDistanceMeters(lastPosRef.current.p, next);
              speedMS = d / dt;
            }
          }
          lastPosRef.current = { p: next, ts: pos.timestamp };
          const kmph = clamp(Math.round(((speedMS || 0) * 3.6) * 10) / 10, 0, 240);
          setSpeedKmph(kmph);

          // Update speed limit based on zones and weather
          const inHigh = isInsideRiskZone(next, "high");
          const inMed = isInsideRiskZone(next, "medium");
          const limit = getDynamicSpeedLimit({ inHighRisk: inHigh, inMedRisk: inMed, weather });
          setSpeedLimit(limit);

          // Warnings
          if (kmph > limit + 10) {
            addAlert({ type: "speed", message: `Overspeeding! Limit ${limit} kmph` });
            screenFlash();
            playBeep({ frequency: 880, durationMs: 200, volume: 0.07 });
            setSafetyScore((s) => clamp(s - 1, 0, 100));
          } else if (kmph > limit) {
            addAlert({ type: "speed", message: `Over limit by ${Math.round(kmph - limit)} kmph` });
          }

          // Approaching danger zone alert within 500m
          const nearestBlackspot = nearestPoint(next, BLACKSPOTS.map((b) => ({ lat: b.lat, lng: b.lng, name: b.name })));
          if (nearestBlackspot && nearestBlackspot.distanceM <= 500) {
            addAlert({ type: "danger", message: `Approaching ${nearestBlackspot.point.name} (${Math.round(nearestBlackspot.distanceM)}m)` });
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

  // Simulations: hazards, weather, active users
  function startSimulations() {
    // Random hazard every 30s
    setInterval(() => {
      const base = mapRef.current?.getCenter();
      const lat = (base?.lat ?? MUMBAI_CENTER.lat) + (Math.random() - 0.5) * 0.02;
      const lng = (base?.lng ?? MUMBAI_CENTER.lng) + (Math.random() - 0.5) * 0.02;
      const type = randomChoice(HAZARD_TYPES);
      addHazard({ lat, lng, type });
      addAlert({ type: "info", message: `Community reported: ${type}` });
    }, 30000);

    // Weather every 2 minutes
    setInterval(() => {
      const next = randomChoice(WEATHER_STATES);
      setWeather(next);
      setVisibilityM(next.visibilityM);
      addAlert({ type: "weather", message: `Weather update: ${next.status}` });
    }, 120000);

    // Active users ebb/flow
    setInterval(() => setActiveUsers((u) => clamp(u + Math.round((Math.random() - 0.5) * 6), 10, 500)), 10000);

    // Night mode after 7PM local
    const hour = new Date().getHours();
    setNightMode(hour >= 19 || hour < 6);

    // Break reminders every 2 hours
    setInterval(() => {
      addAlert({ type: "fatigue", message: "2 hours driving. Consider a break." });
      playBeep({ frequency: 440, durationMs: 600, volume: 0.06 });
    }, 2 * 60 * 60 * 1000);
  }

  // Fog zones management based on weather
  useEffect(() => {
    // eslint-disable-next-line no-undef
    const L = window.L;
    if (!mapRef.current || !L) return;

    // Clear existing fog layers
    try {
      fogLayersRef.current.forEach((c) => c.remove());
    } catch {}
    fogLayersRef.current = [];

    if (weather.status === "Fog") {
      // Select a few spots to mark as fog zones
      const spots = BLACKSPOTS.slice(0);
      // pick 4 unique indices
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
        circle.bindPopup(`<b>Fog Zone</b><br/>Reduced visibility`);
        fogLayersRef.current.push(circle);
      });
    }
  }, [weather, position]);

  // Alerts management
  function addAlert({ type, message }) {
    const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setAlerts((arr) => [{ id, type, message, ts: Date.now() }, ...arr].slice(0, 6));
    setAlertsCount((c) => c + 1);
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

  // Hazards management
  function addHazard({ lat, lng, type }) {
    const id = `hz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const h = { id, lat, lng, type, ts: Date.now() };
    setHazards((list) => [h, ...list].slice(0, 50));
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
      marker.bindPopup(`<b>${type}</b><br/>${new Date(h.ts).toLocaleTimeString()}`);
      hazardMarkersRef.current.push({ id, marker });
      updateNearestHazardDistance(position);
    } catch {}
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

  // SOS actions
  function shareLocationWithContacts() {
    const coordsText = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
    const msg = `SOS! I need help. My location: ${coordsText}`;
    try {
      if (navigator.share) {
        navigator.share({ title: "SOS", text: msg });
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(msg);
        addAlert({ type: "info", message: "Location copied to clipboard" });
      } else {
        window.prompt("Copy this location:", msg);
      }
    } catch {}
  }

  function simulateCall() {
    addAlert({ type: "sos", message: "Dialing emergency services..." });
    playBeep({ frequency: 350, durationMs: 700, volume: 0.09 });
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
    speedPanel: {
      position: "absolute",
      top: 12,
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
      top: 12,
      zIndex: 6,
      display: uiHidden ? "none" : "flex",
      flexDirection: "column",
      gap: 8,
      maxHeight: "55vh",
      overflowY: "auto",
    },
    alertCard: (type) => ({
      padding: 12,
      minWidth: 220,
      borderLeft: `4px solid ${type === "speed" ? "#ff0066" : type === "danger" ? "#ffcc00" : type === "weather" ? "#00d4ff" : type === "fatigue" ? "#ffcc00" : "#00d4ff"}`,
      boxShadow: `0 0 16px ${type === "speed" ? "rgba(255,0,102,0.5)" : type === "danger" ? "rgba(255,204,0,0.5)" : type === "weather" ? "rgba(0,212,255,0.5)" : type === "fatigue" ? "rgba(255,204,0,0.5)" : "rgba(0,212,255,0.5)"}`,
    }),
    sosButton: {
      position: "absolute",
      left: "50%",
      transform: "translateX(-50%)",
      bottom: 24,
      zIndex: 6,
      width: 120,
      height: 120,
      background: "radial-gradient(circle, #ff3355, #ff0066)",
      borderRadius: 60,
      border: "2px solid rgba(255,255,255,0.3)",
      boxShadow: "0 0 30px rgba(255,0,102,0.8), 0 0 60px rgba(255,0,102,0.5)",
      color: "white",
      fontWeight: 900,
      fontSize: 28,
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
      right: 12,
      display: uiHidden ? "none" : "flex",
      gap: 12,
      zIndex: 6,
      justifyContent: "space-between",
      alignItems: "center",
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
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 5,
      padding: "8px 14px",
      display: uiHidden ? "none" : "flex",
      gap: 14,
      alignItems: "center",
    },
    sidebar: {
      position: "absolute",
      right: 12,
      bottom: 160,
      width: 260,
      maxHeight: 280,
      overflowY: "auto",
      zIndex: 5,
      display: uiHidden ? "none" : "block",
    },
    stats: {
      position: "absolute",
      left: "50%",
      bottom: 160,
      transform: "translateX(-50%)",
      zIndex: 6,
      padding: 12,
      minWidth: 250,
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

      {/* Weather bar */}
      <div style={{ ...styles.glassCard, ...styles.weatherBar }}>
        <span style={{ fontWeight: 700 }}>{weather.status}</span>
        <span style={{ opacity: 0.9 }}>Visibility: {Math.round(visibilityM)} m</span>
        <span style={{ opacity: 0.9 }}>Rec. Limit: {weather.recommendedLimit} kmph</span>
        <span style={{ opacity: 0.9 }}>Users: {activeUsers}</span>
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
        <div style={{ padding: 12, fontWeight: 800, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>Live Hazard Feed</div>
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {hazards.slice(0, 12).map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{HAZARD_EMOJI[h.type] || "⚠️"}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{h.type}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{new Date(h.ts).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
          {hazards.length === 0 && <div style={{ opacity: 0.8 }}>No reports yet</div>}
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
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={{ ...styles.button, boxShadow: "0 0 16px rgba(0,212,255,0.3)" }}
            onClick={() => {
              addHazard({ lat: position.lat, lng: position.lng, type: randomChoice(HAZARD_TYPES) });
              addAlert({ type: "info", message: "Hazard reported at your location" });
            }}
          >
            Report Hazard
          </button>
          <button
            style={{ ...styles.button, boxShadow: "0 0 16px rgba(255,204,0,0.3)" }}
            onClick={() => setFocusMode((v) => !v)}
          >
            {focusMode ? "Exit Focus" : "Focus Mode"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...styles.button }} onClick={() => setShowStats((s) => !s)}>
            {showStats ? "Hide Stats" : "Show Stats"}
          </button>
          <button style={{ ...styles.button }} onClick={shareLocationWithContacts}>
            Share Location
          </button>
        </div>
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
          Initializing map...
        </div>
      )}
      {geoError && (
        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 30, ...styles.glassCard, padding: 10, borderLeft: "4px solid #ff0066" }}>
          {geoError}
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


