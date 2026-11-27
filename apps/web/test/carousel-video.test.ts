import { describe, expect, it } from "vitest";
import { FADE, SLIDE_SECONDS, ffmpegArgs, videoSeconds } from "../src/lib/carousel-video";

describe("每日卦例短视频（09-27）", () => {
  it("five slides cross-fade into one 9:16 clip with a silent track", () => {
    expect(videoSeconds()).toBeCloseTo(22.5 - 4 * FADE);
    const args = ffmpegArgs(["1.png", "2.png", "3.png", "4.png", "5.png"], "out.mp4");
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("pad=1080:1920:0:285:color=0xF4F2EC");
    // each fade starts where the previous slide's time runs out
    let off = 0;
    for (let i = 1; i < 5; i++) { off += SLIDE_SECONDS[i - 1]! - FADE; expect(fc).toContain(`offset=${off.toFixed(2)}`); }
    expect(fc.endsWith("[vout]")).toBe(true);
    expect(args).toContain("anullsrc=r=44100:cl=stereo");
    expect(args.slice(-1)[0]).toBe("out.mp4");
    expect(args).toContain("+faststart");
  });
});
