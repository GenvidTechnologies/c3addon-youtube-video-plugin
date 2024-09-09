const C3 = self.C3;

C3.Plugins.Genvidtech_GCoreVideoPlugin.Exps =
{
	State() {
		return JSON.stringify(this._GetState());
	},
	GetLastErrorCategory() {
		return this._GetLastError().category;
	},
	GetLastErrorMessage() {
		return this._GetLastError().message;
	},
	GetCurrentPlaybackTime() {
		const state = this._GetState();
		return state.currentPlaybackTime;
	},
	GetCurrentVolume() {
		const state = this._GetState();
		return state.currentVolume;
	},
	GetDuration() {
		const state = this._GetState();
		return state.duration;
	},
	URL() {
		return this._GetURL();
	},
	Subtitles() {
		return this._GetSubtitles();
	}
};
