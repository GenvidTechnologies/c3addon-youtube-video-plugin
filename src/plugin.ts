const SDK = globalThis.SDK;

////////////////////////////////////////////
// The plugin ID is how Construct identifies different kinds of plugins.
// *** NEVER CHANGE THE PLUGIN ID! ***
// If you change the plugin ID after releasing the plugin, Construct will think it is an entirely different
// plugin and assume it is incompatible with the old one, and YOU WILL BREAK ALL EXISTING PROJECTS USING THE PLUGIN.
// Only the plugin name is displayed in the editor, so to rename your plugin change the name but NOT the ID.
// If you want to completely replace a plugin, make it deprecated (it will be hidden but old projects keep working),
// and create an entirely new plugin with a different plugin ID.
const PLUGIN_ID = "Genvidtech_GCoreVideoPlugin";
////////////////////////////////////////////

const PLUGIN_CATEGORY = "media";

const PLUGIN_CLASS =
  (SDK.Plugins.Genvidtech_GCoreVideoPlugin = class GCoreVideoPlugin extends (
    SDK.IPluginBase
  ) {
    constructor() {
      super(PLUGIN_ID);

      SDK.Lang.PushContext("plugins." + PLUGIN_ID.toLowerCase());

      this._info.SetName(self.lang(".name"));
      this._info.SetDescription(self.lang(".description"));
      this._info.SetCategory(PLUGIN_CATEGORY);
      this._info.SetAuthor("Genvid Technologies LLC");
      this._info.SetHelpUrl(self.lang(".help-url"));
      this._info.SetPluginType("world"); // mark as world plugin since it's placed in the layout
      this._info.SetIsResizable(true); // allow to be resized
      this._info.AddCommonPositionACEs();
      this._info.AddCommonSceneGraphACEs();
      this._info.AddCommonSizeACEs();
      this._info.AddCommonAngleACEs();
      this._info.AddCommonAppearanceACEs();
      this._info.AddCommonZOrderACEs();

      this._info.AddRemoteScriptDependency(
        "https://vplatform.gvideo.co/_players/latest/gplayerAPI.min.js"
      );

      this._info.SetC3RuntimeScripts(
        [
          "main",
          "plugin",
          "instance",
          "conditions",
          "actions",
          "expressions",
        ].map((f) => `c3runtime/${f}.js`)
      );
      this._info.SetRuntimeModuleMainScript("c3runtime/main.js");
      // Load domSide.js in the document context (main thread).
      // This is important for supporting the runtime's web worker mode.
      this._info.SetDOMSideScripts([
        "c3runtime/dom/ElementHandler.js",
        "c3runtime/dom/ElementHandlerMap.js",
        "c3runtime/domSide.js",
      ]);

      SDK.Lang.PushContext(".properties");

      this._info.SetProperties([
        new SDK.PluginProperty("text", "video-url", ""),
        new SDK.PluginProperty("text", "video-subtitles", "off"),
        new SDK.PluginProperty("check", "no-low-latency", false),
      ]);

      SDK.Lang.PopContext(); // .properties

      SDK.Lang.PopContext(); // .plugins
    }
  });

PLUGIN_CLASS.Register(PLUGIN_ID, PLUGIN_CLASS);

export {};
