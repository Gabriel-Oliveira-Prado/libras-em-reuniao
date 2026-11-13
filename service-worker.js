import { instalarServicoMeet } from "./meet/servico.mjs";

instalarServicoMeet(chrome);

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
