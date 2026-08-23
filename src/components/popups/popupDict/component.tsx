import React from "react";
import "./popupDict.css";
import { PopupDictProps, PopupDictState } from "./interface";
import {
  ConfigService,
  WordSyncManager,
} from "../../../assets/lib/kookit-extra-browser.min";
import Parser from "html-react-parser";
import DOMPurify from "dompurify";
import axios from "axios";
import DictHistory from "../../../models/DictHistory";
import { Trans } from "react-i18next";
import { getWebsiteUrl, openExternalUrl } from "../../../utils/common";
import toast from "react-hot-toast";
import DatabaseService from "../../../utils/storage/databaseService";
import { getIframeDoc } from "../../../utils/reader/docUtil";
import DictUtil from "../../../utils/file/dictUtil";
import { getBuiltinDictionary } from "../../../utils/plugins/rendererRegistry";
import type { PluginConfig } from "../../../utils/plugins/types";
import {
  executeCustomDictionary,
  isCustomRendererPlugin,
} from "../../../utils/plugins/customPlugin";
class PopupDict extends React.Component<PopupDictProps, PopupDictState> {
  constructor(props: PopupDictProps) {
    super(props);
    this.state = {
      dictText: this.props.t("Please wait"),
      word: "",
      prototype: "",
      dictService: ConfigService.getReaderConfig("dictService"),
      dictTarget: ConfigService.getReaderConfig("dictTarget") || "",
      dictSource: ConfigService.getReaderConfig("dictSource") || "",
      isAddNew: false,
      isShowUrl: false,
    };
  }

  componentDidMount() {
    this.handleLookUp(this.props.originalText);
  }
  UNSAFE_componentWillReceiveProps(nextProps: PopupDictProps) {
    if (nextProps.originalText !== this.props.originalText) {
      this.handleLookUp(nextProps.originalText);
    }
  }
  async handleLookUp(text: string) {
    let originalText = text.replace(/(\r\n|\n|\r)/gm, "").replace(/-/gm, "");
    this.setState({ word: originalText });
    // let prototype = "";
    this.setState({ prototype: originalText });
    if (ConfigService.getReaderConfig("isLemmatizeWord") === "yes") {
      originalText = originalText;
    }
    if (!this.state.dictService) {
      let pluginList = this.props.plugins.filter(
        (item) =>
          item.type === "dictionary" && !item.key.startsWith("official-ai-")
      );
      if (pluginList.length > 0) {
        this.setState({
          dictService: pluginList[0].key,
        });
        ConfigService.setReaderConfig("dictService", pluginList[0].key);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } else {
        this.setState({ isAddNew: true });
        return;
      }
    }
    const dictText = await this.handleDict(originalText);
    this.handleRecordHistory(
      originalText,
      this.props.originalSentence || "",
      dictText || ""
    );
  }
  handleRecordHistory = async (
    text: string,
    sentence: string,
    dictText: string = ""
  ) => {
    let bookKey = this.props.currentBook.key;
    let bookLocation = ConfigService.getObjectConfig(
      bookKey,
      "recordLocation",
      {}
    );
    let chapter = bookLocation.chapterTitle || "";
    let bookName = this.props.currentBook.name || "";
    let word = new DictHistory(bookKey, text, chapter, sentence);
    await DatabaseService.saveRecord(word, "words");
    let wordSyncManager = new WordSyncManager(ConfigService);
    wordSyncManager.syncWordToEudic(text, sentence);
    wordSyncManager.syncWordToAnki(text, sentence, bookName, chapter, dictText);
    wordSyncManager.syncWordToMaiMemo(text);
  };

  handleDict = async (text: string): Promise<string> => {
    let dictText = "";
    try {
      if (
        ConfigService.getReaderConfig("dictService") &&
        ConfigService.getReaderConfig("dictService")?.startsWith("dict-")
      ) {
        this.setState({ isAddNew: false });
        const plugin = this.props.plugins.find(
          (item) => item.key === ConfigService.getReaderConfig("dictService")
        );
        if (!plugin) return "";
        const config: any = plugin.config || {};
        const dictId: string = config.dictId || "";
        if (!dictId) return "";
        dictText = await DictUtil.lookupWord(dictId, text);
      } else if (ConfigService.getReaderConfig("dictService")) {
        let plugin = this.props.plugins.find(
          (item) => item.key === ConfigService.getReaderConfig("dictService")
        );
        if (!plugin) return "";
        const builtinDictionary = getBuiltinDictionary(plugin.key);
        const getPluginDictText = builtinDictionary
          ? builtinDictionary
          : isCustomRendererPlugin(plugin)
            ? executeCustomDictionary(plugin)
            : undefined;
        if (!getPluginDictText) return "";
        dictText = await getPluginDictText(
          text,
          "auto",
          this.state.dictTarget || "en",
          axios,
          this.props.t,
          plugin.config as PluginConfig
        );
      }

      if (dictText.startsWith("https://")) {
        openExternalUrl(dictText, true, "dict");
        let docs = getIframeDoc(this.props.currentBook.format);
        for (let i = 0; i < docs.length; i++) {
          let doc = docs[i];
          if (!doc) continue;
          doc.getSelection()?.empty();
        }
        return "";
      } else {
        this.setState(
          {
            dictText: dictText,
          },
          () => {
            let moreElement = document.querySelector(".dict-learn-more");
            if (moreElement) {
              moreElement.addEventListener("click", () => {
                openExternalUrl(window.learnMoreUrl || getWebsiteUrl());
              });
            }
          }
        );
      }
      return dictText;
    } catch (error) {
      toast.error(
        this.props.t("Error happened") +
          ": " +
          (error instanceof Error ? error.message : String(error))
      );
      console.error(error);
      this.setState({
        dictText: this.props.t("Error happened"),
      });
      return "";
    }
  };
  handleChangeDictService = (dictService: string) => {
    this.setState(
      {
        dictService: dictService,
        isAddNew: false,
      },
      () => {
        ConfigService.setReaderConfig("dictService", dictService);
        this.setState(
          {
            dictTarget: "en",
          },
          () => {
            ConfigService.setReaderConfig("dictTarget", "en");
            this.handleLookUp(this.state.word);
          }
        );
      }
    );
  };

  render() {
    const renderDictBox = () => {
      return (
        <div
          className="dict-container"
          style={
            this.props.isDockedRight
              ? {
                  paddingLeft: 15,
                  paddingRight: 15,
                  height: "calc(100% - 65px)",
                  width: "calc(100% - 30px)",
                }
              : { height: "calc(100% - 65px)" }
          }
        >
          <div className="dict-service-container" style={{ zIndex: 1 }}>
            <select
              className="dict-service-selector"
              style={{ margin: 0 }}
              value={this.state.dictService}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                if (event.target.value === "add-new") {
                  this.props.handleOpenMenu(false);
                  this.props.handleMenuMode("");
                  this.props.handleSetting(true);
                  this.props.handleSettingMode("plugins");
                  return;
                }
                this.handleChangeDictService(event.target.value);
              }}
            >
              <option
                value={""}
                key={"select"}
                className="add-dialog-shelf-list-option"
              >
                {this.props.t("Please select")}
              </option>
              {this.props.plugins
                .filter((item) => item.type === "dictionary")
                .map((item) => {
                  return (
                    <option
                      value={item.key}
                      key={item.key}
                      className="add-dialog-shelf-list-option"
                    >
                      {this.props.t(item.displayName)}
                      {item.key === "official-ai-dict-plugin" && (
                        <span style={{ fontSize: "13px", color: "#f16464" }}>
                          {" "}
                          (Pro)
                        </span>
                      )}
                    </option>
                  );
                })}
              <option
                value={"add-new"}
                key={"add-new"}
                className="add-dialog-shelf-list-option"
              >
                {this.props.t("Add new plugin")}
              </option>
            </select>
          </div>

          <div
            className="dict-service-container"
            style={
              this.props.isDockedRight
                ? { top: 65, right: 25, zIndex: 1 }
                : { right: 130, zIndex: 1 }
            }
          >
            <select
              className="dict-service-selector"
              style={{ margin: 0, width: "80px" }}
              value={this.state.dictTarget}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                this.setState(
                  {
                    dictTarget: event.target.value || "en",
                  },
                  () => {
                    ConfigService.setReaderConfig(
                      "dictTarget",
                      event.target.value
                    );
                    this.handleLookUp(this.state.word);
                  }
                );
              }}
            >
              {this.props.plugins.find(
                (item) => item.key === this.state.dictService
              )?.langList &&
                (
                  this.props.plugins.find(
                    (item) => item.key === this.state.dictService
                  )?.langList as any[]
                ).map((item) => {
                  return (
                    <option
                      value={item.code}
                      key={item.code}
                      className="add-dialog-shelf-list-option"
                      style={{ width: "80px" }}
                    >
                      {this.props.t(item["nativeLang"])}
                    </option>
                  );
                })}
            </select>
          </div>
          <div className="dict-word">
            {ConfigService.getReaderConfig("isLemmatizeWord") === "yes"
              ? this.state.prototype
              : this.state.word}
          </div>
          <div className="dict-original-word">
            <Trans>Prototype</Trans>
            <span>:</span>
            <span>{this.state.prototype}</span>
          </div>
          {this.state.isAddNew && (
            <div
              style={{
                marginTop: "50px",
                textAlign: "center",
                fontSize: "17px",
                color: "#2084e8",
              }}
            >
              <span
                style={{
                  textDecoration: "underline",
                  cursor: "pointer",
                  textAlign: "center",
                }}
                onClick={() => {
                  this.props.handleOpenMenu(false);
                  this.props.handleMenuMode("");
                  this.props.handleSetting(true);
                  this.props.handleSettingMode("plugins");
                }}
              >
                <Trans>Add new plugin</Trans>
              </span>
            </div>
          )}
          {!this.state.isAddNew && (
            <div className="dict-text-box">
              {Parser(
                DOMPurify.sanitize(
                  this.state.dictText + "<address></address>"
                ) || " ",
                {
                  replace: (_domNode) => {},
                }
              )}
            </div>
          )}
        </div>
      );
    };
    return renderDictBox();
  }
}
export default PopupDict;
