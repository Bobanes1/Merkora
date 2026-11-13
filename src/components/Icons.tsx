import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});
const mk = (d: ReactNode) => ({ size, ...p }: P) => (
  <svg {...base(size)} {...p} aria-hidden="true">
    {d}
  </svg>
);

export const IconHome = mk(<path d="M3 11 12 4l9 7v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />);
export const IconLibrary = mk(
  <>
    <rect x="3" y="4" width="5" height="16" rx="1" />
    <rect x="10" y="4" width="5" height="16" rx="1" />
    <path d="m17 5 3.5 14.5" />
  </>,
);
export const IconSettings = mk(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
);
export const IconCards = mk(
  <>
    <rect x="3" y="6" width="14" height="14" rx="2" />
    <path d="M7 3h11a3 3 0 0 1 3 3v11" />
  </>,
);
export const IconPlay = mk(<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />);
export const IconPause = mk(
  <>
    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
  </>,
);
export const IconChart = mk(
  <>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </>,
);
export const IconDoc = mk(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </>,
);
export const IconQuiz = mk(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" />
  </>,
);
export const IconHeadphones = mk(
  <>
    <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
    <rect x="3" y="14" width="4" height="6" rx="1.5" />
    <rect x="17" y="14" width="4" height="6" rx="1.5" />
  </>,
);
export const IconNote = mk(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z" />
  </>,
);
export const IconSparkle = mk(
  <path d="M12 3 13.8 9.2 20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8zM19 3v4M21 5h-4" />,
);
export const IconChat = mk(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />);
export const IconPlus = mk(<path d="M12 5v14M5 12h14" />);
export const IconSearch = mk(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);
export const IconTrash = mk(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />);
export const IconEdit = mk(
  <>
    <path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" />
    <path d="M18.5 2.5a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4z" />
  </>,
);
export const IconMindmap = mk(
  <>
    <rect x="8.5" y="9.5" width="7" height="5" rx="1.5" />
    <path d="M8.5 12H6M15.5 12H18M6 6.5h-2M6 17.5H4M18 6.5h2M18 17.5h2M6 6.5v11M18 6.5v11" />
  </>,
);
export const IconSpeaker = mk(
  <>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </>,
);
export const IconChevron = mk(<path d="m9 6 6 6-6 6" />);
export const IconChevronDown = mk(<path d="m6 9 6 6 6-6" />);
export const IconClose = mk(<path d="M6 6l12 12M18 6 6 18" />);
export const IconMenu = mk(<path d="M4 6h16M4 12h16M4 18h16" />);
export const IconUpload = mk(<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />);
export const IconKey = mk(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M17 6l3 3M14 9l2 2" />
  </>,
);
export const IconEye = mk(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const IconEyeOff = mk(
  <>
    <path d="M10.7 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </>,
);
export const IconFlame = mk(<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6.5-4-10-2.5 2-3 4-3 6-1-1-2-2-2-4-2.5 2-5 5-5 8a7 7 0 0 0 7 7z" />);
export const IconCheck = mk(<path d="m5 12 5 5 9-10" />);
export const IconFolder = mk(<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />);
export const IconRefresh = mk(<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />);
export const IconShuffle = mk(<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />);
export const IconDownload = mk(<path d="M12 4v12M7 11l5 5 5-5M4 20h16" />);
export const IconStop = mk(<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />);
export const IconSend = mk(<path d="M4 12 20 4l-6 16-3-7z" />);
export const IconBell = mk(<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4" />);
export const IconHeart = mk(
  <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8 3.3 4 7 4c2.2 0 3.8 1.2 5 3 1.2-1.8 2.8-3 5-3 3.7 0 6.1 4 4.6 7.8C19.5 16.4 12 21 12 21z" fill="currentColor" stroke="none" />,
);
export const IconStarLine = mk(<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />);
export const IconStar =mk(<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor" stroke="none" />);
export const IconLock = mk(
  <>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);
export const IconTrophy = mk(<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6v4H9z" />);
export const IconGift = mk(
  <>
    <rect x="3" y="9" width="18" height="12" rx="2" />
    <path d="M3 13h18M12 9v12M12 9c-1.5-3-5-4-5-1.5S10 9 12 9zm0 0c1.5-3 5-4 5-1.5S14 9 12 9z" />
  </>,
);
export const IconPath = mk(<path d="M6 20c0-4 12-4 12-8s-12-4-12-8M6 4h.01M18 12h.01M6 20h.01" />);
export const IconTarget = mk(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </>,
);
export const IconAnki = mk(
  <>
    <rect x="4" y="3" width="13" height="17" rx="2" />
    <path d="M8 21h10a2 2 0 0 0 2-2V7M8 8h5M8 12h5" />
  </>,
);

export const IconOpenAI = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <g fill="none" stroke="#404040" strokeWidth="1.7">
      {[0, 60, 120, 180, 240, 300].map((r) => (
        <rect key={r} x="9.2" y="3.2" width="5.6" height="10" rx="2.8" transform={`rotate(${r} 12 12)`} />
      ))}
    </g>
  </svg>
);
export const IconClaude = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <g stroke="#d97757" strokeWidth="2.2" strokeLinecap="round">
      {[0, 30, 60, 90, 120, 150].map((r) => (
        <line key={r} x1="12" y1="3" x2="12" y2="21" transform={`rotate(${r} 12 12)`} />
      ))}
    </g>
  </svg>
);

export const IconCalendar = mk(
  <>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </>,
);
export const IconTag = mk(
  <>
    <path d="M3 12V4h8l9 9-8 8z" />
    <circle cx="7.5" cy="8.5" r="1.3" />
  </>,
);
export const IconMoon = mk(<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />);
export const IconImage = mk(
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 18 5.5-5.5 4 4 2.5-2.5 4.5 4.5" />
  </>,
);
/** Two tiles joined: the matching game. */
export const IconMatch = mk(
  <>
    <rect x="3" y="4" width="7" height="7" rx="1.5" />
    <rect x="14" y="13" width="7" height="7" rx="1.5" />
    <path d="M10 7.5h2.5a1.5 1.5 0 0 1 1.5 1.5v4" />
  </>,
);
export const IconGrid = mk(
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </>,
);
export const IconList = mk(<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />);
