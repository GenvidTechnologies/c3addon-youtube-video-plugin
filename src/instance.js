
const SDK = self.SDK;

const PLUGIN_CLASS = SDK.Plugins.Genvidtech_GCoreVideoPlugin;

PLUGIN_CLASS.Instance = class GCoreVideoInstance extends SDK.IInstanceBase
{
	constructor(sdkType, inst)
	{
		super(sdkType, inst);
	}
	
	Release()
	{
	}
	
	OnCreate()
	{
	}
	
	OnPropertyChanged(id, value)
	{
	}
};
