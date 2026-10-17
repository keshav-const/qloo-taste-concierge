"use client";

// Looping India montage for the hero. Uses the YouTube IFrame API so we can TRIM the
// creator's intro/outro cards (which show their name) and loop only the middle, full-bleed.

import { useEffect, useRef } from "react";

const VIDEO_ID = "JtOMlDLxEy0";
const INTRO = 6; // seconds skipped at the start (creator name card)
const OUTRO = 8; // seconds stopped before the end (creator name / outro)

// Minimal shape of the parts of the YT IFrame API we use.
type YTPlayer = {
  mute: () => void;
  playVideo: () => void;
  seekTo: (s: number, allowSeekAhead: boolean) => void;
  getDuration: () => number;
  getCurrentTime: () => number;
  destroy?: () => void;
};
type YTNamespace = { Player: new (el: Element, cfg: unknown) => YTPlayer };
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export default function HeroVideo() {
  const targetRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const loopToStart = () => {
      const p = playerRef.current;
      if (!p) return;
      p.seekTo(INTRO, true);
      p.playVideo();
    };

    const create = () => {
      if (cancelled || !targetRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(targetRef.current, {
        videoId: VIDEO_ID,
        playerVars: {
          autoplay: 1, mute: 1, controls: 0, showinfo: 0, modestbranding: 1,
          rel: 0, playsinline: 1, disablekb: 1, iv_load_policy: 3, fs: 0, start: INTRO,
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            e.target.mute();
            e.target.seekTo(INTRO, true);
            e.target.playVideo();
            poll = setInterval(() => {
              const p = playerRef.current;
              try {
                if (!p?.getDuration) return;
                const dur = p.getDuration();
                if (dur && p.getCurrentTime() >= dur - OUTRO) loopToStart();
              } catch {
                /* ignore transient API errors */
              }
            }, 500);
          },
          // ENDED === 0 → jump back to the trimmed start instead of the outro card.
          onStateChange: (e: { data: number; target: YTPlayer }) => {
            if (e.data === 0) loopToStart();
          },
        },
      });
    };

    if (window.YT?.Player) {
      create();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); create(); };
      if (!document.getElementById("yt-iframe-api")) {
        const s = document.createElement("script");
        s.id = "yt-iframe-api";
        s.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(s);
      }
    }

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      try { playerRef.current?.destroy?.(); } catch { /* ignore */ }
    };
  }, []);

  // The API replaces the inner div with an <iframe>; the wrapper keeps it cover-sized & full-bleed.
  // IMPORTANT: the cover math must be VIEWPORT-based (vw/vh) so the iframe stays EXACTLY 16:9 —
  // using min-h-full (relative to the shorter hero) broke the ratio and YouTube added a grey
  // letterbox bar at the top. min-h-[100vh]/min-w-[100vw] keep it 16:9 and overflow is clipped.
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-[100vh] w-[177.78vh] min-w-[100vw] -translate-x-1/2 -translate-y-1/2 [&>iframe]:h-full [&>iframe]:w-full"
    >
      <div ref={targetRef} className="h-full w-full" />
    </div>
  );
}
