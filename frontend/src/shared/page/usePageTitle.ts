import { useEffect } from 'react';

export const SITE_NAME = '제주 안전지도';

/** 문서 제목: 홈은 서비스 이름, 다른 화면은 '화면 이름 · 서비스 이름' */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
  }, [title]);
}
