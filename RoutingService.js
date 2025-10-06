// Routing service with safety-optimized pathfinding
// Uses OpenRouteService API for routing with custom safety scoring

const ORS_API_KEY = '5b3ce3597851110001cf6248a707b8b9b6b14b9bb2a3b8a3c8f8d8c8'; // Free tier key
const ORS_BASE_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

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

// Utility: Check if point is inside polygon
function pointInPolygon(point, polygon) {
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

// Safety scoring configuration
const SAFETY_WEIGHTS = {
  riskArea: 50,      // High penalty for risk areas
  accident: 30,      // High penalty for accidents
  construction: 20,  // Medium penalty for construction
  pothole: 10,       // Lower penalty for potholes
  portal: 5,         // Minimal penalty for portals
};

const HAZARD_BUFFER_METERS = 100; // Consider hazards within 100m of route

class RoutingService {
  constructor() {
    this.cachedRoutes = new Map();
  }

  // Get multiple route options from ORS
  async getRouteOptions(start, end, alternatives = 3) {
    const cacheKey = `${start.lat},${start.lng}-${end.lat},${end.lng}`;
    
    if (this.cachedRoutes.has(cacheKey)) {
      return this.cachedRoutes.get(cacheKey);
    }

    try {
      const response = await fetch(ORS_BASE_URL, {
        method: 'POST',
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: [[start.lng, start.lat], [end.lng, end.lat]],
          alternative_routes: {
            target_count: alternatives,
            weight_factor: 1.4,
            share_factor: 0.6
          },
          format: 'geojson',
          instructions: true,
          geometry_simplify: false
        })
      });

      if (!response.ok) {
        throw new Error(`ORS API error: ${response.status}`);
      }

      const data = await response.json();
      const routes = this.parseORSResponse(data);
      
      // If API returned no usable routes, provide a fallback so UI can render
      const ensuredRoutes = (routes && routes.length > 0) ? routes : [this.createFallbackRoute(start, end)];
      this.cachedRoutes.set(cacheKey, ensuredRoutes);
      return ensuredRoutes;
    } catch (error) {
      console.error('Routing error:', error);
      // Fallback: simple straight line route
      return [this.createFallbackRoute(start, end)];
    }
  }

  // Parse ORS response into our route format
  parseORSResponse(data) {
    if (!data || !data.features || data.features.length === 0) {
      return [];
    }

    return data.features.map((feature, index) => {
      const coords = feature.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
      const props = feature.properties;
      
      return {
        id: `route-${index}`,
        coordinates: coords,
        distance: props.segments?.[0]?.distance || 0,
        duration: props.segments?.[0]?.duration || 0,
        instructions: props.segments?.[0]?.steps || [],
        safetyScore: 0, // Will be calculated separately
      };
    });
  }

  // Create fallback route (straight line with waypoints)
  createFallbackRoute(start, end) {
    const distance = haversineDistance(start, end);
    const bearing = this.calculateBearing(start, end);
    
    // Create waypoints every ~1km for better routing
    const waypoints = [start];
    const numWaypoints = Math.max(2, Math.floor(distance / 1000));
    
    for (let i = 1; i < numWaypoints; i++) {
      const fraction = i / numWaypoints;
      const waypoint = this.interpolatePoint(start, end, fraction);
      waypoints.push(waypoint);
    }
    waypoints.push(end);

    return {
      id: 'fallback-route',
      coordinates: waypoints,
      distance,
      duration: distance / 13.89, // ~50 kmph average
      instructions: [
        {
          instruction: `Head ${this.bearingToDirection(bearing)} toward destination`,
          distance,
          duration: distance / 13.89
        }
      ],
      safetyScore: 0,
    };
  }

  // Calculate safety score for a route based on hazards
  calculateSafetyScore(route, hazards) {
    let totalPenalty = 0;
    const routeCoords = route.coordinates;

    hazards.forEach(hazard => {
      if (hazard.type === 'riskArea' && hazard.geometry.type === 'Polygon') {
        // Check polygon intersection with route
        const polygon = hazard.geometry.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
        
        for (let i = 0; i < routeCoords.length - 1; i++) {
          const segmentStart = routeCoords[i];
          const segmentEnd = routeCoords[i + 1];
          
          // Check if route segment intersects or passes near polygon
          if (this.routeIntersectsPolygon(segmentStart, segmentEnd, polygon)) {
            totalPenalty += SAFETY_WEIGHTS.riskArea;
          }
        }
      } else if (hazard.geometry.type === 'Point') {
        // Check point hazards within buffer of route
        const hazardPoint = {
          lat: hazard.geometry.coordinates[1],
          lng: hazard.geometry.coordinates[0]
        };
        
        const minDistance = this.getMinDistanceToRoute(hazardPoint, routeCoords);
        if (minDistance <= HAZARD_BUFFER_METERS) {
          const weight = SAFETY_WEIGHTS[hazard.type] || 5;
          // Closer hazards have higher penalty
          const proximityMultiplier = 1 - (minDistance / HAZARD_BUFFER_METERS);
          totalPenalty += weight * proximityMultiplier;
        }
      }
    });

    return totalPenalty;
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

  // Check if route segment intersects polygon
  routeIntersectsPolygon(segmentStart, segmentEnd, polygon) {
    // Simple check: if either endpoint is inside polygon or if segment crosses polygon boundary
    if (pointInPolygon(segmentStart, polygon) || pointInPolygon(segmentEnd, polygon)) {
      return true;
    }
    
    // Check if segment intersects any polygon edge (simplified)
    for (let i = 0; i < polygon.length; i++) {
      const polyStart = polygon[i];
      const polyEnd = polygon[(i + 1) % polygon.length];
      
      if (this.lineSegmentsIntersect(segmentStart, segmentEnd, polyStart, polyEnd)) {
        return true;
      }
    }
    
    return false;
  }

  // Check if two line segments intersect
  lineSegmentsIntersect(p1, q1, p2, q2) {
    const orientation = (p, q, r) => {
      const val = (q.lng - p.lng) * (r.lat - q.lat) - (q.lat - p.lat) * (r.lng - q.lng);
      if (val === 0) return 0;
      return val > 0 ? 1 : 2;
    };
    
    const onSegment = (p, q, r) => {
      return q.lng <= Math.max(p.lng, r.lng) && q.lng >= Math.min(p.lng, r.lng) &&
             q.lat <= Math.max(p.lat, r.lat) && q.lat >= Math.min(p.lat, r.lat);
    };
    
    const o1 = orientation(p1, q1, p2);
    const o2 = orientation(p1, q1, q2);
    const o3 = orientation(p2, q2, p1);
    const o4 = orientation(p2, q2, q1);
    
    if (o1 !== o2 && o3 !== o4) return true;
    
    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;
    
    return false;
  }

  // Find the best route (safety first, then distance)
  async getBestRoute(start, end, hazards = []) {
    const routes = await this.getRouteOptions(start, end);
    // Always have at least one route from getRouteOptions (fallback guaranteed)

    // Calculate safety scores for all routes
    routes.forEach(route => {
      route.safetyScore = this.calculateSafetyScore(route, hazards);
    });

    // Sort by safety score (lower is better), then by distance
    routes.sort((a, b) => {
      if (Math.abs(a.safetyScore - b.safetyScore) < 5) {
        // If safety scores are similar, prefer shorter route
        return a.distance - b.distance;
      }
      return a.safetyScore - b.safetyScore;
    });

    return routes[0];
  }

  // Utility functions
  calculateBearing(start, end) {
    const dLng = (end.lng - start.lng) * Math.PI / 180;
    const lat1 = start.lat * Math.PI / 180;
    const lat2 = end.lat * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  bearingToDirection(bearing) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

  interpolatePoint(start, end, fraction) {
    return {
      lat: start.lat + (end.lat - start.lat) * fraction,
      lng: start.lng + (end.lng - start.lng) * fraction
    };
  }

  // Clear cache
  clearCache() {
    this.cachedRoutes.clear();
  }
}

export default new RoutingService();
