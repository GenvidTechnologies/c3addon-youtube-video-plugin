
const SDK = self.SDK;

const PLUGIN_CLASS = SDK.Plugins.Genvidtech_GCoreVideoPlugin;

PLUGIN_CLASS.Type = class GCoreVideoPluginType extends SDK.ITypeBase
{
	constructor(sdkPlugin, iObjectType)
	{
		super(sdkPlugin, iObjectType);
	}
};
