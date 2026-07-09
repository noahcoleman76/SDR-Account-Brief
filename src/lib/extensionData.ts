import type { ImportSummary, SalesforceDataset } from "../types/salesforce";

type DataRequest =
  | {
      type: "GET_IMPORT_SUMMARY";
    }
  | {
      type: "GET_DATASET";
    };

type DataResponse<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

function sendMessage<T>(message: DataRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: DataResponse<T> | undefined) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      if (!response) {
        reject(new Error("No response from extension background service worker."));
        return;
      }

      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }

      resolve(response.data);
    });
  });
}

export function getSummaryFromExtension(): Promise<ImportSummary | undefined> {
  return sendMessage<ImportSummary | undefined>({ type: "GET_IMPORT_SUMMARY" });
}

export function getDatasetFromExtension(): Promise<SalesforceDataset> {
  return sendMessage<SalesforceDataset>({ type: "GET_DATASET" });
}
