/** Maps provider contract — geocoding, routing, travel times. */
export interface MapsProvider {
  readonly id: string;
  available(): boolean;
  geocode(query: string): Promise<{ lat: number; lng: number; label: string } | null>;
  travelTime(from: string, to: string, mode: "driving" | "walking"): Promise<number | null>;
}
