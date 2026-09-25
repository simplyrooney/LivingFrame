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
  body: statusCode === 204 ? "" : JSON.stringify(body)
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
      version: "5.0.0"
    }, origin);
  }

  const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return reply(500, { error: "Supabase environment variables are not configured" }, origin);
  }

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false }
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return reply(401, { error: "Unauthorized" }, origin);

  const { data: authData, error: authError } = await anon.auth.getUser(token);
  if (authError || !authData?.user) {
    return reply(401, { error: "Unauthorized" }, origin);
  }

  const user = authData.user;
  const body = event.body ? JSON.parse(event.body) : {};
  const parts = path.split("/").filter(Boolean);

  async function ownedFrame(id) {
    const { data } = await admin
      .from("frames")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    return data || null;
  }

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
      const { data, error } = await admin
        .from("frames")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) return reply(500, { error: error.message }, origin);
      return reply(200, data, origin);
    }

    if (parts[0] === "frames" && parts[1]) {
      const id = parts[1];

      if (event.httpMethod === "GET" && parts.length === 2) {
        const frame = await ownedFrame(id);
        return frame
          ? reply(200, frame, origin)
          : reply(404, { error: "Frame not found" }, origin);
      }

      if (event.httpMethod === "POST" && parts[2] === "upload-url") {
        const frame = await ownedFrame(id);
        if (!frame) return reply(404, { error: "Frame not found" }, origin);

        const kind = body.kind;
        if (!["photo", "video"].includes(kind)) {
          return reply(400, { error: "kind must be photo or video" }, origin);
        }

        const safe = String(body.filename || `${kind}.bin`)
          .replace(/[^a-zA-Z0-9._-]/g, "_")
          .slice(-120);

        const bucket = kind === "photo"
          ? process.env.PHOTO_BUCKET
          : process.env.VIDEO_BUCKET;

        const objectPath = `${user.id}/${frame.frame_code}/${Date.now()}-${safe}`;

        const { data, error } = await admin.storage
          .from(bucket)
          .createSignedUploadUrl(objectPath);

        if (error) return reply(500, { error: error.message }, origin);

        return reply(200, {
          bucket,
          path: objectPath,
          token: data.token,
          signedUrl: data.signedUrl
        }, origin);
      }

      if (event.httpMethod === "POST" && parts[2] === "asset-complete") {
        const frame = await ownedFrame(id);
        if (!frame) return reply(404, { error: "Frame not found" }, origin);

        const kind = body.kind;
        const assetPath = body.path;

        if (!["photo", "video"].includes(kind) || !assetPath) {
          return reply(400, { error: "kind and path are required" }, origin);
        }

        const patch = kind === "photo"
          ? { photo_path: assetPath }
          : { video_path: assetPath };

        const hasPhoto = kind === "photo" || Boolean(frame.photo_path);
        const hasVideo = kind === "video" || Boolean(frame.video_path);
        if (hasPhoto && hasVideo) patch.status = "assets_uploaded";

        const { data, error } = await admin
          .from("frames")
          .update(patch)
          .eq("id", id)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error) return reply(500, { error: error.message }, origin);
        return reply(200, data, origin);
      }

      if (event.httpMethod === "POST" && parts[2] === "process") {
        const frame = await ownedFrame(id);
        if (!frame) return reply(404, { error: "Frame not found" }, origin);

        if (!frame.photo_path || !frame.video_path) {
          return reply(409, { error: "Photo and video must both be uploaded first" }, origin);
        }

        if (frame.status === "processing") {
          return reply(202, { ...frame, processing: { queued: true, alreadyQueued: true } }, origin);
        }

        const { data, error } = await admin
          .from("frames")
          .update({
            status: "processing",
            processed_video_path: null,
            error_message: null,
            processing_started_at: null,
            processing_completed_at: null
          })
          .eq("id", id)
          .eq("user_id", user.id)
          .select()
          .single();

        if (error) return reply(500, { error: error.message }, origin);

        return reply(202, {
          ...data,
          processing: {
            queued: true,
            next: "processing-worker"
          }
        }, origin);
      }
    }

    return reply(404, { error: "Route not found", path }, origin);
  } catch (err) {
    return reply(500, { error: err?.message || "Internal server error" }, origin);
  }
}
