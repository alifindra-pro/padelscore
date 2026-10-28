export interface ApiFetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { params, headers, ...customConfig } = options;

  let url = endpoint;
  if (params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.append(key, String(value));
    });
    const queryString = query.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(typeof window !== 'undefined' && localStorage.getItem('padel-organization') ? { 'X-Organization-Id': localStorage.getItem('padel-organization')! } : {}),
      ...headers,
    },
    ...customConfig,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data?.error?.message || response.statusText || 'Request failed';
    const err = new Error(errorMsg) as Error & { code?: string; status?: number; details?: unknown };
    err.code = data?.error?.code;
    err.status = response.status;
    err.details = data?.error?.details;
    throw err;
  }

  return data.data !== undefined ? data.data : data;
}
