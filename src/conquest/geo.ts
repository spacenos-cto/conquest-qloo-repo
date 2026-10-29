/**
 * US metros the game knows: coordinates, state and time zone. Mirrors the
 * METROS / STATE tables in public/app.js so the server can plan routes and
 * write calendar entries in local time.
 */
export type Metro = { lat: number; lon: number; state: string; tz: string };

export const METROS: Record<string, Metro> = {
  "Seattle": { lat: 47.6, lon: -122.3, state: "WA", tz: "America/Los_Angeles" },
  "Portland": { lat: 45.5, lon: -122.7, state: "OR", tz: "America/Los_Angeles" },
  "San Francisco": { lat: 37.8, lon: -122.4, state: "CA", tz: "America/Los_Angeles" },
  "Los Angeles": { lat: 34.1, lon: -118.2, state: "CA", tz: "America/Los_Angeles" },
  "Las Vegas": { lat: 36.2, lon: -115.1, state: "NV", tz: "America/Los_Angeles" },
  "Phoenix": { lat: 33.4, lon: -112.1, state: "AZ", tz: "America/Phoenix" },
  "Salt Lake City": { lat: 40.8, lon: -111.9, state: "UT", tz: "America/Denver" },
  "Denver": { lat: 39.7, lon: -104.9, state: "CO", tz: "America/Denver" },
  "Dallas": { lat: 32.8, lon: -96.8, state: "TX", tz: "America/Chicago" },
  "Houston": { lat: 29.8, lon: -95.4, state: "TX", tz: "America/Chicago" },
  "San Antonio": { lat: 29.4, lon: -98.5, state: "TX", tz: "America/Chicago" },
  "Kansas City": { lat: 39.1, lon: -94.6, state: "MO", tz: "America/Chicago" },
  "Minneapolis": { lat: 45, lon: -93.3, state: "MN", tz: "America/Chicago" },
  "St. Louis": { lat: 38.6, lon: -90.2, state: "MO", tz: "America/Chicago" },
  "Memphis": { lat: 35.1, lon: -90, state: "TN", tz: "America/Chicago" },
  "New Orleans": { lat: 30, lon: -90.1, state: "LA", tz: "America/Chicago" },
  "Chicago": { lat: 41.9, lon: -87.6, state: "IL", tz: "America/Chicago" },
  "Detroit": { lat: 42.3, lon: -83, state: "MI", tz: "America/New_York" },
  "Nashville": { lat: 36.2, lon: -86.8, state: "TN", tz: "America/Chicago" },
  "Atlanta": { lat: 33.7, lon: -84.4, state: "GA", tz: "America/New_York" },
  "Charlotte": { lat: 35.2, lon: -80.8, state: "NC", tz: "America/New_York" },
  "Raleigh": { lat: 35.8, lon: -78.6, state: "NC", tz: "America/New_York" },
  "Miami": { lat: 25.8, lon: -80.2, state: "FL", tz: "America/New_York" },
  "Orlando": { lat: 28.5, lon: -81.4, state: "FL", tz: "America/New_York" },
  "Cleveland": { lat: 41.5, lon: -81.7, state: "OH", tz: "America/New_York" },
  "Washington": { lat: 38.9, lon: -77, state: "DC", tz: "America/New_York" },
  "Baltimore": { lat: 39.3, lon: -76.6, state: "MD", tz: "America/New_York" },
  "Philadelphia": { lat: 40, lon: -75.2, state: "PA", tz: "America/New_York" },
  "New York": { lat: 40.7, lon: -74, state: "NY", tz: "America/New_York" },
  "Boston": { lat: 42.4, lon: -71.1, state: "MA", tz: "America/New_York" },
  // the planner also knows these (not on the game map yet), so it can start anywhere in the top 40
  "Austin": { lat: 30.27, lon: -97.74, state: "TX", tz: "America/Chicago" },
  "San Diego": { lat: 32.72, lon: -117.16, state: "CA", tz: "America/Los_Angeles" },
  "Sacramento": { lat: 38.58, lon: -121.49, state: "CA", tz: "America/Los_Angeles" },
  "Indianapolis": { lat: 39.77, lon: -86.16, state: "IN", tz: "America/Indiana/Indianapolis" },
  "Columbus": { lat: 39.96, lon: -83, state: "OH", tz: "America/New_York" },
  "Pittsburgh": { lat: 40.44, lon: -80, state: "PA", tz: "America/New_York" },
  "Tampa": { lat: 27.95, lon: -82.46, state: "FL", tz: "America/New_York" },
  "Milwaukee": { lat: 43.04, lon: -87.91, state: "WI", tz: "America/Chicago" },
  "Cincinnati": { lat: 39.1, lon: -84.51, state: "OH", tz: "America/New_York" },
  "Oklahoma City": { lat: 35.47, lon: -97.52, state: "OK", tz: "America/Chicago" },
};

/** Great-circle distance in miles. */
export function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (d: number) => (d * Math.PI) / 180, R = 3958.8;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Driving hours at 55 mph over the straight-line distance (a deliberate, stated simplification). */
export const driveHours = (a: Metro, b: Metro) => miles(a, b) / 55;
