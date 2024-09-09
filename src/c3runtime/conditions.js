const C3 = self.C3;

C3.Plugins.Genvidtech_GCoreVideoPlugin.Cnds =
{
	OnStateChanged() {
		return true;
	},
	OnError() {
		return true;
	},
	IsPlaying() {
		return this._isPlaying;
	},
	IsPaused() {
		return this._isPaused;
	},
	IsLoading() {
		return this._isLoading;
	},
	IsReady() {
		return this._isReady;
	},
	IsEnded() {
		return this._isEnded;
	},
	IsMuted() {
		return this._isMuted;
	}
};
