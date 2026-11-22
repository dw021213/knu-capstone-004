interface ImportMetaEnv {
  /** 'snapshot'(기본) | 'api' */
  readonly VITE_DATA_MODE?: string;
  /** api 모드에서 부를 백엔드 주소 */
  readonly VITE_API_BASE?: string;
  /** 카카오 지도 JavaScript 키(내 코스 장소 검색). 없으면 내장 목록에서만 찾는다 */
  readonly VITE_KAKAO_MAP_JS_KEY?: string;
}
