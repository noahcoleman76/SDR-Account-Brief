import { getDataset, getSummary } from "../lib/db";

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
  if (message.type === "GET_IMPORT_SUMMARY") {
    void getSummary()
      .then((summary) => sendResponse({ ok: true, data: summary }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Failed to read import summary." })
      );
    return true;
  }

  if (message.type === "GET_DATASET") {
    void getDataset()
      .then((dataset) => sendResponse({ ok: true, data: dataset }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Failed to read imported data." })
      );
    return true;
  }

  return false;
});
