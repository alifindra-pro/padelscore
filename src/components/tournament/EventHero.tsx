"use client";
import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api-client";
import { useTournamentHeader } from "@/components/tournament/TournamentHeader";
import { categoryStyle } from "@/lib/category-color";

type Sponsor = { id: string; name: string; tier: string };
export interface HeroCategory {
  id: string;
  name: string;
  pairs: number;
  start: string | null;
}

/**
 * First screen of a public event page: what, when, where, which categories,
 * and who backs it. The uploaded poster sits faintly behind; the uploaded
 * artwork (logo) is shown crisp on the right.
 */
export function EventHero({
  id,
  name,
  status,
  dateText,
  location,
  categories,
  actions,
}: {
  id: string;
  name: string;
  status: { label: string; live: boolean };
  dateText: string;
  location: string;
  categories: HeroCategory[];
  actions: ReactNode;
}) {
  const settings = useTournamentHeader();
  const [mainSponsors, setMainSponsors] = useState<Sponsor[]>([]);
  useEffect(() => {
    let active = true;
    apiFetch<Sponsor[]>(`/api/v2/tournaments/${id}/sponsors`)
      .then((list) => {
        if (active) setMainSponsors(list.filter((s) => s.tier === "MAIN"));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);
  const image = (kind: string) =>
    `/api/v2/tournaments/${id}/header?image=${kind}&v=${encodeURIComponent(settings?.version ?? "")}`;
  const title = settings?.title || name;
  const { intro, facts } = splitDescription(settings?.description ?? "");
  return (
    <section className="event-hero" aria-labelledby="event-title">
      {settings?.hasBanner && (
        <span className="event-hero-backdrop" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image("banner")} alt="" />
        </span>
      )}
      <div className="page-shell event-hero-inner">
        <div className="event-hero-copy">
          <p className="event-hero-status">
            <span className={status.live ? "is-live" : ""}>{status.label}</span>
          </p>
          <h1 id="event-title">{title}</h1>
          <ul className="event-hero-facts">
            <li>{dateText}</li>
            <li>{location}</li>
          </ul>
          {intro.length > 0 && (
            <p className="event-hero-description">{intro.join(" ")}</p>
          )}
          {facts.length > 0 && (
            <dl className="event-hero-details">
              {facts.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <FactValue value={value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {categories.length > 0 && (
            <ul
              className="event-hero-categories"
              aria-label="Nomor pertandingan"
            >
              {categories.map((c, i) => (
                <li key={c.id} style={categoryStyle(c.name, i)}>
                  <strong>{c.name}</strong>
                  <span>
                    {c.pairs ? `${c.pairs} pasangan` : "Peserta menyusul"}
                    {c.start ? ` · mulai ${c.start} WIB` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="event-hero-actions">{actions}</div>
        </div>
        {settings?.hasLogo && (
          <div className="event-hero-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image("logo")} alt={`Logo ${title}`} />
          </div>
        )}
      </div>
      {mainSponsors.length > 0 && (
        <div className="event-hero-sponsors">
          <div className="page-shell">
            <span>Sponsor utama</span>
            <ul>
              {mainSponsors.map((s) => (
                <li key={s.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/v2/tournaments/${id}/sponsors/${s.id}`}
                    alt={s.name}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Description lines written as "Label: isi" become a fact list (time, prize,
 * contact); other lines form the intro sentence above it.
 */
function splitDescription(text: string) {
  const intro: string[] = [];
  const facts: { label: string; value: string }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^([^:.]{2,32}):\s+(.+)$/.exec(line);
    if (m) facts.push({ label: m[1], value: m[2] });
    else intro.push(line);
  }
  return { intro, facts };
}

/** Indonesian phone numbers in a fact open a WhatsApp chat. */
function FactValue({ value }: { value: string }) {
  const phone = /(\+?62|0)8[\d\s-]{7,14}\d/.exec(value);
  if (!phone) return <>{value}</>;
  const digits = phone[0].replace(/\D/g, "").replace(/^0/, "62");
  return (
    <>
      {value.slice(0, phone.index)}
      <a
        href={`https://wa.me/${digits}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {phone[0]}
      </a>
      {value.slice(phone.index + phone[0].length)}
    </>
  );
}
