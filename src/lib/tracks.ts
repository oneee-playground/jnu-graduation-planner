/**
 * 계열(track) options. Drives the 계열별 교양 의무이수 요건 (전남대학교 교육과정 편성
 * 및 운영 지침 제10조④) — 계열마다 필수 균형/기초 영역이 다르다. 사용자가 대시보드에서
 * 선택한 계열에 해당하는 요건만 교양 영역 의무이수 표에 렌더링된다.
 */
export const TRACKS = ['이공계열', '인문사회계열', '예체능계열'] as const;

export type Track = (typeof TRACKS)[number];
