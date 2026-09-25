import { createClient } from "@supabase/supabase-js";
import { customAlphabet } from "nanoid";

const makeCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

const reply = (statusCode, body, origin="*") => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS"
  },
  body: JSON.stringify(body)
});

export async function handler(event) {
  const origin = process.env.FRONTEND_ORIGIN || "*";

  if (event.httpMethod === "OPTIONS") return reply(204, {}, origin);

  const raw = event.path || "";
  const path = raw
    .replace(/^\/api/, "")
    .replace(/^\/\.netlify\/functions\/api/, "") || "/";

  if (path === "/health") {
    return reply(200, {
      ok: true,
      service: "living-frame-backend",
      runtime: "netlify-functions",
      version: "3.0.0"
    }, origin);
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return reply(500, { error: "Supabase environment variables are not configured" }, origin);
  }

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return reply(401, { error: "Unauthorized" }, origin);

  const { data: authData, error: authError } = await anon.auth.getUser(token);
  if (authError || !authData?.user) return reply(401, { error: "Unauthorized" }, origin);
  const user = authData.user;

  const body = event.body ? JSON.parse(event.body) : {};
  const parts = path.split("/").filter(Boolean);

  try {
    if (event.httpMethod === "POST" && path === "/frames") {
      const title = String(body.title || "Untitled memory").trim().slice(0, 120);

      for (let i = 0; i < 4; i++) {
        const { data, error } = await admin.from("frames").insert({
          frame_code: `LF-${makeCode()}`,
          user_id: user.id,
          title,
          status: "draft"
        }).select().single();

        if (!error) return reply(201, data, origin);
        if (error.code !== "23505") return reply(500, { error: error.message }, origin);
      }
      return reply(500, { error: "Could not generate frame code" }, origin);
    }

    if (event.httpMethod === "GET" && path === "/frames") {
      const { data, error } = await admin.from("frames")
        .select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) return reply(500, { error: error.message }, origin);
      return reply(200, data, origin);
    }

    if (parts[0] === "frames" && parts[1]) {
      const id = parts[1];

      if (event.httpMethod === "GET" && parts.length === 2) {
        const { data, error } = await admin.from("frames")
          .select("*").eq("id", id).eq("user_id", user.id).single();
        if (error || !data) return reply(404, { error: "Frame not found" }, origin);
        return reply(200, data, origin);
      }
    }

    return reply(404, { error: "Route not found", path }, origin);
  } catch (err) {
    return reply(500, { error: err?.message || "Internal server error" }, origin);
  }
}
