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
      <g transform="translate(78 100) rotate(-14 260 180) scale(.94)">
        <path
          d="M5 91 392 12 536 304 149 383Z"
          fill="#173d5b"
          opacity=".10"
          transform="translate(0 20)"
        />
        <path d="M5 76 392 0 536 292 149 368Z" fill="url(#court-surface)" />
        <path d="M5 76v12l144 292v-12Zm144 292v12l387-76v-12Z" fill="#003f79" />
        <path
          d="m26 89 354-70 134 260-354 70ZM60 154l354-70M126 284l354-70M237 119l66 130"
          stroke="white"
          strokeWidth="2.5"
          strokeOpacity=".8"
        />
        <path
          d="m77 222 387-76v-40l-387 76Z"
          fill="#002a51"
          fillOpacity=".55"
        />
        <path d="m77 222 387-76v-40l-387 76Z" fill="url(#court-mesh)" />
        <path d="m77 182 387-76" stroke="white" strokeWidth="3" />
        <path
          d="M77 177v50m387-126v50"
          stroke="#163653"
          strokeWidth="4"
          strokeLinecap="round"
        />
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
      <g transform="translate(484 314) rotate(26)">
        <path
          d="M-23 43C-19 61-12 70-9 78H9C12 70 19 61 23 43Z"
          fill="#173b54"
        />
        <path d="M-11 52 0 70 11 52Z" fill="#dfff00" />
        <rect x="-10" y="75" width="20" height="60" rx="7" fill="#112d46" />
        <path
          d="M-8 86 8 81M-8 96 8 91M-8 106 8 101M-8 116 8 111M-8 126 8 121"
          stroke="#38556b"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <ellipse
          rx="47"
          ry="59"
          fill="#dfff00"
          stroke="#173b54"
          strokeWidth="7"
        />
        {[-30, -15, 0, 15, 30].map((x) =>
          [-36, -18, 0, 18, 36]
            .filter((y) => (x / 39) ** 2 + (y / 49) ** 2 < 1)
            .map((y) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="3.3" fill="#18384b" />
            )),
        )}
        <rect x="-11" y="129" width="22" height="7" rx="3" fill="#173b54" />
      </g>
      <circle cx="566" cy="451" r="23" fill="#dfff00" />
      <path
        d="M550 435C565 438 577 453 577 471"
        stroke="#92a831"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
