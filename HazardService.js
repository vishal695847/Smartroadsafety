// Hazard management service with route filtering capabilities

// Mock hazard data for Mumbai area
const MOCK_HAZARDS = [
  // Accidents
  {
    id: 'acc-1',
    type: 'accident',
    geometry: {
      type: 'Point',
      coordinates: [72.8777, 19.0760] // Mumbai center
    },
    properties: {
      severity: 3,
      description: 'Multi-vehicle collision',
      updatedAt: new Date().toISOString()
    }
  },
  {
    id: 'acc-2',
    type: 'accident',
    geometry: {
      type: 'Point',
      coordinates: [72.8649, 19.0436] // Sion
    },
    properties: {
      severity: 2,
      description: 'Minor fender bender',
      updatedAt: new Date().toISOString()
    }
  },
  
  // Construction sites
  {
    id: 'const-1',
    type: 'construction',
    geometry: {
      type: 'Point',
      coordinates: [72.8795, 19.0656] // Kurla
    },
    properties: {
      severity: 2,
      description: 'Road widening work',
      updatedAt: new Date().toISOString()
    }
  },
  {
    id: 'const-2',
    type: 'construction',
    geometry: {
      type: 'Point',
      coordinates: [72.8697, 19.1176] // Andheri
    },
    properties: {
      severity: 1,
      description: 'Metro construction',
      updatedAt: new Date().toISOString()
    }
  },
  
  // Potholes
  {
    id: 'pot-1',
    type: 'pothole',
    geometry: {
      type: 'Point',
      coordinates: [72.8443, 19.0186] // Dadar
    },
    properties: {
      severity: 2,
      description: 'Large pothole cluster',
      updatedAt: new Date().toISOString()
    }
  },
  {
    id: 'pot-2',
    type: 'pothole',
    geometry: {
      type: 'Point',
      coordinates: [72.8670, 19.0161] // Wadala
    },
    properties: {
      severity: 1,
      description: 'Small potholes',
      updatedAt: new Date().toISOString()
    }
  },
  
  // Portals (toll booths, checkpoints)
  {
    id: 'portal-1',
    type: 'portal',
    geometry: {
      type: 'Point',
      coordinates: [72.9053, 19.1172] // Powai
    },
    properties: {
      severity: 1,
      description: 'Toll plaza',
      updatedAt: new Date().toISOString()
    }
  },
  {
    id: 'portal-2',
    type: 'portal',
    geometry: {
      type: 'Point',
      coordinates: [72.8876, 19.1041] // Saki Naka
    },
    properties: {
      severity: 1,
      description: 'Police checkpoint',
      updatedAt: new Date().toISOString()
    }
  },
  
  // Risk areas (polygons)
  {
    id: 'risk-1',
    type: 'riskArea',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [72.8600, 19.0400], // SW
        [72.8700, 19.0400], // SE
        [72.8700, 19.0500], // NE
        [72.8600, 19.0500], // NW
        [72.8600, 19.0400]  // Close polygon
      ]]
    },
    properties: {
      severity: 3,
      description: 'High accident zone - Sion Circle area',
      updatedAt: new Date().toISOString()
    }
  },
  {
    id: 'risk-2',
    type: 'riskArea',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [72.8750, 19.0600], // SW
        [72.8850, 19.0600], // SE
        [72.8850, 19.0700], // NE
        [72.8750, 19.0700], // NW
        [72.8750, 19.0600]  // Close polygon
      ]]
    },
    properties: {
      severity: 2,
      description: 'Congestion prone area - Kurla Junction',
      updatedAt: new Date().toISOString()
    }
  },
  {
    id: 'risk-3',
    type: 'riskArea',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [72.8650, 19.1100], // SW
        [72.8750, 19.1100], // SE
        [72.8750, 19.1200], // NE
        [72.8650, 19.1200], // NW
        [72.8650, 19.1100]  // Close polygon
      ]]
    },
    properties: {
      severity: 2,
      description: 'Construction zone - Andheri MIDC',
      updatedAt: new Date().toISOString()
    }
  }
];

// Hazard icons and colors
export const HAZARD_CONFIG = {
  accident: {
    icon: '💥',
    color: '#ff0066',
    name: 'Accident',
    priority: 4
  },
  construction: {
    icon: '🚧',
    color: '#ffcc00',
    name: 'Construction',
    priority: 3
  },
  pothole: {
    icon: '🕳️',
    color: '#ff8800',
    name: 'Pothole',
    priority: 2
  },
  portal: {
    icon: '🚓',
    color: '#00d4ff',
    name: 'Portal',
    priority: 1
  },
  riskArea: {
    icon: '⚠️',
    color: '#ff0066',
    name: 'Risk Area',
    priority: 5,
    fillColor: 'rgba(255, 0, 102, 0.2)',
    strokeColor: '#ff0066'
  }
};

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

// Utility: Clamp number between min and max
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Utility: Point to line segment distance
function pointToLineDistance(point, lineStart, lineEnd) {
  const A = point.lat - lineStart.lat;
  const B = point.lng - lineStart.lng;
  const C = lineEnd.lat - lineStart.lat;
  const D = lineEnd.lng - lineStart.lng;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  
  if (lenSq === 0) return haversineDistance(point, lineStart);
  
  let param = dot / lenSq;
  param = Math.max(0, Math.min(1, param));
  
  const xx = lineStart.lat + param * C;
  const yy = lineStart.lng + param * D;
  
  return haversineDistance(point, { lat: xx, lng: yy });
}

class HazardService {
  constructor() {
    this.hazards = [...MOCK_HAZARDS];
    this.listeners = [];
  }

  // Get all hazards
  getAllHazards() {
    return this.hazards;
  }

  // Get hazards by type
  getHazardsByType(type) {
    return this.hazards.filter(h => h.type === type);
  }

  // Add a new hazard with validation
  addHazard(hazard) {
    // Validate hazard data
    if (!hazard.type || !hazard.geometry || !hazard.properties) {
      console.error('Invalid hazard data:', hazard);
      return null;
    }
    
    // Validate coordinates
    if (hazard.geometry.type === 'Point') {
      const [lng, lat] = hazard.geometry.coordinates;
      if (isNaN(lng) || isNaN(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        console.error('Invalid coordinates:', hazard.geometry.coordinates);
        return null;
      }
    }
    
    // Check for duplicates within 100m
    const isDuplicate = this.hazards.some(existing => {
      if (existing.geometry.type === 'Point' && hazard.geometry.type === 'Point') {
        const existingCoords = existing.geometry.coordinates;
        const newCoords = hazard.geometry.coordinates;
        const distance = haversineDistance(
          { lat: existingCoords[1], lng: existingCoords[0] },
          { lat: newCoords[1], lng: newCoords[0] }
        );
        return distance < 100 && existing.type === hazard.type;
      }
      return false;
    });
    
    if (isDuplicate) {
      console.log('Duplicate hazard detected, skipping');
      return null;
    }
    
    const newHazard = {
      id: `${hazard.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...hazard,
      properties: {
        severity: clamp(hazard.properties.severity || 1, 1, 3),
        description: hazard.properties.description || `Reported ${hazard.type}`,
        updatedAt: new Date().toISOString()
      }
    };
    
    this.hazards.push(newHazard);
    this.notifyListeners('hazardAdded', newHazard);
    return newHazard;
  }

  // Remove a hazard
  removeHazard(hazardId) {
    const index = this.hazards.findIndex(h => h.id === hazardId);
    if (index >= 0) {
      const removed = this.hazards.splice(index, 1)[0];
      this.notifyListeners('hazardRemoved', removed);
      return removed;
    }
    return null;
  }

  // Filter hazards by route buffer
  filterHazardsByRoute(route, bufferMeters = 100) {
    if (!route || !route.coordinates || route.coordinates.length < 2) {
      return [];
    }

    const routeCoords = route.coordinates;
    const filteredHazards = [];

    this.hazards.forEach(hazard => {
      if (hazard.geometry.type === 'Point') {
        const hazardPoint = {
          lat: hazard.geometry.coordinates[1],
          lng: hazard.geometry.coordinates[0]
        };
        
        const minDistance = this.getMinDistanceToRoute(hazardPoint, routeCoords);
        if (minDistance <= bufferMeters) {
          filteredHazards.push({
            ...hazard,
            distanceToRoute: minDistance
          });
        }
      } else if (hazard.geometry.type === 'Polygon') {
        // For polygons, check if any part intersects with route buffer
        if (this.polygonIntersectsRouteBuffer(hazard.geometry, routeCoords, bufferMeters)) {
          filteredHazards.push({
            ...hazard,
            distanceToRoute: 0 // Polygon intersects route
          });
        }
      }
    });

    // Sort by priority and distance to route
    return filteredHazards.sort((a, b) => {
      const priorityA = HAZARD_CONFIG[a.type]?.priority || 0;
      const priorityB = HAZARD_CONFIG[b.type]?.priority || 0;
      
      if (priorityA !== priorityB) {
        return priorityB - priorityA; // Higher priority first
      }
      
      return a.distanceToRoute - b.distanceToRoute; // Closer first
    });
  }

  // Get minimum distance from point to route
  getMinDistanceToRoute(point, routeCoords) {
    let minDistance = Infinity;
    
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const distance = pointToLineDistance(point, routeCoords[i], routeCoords[i + 1]);
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance;
  }

  // Check if polygon intersects with route buffer
  polygonIntersectsRouteBuffer(polygonGeometry, routeCoords, bufferMeters) {
    const polygon = polygonGeometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
    
    // Check if any route point is inside polygon
    for (const coord of routeCoords) {
      if (this.pointInPolygon(coord, polygon)) {
        return true;
      }
    }
    
    // Check if any polygon vertex is within buffer of route
    for (const vertex of polygon) {
      const minDistance = this.getMinDistanceToRoute(vertex, routeCoords);
      if (minDistance <= bufferMeters) {
        return true;
      }
    }
    
    return false;
  }

  // Point in polygon test
  pointInPolygon(point, polygon) {
    let inside = false;
    const x = point.lng, y = point.lat;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lng, yi = polygon[i].lat;
      const xj = polygon[j].lng, yj = polygon[j].lat;
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // Get hazards within viewport bounds
  getHazardsInBounds(bounds) {
    const { north, south, east, west } = bounds;
    
    return this.hazards.filter(hazard => {
      if (hazard.geometry.type === 'Point') {
        const [lng, lat] = hazard.geometry.coordinates;
        return lat >= south && lat <= north && lng >= west && lng <= east;
      } else if (hazard.geometry.type === 'Polygon') {
        // Check if any polygon vertex is within bounds
        const coords = hazard.geometry.coordinates[0];
        return coords.some(([lng, lat]) => 
          lat >= south && lat <= north && lng >= west && lng <= east
        );
      }
      return false;
    });
  }

  // Get hazards within radius of user position (for main page - 1km radius)
  getHazardsWithinRadius(userPosition, radiusMeters = 1000) {
    return this.hazards.filter(hazard => {
      if (hazard.geometry.type === 'Point') {
        const hazardPoint = {
          lat: hazard.geometry.coordinates[1],
          lng: hazard.geometry.coordinates[0]
        };
        const distance = haversineDistance(userPosition, hazardPoint);
        return distance <= radiusMeters;
      } else if (hazard.geometry.type === 'Polygon') {
        // For polygons, check if any vertex is within radius
        const coords = hazard.geometry.coordinates[0];
        return coords.some(([lng, lat]) => {
          const distance = haversineDistance(userPosition, { lat, lng });
          return distance <= radiusMeters;
        });
      }
      return false;
    });
  }

  // Get upcoming hazards along route
  getUpcomingHazards(currentPosition, route, lookAheadMeters = 1000) {
    if (!route || !route.coordinates) return [];

    const routeHazards = this.filterHazardsByRoute(route, 50);
    const upcoming = [];

    routeHazards.forEach(hazard => {
      if (hazard.geometry.type === 'Point') {
        const hazardPoint = {
          lat: hazard.geometry.coordinates[1],
          lng: hazard.geometry.coordinates[0]
        };
        
        const distanceFromUser = haversineDistance(currentPosition, hazardPoint);
        if (distanceFromUser <= lookAheadMeters) {
          upcoming.push({
            ...hazard,
            distanceFromUser
          });
        }
      }
    });

    return upcoming.sort((a, b) => a.distanceFromUser - b.distanceFromUser);
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
        console.error('Hazard service listener error:', error);
      }
    });
  }

  // Simulate real-time hazard updates
  startSimulation() {
    // Add random hazards every 45 seconds
    setInterval(() => {
      const types = ['accident', 'construction', 'pothole'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      // Random location around Mumbai
      const lat = 19.0760 + (Math.random() - 0.5) * 0.2;
      const lng = 72.8777 + (Math.random() - 0.5) * 0.2;
      
      this.addHazard({
        type,
        geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        properties: {
          severity: Math.floor(Math.random() * 3) + 1,
          description: `Simulated ${type}`,
          updatedAt: new Date().toISOString()
        }
      });
    }, 45000);

    // Remove old hazards every 5 minutes
    setInterval(() => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      
      this.hazards = this.hazards.filter(hazard => {
        const updatedAt = new Date(hazard.properties.updatedAt);
        return updatedAt > fiveMinutesAgo || hazard.id.startsWith('risk-'); // Keep risk areas
      });
    }, 60000);
  }
}

export default new HazardService();
