import {
  ConfigService,
  SyncUtil,
} from "../../assets/lib/kookit-extra-browser.min";
import { isTokenExpired } from "../common";
import { getCloudConfig } from "../file/common";
import WebDavService from "./webdavService";

class SyncService {
  private static syncUtilCache: { [key: string]: any } = {};
  private static pickerUtilCache: { [key: string]: any } = {};
  static async getSyncUtil() {
    let service = ConfigService.getItem("defaultSyncOption");
    if (!service) {
      return new SyncUtil("", {});
    }
    if (service === "webdav") {
      if (!this.syncUtilCache[service]) {
        let config = await getCloudConfig(service);
        this.syncUtilCache[service] = new WebDavService(config);
      }
      return this.syncUtilCache[service];
    }
    if (!this.syncUtilCache[service] || (await isTokenExpired(service))) {
      let config = await getCloudConfig(service);

      this.syncUtilCache[service] = new SyncUtil(service, config);
    }
    return this.syncUtilCache[service];
  }
  static removeSyncUtil(service) {
    if (this.syncUtilCache[service]) {
      if (typeof this.syncUtilCache[service].clearQueue === "function") {
        this.syncUtilCache[service].clearQueue();
      }
      delete this.syncUtilCache[service];
    }
  }
  static async getPickerUtil(service: string) {
    if (service === "webdav") {
      if (!this.pickerUtilCache[service]) {
        let config = await getCloudConfig(service);
        this.pickerUtilCache[service] = new WebDavService(config);
      }
      return this.pickerUtilCache[service];
    }
    if (!this.pickerUtilCache[service] || (await isTokenExpired(service))) {
      let config = await getCloudConfig(service);
      config.baseFolder = "";

      this.pickerUtilCache[service] = new SyncUtil(service, config);
    }
    return this.pickerUtilCache[service];
  }
  static async removePickerUtil(service: string) {
    delete this.pickerUtilCache[service];
  }
}
export default SyncService;
