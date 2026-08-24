import React from "react";
import "./updateInfo.css";
import { UpdateInfoProps, UpdateInfoState } from "./interface";
import { Trans } from "react-i18next";
import Lottie from "lottie-react";
import animationNew from "../../../assets/lotties/new.json";
import { openExternalUrl } from "../../../utils/common";
import { ConfigService } from "../../../assets/lib/kookit-extra-browser.min";
import { isWindows } from "react-device-detect";

class UpdateInfo extends React.Component<UpdateInfoProps, UpdateInfoState> {
  constructor(props: UpdateInfoProps) {
    super(props);
    this.state = {
      updateLog: "",
      progress: 0,
      downloadedMB: 0,
      totalMB: 0,
      isDownloading: false,
    };
  }
  async componentDidMount() {
    // free-koodo-reader: official update service removed.
  }
  renderList = (arr: any[]) => {
    return arr.map((item, index) => {
      return (
        <li className="update-dialog-list" key={index}>
          <span>{index + 1 + ". "}</span>
          <span>{item}</span>
        </li>
      );
    });
  };

  handleClose = () => {
    this.props.handleNewDialog(false);
  };

  render() {
    return (
      <>
        {this.state.updateLog && this.props.isShowNew && (
          <div className="new-version">
            <div className="new-version-title">
              <Trans>Update to</Trans>
              {" " + this.state.updateLog.version}
              <div
                className="new-version-badge"
                style={{
                  backgroundColor:
                    this.state.updateLog.stable === "yes"
                      ? "rgba(94, 178, 148, 1)"
                      : "rgba(92, 143, 211, 1)",
                }}
              >
                {this.props.t(
                  this.state.updateLog.stable === "yes"
                    ? "Stable version"
                    : "Developer version"
                )}
              </div>
            </div>
            <div
              className="setting-close-container"
              onClick={() => {
                this.handleClose();
              }}
            >
              <span className="icon-close setting-close"></span>
            </div>
            <div className="update-dialog-info" style={{ height: 420 }}>
              <div className="new-version-animation">
                <Lottie
                  animationData={animationNew}
                  loop={false}
                  style={{ height: 220, width: "100%" }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <div
                  className="new-version-open"
                  onClick={() => {
                    openExternalUrl(
                      "https://github.com/NIyueeE/free-koodo-reader/releases"
                    );
                  }}
                >
                  {this.state.isDownloading ? (
                    <Trans>Cancel</Trans>
                  ) : (
                    <Trans>Download</Trans>
                  )}
                </div>
              </div>
              {isWindows && (
                <div
                  className="new-version-skip"
                  onClick={() => {
                    openExternalUrl(
                      "https://github.com/NIyueeE/free-koodo-reader/releases"
                    );
                  }}
                >
                  <Trans>Download in Browser</Trans>
                </div>
              )}
              {this.state.updateLog.stable !== "yes" && (
                <div
                  className="new-version-skip"
                  onClick={() => {
                    ConfigService.setReaderConfig(
                      "skipVersion",
                      this.state.updateLog.version
                    );
                    this.handleClose();
                  }}
                >
                  <Trans>Skip this version</Trans>
                </div>
              )}
              {this.state.updateLog.stable !== "yes" && (
                <div
                  className="new-version-skip"
                  onClick={() => {
                    ConfigService.setReaderConfig("updateChannel", "stable");
                    this.handleClose();
                  }}
                >
                  <Trans>Only receive stable version</Trans>
                </div>
              )}

              {this.state.updateLog && (
                <>
                  <p className="update-dialog-new-title">
                    <Trans>What's new</Trans>
                  </p>
                  <ul className="update-dialog-new-container">
                    {this.renderList(this.state.updateLog.new)}
                  </ul>
                  <p className="update-dialog-fix-title">
                    <Trans>What's been fixed</Trans>
                  </p>
                  <ul className="update-dialog-fix-container">
                    {this.renderList(this.state.updateLog.fix)}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}
      </>
    );
  }
}

export default UpdateInfo;
