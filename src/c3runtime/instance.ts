const C3 = globalThis.C3;

// NOTE: use a unique DOM component ID to ensure it doesn't clash with anything else.
// This must also match the ID in plugin.js and domSide.js.
const DOM_COMPONENT_ID = "genvidtech-youtubevideoplugin";

type DebuggerProperties = { 
	title: string; 
	properties: { 
		name: string; 
		value: string|number|boolean,
		onedit?: (v: string|number|boolean) => void;
	}[];
}[];

class YouTubeVideoInstance extends globalThis.ISDKDOMInstanceBase {
	
	_url: string = "";
	_subtitles: string = "";
	_enableChrome: boolean = true;
	_loop: boolean = false;
	_start: number = 0;
	_isInitialized = false;
	_isReady = false;

	_currentPlaybackTime = 0;
	_currentVolume = -1;
	_duration = -1;

	// Cache fields for issue #12 (YouTube-specific ACEs) — pushed from
	// ElementHandler.PostVideoMetadataState()/StartLoadedFractionPolling().
	_playbackRate = 1;
	_availablePlaybackRates: number[] = [];
	_videoTitle = "";
	_playerVideoUrl = "";
	_loadedFraction = 0;

	_playerState = "offline";
	_audioState = "offline";

	_lastError = {
		category: "",
		message: ""
	};

	constructor() {
		super({ domComponentId: DOM_COMPONENT_ID });

		this._InitializeState();

		const properties = this._getInitProperties();

		if (properties) {
			this._url = (properties[0] ?? "") as string;
			this._subtitles = (properties[1] ?? "off") as string;
			this._enableChrome = (properties[2] ?? true) as boolean;
			this._loop = (properties[3] ?? false) as boolean;
			this._start = (properties[4] ?? 0) as number;
		}

		this._createElement();
	}

	_release() {
		this._InitializeState();
		super._release();
	}

	_getElementState() {
		// Return JSON with the state of the element. This is passed along to both CreateElement()
		// and UpdateState() in domSide.js. It provides a convenient way to send all the DOM element
		// state in one go, ensuring any changes are reflected in the real element.
		return {
			"url": this._url,
			"subtitles": this._subtitles,
			"enableChrome": this._enableChrome,
			"loop": this._loop,
			"start": this._start
		};
	}

	// Reset per-video state. Called at the once-per-load trigger points: _SetURL
	// (a new video requested) and a DOM-side transition to "offline" (video
	// unloaded). NOT called on the transient "loading" playerState (see
	// _OnStateChanged / issue #35). Does NOT clear _isInitialized: that tracks
	// whether the player API has loaded, which persists across video changes.
	_InitializeState() {
		this._isReady = false;

		this._currentPlaybackTime = 0;
		this._currentVolume = -1;
		this._duration = -1;

		this._playbackRate = 1;
		this._availablePlaybackRates = [];
		this._videoTitle = "";
		this._playerVideoUrl = "";
		this._loadedFraction = 0;

		this._playerState = "offline";
		this._audioState = "offline";

		this._lastError = {
			category: "",
			message: ""
		};
	}

	_OnStateChanged(e: JSONObject) {
		if (e.state) {
			const state = e.state as JSONObject;

			// The player API (module) has finished loading.
			if (state.apiInitialized) {
				this._isInitialized = true;
			}

			if (state.playerState) {
				switch (state.playerState) {
					// Only a transition to "offline" (no video) wipes per-video
					// state here. "loading" must NOT reset: the DOM side posts
					// "loading" not just for a genuine new load but on every
					// transient YouTube BUFFERING/UNSTARTED transition — and those
					// fire AFTER metadata is known on a reuse load, so resetting on
					// them wipes _duration/_currentVolume/_isReady back to their
					// reset values right after they were posted, leaving the ready
					// gate below unable to re-satisfy ("Is ready" stuck false for
					// every video after the first). A genuine new load resets in
					// _SetURL instead (which is the real once-per-load trigger).
					// See issue #35.
					case "offline": {
						this._InitializeState();
						break;
					}
				}
				this._playerState = state.playerState as string;
			}

			// Check if audio state has been updated
			if (state.audioState) {
				this._audioState = state.audioState as string;
			}

			// Use !== undefined (not truthiness) so a legitimate 0 — a muted
			// volume, a zero duration/playback time — is stored rather than
			// dropped. Dropping a muted volume of 0 was preventing the player
			// from ever reaching its "initialized" (ready) state.
			if (state.currentPlaybackTime !== undefined) {
				this._currentPlaybackTime = state.currentPlaybackTime as number;
			}

			// Store the reported volume. Mute-state is NOT inferred from volume — YouTube's
			// getVolume() is independent of mute (a muted player still reports its level).
			// `_audioState` is driven solely by the explicit `state.audioState` the DOM side
			// posts (from isMuted()), handled above.
			// Use !== undefined (not truthiness) so a legitimate 0 volume is stored, not
			// dropped — that 0 is also what lets the player reach its ready/initialized state.
			if (state.currentVolume !== undefined) {
				this._currentVolume = state.currentVolume as number;
			}

			if (state.duration !== undefined) {
				this._duration = state.duration as number;
			}

			// Issue #12 fields, pushed from ElementHandler.PostVideoMetadataState/
			// StartLoadedFractionPolling. Use !== undefined for the same reason as
			// above: a legit 0/"" must not be dropped.
			if (state.playbackRate !== undefined) {
				this._playbackRate = state.playbackRate as number;
			}

			if (state.availablePlaybackRates !== undefined) {
				this._availablePlaybackRates = state.availablePlaybackRates as number[];
			}

			if (state.videoTitle !== undefined) {
				this._videoTitle = state.videoTitle as string;
			}

			if (state.playerVideoUrl !== undefined) {
				this._playerVideoUrl = state.playerVideoUrl as string;
			}

			if (state.loadedFraction !== undefined) {
				this._loadedFraction = state.loadedFraction as number;
			}

			// Mark the video as ready (loaded and playable) once its volume and
			// duration are known.
			if (!this._isReady && this._currentVolume > -1 && this._duration > -1) {
				this._isReady = true;
			}
		}

		this._trigger(C3.Plugins.Genvidtech_YouTubeVideoPlugin.Cnds.OnStateChanged);
	}

	_OnError(e: JSONValue) {
		this._lastError = (e as JSONObject).error as typeof this._lastError;
		this._trigger(C3.Plugins.Genvidtech_YouTubeVideoPlugin.Cnds.OnError);
	}

	_GetLastError() {
		return this._lastError;
	}

	_Play() {
		this._postToDOMElement("play", null);
	}

	_Pause() {
		this._postToDOMElement("pause", null);
	}

	_SetPlaybackTime(playbackTime: number) {
		this._postToDOMElement("seek", { requestedPlaybackTime: playbackTime });
	}

	_SetVolume(level: number) {
		this._postToDOMElement("setVolume", { requestedVolume: level });
	}

	// Backs the SetPlaybackRate action (issue #12).
	_SetPlaybackRate(rate: number) {
		this._postToDOMElement("setPlaybackRate", { requestedRate: rate });
	}

	_SetMuted(mute: boolean) {
		if (mute) {
			this._postToDOMElement("mute", null);
		} else {
			this._postToDOMElement("unmute", null);
		}
	}

	_Resize() {
		this._postToDOMElement("resize", null);
	}

	_GetState() {
		return {
			playerState: this._playerState,
			audioState: this._audioState,
			currentVolume: this._currentVolume,
			duration: this._duration,
			currentPlaybackTime: this._currentPlaybackTime,
			playbackRate: this._playbackRate,
			availablePlaybackRates: this._availablePlaybackRates,
			videoTitle: this._videoTitle,
			playerVideoUrl: this._playerVideoUrl,
			loadedFraction: this._loadedFraction,
		};
	}

	_SetURL(url: string): Promise<JSONValue> {
		if (this._url === url) {
			// No-op: nothing to load, so the awaitable load resolves immediately.
			return Promise.resolve(null);
		}

		this._url = url;
		// Loading a video starts with a clean subtitle slate: subtitles are no
		// longer a SetURL parameter. Use SetSubtitles after loading. This also
		// stops the previous video's subtitle selection from leaking onto the
		// new one.
		this._subtitles = "off";
		// Reset per-video state HERE — the genuine once-per-load trigger — rather
		// than on the DOM-side "loading" playerState message, which also fires on
		// transient buffering and would wipe readiness after metadata is known
		// (see the _OnStateChanged "loading" note and issue #35). "Is ready" thus
		// correctly drops to false the moment a new video is requested and re-
		// latches once the new video's volume and duration arrive. Keep
		// _playerState as "loading" (not the "offline" _InitializeState sets) so a
		// load-in-progress reads as loading until the DOM confirms.
		this._InitializeState();
		this._playerState = "loading";
		// Drive the load over the async DOM bridge instead of the fire-and-forget
		// _updateElementState(): the "loadVideo" handler returns a promise that
		// resolves once the new video's metadata is loaded (or settles on
		// error/timeout/supersession), so an event sheet can await Load Video
		// before applying post-load settings (Set playback time, etc.). See
		// ElementHandler.OnLoadVideo / ADR-0005.
		return this._postToDOMElementAsync("loadVideo", this._getElementState());
	}

	_GetURL() {
		return this._url;
	}

	_SetSubtitles(language?: string) {
		language = language || "off";
		if (this._subtitles === language)
			return;

		this._subtitles = language;
		this._updateElementState();
	}

	_GetSubtitles() {
		return this._subtitles;
	}

	_SetEnableChrome(enable?: boolean) {
		// Only default when the arg is actually absent (nullish); an explicit
		// false must be preserved.
		enable = enable ?? false;
		if (this._enableChrome === enable)
			return;

		this._enableChrome = enable;
		this._updateElementState();
	}

	_GetEnableChrome() {
		return this._enableChrome ? 1 : 0;
	}

	_saveToJson() {
		// TODO: Add more state in it?
		return {
			// data to be saved for savegames
			"url": this._url,
			"subtitles": this._subtitles,
			"enableChrome": this._enableChrome,
			"loop": this._loop,
			"start": this._start
		};
	}

	_loadFromJson(o: JSONObject) {
		// load state for savegames
		this._url = (o["url"] ?? "") as string;
		this._subtitles = (o["subtitles"] ?? "off") as string;
		this._enableChrome = (o["enableChrome"] ?? true) as boolean;
		this._loop = (o["loop"] ?? false) as boolean;
		this._start = (o["start"] ?? 0) as number;

		this._updateElementState();		// ensures any state changes are updated in the DOM
	}

	_getDebuggerProperties(): DebuggerProperties {
		const prefix = "plugins.genvidtech_youtubevideoplugin.debugger.";
		return [
			{
				title: prefix + "title",
				properties: [
					{ name: prefix + "isInitialized", value: this._isInitialized },
					{ name: prefix + "isReady", value: this._isReady },
					{ name: prefix + "url", value: this._url, onedit: v => this._SetURL(v as string) },
					{ name: prefix + "subtitles", value: this._subtitles, onedit: v => this._SetSubtitles(v as string) },
					{ name: prefix + "enableChrome", value: this._enableChrome, onedit: v => this._SetEnableChrome(v as boolean) },
					{ name: prefix + "loop", value: this._loop },
					{ name: prefix + "start", value: this._start },
					{ name: prefix + "playbackTime", value: this._currentPlaybackTime, onedit: v => this._SetPlaybackTime(v as number) },
					{ name: prefix + "volume", value: this._currentVolume, onedit: v => this._SetVolume(v as number) },
					{ name: prefix + "duration", value: this._duration },
					{ name: prefix + "playerState", value: this._playerState },
					{ name: prefix + "audioState", value: this._audioState },
					{ name: prefix + "lastErrorCategory", value: this._lastError.category as string },
					{ name: prefix + "lastErrorMessage", value: this._lastError.message as string },
					// Issue #12 rows: playback rate and video metadata.
					{ name: prefix + "playbackRate", value: this._playbackRate, onedit: v => this._SetPlaybackRate(v as number) },
					{ name: prefix + "availablePlaybackRates", value: JSON.stringify(this._availablePlaybackRates) },
					{ name: prefix + "videoTitle", value: this._videoTitle },
					{ name: prefix + "playerVideoUrl", value: this._playerVideoUrl },
					{ name: prefix + "loadedFraction", value: this._loadedFraction }
				]
			},
		];
	}
};

C3.Plugins.Genvidtech_YouTubeVideoPlugin.Instance = YouTubeVideoInstance;

export type { YouTubeVideoInstance as SDKInstanceClass };