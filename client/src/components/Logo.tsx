interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 24, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
      data-testid="img-logo"
    >
      <path d="M1.5 5 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#2b3a9e" />
      <path d="M1.5 10 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#f3b31f" />
      <path d="M1.5 15 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#2f7d3f" />
      <path d="M1.5 20 q2.625 -2.4 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#d13b26" />
    </svg>
  );
}
