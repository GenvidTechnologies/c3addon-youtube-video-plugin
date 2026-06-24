"use strict";

{

interface IElementHandler {
	elementId: number;
}

class ElementHandlerMap {
	_map: Map<string, IElementHandler>;

	constructor() {
		this._map = new Map();
	}
	Set(element: HTMLElement, handler: IElementHandler) {
		let id = element.id ?? "";
		if (id !== "") {
			console.error({ error: "Element already have an id", element });
			throw new Error("Element already initialized!");
		}
		id = `youtube_${handler.elementId}`;
		if (this._map.has(id)) {
			console.error({ error: "Handler already exists", id });
			throw new Error("Handler already exists");
		}
		element.id = id;
		this._map.set(id, handler);
		return handler;
	}

	Get(element: HTMLElement) {
		const id = element.id;
		if (!id) {
			console.error({ error: "No element Id on element", element });
			throw new Error("No element identifier");
		}
		if (!this._map.has(id)) {
			console.error({ error: "No handler with that id", id });
			throw new Error("Handler does not exist");
		}
		return this._map.get(id);
	}

	Delete(element: HTMLElement) {
		const handler = this.Get(element);
		this._map.delete(element.id);
		return handler;
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Genvidtech_YouTubeVideoPlugin_ElementHandlerMap = ElementHandlerMap;

}
