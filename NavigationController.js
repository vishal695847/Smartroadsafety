// Navigation controller for live tracking and re-routing

import RoutingService from './RoutingService.js';
import HazardService from './HazardService.js';

// Utility: Haversine distance in meters
function haversineDistance(a, b) {
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

// Utility: Calculate bearing between two points
function calculateBearing(start, end) {
  const dLng = (end.lng - start.lng) * Math.PI / 180;
  const lat1 = start.lat * Math.PI / 180;
  const lat2 = end.lat * Math.PI / 180;
  
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Utility: Find closest point on route to current position
function findClosestPointOnRoute(position, routeCoords) {
  let minDistance = Infinity;
  let closestIndex = 0;
  let closestPoint = routeCoords[0];
  
  for (let i = 0; i < routeCoords.length; i++) {
    const distance = haversineDistance(position, routeCoords[i]);
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
      closestPoint = routeCoords[i];
    }
  }
  
  return { point: closestPoint, index: closestIndex, distance: minDistance };
}

class NavigationController {
  constructor() {
    this.isNavigating = false;
    this.currentRoute = null;
    this.destination = null;
    this.currentPosition = null;
    this.watchId = null;
    this.listeners = [];
    this.navigationStats = {
      distanceRemaining: 0,
      timeRemaining: 0,
      nextTurn: null,
      upcomingHazards: []
    };
    
    // Navigation settings
    this.settings = {
      routeDeviationThreshold: 100, // meters
      rerouteDelay: 5000, // ms
      positionUpdateInterval: 2000, // ms
      hazardLookAhead: 1000, // meters
      autoRecenter: true
    };
    
    this.lastRerouteTime = 0;
    this.isRerouting = false;
  }

  // Start navigation
  async startNavigation(destination, currentPosition) {
    if (this.isNavigating) {
      this.stopNavigation();
    }

    this.destination = destination;
    this.currentPosition = currentPosition;
    this.isNavigating = true;
    this.isRerouting = false;

    try {
      // Get initial route
      const hazards = HazardService.getAllHazards();
      const route = await RoutingService.getBestRoute(currentPosition, destination, hazards);
      
      if (!route) {
        throw new Error('Could not calculate route');
      }

      this.currentRoute = route;
      this.updateNavigationStats();
      
      // Start position tracking
      this.startPositionTracking();
      
      // Notify listeners
      this.notifyListeners('navigationStarted', {
        route: this.currentRoute,
        destination: this.destination
      });

      return this.currentRoute;
    } catch (error) {
      this.isNavigating = false;
      throw error;
    }
  }

  // Stop navigation
  stopNavigation() {
    this.isNavigating = false;
    this.currentRoute = null;
    this.destination = null;
    
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    
    this.notifyListeners('navigationStopped');
  }

  // Start position tracking
  startPositionTracking() {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      return;
    }

    try {
      this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.handlePositionUpdate({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        console.error('Position tracking error:', error);
        this.notifyListeners('positionError', error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
      );
    } catch (e) {
      console.error('Failed to start geolocation watch:', e);
      this.notifyListeners('positionError', e);
    }
  }

  // Handle position updates
  async handlePositionUpdate(newPosition) {
    if (!this.isNavigating || !this.currentRoute) {
      return;
    }

    const previousPosition = this.currentPosition;
    this.currentPosition = newPosition;

    // Check if user has deviated from route
    const closest = findClosestPointOnRoute(newPosition, this.currentRoute.coordinates);
    const isOffRoute = closest.distance > this.settings.routeDeviationThreshold;

    if (isOffRoute && !this.isRerouting) {
      await this.handleRouteDeviation();
    }

    // Update navigation stats
    this.updateNavigationStats();

    // Check if destination reached
    const distanceToDestination = haversineDistance(newPosition, this.destination);
    if (distanceToDestination < 50) { // 50 meters threshold
      this.handleDestinationReached();
      return;
    }

    // Notify listeners of position update
    this.notifyListeners('positionUpdated', {
      position: newPosition,
      previousPosition,
      isOffRoute,
      stats: this.navigationStats
    });
  }

  // Handle route deviation
  async handleRouteDeviation() {
    const now = Date.now();
    if (now - this.lastRerouteTime < this.settings.rerouteDelay) {
      return; // Too soon to reroute
    }

    this.isRerouting = true;
    this.lastRerouteTime = now;

    try {
      this.notifyListeners('rerouting');
      
      const hazards = HazardService.getAllHazards();
      const newRoute = await RoutingService.getBestRoute(
        this.currentPosition, 
        this.destination, 
        hazards
      );

      if (newRoute) {
        this.currentRoute = newRoute;
        this.updateNavigationStats();
        
        this.notifyListeners('routeUpdated', {
          route: this.currentRoute,
          reason: 'deviation'
        });
      }
    } catch (error) {
      console.error('Rerouting failed:', error);
      this.notifyListeners('rerouteError', error);
    } finally {
      this.isRerouting = false;
    }
  }

  // Handle destination reached
  handleDestinationReached() {
    this.notifyListeners('destinationReached', {
      destination: this.destination,
      finalPosition: this.currentPosition
    });
    
    this.stopNavigation();
  }

  // Update navigation statistics
  updateNavigationStats() {
    if (!this.currentRoute || !this.currentPosition) {
      return;
    }

    const routeCoords = this.currentRoute.coordinates;
    const closest = findClosestPointOnRoute(this.currentPosition, routeCoords);
    
    // Calculate remaining distance
    let remainingDistance = 0;
    for (let i = closest.index; i < routeCoords.length - 1; i++) {
      remainingDistance += haversineDistance(routeCoords[i], routeCoords[i + 1]);
    }
    
    // Add distance from current position to closest point on route
    remainingDistance += closest.distance;

    // Estimate remaining time (assuming average speed of 30 kmph in city)
    const averageSpeedMs = 8.33; // 30 kmph = 8.33 m/s
    const remainingTime = remainingDistance / averageSpeedMs;

    // Find next turn instruction
    const nextTurn = this.findNextTurn(closest.index);

    // Get upcoming hazards
    const upcomingHazards = HazardService.getUpcomingHazards(
      this.currentPosition,
      this.currentRoute,
      this.settings.hazardLookAhead
    );

    this.navigationStats = {
      distanceRemaining: Math.round(remainingDistance),
      timeRemaining: Math.round(remainingTime),
      nextTurn,
      upcomingHazards,
      routeProgress: Math.max(0, Math.min(1, 1 - (remainingDistance / this.currentRoute.distance)))
    };
  }

  // Find next turn instruction
  findNextTurn(currentIndex) {
    if (!this.currentRoute.instructions || currentIndex >= this.currentRoute.instructions.length) {
      return null;
    }

    // Find the next instruction that's ahead of current position
    for (let i = 0; i < this.currentRoute.instructions.length; i++) {
      const instruction = this.currentRoute.instructions[i];
      if (instruction.distance > 0) {
        return {
          instruction: instruction.instruction || 'Continue straight',
          distance: Math.round(instruction.distance),
          type: instruction.type || 'straight'
        };
      }
    }

    return null;
  }

  // Get current navigation state
  getNavigationState() {
    return {
      isNavigating: this.isNavigating,
      isRerouting: this.isRerouting,
      currentRoute: this.currentRoute,
      destination: this.destination,
      currentPosition: this.currentPosition,
      stats: this.navigationStats
    };
  }

  // Get route-filtered hazards
  getRouteHazards(bufferMeters = 100) {
    if (!this.currentRoute) {
      return [];
    }
    
    return HazardService.filterHazardsByRoute(this.currentRoute, bufferMeters);
  }

  // Force reroute
  async forceReroute() {
    if (!this.isNavigating || !this.currentPosition || !this.destination) {
      return null;
    }

    this.isRerouting = true;
    
    try {
      const hazards = HazardService.getAllHazards();
      const newRoute = await RoutingService.getBestRoute(
        this.currentPosition,
        this.destination,
        hazards
      );

      if (newRoute) {
        this.currentRoute = newRoute;
        this.updateNavigationStats();
        
        this.notifyListeners('routeUpdated', {
          route: this.currentRoute,
          reason: 'manual'
        });
      }

      return newRoute;
    } catch (error) {
      console.error('Force reroute failed:', error);
      throw error;
    } finally {
      this.isRerouting = false;
    }
  }

  // Event listener management
  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    const index = this.listeners.indexOf(callback);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Navigation listener error:', error);
      }
    });
  }

  // Update settings
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  // Get current settings
  getSettings() {
    return { ...this.settings };
  }
}

export default new NavigationController();
