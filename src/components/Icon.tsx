import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faArrowRight,
  faArrowRotateRight,
  faBarsProgress,
  faBullseye,
  faCalendarDay,
  faChartSimple,
  faCheck,
  faChevronLeft,
  faChevronRight,
  faCircleHalfStroke,
  faCircleInfo,
  faCirclePause,
  faCirclePlay,
  faClock,
  faCopy,
  faEye,
  faFire,
  faGear,
  faHouse,
  faHourglassHalf,
  faLeaf,
  faLightbulb,
  faLink,
  faLock,
  faPlay,
  faRotateLeft,
  faShareNodes,
  faSliders,
  faStar as faStarSolid,
  faStarHalfStroke,
  faStopwatch,
  faTableCellsLarge,
  faTrash,
  faTrophy,
  faVolumeHigh,
  faVolumeXmark,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

/** 全站图标表：统一走 Font Awesome，避免到处散落 emoji */
export const ICONS = {
  trophy: faTrophy,
  calendar: faCalendarDay,
  stopwatch: faStopwatch,
  leaf: faLeaf,
  sliders: faSliders,
  home: faHouse,
  grid: faTableCellsLarge,
  chart: faChartSimple,
  gear: faGear,
  info: faCircleInfo,
  play: faPlay,
  pause: faCirclePause,
  resume: faCirclePlay,
  restart: faArrowRotateRight,
  undo: faRotateLeft,
  hint: faLightbulb,
  clear: faTrash,
  eye: faEye,
  star: faStarSolid,
  starHalf: faStarHalfStroke,
  lock: faLock,
  fire: faFire,
  clock: faClock,
  hourglass: faHourglassHalf,
  bullseye: faBullseye,
  copy: faCopy,
  link: faLink,
  share: faShareNodes,
  check: faCheck,
  close: faXmark,
  prev: faChevronLeft,
  next: faChevronRight,
  back: faArrowLeft,
  forward: faArrowRight,
  progress: faBarsProgress,
  contrast: faCircleHalfStroke,
  sound: faVolumeHigh,
  mute: faVolumeXmark,
} satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className,
  size,
  spin,
}: {
  name: IconName;
  className?: string;
  size?: 'xs' | 'sm' | 'lg' | 'xl';
  spin?: boolean;
}) {
  return <FontAwesomeIcon icon={ICONS[name]} className={className} size={size} spin={spin} fixedWidth />;
}

/** 星级显示：0~3 星 */
export function Stars({ value, max = 3, className }: { value: number; max?: number; className?: string }) {
  return (
    <span className={'stars-inline' + (className ? ' ' + className : '')}>
      {Array.from({ length: max }, (_, i) => (
        <Icon key={i} name="star" className={i < value ? 'star-on' : 'star-off'} />
      ))}
    </span>
  );
}
