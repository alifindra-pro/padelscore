export function CourtScene({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 650 540"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="court-surface"
          x1="100"
          y1="100"
          x2="550"
          y2="500"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#1978c9" />
          <stop offset="1" stopColor="#004a8c" />
        </linearGradient>
        <pattern
          id="court-mesh"
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M12 0H0V12"
            stroke="white"
            strokeOpacity=".2"
            strokeWidth=".8"
          />
        </pattern>
      </defs>
      <circle
        cx="368"
        cy="244"
        r="225"
        stroke="#c7d8e6"
        strokeDasharray="3 9"
      />
      <circle cx="368" cy="244" r="182" fill="#e2edf4" />
      <g transform="translate(72 75) rotate(-14 260 180)">
        <path
          d="M5 91 392 12 536 304 149 383Z"
          fill="#173d5b"
          opacity=".10"
          transform="translate(0 20)"
        />
        <path d="M5 76 392 0 536 292 149 368Z" fill="url(#court-surface)" />
        <path d="M5 76v12l144 292v-12Zm144 292v12l387-76v-12Z" fill="#003f79" />
        <path
          d="m26 89 354-70 134 260-354 70ZM80 194l354-70M221 50l132 260M128 287l354-70"
          stroke="white"
          strokeWidth="2.5"
          strokeOpacity=".8"
        />
        <path
          d="m105 248 386-76v-54l-386 76Z"
          fill="#002a51"
          fillOpacity=".55"
        />
        <path d="m105 248 386-76v-54l-386 76Z" fill="url(#court-mesh)" />
        <path d="m105 194 386-76" stroke="white" strokeWidth="4" />
        <path d="M105 185v68m386-145v68" stroke="#163653" strokeWidth="5" />
        <path
          d="M5 76V20l387-76V0m0-56 144 292v56M5 20l144 292 387-76M149 312v56"
          stroke="#6692ac"
          strokeWidth="2"
        />
        <path d="m5 20 387-76 144 292-387 76Z" fill="#d6eeff" opacity=".05" />
        <ellipse cx="335" cy="91" rx="14" ry="6" fill="#002d58" opacity=".3" />
        <circle cx="335" cy="83" r="9" fill="#dfff00" />
        <path d="M330 76c6 3 8 7 8 14" stroke="#7d9500" strokeWidth="1.5" />
      </g>
      <g transform="translate(486 302) rotate(30)">
        <rect x="-10" y="34" width="20" height="92" rx="8" fill="#112d46" />
        <path
          d="M-9 61h18m-18 9h18m-18 9h18m-18 9h18m-18 9h18m-18 9h18"
          stroke="#38556b"
          strokeWidth="3"
        />
        <ellipse
          rx="49"
          ry="63"
          fill="#dfff00"
          stroke="#173b54"
          strokeWidth="7"
        />
        {[-30, -15, 0, 15, 30].map((x) =>
          [-30, -15, 0, 15, 30].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" fill="#18384b" />
          )),
        )}
        <path d="m-15 49 15 18 15-18" fill="#173b54" />
      </g>
      <circle cx="559" cy="448" r="24" fill="#dfff00" />
      <path d="M543 431c18 7 24 19 25 38" stroke="#92a831" strokeWidth="2" />
    </svg>
  );
}
