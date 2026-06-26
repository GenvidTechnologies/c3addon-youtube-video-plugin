import type { SDKInstanceClass } from "./instance.js";

const C3 = self.C3;

C3.Plugins.Genvidtech_YouTubeVideoPlugin.Acts = {
	Play(this: SDKInstanceClass) {
		this._Play();
	},
	Pause(this: SDKInstanceClass) {
		this._Pause();
	},
	SetMuted(this: SDKInstanceClass, mute: boolean) {
		this._SetMuted(mute);
	},
	SetPlaybackTime(this:SDKInstanceClass, playbackTime: number) {
		this._SetPlaybackTime(playbackTime);
	},
	SetVolume(this:SDKInstanceClass, level: number) {
		this._SetVolume(level);
	},
	SetURL(this:SDKInstanceClass, url: string) {
		this._SetURL(url);
	},
	SetSubtitles(this:SDKInstanceClass, language: string) {
		this._SetSubtitles(language);
	},
	SetQuality(this:SDKInstanceClass, level: number) {
		this._SetQuality(level);
	},
	SetEnableChrome(this:SDKInstanceClass, enable: boolean) {
		this._SetEnableChrome(enable);
	},
	AddSubtitleSource(this:SDKInstanceClass, url: string, language: string, label: string) {
		this._AddSubtitleSource(url, language, label);
	},
	AddProjectSubtitleSource(this:SDKInstanceClass, file: string, language: string, label: string) {
		// Async action (aces.json isAsync) — return the promise so Construct waits
		// for the project file URL to resolve before continuing.
		return this._AddProjectSubtitleSource(file, language, label);
	},
	Resize(this: SDKInstanceClass) {
		this._Resize();
	}
};
