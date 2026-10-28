export function PadelArtwork({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 300"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse
        cx="204"
        cy="260"
        rx="155"
        ry="19"
        fill="#172d40"
        opacity=".08"
      />
      <circle cx="210" cy="143" r="120" fill="#edf4ff" />
      <circle
        cx="210"
        cy="143"
        r="139"
        stroke="#5599e8"
        strokeDasharray="4 10"
        opacity=".35"
      />
      <g transform="translate(55 60) rotate(-12 145 90)">
        <rect width="290" height="180" rx="14" fill="#0060aa" />
        <rect
          x="14"
          y="14"
          width="262"
          height="152"
          rx="3"
          stroke="white"
          strokeWidth="2"
          opacity=".8"
        />
        <path
          d="M90 14v152M200 14v152M14 90h76m110 0h76"
          stroke="white"
          strokeWidth="2"
          opacity=".65"
        />
        <path d="M145 5v170" stroke="#dfff00" strokeWidth="3" />
        <path
          d="M139 14v152m12-152v152"
          stroke="white"
          strokeDasharray="3 4"
          opacity=".5"
        />
        <circle cx="60" cy="55" r="10" fill="#dfff00" />
        <circle cx="225" cy="125" r="10" fill="white" />
      </g>
      <g transform="translate(255 150) rotate(28)">
        <rect x="26" y="67" width="17" height="64" rx="7" fill="#172d40" />
        <ellipse
          cx="35"
          cy="35"
          rx="35"
          ry="46"
          fill="#dfff00"
          stroke="#172d40"
          strokeWidth="5"
        />
        {[15, 30, 45, 60].map((row) =>
          [20, 35, 50].map((column) => (
            <circle
              key={`${row}-${column}`}
              cx={column}
              cy={row}
              r="3"
              fill="#172d40"
              opacity=".7"
            />
          )),
        )}
        <path
          d="M28 103h13m-13 8h13m-13 8h13"
          stroke="#5599e8"
          strokeWidth="3"
        />
      </g>
      <circle
        cx="91"
        cy="228"
        r="18"
        fill="#dfff00"
        stroke="#172d40"
        strokeWidth="2"
      />
      <path d="M79 215c15 6 19 14 20 28" stroke="#172d40" strokeWidth="2" />
      <path d="m324 42 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" fill="#0060aa" />
    </svg>
  );
}
