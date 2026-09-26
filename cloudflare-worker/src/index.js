const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": env.FRONTEND_ORIGIN || "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, service: "living-frame-backend", runtime: "cloudflare-workers", version: "1.0.0" }, 200, cors);
      }

      const publicMatch = url.pathname.match(/^\/api\/public\/frames\/([^/]+)$/);
      if (request.method === "GET" && publicMatch) {
        const frameCode = decodeURIComponent(publicMatch[1]).toUpperCase();
        const response = await fetch(
          `${env.SUPABASE_URL}/rest/v1/frames?frame_code=eq.${encodeURIComponent(frameCode)}&select=frame_code,status,ar_provider,ar_experience_url&limit=1`,
          { headers: supabaseServiceHeaders(env) }
        );

        if (!response.ok) {
          const detail = await response.text();
          return json({ error: "Database lookup failed", status: response.status, detail }, 500, cors);
        }

        const rows = await response.json();
        const frame = rows?.[0];
        if (!frame) return json({ error: "Frame not found" }, 404, cors);

        return json({
          frame_code: frame.frame_code,
          status: frame.status,
          ar_provider: frame.ar_provider,
          ar_experience_url: frame.ar_experience_url,
          ar_ready: Boolean(frame.ar_experience_url)
        }, 200, cors);
      }

      const arMatch = url.pathname.match(/^\/api\/frames\/([^/]+)\/ar$/);
      if (request.method === "PATCH" && arMatch) {
        const frameId = decodeURIComponent(arMatch[1]);
        const user = await requireUser(request, env);
        if (!user.ok) return json({ error: user.error }, user.status, cors);

        const body = await request.json().catch(() => ({}));
        const arProvider = body.ar_provider || null;
        const arTargetId = body.ar_target_id || null;
        const arExperienceUrl = body.ar_experience_url || null;

        if (arExperienceUrl) {
          let parsed;
          try { parsed = new URL(arExperienceUrl); } catch { return json({ error: "Invalid ar_experience_url" }, 400, cors); }
          if (parsed.protocol !== "https:") return json({ error: "ar_experience_url must use HTTPS" }, 400, cors);
        }

        const ownRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/frames?id=eq.${encodeURIComponent(frameId)}&user_id=eq.${encodeURIComponent(user.data.id)}&select=id&limit=1`,
          { headers: supabaseServiceHeaders(env) }
        );
        if (!ownRes.ok) return json({ error: "Ownership check failed" }, 500, cors);

        const owned = await ownRes.json();
        if (!owned?.length) return json({ error: "Frame not found" }, 404, cors);

        const patchRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/frames?id=eq.${encodeURIComponent(frameId)}`,
          {
            method: "PATCH",
            headers: { ...supabaseServiceHeaders(env), "Content-Type": "application/json", "Prefer": "return=representation" },
            body: JSON.stringify({
              ar_provider: arProvider,
              ar_target_id: arTargetId,
              ar_experience_url: arExperienceUrl,
              updated_at: new Date().toISOString()
            })
          }
        );

        if (!patchRes.ok) {
          const detail = await patchRes.text();
          return json({ error: "Failed to update AR mapping", detail }, 500, cors);
        }

        const updated = await patchRes.json();
        return json(updated?.[0] || { ok: true }, 200, cors);
      }

      return json({ error: "Not found" }, 404, cors);
    } catch (err) {
      return json({ error: "Internal server error", detail: err?.message || String(err) }, 500, cors);
    }
  }
};

function json(data, status, cors = {}) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: { ...JSON_HEADERS, ...cors } });
}

function supabaseServiceHeaders(env) {
  return { "apikey": env.SUPABASE_SERVICE_ROLE_KEY };
}

async function requireUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, error: "Missing bearer token" };

  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      "apikey": env.SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${match[1]}`
    }
  });

  if (!response.ok) return { ok: false, status: 401, error: "Invalid or expired token" };
  return { ok: true, data: await response.json() };
}
