import "Polyfill"
import * as Options from "../options"
import * as captureTab from "./captureTab"
import { showContextMenu } from "./domutils"
import { documentClicked, documentKeyPressed as documentKeyDown, documentMouseOver, mouseActivate } from "./event-listeners/document"
import { onMessage } from "./event-listeners/message"
import { restore as recorderRestore, saveForLater } from "./event-listeners/recorder"
import { initSearch, searchKeydown, searchTextChanged } from "./event-listeners/search"
import G from "./globals"
import { sendRuntimeMessage } from "../messaging"
import { restore } from "./recorder"
import { getWrongToRight } from "./wrong-to-right"
import { hideTabPreview } from "./wtdom"
import { extendTabsList, populateTabsList } from "./wtinit"
import { windowEntryRenameContextMenu, windowEntryRename, windowEntryRenameCancel, windowEntryRenameBoxKeyDown } from "./event-listeners/windowEntryRename"
import { selectTab } from "./event-listeners/tabEntry"

G.tabsList = document.getElementById("tabs-list");

function setPopupSize(width, height) {
    document.documentElement.style.width = width + "px";
    document.documentElement.style.height = height + "px";
    document.body.style.width = width + "px";
    document.body.style.height = height + "px";
}

async function fulfillOptions() {
    let popupOptions = (await Options.options()).popup;
    // popup.size
    setPopupSize(popupOptions.size.width, popupOptions.size.height);
    // popup.scale
    document.documentElement.style.setProperty('--scale', popupOptions.scale.toString());
    // popup.showDetails
    if (!Options.stbool(popupOptions.showDetails)) {
        let leftContainer = document.getElementById("left-container");
        popupOptions.size.width = popupOptions.size.width;
        setPopupSize(popupOptions.size.width, popupOptions.size.height);
        leftContainer.style.display = "none";
        document.getElementById("tabs-container").style.width = "100%";
    } else {
        // popup.showPreview
        if (!Options.stbool(popupOptions.showPreview)) hideTabPreview();
    }
    // popup.hideAfterTabSelection
    G.hideAfterTabSelection = Options.stbool(popupOptions.hideAfterTabSelection);
    // popup.searchInURLs
    G.searchInURLs = Options.stbool(popupOptions.searchInURLs);
    // popup.sortByLastAccessed
    G.sortByLastAccessed = Options.stbool(popupOptions.sortByLastAccessed);
}

async function main() {
    // Initialize captureTab based on environment
    captureTab.init();
    // Fulfill user options
    await fulfillOptions();
    // Make tabs list fit the panel
    extendTabsList();
    // Fix for cross-window dragging issue
    await getWrongToRight();
    // Populate tabs list with tabs
    await populateTabsList();
    // Initialize components
    initSearch();
    // Event Listeners
    generalSetup();
}

/* Add event listeners */

// Starting point
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
} else {
    main();
}

function generalSetup() {
    document.addEventListener("mouseover", documentMouseOver);
    document.addEventListener("click", documentClicked);
    document.addEventListener("keydown", documentKeyDown);
    document.addEventListener("mousemove", mouseActivate);

    // Add event listeners to all copy buttons
    let copyButtons = Array.from(document.getElementsByClassName("copy-button"));
    for (let i = 0; i < copyButtons.length; i++) {
        copyButtons[i].addEventListener("click", e => {
            document.oncopy = ce => {
                ce.clipboardData.setData("text", document.getElementById(e.target.getAttribute("for")).innerText);
                ce.preventDefault();
            };
            document.execCommand("copy", false, null);
            e.target.innerText = "Copied!";
            setTimeout(() => {
                e.target.innerText = "Copy";
            }, 2000);
        });
    }

    // Add event listener for clicks on the reload tab button
    document.getElementById("unloaded-tab-preview-placeholder-text").addEventListener("click", e => {
        e.target.setAttribute("data-loading", "");
        let tabId = document.getElementById("tab-details").getAttribute("data-tab_id");
        browser.tabs.reload(parseInt(tabId)).then(() => {
            selectTab(document.querySelector(".tab-entry[data-tab_id='" + tabId + "']"));
        });
    });

    // Add event listener for recorder.js
    document.getElementById("save-for-later").addEventListener("click", saveForLater);
    document.getElementById("restore-now").addEventListener("click", async () => {
        let saveForLater = (await browser.storage.sync.get("save-for-later"))["save-for-later"];
        let lastModified = saveForLater["last-modified-channel"];
        let recentChannelRecords = saveForLater["channels"][lastModified]["records"];
        restore(recentChannelRecords[recentChannelRecords.length - 1]);
    });

    // Add event listener to listen for any messages from background.js
    if (!browser.runtime.onMessage.hasListener(onMessage)) {
        browser.runtime.onMessage.addListener(onMessage);
    }

    // Add keyup event listener and put focus on search
    let search = document.getElementById("search");
    search.addEventListener("keydown", searchKeydown);
    search.addEventListener("keyup", searchTextChanged);
    search.focus();

    // Do stopPropagation for all clicks that happen within context menus
    for (let menu of document.getElementsByClassName("context-menu")) {
        menu.addEventListener("click", e => e.stopPropagation());
        menu.addEventListener("keydown", e => e.stopPropagation());
    }

    // Rename context menu
    document.getElementById("window-entry-context-menu-rename").addEventListener("click", windowEntryRenameContextMenu);
    // Add event handler to handle cancellation of rename
    document.getElementById("window-entry-rename-cancel-btn").addEventListener("click", windowEntryRenameCancel);
    // Add event handler to handle rename
    document.getElementById("window-entry-rename-btn").addEventListener("click", windowEntryRename);
    // Add keydown handler to rename box
    document.getElementById("window-entry-rename-box").addEventListener("keydown", windowEntryRenameBoxKeyDown);

    document.getElementById("settings-btn").addEventListener("click", () => {
        browser.runtime.openOptionsPage();
        window.close();
    });

    // Tell background script that popup is being unloaded (SEEMS TO BE UNRELIABLE)
    window.addEventListener("beforeunload", () => {
        sendRuntimeMessage("POPUP_UNLOADED", {});
    });

    // Tell background script that everything is loaded now
    sendRuntimeMessage("INIT__POPUP_LOADED", {});
}
