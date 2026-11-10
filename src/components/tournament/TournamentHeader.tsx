"use client";
import {
  useEffect,
  useState,
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";
import { tournamentTheme } from "@/lib/tournament-theme";
import { apiFetch } from "@/lib/api-client";
export type HeaderSettings = {
  title: string;
  themeColor: string;
  description: string;
  hasBanner: boolean;
  hasLogo: boolean;
  version: string;
};
export function HeaderPreview({
  id,
  name,
  settings,
  children,
}: {
  id: string;
  name: string;
  settings?: HeaderSettings;
  children?: ReactNode;
}) {
  const theme = tournamentTheme(settings?.themeColor);
  const source = (kind: string) =>
    `/api/v2/tournaments/${id}/header?image=${kind}&v=${encodeURIComponent(settings?.version ?? "")}`;
  return (
    <div
      className="space-y-4 rounded-xl p-4 sm:p-5"
      style={{ background: theme.soft, borderTop: `4px solid ${theme.accent}` }}
    >
      {settings?.hasBanner && (
        <div className="overflow-hidden rounded-xl bg-surface-tint">
          {/* Access-controlled images are served by the application. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={source("banner")}
            alt={`Banner ${settings.title || name}`}
            className="w-full max-h-96 object-contain"
          />
        </div>
      )}
      <div className="flex items-start gap-4">
        {settings?.hasLogo && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={source("logo")}
              alt={`Logo ${settings.title || name}`}
              className="w-16 h-16 sm:w-24 sm:h-24 shrink-0 object-contain rounded-lg bg-card p-2"
            />
          </>
        )}
        <div className="min-w-0 flex-1">
          <h1
            className="page-heading break-words"
            style={{ color: theme.brand }}
          >
            {settings?.title || name}
          </h1>
          {settings?.description && (
            <p className="text-sm sm:text-base text-secondary mt-2 whitespace-pre-line break-words max-w-3xl">
              {settings.description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
const HeaderContext = createContext<HeaderSettings | undefined>(undefined);
export function TournamentTheme({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState<HeaderSettings>();
  useEffect(() => {
    let active = true;
    apiFetch<HeaderSettings>(`/api/v2/tournaments/${id}/header`)
      .then((data) => {
        if (active) setSettings(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);
  const theme = tournamentTheme(settings?.themeColor);
  const style = {
    "--color-brand": theme.brand,
    "--color-brand-strong": theme.brand,
    "--color-brand-hover": theme.hover,
    "--color-brand-accent": theme.accent,
    "--color-brand-soft": theme.soft,
  } as CSSProperties;
  return (
    <HeaderContext.Provider value={settings}>
      <div
        className="event-public-page bg-canvas text-ink flex flex-col"
        style={style}
      >
        {children}
      </div>
    </HeaderContext.Provider>
  );
}
export function TournamentHeader({
  id,
  name,
  children,
}: {
  id: string;
  name: string;
  children?: ReactNode;
}) {
  const settings = useContext(HeaderContext);
  return (
    <HeaderPreview id={id} name={name} settings={settings}>
      {children}
    </HeaderPreview>
  );
}
