declare module "fluent-ffmpeg" {
  interface FfmpegCommand {
    input(source: string): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    output(target: string): FfmpegCommand;
    on(event: "error", callback: (err: Error) => void): FfmpegCommand;
    on(event: "end", callback: () => void): FfmpegCommand;
    run(): void;
  }

  function ffmpeg(): FfmpegCommand;

  namespace ffmpeg {
    function setFfmpegPath(path: string): void;
  }

  export = ffmpeg;
}

declare module "ffmpeg-static" {
  const path: string;
  export default path;
}
