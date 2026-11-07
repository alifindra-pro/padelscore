"use client";
import { useState } from "react";
export function PlayerPhoto({
  id,
  name,
  version = 0,
}: {
  id: string;
  name: string;
  version?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = `/api/v2/players/${id}/photo?v=${version}`;
  if (failed === url)
    return (
      <span className="player-photo player-photo-initial" aria-label={name}>
        {name.charAt(0).toUpperCase()}
      </span>
    );
  // Authenticated images use the original URL; optimization would drop session cookies.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`Foto ${name}`}
      width={32}
      height={32}
      loading="lazy"
      className="player-photo"
      onError={() => setFailed(url)}
    />
  );
}
