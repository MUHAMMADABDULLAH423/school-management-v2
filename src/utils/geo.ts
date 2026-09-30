/**
 * Geolocation helpers for location-verified attendance.
 */

/** Haversine distance in metres between two lat/lng points. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Promise wrapper around navigator.geolocation.getCurrentPosition. */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported on this device or browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

/** Human-friendly message for a geolocation failure. */
export function geoErrorMessage(err: unknown): string {
  const code = (err as GeolocationPositionError)?.code;
  if (code === 1)
    return 'Location permission denied. Please allow location access for this site in your browser settings and try again.';
  if (code === 2)
    return 'Location unavailable. Make sure GPS / location services are turned on and try again.';
  if (code === 3) return 'Location request timed out. Please try again.';
  const msg = (err as Error)?.message;
  return msg || 'Could not get your location. Please try again.';
}

/** True when the school profile has a usable GPS fence configured. */
export function hasGpsFence(gps?: { lat: number; lng: number; radius: number } | null): boolean {
  return !!gps && Number(gps.lat) !== 0 && Number(gps.lng) !== 0;
}
