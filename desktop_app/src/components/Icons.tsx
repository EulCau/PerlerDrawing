import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const baseProps: IconProps = {
  "aria-hidden": true,
  fill: "none",
  viewBox: "0 0 24 24",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function SunIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2.5v2M12 19.5v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.5 12h2M19.5 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z" />
    </svg>
  );
}

export function SystemIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m5.5 17 4.2-4.2 3.1 3.1 2.1-2.1 3.6 3.2" />
    </svg>
  );
}

export function TableIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M9 4v16M15 4v16" />
    </svg>
  );
}

export function ArrowIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 12h14M14 7l5 5-5 5" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M9 7 4 12l5 5" />
      <path d="M5 12h8a6 6 0 0 1 6 6" />
    </svg>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m15 7 5 5-5 5" />
      <path d="M19 12h-8a6 6 0 0 0-6 6" />
    </svg>
  );
}

export function ZoomInIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4 4M10.5 7.5v6M7.5 10.5h6" />
    </svg>
  );
}

export function ZoomOutIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4 4M7.5 10.5h6" />
    </svg>
  );
}

export function FitIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </svg>
  );
}

export function PreviewIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M2.8 12s3.4-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.4 5.5-9.2 5.5S2.8 12 2.8 12Z" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

export function MirrorIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3v18" strokeDasharray="2 2" />
      <path d="m9 7-5 5 5 5V7ZM15 7l5 5-5 5V7Z" />
    </svg>
  );
}

export function BrushIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m14 5 5-2 2 2-2 5-9 9-5 1 1-5 8-10Z" />
      <path d="m13 7 4 4M4 21c1.5-1.5 3.1-1.8 5-1" />
    </svg>
  );
}

export function EraserIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m8.2 18.5-4.7-4.7a2 2 0 0 1 0-2.8l7.5-7.5a2 2 0 0 1 2.8 0l6.7 6.7a2 2 0 0 1 0 2.8L15 18.5H8.2Z" />
      <path d="m8 8 8 8M8.2 18.5H21" />
    </svg>
  );
}

export function EyedropperIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m13 5 2-2a2.1 2.1 0 0 1 3 0l3 3a2.1 2.1 0 0 1 0 3l-2 2" />
      <path d="m10 8 6 6-8 8H3v-5l7-9ZM5 17l2 2" />
    </svg>
  );
}

export function FillIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m4 13 8-8 7 7-8 8H4v-7Z" />
      <path d="m8 9 6 6M19 16s2 2.2 2 3.5a2 2 0 0 1-4 0C17 18.2 19 16 19 16Z" />
    </svg>
  );
}

export function LineIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m5 19 14-14" />
      <circle cx="5" cy="19" r="1.5" />
      <circle cx="19" cy="5" r="1.5" />
    </svg>
  );
}

export function RectangleIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
    </svg>
  );
}

export function EllipseIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />
    </svg>
  );
}

export function SelectionIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />
      <path d="M9 8h6v6H9z" strokeDasharray="2 2" />
    </svg>
  );
}

export function HandIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V10M11 9V5.5a1.5 1.5 0 0 1 3 0V10M14 9V7a1.5 1.5 0 0 1 3 0v4M17 10v-.5a1.5 1.5 0 0 1 3 0V15c0 4-3 7-7 7h-1c-2.5 0-4.3-1.4-5.5-3.3L3.8 14a1.7 1.7 0 0 1 2.8-1.9L8 14" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v5h5M9 12h6M9 16h6" />
    </svg>
  );
}

export function SaveIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 3h12l2 2v16H5V3Z" />
      <path d="M8 3v6h8V3M8 21v-7h8v7" />
    </svg>
  );
}

export function SaveAsIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M5 3h10l2 2v7M8 3v6h6V3M8 21H5V3" />
      <path d="m12 19 6.5-6.5 2 2L14 21h-2v-2Z" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17.5v.1" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
