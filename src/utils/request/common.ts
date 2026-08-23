import { isElectron } from "react-device-detect";
import { ConfigService } from "../../assets/lib/kookit-extra-browser.min";

export const parseWithSystemOCR = async (imageBase64: string) => {
  if (!isElectron) {
    return;
  }
  const ipcRenderer = window.electronAPI;
  let result = await ipcRenderer.invoke("system-ocr", {
    base64: imageBase64,
    lang: "auto",
  });
  return result.text || "";
};

export const parseWithExternalOcrApi = async (imageBase64: string) => {
  const url = ConfigService.getReaderConfig("externalOcrUrl");
  if (!url) {
    throw new Error("External OCR API URL not configured");
  }
  const apiKey = ConfigService.getReaderConfig("externalOcrApiKey") || "";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ image: imageBase64 }),
  });
  if (!response.ok) {
    throw new Error(`External OCR API failed: ${response.status}`);
  }
  const data = await response.json();
  return data.text || data.result || data.data?.text || "";
};
