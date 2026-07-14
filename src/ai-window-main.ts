import type { AiWindowStateEnvelope } from "./shared/ai-window.js";
import {
  createAiWorkspaceWindow,
  type AiWorkspaceWindowController,
} from "./ui/ai-workspace-window.js";

const host = document.querySelector<HTMLElement>("#ai-window-app");
if (host === null) throw new Error("AI window mount is unavailable");

let destroyed = false;
let lastSequence = -1;
let controller: AiWorkspaceWindowController | null = null;

const createController = (envelope: AiWindowStateEnvelope): AiWorkspaceWindowController =>
  createAiWorkspaceWindow(host, {
    presentation: "native",
    initialState: envelope.state,
    onSend(prompt, context) {
      void window.aiWindowApi.sendIntent({ type: "send", prompt, ...context });
    },
    onCancel: () => void window.aiWindowApi.sendIntent({ type: "cancel" }),
    onSelectProject: (projectId) =>
      void window.aiWindowApi.sendIntent({ type: "select-project", projectId }),
    onSelectConversation: (projectId, conversationId) =>
      void window.aiWindowApi.sendIntent({
        type: "select-conversation",
        projectId,
        conversationId,
      }),
    onNewConversation: (projectId) =>
      void window.aiWindowApi.sendIntent({ type: "new-conversation", projectId }),
    onModeChange: (mode) => void window.aiWindowApi.sendIntent({ type: "mode-change", mode }),
    onOpenModelSettings: () => void window.aiWindowApi.sendIntent({ type: "open-model-settings" }),
    onReviewDecision: (reviewId, accepted) =>
      void window.aiWindowApi.sendIntent({ type: "review-decision", reviewId, accepted }),
    onOpenChange(open) {
      if (!open && !destroyed) void window.aiWindowApi.sendIntent({ type: "close" });
    },
  });

const adoptState = (envelope: AiWindowStateEnvelope): void => {
  if (destroyed || envelope.sequence < lastSequence) return;
  lastSequence = envelope.sequence;
  document.documentElement.lang = envelope.locale;
  document.documentElement.dataset.locale = envelope.locale;
  document.documentElement.dataset.background = envelope.background;
  document.documentElement.dataset.theme = envelope.theme;
  host.dataset.locale = envelope.locale;
  host.dataset.background = envelope.background;
  host.dispatchEvent(
    new CustomEvent("workbench-locale-change", { detail: { locale: envelope.locale } }),
  );
  if (controller === null) {
    controller = createController(envelope);
    controller.open();
  } else {
    controller.setState(envelope.state);
  }
  document.documentElement.dataset.ready = "true";
};

const unsubscribe = window.aiWindowApi.onState(adoptState);
void window.aiWindowApi.ready();

window.addEventListener(
  "beforeunload",
  () => {
    destroyed = true;
    unsubscribe();
    controller?.destroy();
    controller = null;
  },
  { once: true },
);
