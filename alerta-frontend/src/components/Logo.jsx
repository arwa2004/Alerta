export default function Logo({ size = 28, showText = true }) {
  return (
    <div className="flex items-center gap-2.5">
      {/* Logo SVG officiel Alerta de la maquette */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        className="flex-shrink-0"
      >
        <rect width="64" height="64" rx="16" fill="#0B1F3A" />
        <path
          d="M8 32Q32 10 56 32Q32 54 8 32Z"
          fill="none"
          stroke="#00C2CB"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="32" r="10" fill="#00C2CB" />
        <rect x="26.8" y="28" width="2.6" height="8" rx="1.3" fill="#0B1F3A" />
        <rect x="30.7" y="24.5" width="2.6" height="15" rx="1.3" fill="#0B1F3A" />
        <rect x="34.6" y="28" width="2.6" height="8" rx="1.3" fill="#0B1F3A" />
      </svg>

      {showText && (
        <span className="font-poppins font-bold text-lg text-[#0B1F3A] tracking-tight">
          Aler<em className="not-italic text-[#00838F]">ta</em>
        </span>
      )}
    </div>
  );
}
