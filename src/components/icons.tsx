import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconDatabase(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <ellipse cx="10" cy="4.6" rx="6" ry="2.2" />
      <path d="M4 4.6v4.4c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V4.6" />
      <path d="M4 9v4.6c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V9" />
      <path d="M4 13.6v1.8c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2v-1.8" />
    </Icon>
  );
}

export function IconTable(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <path d="M3 8.3h14" />
      <path d="M8 8.3V16" />
    </Icon>
  );
}

export function IconUpload(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M10 13V4" />
      <path d="M6.2 7.6 10 3.8l3.8 3.8" />
      <path d="M4 13.5v1.3c0 .9.7 1.6 1.6 1.6h8.8c.9 0 1.6-.7 1.6-1.6v-1.3" />
    </Icon>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2.1M10 15.4v2.1M17.5 10h-2.1M4.6 10H2.5M15.1 4.9l-1.5 1.5M6.4 13.6l-1.5 1.5M15.1 15.1l-1.5-1.5M6.4 6.4 4.9 4.9" />
    </Icon>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 5l10 10M15 5 5 15" />
    </Icon>
  );
}

export function IconSend(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M17 3 3 9.2l6 2m8-8.2-2.6 13.6L9 12.8m8-9.8L9 12.8" />
    </Icon>
  );
}

export function IconPlay(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 4.2v11.6c0 .7.75 1.15 1.35.8l9.3-5.8a.9.9 0 0 0 0-1.6l-9.3-5.8C6.75 3.05 6 3.5 6 4.2Z" />
    </Icon>
  );
}

export function IconShieldCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M10 2.5 4 4.8v4.4c0 4 2.6 6.9 6 8.3 3.4-1.4 6-4.3 6-8.3V4.8L10 2.5Z" />
      <path d="M7.3 9.9l1.9 1.9 3.5-3.9" />
    </Icon>
  );
}

export function IconKey(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="13" r="3.3" />
      <path d="M9.3 10.7 15.5 4.5M13.2 6.8l1.8 1.8M15.4 4.6l1.8 1.8" />
    </Icon>
  );
}

export function IconMessage(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 5.2c0-.9.75-1.6 1.6-1.6h10.8c.9 0 1.6.7 1.6 1.6v7.1c0 .9-.7 1.6-1.6 1.6H8.6L5 17V13.9H4.6c-.9 0-1.6-.7-1.6-1.6Z" />
    </Icon>
  );
}

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="8.7" cy="8.7" r="5" />
      <path d="M12.4 12.4 17 17" />
    </Icon>
  );
}

export function IconAlertTriangle(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M10 3.2 2.6 16.2h14.8L10 3.2Z" />
      <path d="M10 8.3v3.6" />
      <circle cx="10" cy="14.2" r="0.7" fill="currentColor" stroke="none" />
    </Icon>
  );
}
