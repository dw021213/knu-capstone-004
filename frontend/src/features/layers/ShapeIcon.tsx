import { SHAPE_PATH, type MarkerShape } from '../map/markerShapes';

/** 지도 마커와 같은 모양(검정 채움, 흰 테두리) */
export function ShapeIcon({ shape, className }: { shape: MarkerShape; className?: string }) {
  return (
    <svg className={className} viewBox="-10 -10 20 20" aria-hidden="true">
      <path d={SHAPE_PATH[shape]} />
    </svg>
  );
}
