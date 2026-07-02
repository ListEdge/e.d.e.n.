/**
 * Home automation provider contract.
 * Home Assistant is the first implementation target; Matter, Apple Home,
 * Google Home and Alexa slot in behind this same interface later.
 */
export interface HomeProvider {
  readonly id: string;
  available(): boolean;
  listDevices(): Promise<Array<{ id: string; name: string; kind: string }>>;
  setState(deviceId: string, state: Record<string, unknown>): Promise<void>;
}
