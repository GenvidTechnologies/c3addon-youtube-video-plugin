import type { SDKInstanceClass } from "./instance.ts";

const C3 = globalThis.C3;

// NOTE: use a unique DOM component ID to ensure it doesn't clash with anything else
// This must also match the ID in instance.js and domSide.js.
const DOM_COMPONENT_ID = "genvidtech-youtubevideoplugin";

// NOTE: DOM plugins derive from C3.SDKDOMPluginBase, not C3.SDKPluginBase.
C3.Plugins.Genvidtech_YouTubeVideoPlugin = class YouTubeVideoPlugin extends globalThis.ISDKDOMPluginBase {
	constructor() {
		super({ domComponentId: DOM_COMPONENT_ID });

		this._addElementMessageHandler<SDKInstanceClass>("state-changed", (sdkInst, e) => sdkInst._OnStateChanged(e as JSONObject));
		this._addElementMessageHandler<SDKInstanceClass>("error", (sdkInst, e) => sdkInst._OnError(e as JSONObject));
	}
};

