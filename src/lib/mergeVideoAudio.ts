/**
 * Server-side video + audio merge using ffmpeg.
 *
 * Takes a video buffer (original) and an audio buffer (ElevenLabs output),
 * mutes the original video audio and overlays the new audio track.
 * Returns the merged MP4 as a Buffer.
 */

import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export async function mergeVideoWithAudioServer(
  videoBuffer: Buffer,
  audioBuffer: Buffer,
): Promise<Buffer> {
  const id = randomUUID();
  const dir = tmpdir();
  const videoPath = join(dir, `merge-video-${id}.mp4`);
  const audioPath = join(dir, `merge-audio-${id}.mp3`);
  const outputPath = join(dir, `merge-output-${id}.mp4`);

  await Promise.all([
    writeFile(videoPath, videoBuffer),
    writeFile(audioPath, audioBuffer),
  ]);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(videoPath)
        .input(audioPath)
        .outputOptions([
          "-c:v", "copy",
          "-c:a", "aac",
          "-map", "0:v:0",
          "-map", "1:a:0",
          "-shortest",
          "-movflags", "+faststart",
          "-y",
        ])
        .output(outputPath)
        .on("error", (err: Error) => reject(err))
        .on("end", () => resolve())
        .run();
    });

    return await readFile(outputPath);
  } finally {
    await Promise.all([
      unlink(videoPath).catch(() => {}),
      unlink(audioPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  }
}
