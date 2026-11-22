// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DATE_NOTICE, courseDateNotice } from './notice';

describe('courseDateNotice', () => {
  const today = '2026-10-17';

  it('오늘은 모드 안내 그대로', () => {
    expect(courseDateNotice('snapshot', today, today)).toBe(DATE_NOTICE.snapshot);
    expect(courseDateNotice('api', today, today)).toBe(DATE_NOTICE.api);
  });

  it('내일은 날씨가 아직 반영되지 않았다고 한다. snapshot은 날짜 무관 안내를 이어 붙인다', () => {
    expect(courseDateNotice('api', '2026-10-18', today)).toBe('내일 날씨는 아직 반영되지 않았어요');
    expect(courseDateNotice('snapshot', '2026-10-18', today)).toBe(
      '내일 날씨는 아직 반영되지 않았어요 · 공간 점수는 날짜와 무관',
    );
  });

  it('모레 이후는 날짜로 말한다', () => {
    expect(courseDateNotice('api', '2026-10-20', today)).toBe(
      '10월 20일 날씨는 아직 반영되지 않았어요',
    );
  });
});
