// Supabase Auth's HTTPS API. No third-party runtime dependency is needed here.
export function authAdmin(
  url: string,
  serviceKey: string,
  fetcher: typeof fetch = fetch,
) {
  if (!url || !serviceKey) throw Error("Auth configuration required");
  const base = url.replace(/\/$/, "") + "/auth/v1";
  return {
    async getUser(token: string) {
      const result = await fetcher(`${base}/user`, {
        method: "GET",
        headers: { apikey: serviceKey, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      if (!result.ok) return null;
      const user = await result.json();
      return typeof user.id === "string" && user.id ? user : null;
    },
    async deleteUser(id: string) {
      const result = await fetcher(
        `${base}/admin/users/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ should_soft_delete: false }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!result.ok) throw Error("Account deletion incomplete");
    },
  };
}
