"use strict";

// =============================================================================
// YouTube IFrame Player API integration — SCAFFOLD / STUB.
//
// This is the *only* file coupled to the player API (see docs/architecture.md).
// It was ported from the GCore player handler: the runtime <-> DOM message
// bridge and the public method surface (OnPlay/OnPause/OnSeek/OnSetVolume/
// OnResize/UpdateState/Destroy) are preserved so the rest of the
// plugin compiles and runs unchanged. The actual YouTube playback wiring —
// constructing the YT.Player, mapping its events to runtime state, captions,
// etc. — is intentionally left as TODOs and tracked in this repo's
// GitHub issues. See docs/youtube-player-api.md.
//
// API reference: https://developers.google.com/youtube/iframe_api_reference
// =============================================================================

{
  const YOUTUBE_IFRAME_API_URL = "https://www.youtube.com/iframe_api";

  // Human-readable text for the YouTube IFrame API onError codes.
  // https://developers.google.com/youtube/iframe_api_reference#onError
  const YT_ERROR_MESSAGES: Record<number, string> = {
    2: "Invalid video id or parameter",
    5: "HTML5 player error",
    100: "Video not found or removed",
    101: "Embedded playback disabled by the video owner",
    150: "Embedded playback disabled by the video owner",
  };

  // Minimal surface of the YouTube IFrame Player API we expect to call. The
  // full API is documented at the reference URL above; we only model the bits
  // this plugin uses so we can stay off `any`.
  interface YTPlayer {
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    mute(): void;
    unMute(): void;
    setVolume(volume: number): void; // 0..100
    getVolume(): number;
    getDuration(): number;
    getCurrentTime(): number;
    setSize(width: number, height: number): void;
    loadVideoById(videoId: string): void;
    isMuted(): boolean;
    destroy(): void;
  }

  // The argument passed to YT.Player event callbacks (onReady, onStateChange…).
  interface YTPlayerEvent {
    target: YTPlayer;
    data?: number;
  }

  interface YTPlayerConstructor {
    new (element: HTMLElement | string, options: unknown): YTPlayer;
  }

  // The global `YT` namespace the iframe_api script installs on window.
  interface YTNamespace {
    Player: YTPlayerConstructor;
    PlayerState: {
      UNSTARTED: number;
      ENDED: number;
      PLAYING: number;
      PAUSED: number;
      BUFFERING: number;
      CUED: number;
    };
  }

  // Typed view of the bits of the global object the IFrame API touches.
  type YTGlobal = {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  };

  // Shared, lazily-resolved API load. The iframe_api script is injected by
  // plugin.ts via AddRemoteScriptDependency; it loads www-widgetapi.js and then
  // invokes window.onYouTubeIframeAPIReady once the global `YT` is usable. We
  // resolve a single promise so every element handler shares one load, and chain
  // any pre-existing onYouTubeIframeAPIReady so we don't clobber another consumer.
  let youTubeApiPromise: Promise<YTNamespace> | null = null;
  function loadYouTubeAPI(): Promise<YTNamespace> {
    if (youTubeApiPromise === null) {
      youTubeApiPromise = new Promise<YTNamespace>((resolve) => {
        const w = globalThis as unknown as YTGlobal;
        if (w.YT && w.YT.Player) {
          resolve(w.YT);
          return;
        }
        const previous = w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady = () => {
          previous?.();
          if (w.YT) {
            resolve(w.YT);
          }
        };
        // Fallback: ensure the iframe_api script is present. In a Construct
        // export, plugin.ts declares it as a remote dependency, but inject it
        // here too so the handler also works standalone (e.g. in
        // test/player-test.html).
        const alreadyInjected = Array.from(
          document.getElementsByTagName("script")
        ).some((s) => s.src === YOUTUBE_IFRAME_API_URL);
        if (!alreadyInjected) {
          const tag = document.createElement("script");
          tag.src = YOUTUBE_IFRAME_API_URL;
          document.head.appendChild(tag);
        }
      });
    }
    return youTubeApiPromise;
  }

  // Extract an 11-character YouTube video id from the common URL shapes a
  // Construct project might store, or accept a bare id. Returns "" when nothing
  // matches (treated as "no video / offline").
  function extractVideoId(url: string): string {
    const trimmed = (url || "").trim();
    if (trimmed === "") {
      return "";
    }
    // Bare video id.
    if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    // youtu.be/<id>, youtube.com/watch?v=<id>, /embed/<id>, /shorts/<id>, /v/<id>
    const patterns = [
      /[?&]v=([A-Za-z0-9_-]{11})/,
      /youtu\.be\/([A-Za-z0-9_-]{11})/,
      /\/embed\/([A-Za-z0-9_-]{11})/,
      /\/shorts\/([A-Za-z0-9_-]{11})/,
      /\/live\/([A-Za-z0-9_-]{11})/,
      /\/v\/([A-Za-z0-9_-]{11})/,
    ];
    for (const re of patterns) {
      const m = trimmed.match(re);
      if (m) {
        return m[1];
      }
    }
    return "";
  }

  class ElementHandler {
    element: HTMLElement;
    elementId: number;
    handler: IDOMElementHandler;
    player: YTPlayer | null;
    currentUrl: string;
    currentVideoId: string;
    subtitleLang: string;
    enableChrome: boolean;
    loop: boolean;
    start: number;
    // Audio state carried across video loads (mirrors the GCore handler so the
    // ACE/runtime layer keeps the same contract). Volume is kept in 0..1 units.
    lastMuted: boolean;
    lastVolume: number;
    resizeObserver: ResizeObserver | null;
    playbackTimer: number | null;
    controller: AbortController;
    // Awaitable-load state. The load promise resolves once the new video's
    // metadata is loaded (getDuration() > 0) for the most-recently-requested
    // load, or settles on error / timeout / supersession / Destroy. Readiness is
    // POLLED from getDuration(), not derived from a play state: YouTube's onReady
    // fires only once per player (not per loadVideoById), and PLAYING may never
    // fire when autoplay is blocked. See ADR-0005 / issue #18.
    loadReadyResolve: ((v: JSONValue) => void) | null;
    loadGen: number;
    loadReadyTimer: number | null;
    loadReadyPoll: number | null;

    constructor(
      element: HTMLElement,
      elementId: number,
      domHandler: IDOMElementHandler
    ) {
      this.element = element;
      this.elementId = elementId;
      this.handler = domHandler;
      this.player = null;
      this.currentUrl = "";
      this.currentVideoId = "";
      this.subtitleLang = "off";
      this.enableChrome = true;
      this.loop = false;
      this.start = 0;
      this.lastMuted = true;
      this.lastVolume = -1;
      this.resizeObserver = null;
      this.playbackTimer = null;
      this.controller = new AbortController();
      this.loadReadyResolve = null;
      this.loadGen = 0;
      this.loadReadyTimer = null;
      this.loadReadyPoll = null;

      this.Setup();
    }

    Setup() {
      const { signal } = this.controller;

      // Eagerly load the API so the runtime can report the player API as
      // initialized even before a video URL is set.
      loadYouTubeAPI()
        .then(() => this.PostStateToRuntime({ apiInitialized: true }))
        .catch((err) =>
          console.error("[video player] Failed to load YouTube IFrame API", err)
        );

      // Keep player interactions inside the element so they don't leak into the
      // Construct game's input handling.
      const interactiveEvents = [
        "touchstart",
        "touchmove",
        "touchend",
        "mousedown",
        "mouseup",
        "keydown",
        "keyup",
        "click",
      ];
      interactiveEvents.map((e) =>
        this.element.addEventListener(e, (ev) => ev.stopPropagation(), { signal })
      );

      this.element.style.position = "absolute";
      this.element.style.border = "none";
      this.element.style.pointerEvents = "none";
    }

    PostToRuntime(event: string, data?: JSONValue) {
      this.handler.PostToRuntimeElement(event, this.elementId, data);
    }

    PostStateToRuntime(state: JSONObject) {
      this.PostToRuntime("state-changed", { state });
    }

    PostErrorToRuntime(category: string, message: string) {
      this.PostToRuntime("error", { error: { category, message } });
    }

    // Settle the pending awaitable-load promise (generation-guarded). Called from
    // the readiness poll (getDuration() > 0), the error path, the 15s timeout,
    // and Destroy. A stale load's late settle (generation mismatch) is a safe
    // no-op via the guard.
    private _settleLoadPromise(gen: number): void {
      if (this.loadGen !== gen) {
        return;
      }
      this._clearLoadWaiters();
      const resolve = this.loadReadyResolve;
      this.loadReadyResolve = null;
      resolve?.(null);
    }

    // Stop the readiness poll and timeout for the current pending load (without
    // resolving). Shared by _settleLoadPromise, supersession, and Destroy.
    private _clearLoadWaiters(): void {
      if (this.loadReadyTimer !== null) {
        globalThis.clearTimeout(this.loadReadyTimer);
        this.loadReadyTimer = null;
      }
      if (this.loadReadyPoll !== null) {
        globalThis.clearInterval(this.loadReadyPoll);
        this.loadReadyPoll = null;
      }
    }

    // Returns whether a rebuild load was kicked off (so OnLoadVideo knows to await
    // metadata readiness). false for an unchanged URL or an offline (empty id)
    // transition — nothing further will signal readiness.
    UpdateState(e: JSONObject): boolean {
      const url = (e["url"] ?? "") as string;
      this.subtitleLang = (e["subtitles"] ?? "off") as string;
      this.enableChrome = (e["enableChrome"] ?? true) as boolean;
      this.loop = (e["loop"] ?? false) as boolean;
      this.start = (e["start"] ?? 0) as number;
      // TODO(youtube): map the remaining incoming state — subtitles selection —
      // onto YouTube IFrame player options. Tracked in the repo's GitHub issues.

      if (this.currentUrl === url) {
        // URL unchanged — apply lightweight changes (e.g. chrome/controls) to
        // the existing player without rebuilding it.
        // TODO(youtube): apply live chrome/subtitle changes here.
        return false;
      }

      this.currentUrl = url;
      const videoId = extractVideoId(url);
      this.currentVideoId = videoId;
      // A list= param is recognized but not acted on: playlist loading and
      // navigation are deferred to issue #12. A watch URL with list= still
      // loads only its single video; a playlist-only URL has no id and stays
      // offline.
      const hasPlaylistParam = /[?&]list=/.test(url);

      if (videoId === "") {
        if (hasPlaylistParam) {
          console.debug(
            "[video player] Playlist-only URL with no video id; staying offline (see #12)"
          );
        } else {
          console.debug("[video player] No YouTube video id in URL; going offline");
        }
        this.DestroyPlayer();
        this.PostStateToRuntime({ playerState: "offline" });
        return false;
      }

      if (hasPlaylistParam) {
        console.debug(
          "[video player] Playlist param ignored; loading single video only (see #12)"
        );
      }
      console.debug("[video player] Loading YouTube video", videoId);
      this.PostStateToRuntime({ playerState: "loading" });
      this.CreatePlayer(videoId);
      return true;
    }

    async CreatePlayer(videoId: string) {
      // Capture the load generation so a failure settles only this load's
      // awaitable (a newer load will have advanced loadGen).
      const myGen = this.loadGen;

      let YT: YTNamespace;
      try {
        YT = await loadYouTubeAPI();
      } catch (err) {
        console.error("[video player] Failed to load YouTube IFrame API", err);
        this.PostErrorToRuntime("youtube", `Failed to load player: ${err}`);
        this._settleLoadPromise(myGen);
        return;
      }

      // A later UpdateState() may have changed or cleared the URL while we
      // awaited the API load; bail if this request is stale.
      if (this.currentVideoId !== videoId) {
        return;
      }

      // If a player already exists, reuse it by loading the new video.
      if (this.player) {
        // NOTE: loop/start (and other playerVars) apply only at YT.Player construction;
        // they are NOT re-applied on loadVideoById — a rebuild is required.
        this.player.loadVideoById(videoId);
        // onReady fires only once per player, so re-apply the user's audio intent here.
        this.RestoreAudioState();
        this.PostAudioState();
        return;
      }

      // Build the YT.Player on the Construct-managed container <div>. The API
      // replaces the element with an <iframe>.
      this.player = new YT.Player(this.element, {
        videoId,
        playerVars: this.buildPlayerVars(videoId),
        events: {
          // TODO(youtube): translate these into PostStateToRuntime() calls so
          // the runtime ACE layer (playerState, duration, volume, captions,
          // etc.) is driven by real player events. Each of these is
          // tracked as a development-task issue.
          onReady: (ev: YTPlayerEvent) => {
            console.log("[video player] YouTube player ready");
            const player = ev.target;
            this.RestoreAudioState();
            this.PostStateToRuntime({ duration: player.getDuration() });
            this.PostAudioState();
          },
          onStateChange: (ev: YTPlayerEvent) => {
            const PS = YT.PlayerState;
            switch (ev.data) {
              case PS.PLAYING:
                this.PostStateToRuntime({ playerState: "playing" });
                // Autoplay may have force-muted us; if the user's intent was unmuted,
                // unmute now that playback has actually started.
                if (!this.lastMuted && this.player?.isMuted()) {
                  this.player.unMute();
                }
                this.PostAudioState();
                this.StartPlaybackPolling();
                break;
              case PS.PAUSED:
                this.StopPlaybackPolling();
                this.PostStateToRuntime({ playerState: "paused" });
                break;
              case PS.ENDED:
                this.StopPlaybackPolling();
                this.PostStateToRuntime({ playerState: "ended" });
                break;
              case PS.BUFFERING:
                this.StopPlaybackPolling();
                this.PostStateToRuntime({ playerState: "loading" });
                break;
              case PS.UNSTARTED:
              case PS.CUED:
                this.PostStateToRuntime({ playerState: "loading" });
                break;
            }
          },
          onError: (ev: YTPlayerEvent) => {
            const code = ev.data ?? -1;
            const message = YT_ERROR_MESSAGES[code] ?? `YouTube player error ${code}`;
            this.PostErrorToRuntime("youtube", message);
            // A load that errors must settle its awaitable so the event sheet
            // doesn't wait out the 15s timeout. Use the CURRENT loadGen (not a
            // captured one): this callback is registered once on the single
            // per-instance player and reused across loadVideoById reuse loads, so
            // an error always pertains to the load currently in flight. Capturing
            // a generation here would bind it to the first load and wrongly skip
            // settling every reuse-load error. (Poll/timeout differ — they are
            // created fresh per load, so they capture myGen.) See ADR-0005 §4.
            this._settleLoadPromise(this.loadGen);
          },
        },
      });

      // Keep the iframe sized to the Construct-managed container.
      this.ResizePlayer();
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => this.ResizePlayer());
      this.resizeObserver.observe(this.element);
    }

    private buildPlayerVars(videoId: string): object {
      const safeOrigin = (): string | undefined => {
        const o = typeof window !== "undefined" ? window.location.origin : "";
        return /^https?:\/\//.test(o) ? o : undefined;
      };
      const vars: Record<string, number | string> = {
        autoplay: 1,
        playsinline: 1,
        rel: 0,
        controls: this.enableChrome ? 1 : 0,
        mute: this.lastMuted ? 1 : 0,
        cc_load_policy: this.subtitleLang !== "off" ? 1 : 0,
      };
      if (this.loop) {
        vars["loop"] = 1;
        vars["playlist"] = videoId; // YouTube requires playlist=videoId for single-video loop
      }
      if (this.start > 0) {
        vars["start"] = this.start;
      }
      const origin = safeOrigin();
      if (origin !== undefined) {
        vars["origin"] = origin;
      }
      console.debug("[video player] playerVars", vars);
      return vars;
    }

    ResizePlayer() {
      if (!this.player) {
        return;
      }
      const width = this.element.clientWidth;
      const height = this.element.clientHeight;
      if (width > 0 && height > 0) {
        this.player.setSize(width, height);
      }
    }

    // Re-apply the user's audio intent to the player. Called when a player becomes
    // ready and on each video load — YouTube's onReady fires only once per player
    // construction, so subsequent loadVideoById calls must restore audio explicitly.
    // Note: lastMuted/lastVolume hold the user's *intent* via the ACEs, so a mute
    // the user makes through YouTube's native chrome is treated as transient — it
    // is overridden by the stored intent on the next load.
    private RestoreAudioState() {
      if (!this.player) {
        return;
      }
      // lastVolume is 0..1; -1 means "never set" — leave the player default then.
      if (this.lastVolume >= 0) {
        this.player.setVolume(this.lastVolume * 100);
      }
      if (this.lastMuted) {
        this.player.mute();
      } else {
        this.player.unMute();
      }
    }

    // Post the player's current audio readout. The DOM side is authoritative for
    // audioState (the runtime no longer infers mute from volume) — YouTube's
    // getVolume() is independent of mute, so always send both together.
    private PostAudioState() {
      if (!this.player) {
        return;
      }
      this.PostStateToRuntime({
        currentVolume: this.player.getVolume() / 100,
        audioState: this.player.isMuted() ? "muted" : "unmuted",
      });
    }

    StartPlaybackPolling() {
      if (this.playbackTimer !== null) {
        return;
      }
      // YouTube provides no `timeupdate` event, so poll getCurrentTime() while
      // playing. 250ms (~4 updates/sec) keeps the readout smooth without churn.
      this.playbackTimer = globalThis.setInterval(() => {
        if (this.player) {
          this.PostStateToRuntime({
            currentPlaybackTime: this.player.getCurrentTime(),
            currentVolume: this.player.getVolume() / 100,
            audioState: this.player.isMuted() ? "muted" : "unmuted",
          });
        }
      }, 250);
    }

    StopPlaybackPolling() {
      if (this.playbackTimer !== null) {
        globalThis.clearInterval(this.playbackTimer);
        this.playbackTimer = null;
      }
    }

    DestroyPlayer() {
      this.StopPlaybackPolling();
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      if (this.player) {
        try {
          this.player.destroy();
        } catch (e) {
          console.warn("[video player] destroy failed", e);
        }
        this.player = null;
      }
    }

    Destroy() {
      // Settle any pending load so a destroyed element never hangs an awaiting
      // action.
      this._clearLoadWaiters();
      const resolve = this.loadReadyResolve;
      this.loadReadyResolve = null;
      resolve?.(null);
      // Remove event listeners.
      this.controller.abort();
      this.currentUrl = "";
      this.currentVideoId = "";
      this.DestroyPlayer();
    }

    // Awaitable form of Load Video. Returns a promise that resolves to null once
    // the new video's metadata is loaded (getDuration() > 0) for this load, or
    // settles on error / 15s timeout / supersession / Destroy. "Resolved" means
    // the load attempt is done, not that it succeeded — branch via On error /
    // Is ready. Readiness is polled, not taken from a play state (see the
    // loadReadyResolve field note and ADR-0005 / issue #18).
    OnLoadVideo(data: JSONObject): Promise<JSONValue> {
      // Supersede any pending load promise from a previous Load Video so the
      // prior awaiter is not left hanging.
      this._clearLoadWaiters();
      const prevResolve = this.loadReadyResolve;
      this.loadReadyResolve = null;
      prevResolve?.(null);

      const myGen = ++this.loadGen;
      const willLoad = this.UpdateState(data);
      if (!willLoad) {
        // Unchanged URL or offline transition — nothing to await.
        return Promise.resolve(null);
      }

      // On player reuse, loadVideoById briefly still reports the OLD video's
      // duration before resetting to 0; require we first observe the reset (or a
      // fresh player with no duration yet) before accepting duration > 0, so a
      // stale duration can't resolve the new load early.
      let sawReset = false;
      return new Promise<JSONValue>((resolve) => {
        this.loadReadyResolve = resolve;
        this.loadReadyPoll = globalThis.setInterval(() => {
          if (this.loadGen !== myGen) {
            return; // superseded
          }
          const duration = this.player?.getDuration() ?? 0;
          if (!sawReset) {
            if (duration === 0) {
              sawReset = true;
            }
            return;
          }
          if (duration > 0) {
            this._settleLoadPromise(myGen);
          }
        }, 100);
        this.loadReadyTimer = globalThis.setTimeout(
          () => this._settleLoadPromise(myGen),
          15000
        );
      });
    }

    OnPlay() {
      console.log("[video player] Play requested");
      this.player?.playVideo();
    }

    OnPause() {
      console.log("[video player] Pause requested");
      this.player?.pauseVideo();
    }

    OnSeek(state: JSONObject) {
      const time = state["requestedPlaybackTime"];
      console.log("[video player] Seek requested", time);
      if (typeof time === "number") {
        this.player?.seekTo(time, true);
      }
    }

    OnSetVolume(state: JSONObject) {
      const volume = state["requestedVolume"];
      console.log("[video player] Set volume requested", volume);
      if (typeof volume === "number") {
        // ACE/runtime value is 0..1; keep lastVolume in 0..1 units.
        this.lastVolume = volume;
        // YouTube API volume is 0..100.
        this.player?.setVolume(volume * 100);
        this.PostAudioState();
      }
    }

    OnMute() {
      console.log("[video player] Mute requested");
      this.lastMuted = true;
      this.player?.mute();
      // Post via PostAudioState so audioState and currentVolume always travel
      // together — keeps GetCurrentVolume fresh after a mute/unmute, not just
      // after the next playback poll.
      this.PostAudioState();
    }

    OnUnmute() {
      console.log("[video player] Unmute requested");
      this.lastMuted = false;
      this.player?.unMute();
      this.PostAudioState();
    }

    OnResize() {
      console.log("[video player] Resize requested");
      this.ResizePlayer();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).Genvidtech_YouTubeVideoPlugin_ElementHandler =
    ElementHandler;
}
