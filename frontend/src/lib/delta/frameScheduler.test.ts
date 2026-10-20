import { describe, expect, it } from "vitest";
import { createFrameScheduler } from "./frameScheduler";

describe("createFrameScheduler", () => {
  it("coalesces a burst to the latest update in one animation frame", () => {
    const frames: FrameRequestCallback[] = [];
    const schedule = createFrameScheduler((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const calls: string[] = [];

    schedule(() => calls.push("first"));
    schedule(() => calls.push("middle"));
    schedule(() => calls.push("latest"));

    expect(frames).toHaveLength(1);
    frames[0](0);
    expect(calls).toEqual(["latest"]);

    schedule(() => calls.push("next frame"));
    expect(frames).toHaveLength(2);
    frames[1](16);
    expect(calls).toEqual(["latest", "next frame"]);
  });

  it("does not run pending work after cancellation", () => {
    const frames: FrameRequestCallback[] = [];
    const schedule = createFrameScheduler((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const callback = () => { throw new Error("cancelled work ran"); };

    schedule(callback);
    schedule.cancel();
    frames[0](0);
  });
});
