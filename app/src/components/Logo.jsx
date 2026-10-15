// Vyapar mark traced from the official logo: a downward triangle split into
// red / orange / yellow bands, with the notch cut into the red band.
export function VyaparMark({ size = 34 }) {
  return (
    <svg width={size} height={(size * 560) / 630} viewBox="650 560 630 560" aria-hidden="true">
      <path
        fill="#EC1C3C"
        d="M700 575H860L1076 948L997 1085Q968 1120 940 1088L857 942Q846 921 858 900L896 835Q912 800 868 787H792Q768 786 755 768L672 625Q655 590 700 575Z"
      />
      <path fill="#F7A01F" d="M860 575H1076L1184 760L1076 948Z" />
      <path fill="#FDC414" d="M1076 575H1233Q1280 580 1263 624L1184 760Z" />
    </svg>
  );
}

export function VyaparLogo({ size = 34 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.22 }}>
      <VyaparMark size={size} />
      <span
        style={{
          color: '#EC1C3C',
          fontWeight: 600,
          fontSize: size * 0.86,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        Vyapar
      </span>
    </span>
  );
}
