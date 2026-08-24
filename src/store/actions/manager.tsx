import { ConfigService } from "../../assets/lib/kookit-extra-browser.min";
import BookModel from "../../models/Book";
import PluginModel from "../../models/Plugin";
import { Dispatch } from "redux";
import DatabaseService from "../../utils/storage/databaseService";
import toast from "react-hot-toast";
import BookUtil from "../../utils/file/bookUtil";
import i18n from "../../i18n";
import DictUtil from "../../utils/file/dictUtil";
import { resolveStoredPlugin } from "../../utils/plugins/records";
import { isBuiltinPluginKey } from "../../utils/plugins/catalog";

let hasWarnedDisabledCustomVoice = false;

export function handleBooks(books: BookModel[]) {
  return { type: "HANDLE_BOOKS", payload: books };
}
export function handlePlugins(plugins: PluginModel[]) {
  return { type: "HANDLE_PLUGINS", payload: plugins };
}
export function handleDeletedBooks(deletedBooks: BookModel[]) {
  return { type: "HANDLE_DELETED_BOOKS", payload: deletedBooks };
}
export function handleSearchResults(searchResults: number[]) {
  return { type: "HANDLE_SEARCH_BOOKS", payload: searchResults };
}
export function handleSearch(isSearch: boolean) {
  return { type: "HANDLE_SEARCH", payload: isSearch };
}
export function handleRefreshBookCover(key: string) {
  return { type: "HANDLE_REFRESH_BOOK_COVER", payload: key };
}
export function handleUserInfo(userInfo: any) {
  return { type: "HANDLE_USER_INFO", payload: userInfo };
}
export function handleDetailDialog(isDetailDialog: boolean) {
  return { type: "HANDLE_DETAIL_DIALOG", payload: isDetailDialog };
}
export function handleSetting(isSettingOpen: boolean) {
  return { type: "HANDLE_SETTING", payload: isSettingOpen };
}
export function handleSettingMode(settingMode: string) {
  return { type: "HANDLE_SETTING_MODE", payload: settingMode };
}
export function handleShowPopupNote(isShowPopupNote: boolean) {
  return { type: "HANDLE_SHOW_POPUP_NOTE", payload: isShowPopupNote };
}
export function handleSettingDrive(settingDrive: string) {
  return { type: "HANDLE_SETTING_DRIVE", payload: settingDrive };
}
export function handleAbout(isAboutOpen: boolean) {
  return { type: "HANDLE_ABOUT", payload: isAboutOpen };
}

export function handleViewMode(mode: string) {
  return { type: "HANDLE_VIEW_MODE", payload: mode };
}

export function handleSortDisplay(isSortDisplay: boolean) {
  return { type: "HANDLE_SORT_DISPLAY", payload: isSortDisplay };
}
export function handleLoadingDialog(isShowLoading: boolean) {
  return { type: "HANDLE_SHOW_LOADING", payload: isShowLoading };
}
export function handleNewDialog(isShowNew: boolean) {
  return { type: "HANDLE_SHOW_NEW", payload: isShowNew };
}
export function handleSelectBook(isSelectBook: boolean) {
  return { type: "HANDLE_SELECT_BOOK", payload: isSelectBook };
}
export function handleSelectedBooks(selectedBooks: string[]) {
  return { type: "HANDLE_SELECTED_BOOKS", payload: selectedBooks };
}
export function handleNewWarning(isNewWarning: boolean) {
  return { type: "HANDLE_NEW_WARNING", payload: isNewWarning };
}
export function handleShowSupport(isShowSupport: boolean) {
  return { type: "HANDLE_SHOW_SUPPORT", payload: isShowSupport };
}
export function handleLoadMore(isLoadMore: boolean) {
  return { type: "HANDLE_LOAD_MORE", payload: isLoadMore };
}
export function handleAuthed(isAuthed: boolean) {
  return { type: "HANDLE_AUTHED", payload: isAuthed };
}
export function handleBookSortCode(bookSortCode: {
  sort: number;
  order: number;
}) {
  return { type: "HANDLE_SORT_CODE", payload: bookSortCode };
}

export function handleNoteSortCode(noteSortCode: {
  sort: number;
  order: number;
}) {
  return { type: "HANDLE_NOTE_SORT_CODE", payload: noteSortCode };
}

export function handleFetchBooks() {
  return async (dispatch: Dispatch) => {
    let bookSortCodeStr =
      ConfigService.getReaderConfig("bookSortCode") || '{"sort":1,"order":2}';
    let bookSortCode = JSON.parse(bookSortCodeStr);
    let sortField = "key";
    switch (bookSortCode.sort) {
      case 1:
        sortField = "recentRead";
        break;
      case 2:
        sortField = "name";
        break;
      case 3:
        sortField = "key";
        break;
      case 4:
        sortField = "readingTime";
        break;
      case 5:
        sortField = "author";
        break;
      case 6:
        sortField = "percentage";
        break;
      case 7:
        sortField = "size";
        break;
    }
    let orderField = "ASC";
    if (bookSortCode.order === 2) {
      orderField = "DESC";
    }
    let bookList: { key: string }[] = [];
    if (sortField === "recentRead") {
      let allBookKeys = await DatabaseService.getAllRecordKeys("books");
      let recentBookLKeys = ConfigService.getAllListConfig("recentBooks") || [];
      let sortedKeys = [
        ...recentBookLKeys.filter((key) => allBookKeys.includes(key)),
        ...allBookKeys.filter((key) => !recentBookLKeys.includes(key)),
      ];
      if (bookSortCode.order === 1) {
        sortedKeys = sortedKeys.reverse();
      }
      bookList = sortedKeys.map((key: string) => {
        return { key };
      });
    } else if (sortField === "readingTime") {
      let allBookKeys = await DatabaseService.getAllRecordKeys("books");
      let durationObj = ConfigService.getAllObjectConfig("readingTime");
      const sortable: any[] = [];
      for (let obj in durationObj) {
        sortable.push([obj, durationObj[obj]]);
      }
      sortable.sort(function (a, b) {
        return a[1] - b[1];
      });
      let recentBookLKeys = Object.keys(durationObj) || [];
      let sortedKeys = [
        ...recentBookLKeys.filter((key) => allBookKeys.includes(key)),
        ...allBookKeys.filter((key) => !recentBookLKeys.includes(key)),
      ];
      if (bookSortCode.order === 1) {
        sortedKeys = sortedKeys.reverse();
      }
      bookList = sortedKeys.map((key: string) => {
        return { key };
      });
    } else if (sortField === "percentage") {
      let allBookKeys = await DatabaseService.getAllRecordKeys("books");
      let locationObj = ConfigService.getAllObjectConfig("recordLocation");
      const sortable: any[] = [];
      for (let obj in locationObj) {
        sortable.push([obj, locationObj[obj].percentage || 0]);
      }
      sortable.sort(function (a, b) {
        return b[1] - a[1];
      });
      let recentBookLKeys = sortable.map((item) => item[0]) || [];
      let sortedKeys = [
        ...recentBookLKeys.filter((key) => allBookKeys.includes(key)),
        ...allBookKeys.filter((key) => !recentBookLKeys.includes(key)),
      ];
      if (bookSortCode.order === 1) {
        sortedKeys = sortedKeys.reverse();
      }
      bookList = sortedKeys.map((key: string) => {
        return { key };
      });
    } else {
      bookList = await BookUtil.getBookKeysWithSort(sortField, orderField);
    }

    let deletedBookKeys = ConfigService.getAllListConfig("deletedBooks");
    let books = bookList.filter(
      (item: { key: string }) => !deletedBookKeys.includes(item.key)
    );
    dispatch(handleBooks(books as BookModel[]));
    dispatch(
      handleDeletedBooks(deletedBookKeys.map((key) => ({ key })) as BookModel[])
    );
    // DatabaseService.getAllRecords("books").then((value) => {
    //   let bookArr: any = value;
    //   let keyArr = ConfigService.getAllListConfig("deletedBooks");
    //   dispatch(handleDeletedBooks(handleKeyFilter(bookArr, keyArr)));
    //   dispatch(handleBooks(handleKeyRemove(bookArr, keyArr)));
    // });
  };
}
export function handleFetchUserInfo() {
  return async (dispatch: Dispatch) => {
    // free-koodo-reader: no official account / Pro service.
    dispatch(handleUserInfo(null));
    return null;
  };
}
export function handleFetchPlugins() {
  return async (dispatch: Dispatch) => {
    DatabaseService.getAllRecords("plugins").then(async (pluginList) => {
      try {
        // Migrate legacy AI model entries from DB to ConfigService
        const legacyAiPlugins = pluginList.filter(
          (p: PluginModel) => p.type === "ai"
        );
        for (const p of legacyAiPlugins) {
          const existing = ConfigService.getObjectConfig(
            p.key,
            "aiModelConfig",
            null
          );
          if (!existing) {
            ConfigService.setObjectConfig(
              p.key,
              { key: p.key, displayName: p.displayName, config: p.config },
              "aiModelConfig"
            );
          }
          await DatabaseService.deleteRecord(p.key, "plugins");
        }
        pluginList = pluginList.filter((p: PluginModel) => p.type !== "ai");

        const hasDisabledCustomVoice = pluginList.some(
          (plugin: PluginModel) =>
            plugin.type === "voice" && !isBuiltinPluginKey(plugin.key)
        );
        if (hasDisabledCustomVoice && !hasWarnedDisabledCustomVoice) {
          hasWarnedDisabledCustomVoice = true;
          toast.error(i18n.t("Custom voice plugins have been disabled"));
        }

        const resolvedPlugins = await Promise.all(
          pluginList.map((plugin) => resolveStoredPlugin(plugin))
        );
        pluginList = resolvedPlugins.filter((plugin): plugin is PluginModel =>
          Boolean(plugin)
        );

        // Load local dictionary plugins from ConfigService
        const localDictIds = DictUtil.getDictIds();
        for (const dictId of localDictIds) {
          const meta = DictUtil.getDictMeta(dictId);
          if (meta) {
            let localDictPlugin = new PluginModel(
              `dict-${dictId}`,
              "dictionary",
              meta.name,
              "dict",
              "1.0.0",
              "",
              { dictId },
              [],
              [],
              "",
              ""
            );
            pluginList.push(localDictPlugin);
          }
        }

        dispatch(handlePlugins(pluginList));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        toast.error(errorMessage);
        console.error(error);
      }
    });
  };
}
export function handleFetchAuthed() {
  return (dispatch: Dispatch) => {
    // free-koodo-reader: all local features are unlocked.
    dispatch(handleAuthed(true));
  };
}
export function handleFetchBookSortCode() {
  return (dispatch: Dispatch) => {
    let bookSortCode = JSON.parse(
      ConfigService.getReaderConfig("bookSortCode") || '{"sort": 1, "order": 2}'
    );
    dispatch(handleBookSortCode(bookSortCode));
  };
}
export function handleFetchNoteSortCode() {
  return (dispatch: Dispatch) => {
    let noteSortCode = JSON.parse(
      ConfigService.getReaderConfig("noteSortCode") || '{"sort": 1, "order": 2}'
    );
    dispatch(handleNoteSortCode(noteSortCode));
  };
}
export function handleFetchViewMode() {
  return (dispatch: Dispatch) => {
    let viewMode = ConfigService.getReaderConfig("viewMode") || "card";
    dispatch(handleViewMode(viewMode));
  };
}
