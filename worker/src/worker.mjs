import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  PHOTO_BUCKET = "living-frame-photos",
  VIDEO_BUCKET = "living-frame-videos",
  PROCESSED_BUCKET = "living-frame-processed",
  POLL_INTERVAL_MS = "5000",
  RUN_ONCE = "false"
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", d => stderr += d.toString());
    p.on("error", reject);
    p.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} failed (${code}): ${stderr.slice(-4000)}`));
    });
  });
}

async function download(bucket, objectPath, localPath) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) throw error;
  const buf = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, buf);
}

async function upload(bucket, objectPath, localPath, contentType) {
  const buf = await fs.readFile(localPath);
  const { error } = await supabase.storage
    .from(bucket)
    .upload(objectPath, buf, {
      contentType,
      upsert: true,
      cacheControl: "3600"
    });
  if (error) throw error;
}

async function claimJob() {
  const { data: rows, error } = await supabase
    .from("frames")
    .select("*")
    .eq("status", "processing")
    .is("processing_started_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  const frame = rows?.[0];
  if (!frame) return null;

  const now = new Date().toISOString();

  const { data: claimed, error: claimError } = await supabase
    .from("frames")
    .update({
      processing_started_at: now,
      processing_attempts: (frame.processing_attempts || 0) + 1
    })
    .eq("id", frame.id)
    .is("processing_started_at", null)
    .select()
    .maybeSingle();

  if (claimError) throw claimError;
  return claimed || null;
}

async function processFrame(frame) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "living-frame-"));
  const photoFile = path.join(tmp, "photo");
  const videoFile = path.join(tmp, "video");
  const outputFile = path.join(tmp, "processed.mp4");

  try {
    await download(PHOTO_BUCKET, frame.photo_path, photoFile);
    await download(VIDEO_BUCKET, frame.video_path, videoFile);

    const meta = await sharp(photoFile).metadata();
    const width = meta.width;
    const height = meta.height;

    if (!width || !height) {
      throw new Error("Could not read photo dimensions");
    }

    const ratio = width / height;

    // Center-crop to the photo aspect ratio, never stretch.
    // Scale output to max 1080 px on the long dimension while preserving ratio.
    let outW, outH;
    if (ratio >= 1) {
      outW = 1080;
      outH = Math.round(outW / ratio);
    } else {
      outH = 1080;
      outW = Math.round(outH * ratio);
    }
    outW -= outW % 2;
    outH -= outH % 2;

    const filter = [
      `crop='if(gt(a,${ratio}),ih*${ratio},iw)':'if(gt(a,${ratio}),ih,iw/${ratio})'`,
      `scale=${outW}:${outH}`
    ].join(",");

    await run("ffmpeg", [
      "-y",
      "-i", videoFile,
      "-vf", filter,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "128k",
      outputFile
    ]);

    const processedPath = `${frame.user_id}/${frame.frame_code}/processed-${Date.now()}.mp4`;
    await upload(PROCESSED_BUCKET, processedPath, outputFile, "video/mp4");

    const { error: updateError } = await supabase
      .from("frames")
      .update({
        status: "ready",
        processed_video_path: processedPath,
        target_width: width,
        target_height: height,
        processing_completed_at: new Date().toISOString(),
        error_message: null
      })
      .eq("id", frame.id);

    if (updateError) throw updateError;

    console.log(`[READY] ${frame.frame_code} -> ${processedPath}`);
  } catch (err) {
    console.error(`[FAILED] ${frame.frame_code}:`, err);

    await supabase
      .from("frames")
      .update({
        status: "failed",
        processing_completed_at: new Date().toISOString(),
        error_message: String(err?.message || err).slice(0, 2000)
      })
      .eq("id", frame.id);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  console.log("Living Frame processing worker started");

  while (true) {
    const job = await claimJob();

    if (job) {
      console.log(`[PROCESSING] ${job.frame_code}`);
      await processFrame(job);
    } else if (String(RUN_ONCE).toLowerCase() === "true") {
      break;
    } else {
      await sleep(Number(POLL_INTERVAL_MS) || 5000);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
