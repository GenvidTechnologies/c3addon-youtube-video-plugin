import type { SDKInstanceClass } from "./instance";

const C3 = globalThis.C3;

C3.Plugins.Genvidtech_YouTubeVideoPlugin.Exps =
{
	State(this:SDKInstanceClass) {
		return JSON.stringify(this._GetState());
	},
	GetLastErrorCategory(this:SDKInstanceClass) {
		return this._GetLastError().category;
	},
	GetLastErrorMessage(this:SDKInstanceClass) {
		return this._GetLastError().message;
	},
	GetCurrentPlaybackTime(this:SDKInstanceClass) {
		return this._currentPlaybackTime;
	},
	GetCurrentVolume(this:SDKInstanceClass) {
		return this._currentVolume;
	},
	GetDuration(this:SDKInstanceClass) {
		return this._duration;
	},
	URL(this:SDKInstanceClass) {
		return this._GetURL();
	},
	Subtitles(this:SDKInstanceClass) {
		return this._GetSubtitles();
	},
	GetEnableChrome(this:SDKInstanceClass) {
		return this._GetEnableChrome();
	},
	// Dormant — no ACE wired up yet (see issue #12).
	GetPlaybackRate(this: SDKInstanceClass) {
		return this._playbackRate;
	},
	GetAvailablePlaybackRate(this: SDKInstanceClass, index: number) {
		return this._availablePlaybackRates[index] ?? 0;
	},
	GetAvailablePlaybackRateCount(this: SDKInstanceClass) {
		return this._availablePlaybackRates.length;
	},
	GetVideoTitle(this: SDKInstanceClass) {
		return this._videoTitle;
	},
	GetPlayerUrl(this: SDKInstanceClass) {
		return this._playerVideoUrl;
	},
	GetVideoLoadedFraction(this: SDKInstanceClass) {
		return this._loadedFraction;
	}
};
