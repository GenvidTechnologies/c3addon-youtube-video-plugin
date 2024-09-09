const C3 = self.C3;

// NOTE: use a unique DOM component ID to ensure it doesn't clash with anything else
// This must also match the ID in instance.js and domSide.js.
const DOM_COMPONENT_ID = "genvidtech-gcorevideoplugin";

// NOTE: DOM plugins derive from C3.SDKDOMPluginBase, not C3.SDKPluginBase.
C3.Plugins.Genvidtech_GCoreVideoPlugin = class GCoreVideoPlugin extends C3.SDKDOMPluginBase {
	constructor(opts) {
		super(opts, DOM_COMPONENT_ID);

		this.AddElementMessageHandler("state-changed", (sdkInst, e) => sdkInst._OnStateChanged(e));
		this.AddElementMessageHandler("error", (sdkInst, e) => sdkInst._OnError(e));
	}

	Release() {
		super.Release();
	}
};
