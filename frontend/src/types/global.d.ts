export {};
declare global {
  interface Window {
    __mapReady?: boolean;
    __mapDebug?: { project(lng: number, lat: number): [number, number]; zoom(): number };
  }
}
