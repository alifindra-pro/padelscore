import * as SecureStore from "expo-secure-store";
export const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
let refreshing: Promise<void> | null = null;
export async function saveTokens(tokens: {
  accessToken: string;
  refreshToken: string;
}) {
  await SecureStore.setItemAsync("padel-access", tokens.accessToken);
  await SecureStore.setItemAsync("padel-refresh", tokens.refreshToken);
}
export async function request<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
  retry = true,
): Promise<T> {
  const token = await SecureStore.getItemAsync("padel-access");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && retry && path !== "/api/v2/auth/login") {
    const refreshToken = await SecureStore.getItemAsync("padel-refresh");
    if (refreshToken) {
      refreshing ??= fetch(`${API}/api/v2/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok)
            throw new Error(
              "Silakan login kembali. Antrean skor tetap tersimpan.",
            );
          await saveTokens(j.data);
        })
        .finally(() => {
          refreshing = null;
        });
      await refreshing;
      return request(path, method, body, false);
    }
  }
  const json = await res.json();
  if (!res.ok) {
    const error = new Error(
      json.error?.message ?? "Permintaan gagal",
    ) as Error & { status: number };
    error.status = res.status;
    throw error;
  }
  return json.data as T;
}
export async function logout() {
  const refreshToken = await SecureStore.getItemAsync("padel-refresh");
  if (refreshToken)
    await request("/api/v2/auth/logout", "POST", { refreshToken });
  await SecureStore.deleteItemAsync("padel-access");
  await SecureStore.deleteItemAsync("padel-refresh");
}
