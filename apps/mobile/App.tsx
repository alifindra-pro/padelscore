import React, { useEffect, useEffectEvent, useState, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  StyleSheet,
  AppState,
  Linking,
  Share,
  Alert,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import { useFonts } from "expo-font";
import { request, saveTokens, logout, API } from "./api";
import { loadMatch, saveMatch, deviceId, cachedMatches } from "./store";
import {
  COLORS,
  OfflineMatch,
  Action,
  ScoreState,
  Rules,
  pointLabels,
  serviceInfo,
  enqueue,
  acknowledge,
  SocialRound,
  SocialPlayer,
} from "../../packages/core/src";
interface Tournament {
  id: string;
  name: string;
  slug: string;
  location: string;
  status: string;
}
interface Match {
  id: string;
  entryA?: { name: string };
  entryB?: { name: string };
  court?: { name: string };
  status: string;
  state?: ScoreState;
  scoreSnapshot?: { pointsA: string; pointsB: string };
}
interface DownloadedMatch extends Match {
  ownershipVersion: number;
  rulesSnapshot: Rules;
  stateV2: ScoreState;
  version: number;
  sequence: number;
  actionEvents: { action: Action }[];
}
interface PublicTournament extends Tournament {
  categories: {
    id: string;
    name: string;
    stages: {
      id: string;
      name: string;
      matches: Match[];
      groups: {
        name: string;
        standings: {
          id: string;
          rank: number;
          points: number;
          entry: { name: string };
        }[];
      }[];
    }[];
  }[];
}
interface Social {
  id: string;
  name: string;
  format: string;
  participants: SocialPlayer[];
  rounds: SocialRound[];
  leaderboard: {
    id: string;
    name: string;
    points: number;
    average: number;
    played: number;
  }[];
}
function Button({
  title,
  onPress,
  disabled = false,
  lime = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  lime?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        lime && { backgroundColor: COLORS.lime },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[styles.buttonText, lime && { color: COLORS.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  value,
  onChange,
  placeholder,
  secure = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secure?: boolean;
}) {
  return (
    <TextInput
      accessibilityLabel={placeholder}
      placeholder={placeholder}
      value={value}
      onChangeText={onChange}
      secureTextEntry={secure}
      autoCapitalize="none"
      style={styles.input}
    />
  );
}
function fetchHome() {
  return Promise.all([
    request<Tournament[]>("/api/v2/public/tournaments"),
    request<Social[]>("/api/v2/public/social"),
  ]);
}
export default function App() {
  const [fontsLoaded] = useFonts({
    // Metro resolves bundled assets through require()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    PlusJakarta: require("./assets/plus-jakarta-sans.ttf"),
  });
  const [screen, setScreen] = useState<
    "home" | "tournament" | "match" | "social" | "login" | "referee" | "scoring"
  >("home");
  const [events, setEvents] = useState<Tournament[]>([]);
  const [socials, setSocials] = useState<Social[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [event, setEvent] = useState<PublicTournament>();
  const [social, setSocial] = useState<Social>();
  const [publicMatch, setPublicMatch] = useState<Match>();
  const [assigned, setAssigned] = useState<Match[]>([]);
  const [offline, setOffline] = useState<OfflineMatch>();
  const [updated, setUpdated] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const fail = (e: unknown) =>
    setError((e as Error).message ?? "Tidak dapat terhubung");
  const navigate = (next: typeof screen) => {
    setScreen(next);
    setError("");
  };
  const showHome = ([list, community]: [Tournament[], Social[]]) => {
    setEvents(list);
    setSocials(community);
  };
  async function openTournament(slug: string) {
    try {
      setEvent(
        await request<PublicTournament>(
          `/api/v1/tournaments/slug/${slug}/public`,
        ),
      );
      navigate("tournament");
    } catch (e) {
      fail(e);
    }
  }
  async function openMatch(id: string) {
    try {
      setPublicMatch(await request<Match>(`/api/v2/public/matches/${id}`));
      navigate("match");
    } catch (e) {
      fail(e);
    }
  }
  async function openSocial(id: string) {
    try {
      setSocial(await request<Social>(`/api/v2/public/social/${id}`));
      navigate("social");
    } catch (e) {
      fail(e);
    }
  }
  const receive = useEffectEvent((url: string) => {
    const route = url.replace(/^[^:]+:\/\/(?:[^/]*\/)?/, "");
    const match = url.match(/\/match\/([^/?]+)/);
    const social = url.match(/\/social\/([^/?]+)/);
    const tournament = url.match(/\/tournament\/([^/?]+)/);
    if (match) void openMatch(match[1]);
    else if (social) void openSocial(social[1]);
    else if (tournament) void openTournament(tournament[1]);
    else if (route.startsWith("match/")) void openMatch(route.split("/")[1]);
  });
  useEffect(() => {
    let active = true;
    fetchHome()
      .then((data) => {
        if (active) showHome(data);
      })
      .catch((e) => {
        if (active) fail(e);
      });
    Linking.getInitialURL().then((url) => {
      if (url) receive(url);
    });
    const sub = Linking.addEventListener("url", ({ url }) => receive(url));
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  // Reads the latest screen and selection on every tick without restarting the timer
  const poll = useEffectEvent(async () => {
    if (AppState.currentState !== "active") return;
    try {
      if (screen === "match" && publicMatch)
        setPublicMatch(
          await request(`/api/v2/public/matches/${publicMatch.id}`),
        );
      if (screen === "social" && social)
        setSocial(await request(`/api/v2/public/social/${social.id}`));
      if (screen === "tournament" && event)
        setEvent(
          await request(`/api/v1/tournaments/slug/${event.slug}/public`),
        );
      setUpdated(new Date().toLocaleTimeString("id-ID"));
    } catch (e) {
      fail(e);
    }
  });
  useEffect(() => {
    const timer = setInterval(() => void poll(), 5000);
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") void poll();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);
  async function referees() {
    try {
      const data = await request<Match[]>("/api/v2/matches/assigned");
      setAssigned(data);
      navigate("referee");
    } catch (e) {
      const cached = await cachedMatches();
      if (cached.length) {
        setAssigned(
          cached.map((m) => ({
            id: m.id,
            entryA: { name: m.teamA },
            entryB: { name: m.teamB },
            status: "Tersimpan di perangkat",
          })),
        );
        navigate("referee");
      } else fail(e);
    }
  }
  async function prepare(id: string) {
    setBusy(true);
    try {
      const cached = await loadMatch(id);
      if (cached) {
        setOffline(cached);
        navigate("scoring");
        return;
      }
      const device = await deviceId();
      await request(`/api/v2/matches/${id}/claim`, "POST", {
        deviceId: device,
      });
      const m = await request<DownloadedMatch>(`/api/v2/matches/${id}`);
      const record: OfflineMatch = {
        id,
        deviceId: device,
        ownershipVersion: m.ownershipVersion,
        rules: m.rulesSnapshot,
        state: m.stateV2,
        confirmedState: m.stateV2,
        version: m.version,
        sequence: m.sequence,
        history: m.actionEvents.map((e) => e.action),
        pending: [],
        lastSyncedAt: new Date().toISOString(),
        teamA: m.entryA?.name ?? "Pasangan A",
        teamB: m.entryB?.name ?? "Pasangan B",
        conflict: null,
      };
      await saveMatch(record);
      setOffline(record);
      navigate("scoring");
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: Action) {
    if (!offline || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (action.type === "FINALIZE_MATCH") {
        if (offline.pending.length)
          throw new Error("Sinkronkan antrean sebelum finalisasi");
        await request(`/api/v2/matches/${offline.id}`);
      }
      const next = enqueue(offline, action, Crypto.randomUUID());
      await saveMatch(next);
      setOffline(next);
      setError("");
    } catch (e) {
      fail(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function sync() {
    if (!offline || lock.current || !offline.pending.length) return;
    lock.current = true;
    setBusy(true);
    try {
      const result = await request<{
        accepted: string[];
        state: ScoreState;
        version: number;
        sequence: number;
      }>(`/api/v2/matches/${offline.id}/actions`, "POST", {
        deviceId: offline.deviceId,
        ownershipVersion: offline.ownershipVersion,
        rulesVersion: 2,
        events: offline.pending.slice(0, 500),
      });
      const next = acknowledge(offline, result, new Date().toISOString());
      await saveMatch(next);
      setOffline(next);
      setError("");
    } catch (e) {
      fail(e);
      if ((e as Error & { status: number }).status === 409) {
        const next = { ...offline, conflict: (e as Error).message };
        await saveMatch(next);
        setOffline(next);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const autoSync = useEffectEvent(() => void sync());
  useEffect(() => {
    if (screen !== "scoring" || !offline?.pending.length || offline.conflict)
      return;
    const timer = setTimeout(autoSync, 3000);
    return () => clearTimeout(timer);
  }, [screen, offline, busy]);
  const labels = offline ? pointLabels(offline.state) : [];
  if (!fontsLoaded)
    return (
      <SafeAreaProvider>
        <SafeAreaView>
          <Text>Memuat Padel Indonesia…</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.brand}>PADEL INDONESIA</Text>
          {screen !== "home" && (
            <Button title="← Beranda" onPress={() => navigate("home")} />
          )}{" "}
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {screen === "home" && (
            <>
              <Text style={styles.title}>Setiap lapangan. Setiap poin.</Text>
              <Text style={styles.body}>
                Jadwal dan hasil pertandingan tanpa akun.
              </Text>
              <Field
                value={query}
                onChange={setQuery}
                placeholder="Cari turnamen atau lokasi"
              />
              {events
                .filter((e) =>
                  `${e.name} ${e.location}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((e) => (
                  <Pressable
                    key={e.id}
                    style={styles.card}
                    onPress={() => openTournament(e.slug)}
                  >
                    <Text style={styles.heading}>{e.name}</Text>
                    <Text>
                      {e.location} · {e.status}
                    </Text>
                  </Pressable>
                ))}
              <Text style={styles.heading}>Pertandingan sosial</Text>
              {socials.map((s) => (
                <Button
                  key={s.id}
                  title={`${s.name} · ${s.format}`}
                  onPress={() => openSocial(s.id)}
                />
              ))}
              <Button
                title="Masuk sebagai wasit"
                onPress={() => navigate("login")}
              />
              <Button title="Buka pertandingan tersimpan" onPress={referees} />
            </>
          )}
          {screen === "tournament" && event && (
            <>
              <Text style={styles.title}>{event.name}</Text>
              <Text>
                {event.location} · Diperbarui {updated}
              </Text>
              {event.categories.map((c) => (
                <View key={c.id}>
                  <Text style={styles.heading}>{c.name}</Text>
                  {c.stages.map((s) => (
                    <View key={s.id}>
                      <Text style={styles.heading}>{s.name}</Text>
                      {s.groups?.map((g) => (
                        <View key={g.name} style={styles.card}>
                          <Text style={styles.heading}>{g.name}</Text>
                          {g.standings.map((r) => (
                            <Text key={r.id}>
                              {r.rank}. {r.entry?.name} · {r.points} poin
                            </Text>
                          ))}
                        </View>
                      ))}
                      {s.matches.map((m) => (
                        <Pressable
                          key={m.id}
                          style={styles.card}
                          onPress={() => openMatch(m.id)}
                        >
                          <Text style={styles.heading}>
                            {m.entryA?.name ?? "Menunggu"} vs{" "}
                            {m.entryB?.name ?? "Menunggu"}
                          </Text>
                          <Text>
                            {m.court?.name} · {m.status}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}
          {screen === "match" && publicMatch && (
            <View style={styles.card}>
              <Text style={styles.heading}>
                {publicMatch.court?.name ?? "Papan skor"}
              </Text>
              {[publicMatch.entryA?.name, publicMatch.entryB?.name].map(
                (name, i) => (
                  <View key={i} style={styles.scoreRow}>
                    <Text style={styles.body}>{name ?? "Menunggu"}</Text>
                    <Text style={styles.score}>
                      {publicMatch.state
                        ? pointLabels(publicMatch.state)[i]
                        : i === 0
                          ? publicMatch.scoreSnapshot?.pointsA
                          : publicMatch.scoreSnapshot?.pointsB}
                    </Text>
                  </View>
                ),
              )}
              <Text>
                {publicMatch.status} · {updated}
              </Text>
              <Button
                title="Bagikan pertandingan"
                onPress={() =>
                  void Share.share({
                    message: `${API}/match/${publicMatch.id}`,
                  })
                }
              />
            </View>
          )}
          {screen === "social" && social && (
            <>
              <Text style={styles.title}>{social.name}</Text>
              <Text style={styles.heading}>Leaderboard</Text>
              {social.leaderboard.map((p, i) => (
                <View key={p.id} style={styles.card}>
                  <Text>
                    {i + 1}. {p.name} · {p.points} poin · rata-rata{" "}
                    {p.average.toFixed(2)}
                  </Text>
                </View>
              ))}
              {social.rounds.map((r) => (
                <View key={r.number} style={styles.card}>
                  <Text style={styles.heading}>Ronde {r.number}</Text>
                  {r.matches.map((m) => (
                    <Text key={m.court}>
                      Lapangan {m.court}:{" "}
                      {m.teamA
                        .map(
                          (id) =>
                            social.participants.find((p) => p.id === id)?.name,
                        )
                        .join(" / ")}{" "}
                      {m.scoreA ?? "—"}–{m.scoreB ?? "—"}{" "}
                      {m.teamB
                        .map(
                          (id) =>
                            social.participants.find((p) => p.id === id)?.name,
                        )
                        .join(" / ")}
                    </Text>
                  ))}
                </View>
              ))}
            </>
          )}
          {screen === "login" && (
            <>
              <Text style={styles.title}>Login Wasit</Text>
              <Field value={email} onChange={setEmail} placeholder="Email" />
              <Field
                value={password}
                onChange={setPassword}
                placeholder="Kata sandi"
                secure
              />
              <Button
                title="Masuk"
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    const tokens = await request<{
                      accessToken: string;
                      refreshToken: string;
                    }>("/api/v2/auth/login", "POST", { email, password });
                    await saveTokens(tokens);
                    setPassword("");
                    await referees();
                  } catch (e) {
                    fail(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </>
          )}
          {screen === "referee" && (
            <>
              <Text style={styles.title}>Penugasan Wasit</Text>
              {assigned.map((m) => (
                <Button
                  key={m.id}
                  title={`${m.entryA?.name ?? "A"} vs ${m.entryB?.name ?? "B"}`}
                  disabled={busy}
                  onPress={() => prepare(m.id)}
                />
              ))}
              <Button
                title="Keluar"
                onPress={() =>
                  logout()
                    .then(() => navigate("home"))
                    .catch(fail)
                }
              />
            </>
          )}
          {screen === "scoring" && offline && (
            <>
              <Text style={styles.heading}>
                {offline.rules.name} · {offline.rules.deuce}
              </Text>
              <View style={styles.card}>
                {[offline.teamA, offline.teamB].map((name, i) => (
                  <View style={styles.scoreRow} key={i}>
                    <Text style={styles.body}>{name}</Text>
                    <Text style={styles.score}>{labels[i]}</Text>
                  </View>
                ))}
                <Text>
                  Set{" "}
                  {offline.state.sets
                    .map((s) =>
                      s.kind === "MATCH_TIEBREAK"
                        ? s.tiebreak.join("–")
                        : s.games.join("–"),
                    )
                    .join(" / ")}
                </Text>
                <Text>
                  Servis: {serviceInfo(offline.state).server} ·{" "}
                  {serviceInfo(offline.state).side}
                </Text>
              </View>
              <Text>
                {offline.pending.length} aksi tersimpan di perangkat, belum
                tersinkron.
              </Text>
              <Text>Terakhir sinkron: {offline.lastSyncedAt ?? "belum"}</Text>
              <Button
                title="Sinkronkan skor"
                onPress={sync}
                disabled={busy || !!offline.conflict || !offline.pending.length}
              />
              {offline.conflict ? (
                <Text style={styles.error}>{offline.conflict}</Text>
              ) : (
                <>
                  {["NOT_STARTED", "WARMUP"].includes(offline.state.status) && (
                    <Button
                      title="Mulai pertandingan"
                      lime
                      disabled={busy}
                      onPress={() =>
                        act({ type: "START_MATCH", at: Date.now() })
                      }
                    />
                  )}{" "}
                  {offline.state.status === "IN_PROGRESS" && (
                    <>
                      {(["A", "B"] as const).map((team, i) => (
                        <Button
                          key={team}
                          title={`+1 ${i === 0 ? offline.teamA : offline.teamB}`}
                          lime
                          disabled={busy}
                          onPress={() => act({ type: "AWARD_POINT", team })}
                        />
                      ))}
                      <Button
                        title={
                          offline.state.faults ? "Double fault" : "First fault"
                        }
                        disabled={busy}
                        onPress={() =>
                          act({
                            type: offline.state.faults
                              ? "RECORD_SECOND_SERVE_FAULT"
                              : "RECORD_FIRST_SERVE_FAULT",
                          })
                        }
                      />
                      <Button
                        title="Tunda pertandingan"
                        disabled={busy}
                        onPress={() =>
                          act({ type: "SUSPEND_MATCH", at: Date.now() })
                        }
                      />
                      {offline.rules.mode === "TIMED" && (
                        <Button
                          title="Waktu habis"
                          onPress={() =>
                            act({ type: "TIME_EXPIRED", at: Date.now() })
                          }
                        />
                      )}
                    </>
                  )}
                  {offline.state.status === "SUSPENDED" && (
                    <Button
                      title="Lanjutkan"
                      disabled={busy}
                      onPress={() =>
                        act({ type: "RESUME_MATCH", at: Date.now() })
                      }
                    />
                  )}{" "}
                  {!offline.state.finalized && (
                    <Button
                      title="Batalkan aksi terakhir"
                      disabled={busy}
                      onPress={() =>
                        Alert.alert(
                          "Batalkan aksi?",
                          "Aksi dicatat dalam riwayat audit.",
                          [
                            { text: "Batal" },
                            {
                              text: "Batalkan aksi",
                              onPress: () =>
                                void act({
                                  type: "UNDO_LAST_ACTION",
                                  reason:
                                    "Koreksi input wasit pada perangkat mobile",
                                }),
                            },
                          ],
                        )
                      }
                    />
                  )}{" "}
                  {[
                    "COMPLETED",
                    "RETIRED",
                    "WALKOVER",
                    "DISQUALIFIED",
                  ].includes(offline.state.status) &&
                    !offline.state.finalized && (
                      <Button
                        title="Finalisasi hasil"
                        disabled={busy || !!offline.pending.length}
                        lime
                        onPress={() => act({ type: "FINALIZE_MATCH" })}
                      />
                    )}
                </>
              )}
              <Button
                title="Bagikan antrean untuk admin"
                onPress={() =>
                  void Share.share({ message: JSON.stringify(offline) })
                }
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  brand: {
    fontFamily: "PlusJakarta",
    fontSize: 14,
    fontWeight: "800",
    color: COLORS.brand,
  },
  title: {
    fontFamily: "PlusJakarta",
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.ink,
  },
  heading: {
    fontFamily: "PlusJakarta",
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.ink,
    marginVertical: 8,
  },
  body: {
    fontFamily: "PlusJakarta",
    fontSize: 16,
    color: COLORS.ink,
    flexShrink: 1,
  },
  card: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 16,
    gap: 12,
  },
  button: {
    backgroundColor: COLORS.brand,
    padding: 16,
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    fontFamily: "PlusJakarta",
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  input: {
    backgroundColor: "#fff",
    borderColor: COLORS.line,
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    minHeight: 48,
    fontSize: 16,
  },
  error: {
    backgroundColor: "#ffdad6",
    color: "#93000a",
    padding: 12,
    borderRadius: 8,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  score: {
    fontFamily: "PlusJakarta",
    fontVariant: ["tabular-nums"],
    fontSize: 40,
    fontWeight: "800",
    color: COLORS.ink,
  },
});
