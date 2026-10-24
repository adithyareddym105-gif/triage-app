export function formatError(data: any): string {
  const e = data?.error;
  if (!e) return "Unexpected error.";
  const issues = e.issues?.length ? ` (${e.issues.map((i: any) => `${i.path || "request"}: ${i.message}`).join("; ")})` : "";
  return `${e.message}${issues}`;
}

export async function postJson(url: string, payload: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  } catch {
    throw new Error("Network error: the server is unreachable.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(formatError(data));
  return data;
}
