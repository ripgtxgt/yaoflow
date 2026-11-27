"use client";

import { detent, soundReady } from "@/lib/card-sound";

/**
 * 10-18 (Neil: 像 Apple 的滚轮那样，滑动有震动): one light tick per row of a picker wheel.
 *  - Android phones: navigator.vibrate. Computers: the click sound.
 *  - iPhone: Safari gives web pages no vibration (the hidden-switch trick only answers a real finger tap since iOS 26.5),
 *    so a picker there plays a short click instead, like the native wheel's sound. Web Audio follows the silent switch.
 * `prime()` must run inside a touch/pointer handler: browsers only let sound start after a gesture.
 */
let last = 0;
// desktop Chrome also has navigator.vibrate but nothing to buzz, so vibration is only for touch phones (Android);
// iPhone and computers get the click sound (10-18 Neil: 电脑版也要有声音)
const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && /Android/i.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 0;

export function prime() {
  if (!canVibrate()) soundReady();
}

export function tick() {
  const now = Date.now();
  if (now - last < 30) return; // a fast flick would otherwise buzz continuously
  last = now;
  try {
    if (canVibrate()) navigator.vibrate(8);
    else detent();
  } catch { /* */ }
}
