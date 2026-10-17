interface ImportMetaEnv {
  /** 'snapshot'(기본) | 'api' */
  readonly VITE_DATA_MODE?: string;
  /** api 모드에서 부를 백엔드 주소 */
  readonly VITE_API_BASE?: string;
}
