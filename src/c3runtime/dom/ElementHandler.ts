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
    setPlaybackRate(rate: number): void;
    getPlaybackRate(): number;
    getAvailablePlaybackRates(): number[];
    getVideoUrl(): string;
    getVideoLoadedFraction(): number;
    getVideoData?(): { title?: string; video_id?: string; author?: string };
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
        // Fallback: inject a clean *classic* <script> DOM-side so the API loads
        // even when the remote dependency declared in plugin.ts didn't. In
        // Construct *preview* that declared tag is fetched with `crossorigin`
        // and fails CORS (youtube.com/iframe_api sends no ACAO header), yet the
        // failed <script> stays in the DOM with this same `src`. So we must NOT
        // key "already injected" off its src — that would make us skip the
        // working load and hang. Key off our OWN marker instead; a classic tag
        // (no crossorigin) is not CORS-gated and loads in preview and export
        // alike. (On export the declared tag loads before the runtime, so the
        // `w.YT` check above usually resolves first and we never inject here.)
        const IFRAME_API_MARKER = "data-yt-iframe-api";
        const alreadyInjected =
          document.querySelector(`script[${IFRAME_API_MARKER}]`) !== null;
        if (!alreadyInjected) {
          const tag = document.createElement("script");
          tag.src = YOUTUBE_IFRAME_API_URL;
          tag.setAttribute(IFRAME_API_MARKER, "");
          tag.addEventListener("error", () => {
            console.error(`[YouTubeVideo] failed to load ${YOUTUBE_IFRAME_API_URL}`);
          });
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
    // youtu.be/<id>, youtube.com/watch?v=<id>, /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
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
    loadedFractionTimer: number | null;
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
      this.loadedFractionTimer = null;
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

      if (this.currentUrl === url) {
        // URL unchanged — apply lightweight changes (e.g. chrome/controls) to
        // the existing player without rebuilding it.
        // TODO(youtube): apply live chrome changes here. Subtitle language is
        // construction-time only (cc_lang_pref via Load Video) by design —
        // live caption switching is a future issue.
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
        this.StartLoadedFractionPolling();
        return;
      }

      // Build the player on a PRE-CREATED <iframe> placed INSIDE the
      // Construct-managed container <div>, rather than letting YT.Player replace
      // a <div> with its own iframe. Two reasons:
      //  1) Visibility: the iframe lives inside the container Construct
      //     positions/sizes/shows, so set-visible and layout geometry reach the
      //     player. (Building on this.element directly detaches it — the replaced
      //     iframe floats free and "stays invisible".)
      //  2) Cross-origin isolation: when the page is COOP+COEP isolated (e.g.
      //     Construct's worker / SharedArrayBuffer preview,
      //     `crossOriginIsolated === true`), a normal cross-origin YouTube iframe
      //     is blocked — chrome loads but the video stays black with a spinner
      //     because the media (googlevideo.com, no CORP header) can't load. A
      //     `credentialless` iframe is the standard escape hatch, but the
      //     attribute must be set BEFORE the iframe navigates, so we must create
      //     the iframe ourselves (YT.Player's own iframe can't be marked in
      //     time). Only mark it when actually isolated — credentialless drops
      //     cookies, so leaving it off elsewhere keeps sign-in-gated playback
      //     working. Verified empirically under COOP/COEP (see
      //     docs/youtube-player-api.md).
      const iframe = document.createElement("iframe");
      if ((globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated) {
        iframe.setAttribute("credentialless", "");
      }
      iframe.src = this.buildEmbedUrl(videoId);
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "none";
      iframe.style.display = "block";
      // The container has pointer-events:none for game input; re-enable them on
      // the iframe so YouTube's own chrome stays usable.
      iframe.style.pointerEvents = "auto";
      iframe.setAttribute(
        "allow",
        "autoplay; encrypted-media; picture-in-picture; fullscreen"
      );
      this.element.appendChild(iframe);
      this.player = new YT.Player(iframe, {
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
            this.PostVideoMetadataState();
            this.PostAudioState();
            this.StartLoadedFractionPolling();
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
                this.PostVideoMetadataState();
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
                this.PostStateToRuntime({ playerState: "loading" });
                break;
              case PS.CUED:
                this.PostStateToRuntime({ playerState: "loading" });
                this.PostVideoMetadataState();
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
          onPlaybackRateChange: (ev: YTPlayerEvent) => {
            this.PostStateToRuntime({ playbackRate: ev.target.getPlaybackRate() });
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
      if (this.subtitleLang !== "off") {
        vars["cc_lang_pref"] = this.subtitleLang; // prefer this caption language at load
      }
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

    // Build the youtube.com/embed/<id> URL (with enablejsapi=1) that the
    // pre-created <iframe> loads; YT.Player then attaches to that iframe in
    // place. Reuses buildPlayerVars() so the URL params match the option form.
    private buildEmbedUrl(videoId: string): string {
      const params = new URLSearchParams({ enablejsapi: "1" });
      const vars = this.buildPlayerVars(videoId) as Record<string, string | number>;
      for (const [k, v] of Object.entries(vars)) {
        params.set(k, String(v));
      }
      return `https://www.youtube.com/embed/${encodeURIComponent(
        videoId
      )}?${params.toString()}`;
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

    // Post an unofficial/official metadata snapshot: title (unofficial getVideoData(),
    // guarded), video URL, playback rate and its available values. Called from
    // onReady, and on state transitions to PLAYING/CUED where metadata may have
    // changed or just become available (see issue #12).
    private PostVideoMetadataState() {
      if (!this.player) return;
      let videoTitle = "";
      try {
        videoTitle = this.player.getVideoData?.()?.title ?? "";
      } catch (e) {
        console.warn("[video player] getVideoData failed (unofficial API)", e);
      }
      this.PostStateToRuntime({
        videoTitle,
        playerVideoUrl: this.player.getVideoUrl(),
        playbackRate: this.player.getPlaybackRate(),
        availablePlaybackRates: this.player.getAvailablePlaybackRates(),
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

    // YouTube provides no buffered-progress event, so poll getVideoLoadedFraction()
    // while a load is in flight. Self-terminates once the fraction reaches 1.0.
    // Started from onReady (first load) and from the player-reuse branch of
    // CreatePlayer (loadVideoById); idempotent (null-guarded) so either caller
    // is safe.
    StartLoadedFractionPolling() {
      if (this.loadedFractionTimer !== null) {
        return;
      }
      this.loadedFractionTimer = globalThis.setInterval(() => {
        let frac = 0;
        try {
          frac = this.player?.getVideoLoadedFraction() ?? 0;
        } catch (e) {
          console.warn("[video player] getVideoLoadedFraction failed", e);
        }
        this.PostStateToRuntime({ loadedFraction: frac });
        if (frac >= 1.0) {
          this.StopLoadedFractionPolling();
        }
      }, 500);
    }

    StopLoadedFractionPolling() {
      if (this.loadedFractionTimer !== null) {
        globalThis.clearInterval(this.loadedFractionTimer);
        this.loadedFractionTimer = null;
      }
    }

    DestroyPlayer() {
      this.StopPlaybackPolling();
      this.StopLoadedFractionPolling();
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
          // YT attaches API methods (getDuration, ...) only after the player's
          // onReady fires — before that `new YT.Player()` returns a shell where
          // `getDuration` is not yet a function (`?.` guards null, not a missing
          // method). Treat "not ready yet" as duration 0 so the poll keeps going
          // (and naturally trips `sawReset`) instead of throwing every tick.
          const player = this.player;
          const duration =
            typeof player?.getDuration === "function" ? player.getDuration() : 0;
          if (!sawReset) {
            if (duration === 0) {
              sawReset = true;
            }
            return;
          }
          if (duration > 0) {
            // Forward the new video's duration to the runtime. onReady posts
            // duration too, but it fires only once per YT.Player — on a reuse
            // load (loadVideoById) it never re-fires, so without this the runtime
            // keeps the -1 that _InitializeState() set on "loading" and its ready
            // gate (currentVolume > -1 && duration > -1) never re-satisfies, so
            // "Is ready" stays false for every load after the first. Sourcing it
            // from this poll (not a play-state event) also stays robust when
            // autoplay is blocked and PLAYING never fires — same rationale as the
            // readiness poll itself. See issue #35 / ADR-0005.
            this.PostStateToRuntime({ duration });
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

    // Called via the domSide.ts message bridge from the Set playback rate ACE.
    OnSetPlaybackRate(state: JSONObject) {
      const rate = state["requestedRate"];
      if (typeof rate === "number") {
        this.player?.setPlaybackRate(rate);
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
