export const AI_PROVIDER_CONFIG_CHANGE_EVENT = "ai-provider-config-change";

export function dispatchAiProviderConfigChange(ownerDocument: Document): void {
  const view = ownerDocument.defaultView;
  if (view === null) return;
  view.dispatchEvent(new view.Event(AI_PROVIDER_CONFIG_CHANGE_EVENT));
}
