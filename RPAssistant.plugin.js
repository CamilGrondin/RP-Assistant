/**
 * @name RPAssistant
 * @author pink_momo_4
 * @description Assistant RolePlay intégré avec tableau de bord, suivi des scènes, rappels et notes.
 * @version 1.0.0
 * @source https://github.com/CamilGrondin/RP-Assistant
 * @updateUrl https://raw.githubusercontent.com/CamilGrondin/RP-Assistant/main/RPAssistant.plugin.js
 */

module.exports = class RPAssistant {
    constructor(meta = {}) {
        this.pluginName = meta.name || "RPAssistant";
        this.panelId = "rp-assistant-panel";
        this.cssId = "rp-assistant-css";
        this.settingsKey = "settings";
        this.toggleButtonId = "rp-toggle-btn";
        this.dashboardPopupId = "rp-dashboard-popup";
        this.routeWatcherId = null;
        this.characterSheetReactionWatcherId = null;
        this.pendingSendTimerId = null;
        this.pendingSendCountdownTimerId = null;
        this.pendingSendConversationKey = "";
        this.pendingSendMessage = "";
        this.pendingSendDelayMinutes = 0;
        this.pendingSendScheduleLabel = "";
        this.pendingSendTargetChannelId = "";
        this.pendingSendStorageKey = "";
        this.pendingSendDueAt = 0;
        this.pendingSendScheduleType = "";
        this.lastAcceptedCharacterSheetMessageId = "";
        this.conversationKey = "";
        this.storageKey = "";
        this.isDashboardPopupOpen = false;
        this.isMessagePopupOpen = false;
        this.messagePopupId = "rp-message-popup";
        this.profileSaveTimerId = null;
        this.profileSaveDelayMs = 250;
        this.legacyProfileKey = "profile";
        this.migrationFlagKey = "profiles-migrated-v2";
        this.isOpen = false;
        this.isEditing = false;
        this.editorFocusField = null;
        this.defaultSettings = {
            language: "fr"
        };
        this.settings = this.createDefaultSettings();
        this.language = this.settings.language;
        this.labels = this.getLanguagePack(this.language);
        this.defaultProfile = {
            characterName: "",
            imageUrl: "",
            status: "",
            mood: "",
            location: "",
            state: "",
            messageDraft: "",
            messageScheduleValue: "",
            messageDelayMinutes: 0,
            characterSheetDraft: "",
            sceneTitle: "",
            sceneLocation: "",
            sceneNote: "",
            reminders: [],
            notes: []
        };
        this.profile = this.createEmptyProfile();
    }

    getMountNode() {
        return document.getElementById("app-mount") || document.body || document.documentElement;
    }

    getPanelNode() {
        return document.getElementById(this.panelId);
    }

    getDashboardPopupNode() {
        return document.getElementById(this.dashboardPopupId);
    }

    getMessagePopupNode() {
        return document.getElementById(this.messagePopupId);
    }

    getConversationContext() {
        const pathname = window.location?.pathname || "";
        const segments = pathname.split("/").filter(Boolean);
        const isChannelsRoute = segments[0] === "channels";

        return {
            pathname,
            conversationKey: encodeURIComponent(pathname || "unknown-conversation"),
            guildId: isChannelsRoute ? segments[1] || "" : "",
            channelId: isChannelsRoute ? segments[2] || "" : ""
        };
    }

    getConversationKey() {
        return this.getConversationContext().conversationKey;
    }

    getCurrentSelectedChannelId() {
        return this.getDiscordSelectedChannelStore()?.getChannelId?.() || "";
    }

    getCurrentConversationChannelId() {
        const conversationChannelId = this.getConversationContext().channelId;
        return conversationChannelId || this.getCurrentSelectedChannelId();
    }

    getStorageKey(conversationKey = this.conversationKey) {
        return `profile:${conversationKey || "unknown-conversation"}`;
    }

    createEmptyProfile() {
        return {
            ...this.defaultProfile,
            reminders: [],
            notes: []
        };
    }

    cleanText(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    cleanUrl(value) {
        const cleanedValue = this.cleanText(value);
        if (!cleanedValue) {
            return "";
        }

        try {
            const parsedUrl = new URL(cleanedValue);
            if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
                return parsedUrl.toString();
            }
        } catch {
            return "";
        }

        return "";
    }

    normalizeDelay(value) {
        const parsedValue = Number.parseInt(value, 10);
        if (!Number.isFinite(parsedValue) || parsedValue < 0) {
            return 0;
        }

        return Math.min(parsedValue, 120);
    }

    normalizeLines(value) {
        if (Array.isArray(value)) {
            return value.map(item => this.cleanText(item)).filter(Boolean);
        }

        if (typeof value === "string") {
            return value
                .split(/\r?\n/)
                .map(line => this.cleanText(line))
                .filter(Boolean);
        }

        return [];
    }

    normalizeProfile(storedProfile) {
        const profile = {
            ...this.createEmptyProfile(),
            ...(storedProfile && typeof storedProfile === "object" ? storedProfile : {})
        };

        profile.characterName = this.cleanText(profile.characterName);
        profile.imageUrl = this.cleanUrl(profile.imageUrl);
        profile.status = this.cleanText(profile.status);
        profile.mood = this.cleanText(profile.mood);
        profile.location = this.cleanText(profile.location);
        profile.state = this.cleanText(profile.state);
        profile.messageDraft = this.cleanText(profile.messageDraft);
        profile.messageScheduleValue = this.cleanText(profile.messageScheduleValue);
        profile.messageDelayMinutes = this.normalizeDelay(profile.messageDelayMinutes);
        profile.characterSheetDraft = this.cleanText(profile.characterSheetDraft);
        profile.sceneTitle = this.cleanText(profile.sceneTitle);
        profile.sceneLocation = this.cleanText(profile.sceneLocation);
        profile.sceneNote = this.cleanText(profile.sceneNote);
        profile.reminders = this.normalizeLines(profile.reminders);
        profile.notes = this.normalizeLines(profile.notes);

        if (!profile.messageScheduleValue && profile.messageDelayMinutes > 0) {
            profile.messageScheduleValue = String(profile.messageDelayMinutes);
        }

        return profile;
    }

    createDefaultSettings() {
        return {
            ...this.defaultSettings
        };
    }

    normalizeSettings(storedSettings) {
        const settings = {
            ...this.createDefaultSettings(),
            ...(storedSettings && typeof storedSettings === "object" ? storedSettings : {})
        };

        settings.language = settings.language === "en" ? "en" : "fr";
        return settings;
    }

    loadSettings() {
        try {
            const storedSettings = BdApi?.Data?.load?.(this.pluginName, this.settingsKey);
            return this.normalizeSettings(storedSettings);
        } catch {
            return this.createDefaultSettings();
        }
    }

    saveSettings(settings = this.settings) {
        try {
            BdApi?.Data?.save?.(this.pluginName, this.settingsKey, this.normalizeSettings(settings));
        } catch {
            // Ignore settings storage failures and keep the current in-memory state.
        }
    }

    applySettings(settings) {
        this.settings = this.normalizeSettings(settings);
        this.language = this.settings.language;
        this.labels = this.getLanguagePack(this.language);
        return this.settings;
    }

    setLanguage(language) {
        const nextLanguage = language === "en" ? "en" : "fr";
        if (this.language === nextLanguage) {
            return false;
        }

        this.applySettings({
            ...this.settings,
            language: nextLanguage
        });
        this.saveSettings();
        this.refreshLocalizedUi();
        return true;
    }

    getLanguagePack(language = this.language) {
        const packs = {
            fr: {
                settingsTitle: "Langue",
                settingsDescription: "Choisis la langue utilisée par RP Assistant.",
                settingsNote: "Le changement est appliqué immédiatement au message, au statut et aux notifications.",
                languageLabel: "Langue",
                languageFrench: "Français",
                languageEnglish: "English",
                messageCardTitle: "Message RP",
                composeLink: "Écrire",
                messageDraftLabel: "Message à envoyer",
                messageDraftPlaceholder: "Tape ton message RP ici...",
                scheduleLabel: "Envoyer plus tard",
                schedulePlaceholder: "15 ou 20:30",
                sendNowTitle: "Envoyer maintenant",
                sendLaterTitle: "Envoyer plus tard",
                statusEmpty: "Aucun message enregistré.",
                statusReady: "Message prêt à être envoyé",
                statusReadyScheduled: "Message prêt pour envoi",
                statusScheduled: "Message programmé",
                countdownPrefix: "dans",
                countdownSoon: "dans quelques secondes",
                scheduleIn: minutes => `dans ${minutes} min`,
                scheduleAt: time => `à ${time}`,
                characterSheetCardTitle: "Fiches",
                characterSheetComposeLink: "Fiche",
                characterSheetDraftLabel: "Fiche à envoyer",
                characterSheetDraftPlaceholder: "Rédige ou ajuste ta fiche ici...",
                characterSheetSendTitle: "Envoyer la fiche",
                characterSheetApplyTitle: "Appliquer au tableau de bord",
                characterSheetResetTitle: "Régénérer depuis le tableau",
                characterSheetNote: "Réagis avec ✅ à cette fiche dans la conversation pour mettre à jour le tableau de bord.",
                characterSheetSentToast: "Fiche envoyée.",
                characterSheetAppliedToast: "Fiche appliquée au tableau de bord.",
                characterSheetAcceptedToast: "✅ Fiche validée et tableau de bord mis à jour.",
                characterSheetInvalidToast: "Impossible de lire la fiche.",
                characterSheetHeading: "FICHE DE PERSONNAGE",
                sheetNameLabel: "Nom",
                sheetImageLabel: "Image",
                sheetStatusLabel: "Statut",
                sheetMoodLabel: "Humeur",
                sheetLocationLabel: "Lieu",
                sheetStateLabel: "État",
                sheetSceneTitleLabel: "Titre de la scène",
                sheetSceneLocationLabel: "Lieu de la scène",
                sheetSceneNoteLabel: "Description de la scène",
                sheetRemindersLabel: "Rappels",
                sheetNotesLabel: "Notes",
                invalidMessage: "Tape un message avant d'envoyer.",
                invalidTarget: "Impossible d'identifier la conversation cible.",
                invalidSchedule: "Utilise un délai en minutes ou une heure au format 20:30.",
                scheduledToast: (scheduleLabel, chunkSuffix) => `Message programmé ${scheduleLabel}${chunkSuffix}.`,
                sentToast: chunkCount => chunkCount > 1 ? `Message envoyé en ${chunkCount} parties.` : "Message envoyé.",
                sendFailed: "Impossible d'envoyer le message.",
                chunkSuffix: chunkCount => chunkCount > 1 ? ` en ${chunkCount} parties` : ""
            },
            en: {
                settingsTitle: "Language",
                settingsDescription: "Choose the language used by RP Assistant.",
                settingsNote: "The change applies immediately to message text, status copy, and notifications.",
                languageLabel: "Language",
                languageFrench: "French",
                languageEnglish: "English",
                messageCardTitle: "RP Message",
                composeLink: "Write",
                messageDraftLabel: "Message to send",
                messageDraftPlaceholder: "Type your RP message here...",
                scheduleLabel: "Send later",
                schedulePlaceholder: "15 or 20:30",
                sendNowTitle: "Send now",
                sendLaterTitle: "Send later",
                statusEmpty: "No saved message.",
                statusReady: "Message ready to send",
                statusReadyScheduled: "Ready to send",
                statusScheduled: "Scheduled message",
                countdownPrefix: "in",
                countdownSoon: "in a few seconds",
                scheduleIn: minutes => `in ${minutes} min`,
                scheduleAt: time => `at ${time}`,
                characterSheetCardTitle: "Character sheets",
                characterSheetComposeLink: "Sheet",
                characterSheetDraftLabel: "Sheet to send",
                characterSheetDraftPlaceholder: "Write or adjust the sheet here...",
                characterSheetSendTitle: "Send sheet",
                characterSheetApplyTitle: "Apply to dashboard",
                characterSheetResetTitle: "Regenerate from dashboard",
                characterSheetNote: "React with ✅ to this sheet in the conversation to update the dashboard.",
                characterSheetSentToast: "Sheet sent.",
                characterSheetAppliedToast: "Sheet applied to the dashboard.",
                characterSheetAcceptedToast: "✅ Sheet approved and dashboard updated.",
                characterSheetInvalidToast: "Unable to read the sheet.",
                characterSheetHeading: "CHARACTER SHEET",
                sheetNameLabel: "Name",
                sheetImageLabel: "Image",
                sheetStatusLabel: "Status",
                sheetMoodLabel: "Mood",
                sheetLocationLabel: "Location",
                sheetStateLabel: "State",
                sheetSceneTitleLabel: "Scene title",
                sheetSceneLocationLabel: "Scene location",
                sheetSceneNoteLabel: "Scene description",
                sheetRemindersLabel: "Reminders",
                sheetNotesLabel: "Notes",
                invalidMessage: "Type a message before sending.",
                invalidTarget: "Unable to identify the target conversation.",
                invalidSchedule: "Use minutes or a time in 20:30 format.",
                scheduledToast: (scheduleLabel, chunkSuffix) => `Message scheduled ${scheduleLabel}${chunkSuffix}.`,
                sentToast: chunkCount => chunkCount > 1 ? `Message sent in ${chunkCount} parts.` : "Message sent.",
                sendFailed: "Could not send the message.",
                chunkSuffix: chunkCount => chunkCount > 1 ? ` in ${chunkCount} parts` : ""
            }
        };

        return packs[language] || packs.fr;
    }

    refreshLocalizedUi() {
        const dashboardPopup = this.getDashboardPopupNode();
        if (dashboardPopup && this.isEditing) {
            this.profile = this.collectProfileFromEditor(dashboardPopup);
        }

        const messagePopup = this.getMessagePopupNode();
        if (messagePopup) {
            const messageDraft = messagePopup.querySelector("#rp-message-draft");
            const scheduleInput = messagePopup.querySelector("#rp-message-schedule");
            const characterSheetDraft = messagePopup.querySelector("#rp-character-sheet-draft");

            if (messageDraft) {
                this.profile.messageDraft = this.cleanText(messageDraft.value);
            }

            if (scheduleInput) {
                this.profile.messageScheduleValue = this.cleanText(scheduleInput.value);
            }

            if (characterSheetDraft) {
                this.profile.characterSheetDraft = this.cleanText(characterSheetDraft.value);
            }
        }

        this.renderPanel();
    }

    formatCountdownText(targetTimestamp) {
        const remainingMs = Number.isFinite(targetTimestamp) ? targetTimestamp - Date.now() : 0;
        if (remainingMs <= 5000) {
            return this.labels.countdownSoon;
        }

        const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const parts = [];

        if (hours > 0) {
            parts.push(`${hours} h`);
            if (minutes > 0) {
                parts.push(`${minutes} min`);
            }
        } else if (minutes > 0) {
            parts.push(`${minutes} min`);
            if (minutes < 5 && seconds > 0) {
                parts.push(`${seconds} s`);
            }
        } else {
            parts.push(`${seconds} s`);
        }

        return `${this.labels.countdownPrefix} ${parts.join(" ")}`;
    }

    startPendingSendCountdown() {
        this.stopPendingSendCountdown();
        this.pendingSendCountdownTimerId = window.setInterval(() => {
            this.refreshPendingSendDisplay();
        }, 1000);
    }

    stopPendingSendCountdown() {
        if (this.pendingSendCountdownTimerId) {
            window.clearInterval(this.pendingSendCountdownTimerId);
        }

        this.pendingSendCountdownTimerId = null;
    }

    refreshPendingSendDisplay() {
        const roots = [this.getPanelNode(), this.getDashboardPopupNode(), this.getMessagePopupNode()].filter(Boolean);
        if (!roots.length) {
            return;
        }

        const statusText = this.renderMessageStatus();
        for (const root of roots) {
            const statusNode = root.querySelector("[data-rp-send-status]");
            if (statusNode) {
                statusNode.textContent = statusText;
            }
        }
    }

    getMessageScheduleValue() {
        const storedScheduleValue = this.cleanText(this.profile.messageScheduleValue);
        if (storedScheduleValue) {
            return storedScheduleValue;
        }

        return this.profile.messageDelayMinutes > 0 ? String(this.profile.messageDelayMinutes) : "";
    }

    parseMessageScheduleValue(value) {
        const cleanedValue = this.cleanText(value);
        if (!cleanedValue) {
            return null;
        }

        if (/^\d+$/.test(cleanedValue)) {
            const delayMinutes = Number.parseInt(cleanedValue, 10);
            if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) {
                return null;
            }

            return {
                type: "delay",
                delayMinutes,
                dueAt: Date.now() + (delayMinutes * 60000),
                label: this.labels.scheduleIn(delayMinutes)
            };
        }

        const timeMatch = cleanedValue.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
        if (!timeMatch) {
            return null;
        }

        const now = new Date();
        const targetDate = new Date(now);
        targetDate.setSeconds(0, 0);
        targetDate.setHours(Number.parseInt(timeMatch[1], 10), Number.parseInt(timeMatch[2], 10), 0, 0);

        if (targetDate.getTime() <= now.getTime()) {
            targetDate.setDate(targetDate.getDate() + 1);
        }

        const delayMinutes = Math.max(1, Math.ceil((targetDate.getTime() - now.getTime()) / 60000));

        return {
            type: "time",
            delayMinutes,
            dueAt: targetDate.getTime(),
            label: this.labels.scheduleAt(cleanedValue)
        };
    }

    splitMessageForDiscord(message, maxLength = 2000) {
        const cleanedMessage = this.cleanText(message);
        if (!cleanedMessage) {
            return [];
        }

        if (cleanedMessage.length <= maxLength) {
            return [cleanedMessage];
        }

        const chunks = [];
        let remainingMessage = cleanedMessage;

        while (remainingMessage.length > maxLength) {
            let splitIndex = remainingMessage.lastIndexOf("\n", maxLength);
            if (splitIndex <= 0) {
                splitIndex = remainingMessage.lastIndexOf(" ", maxLength);
            }

            if (splitIndex <= 0) {
                splitIndex = maxLength;
            }

            const chunk = remainingMessage.slice(0, splitIndex).trimEnd();
            if (!chunk.length) {
                splitIndex = maxLength;
            } else {
                chunks.push(chunk);
            }

            remainingMessage = remainingMessage.slice(splitIndex).trimStart();
        }

        if (remainingMessage.length) {
            chunks.push(remainingMessage);
        }

        return chunks;
    }

    async pauseBetweenMessageChunks(delayMs = 180) {
        return new Promise(resolve => window.setTimeout(resolve, delayMs));
    }

    async sendMessageChunksToDiscord(message, channelId = this.getCurrentConversationChannelId()) {
        const chunks = this.splitMessageForDiscord(message);
        if (!chunks.length) {
            return false;
        }

        for (let index = 0; index < chunks.length; index += 1) {
            const sent = this.dispatchMessageToDiscord(chunks[index], channelId);
            if (!sent) {
                return false;
            }

            if (index < chunks.length - 1) {
                await this.pauseBetweenMessageChunks();
            }
        }

        return true;
    }

    loadProfile(storageKey = this.storageKey) {
        try {
            const storedProfile = BdApi?.Data?.load?.(this.pluginName, storageKey);
            if (storedProfile && typeof storedProfile === "object") {
                return this.normalizeProfile(storedProfile);
            }

            const migrationAlreadyDone = Boolean(BdApi?.Data?.load?.(this.pluginName, this.migrationFlagKey));
            if (!migrationAlreadyDone) {
                const legacyProfile = BdApi?.Data?.load?.(this.pluginName, this.legacyProfileKey);
                if (legacyProfile && typeof legacyProfile === "object") {
                    const normalizedLegacyProfile = this.normalizeProfile(legacyProfile);
                    BdApi?.Data?.save?.(this.pluginName, storageKey, normalizedLegacyProfile);
                    BdApi?.Data?.save?.(this.pluginName, this.migrationFlagKey, true);
                    return normalizedLegacyProfile;
                }

                BdApi?.Data?.save?.(this.pluginName, this.migrationFlagKey, true);
            }

            return this.createEmptyProfile();
        } catch {
            return this.createEmptyProfile();
        }
    }

    saveProfile(storageKey = this.storageKey, profile = this.profile) {
        try {
            BdApi?.Data?.save?.(this.pluginName, storageKey, profile);
        } catch {
            // Ignore storage failures and keep the current in-memory state.
        }
    }

    scheduleProfileSave() {
        if (this.profileSaveTimerId) {
            window.clearTimeout(this.profileSaveTimerId);
        }

        this.profileSaveTimerId = window.setTimeout(() => {
            this.profileSaveTimerId = null;
            this.saveProfile();
        }, this.profileSaveDelayMs);
    }

    cancelProfileSave() {
        if (this.profileSaveTimerId) {
            window.clearTimeout(this.profileSaveTimerId);
        }

        this.profileSaveTimerId = null;
    }

    flushProfileSave() {
        if (!this.profileSaveTimerId) {
            return false;
        }

        this.cancelProfileSave();
        this.saveProfile();
        return true;
    }

    start() {
        this.removePanel();
        this.removeToggleButton();
        this.stopRouteWatcher();
        this.cancelPendingSend();
        this.cancelProfileSave();
        this.closeDashboardPopup(true);
        this.closeMessagePopup(true);
        this.removeCSS();
        this.applySettings(this.loadSettings());
        this.conversationKey = this.getConversationKey();
        this.storageKey = this.getStorageKey(this.conversationKey);
        this.profile = this.loadProfile();
        this.isOpen = false;
        this.isEditing = false;
        this.editorFocusField = null;
        this.injectCSS();
        this.createToggleButton();
        this.renderPanel();
        this.startRouteWatcher();
        this.startCharacterSheetReactionWatcher();
    }

    stop() {
        this.stopRouteWatcher();
        this.stopCharacterSheetReactionWatcher();
        this.flushProfileSave();
        this.cancelPendingSend();
        this.stopPendingSendCountdown();
        this.closeDashboardPopup(true);
        this.closeMessagePopup(true);
        this.removeCSS();
        this.removePanel();
        this.removeToggleButton();
    }

    startRouteWatcher() {
        this.stopRouteWatcher();
        this.routeWatcherId = window.setInterval(() => {
            this.syncConversationContext();
        }, 500);
    }

    stopRouteWatcher() {
        if (this.routeWatcherId) {
            window.clearInterval(this.routeWatcherId);
            this.routeWatcherId = null;
        }
    }

    syncConversationContext() {
        const nextConversationKey = this.getConversationKey();
        if (nextConversationKey === this.conversationKey) {
            return false;
        }

        const previousStorageKey = this.storageKey;
        const panel = this.getPanelNode();

        if (this.isEditing) {
            const dashboardPopup = this.getDashboardPopupNode();
            if (dashboardPopup) {
                this.profile = this.collectProfileFromEditor(dashboardPopup);
            }
        }

        this.flushProfileSave();

        if (previousStorageKey) {
            this.saveProfile(previousStorageKey);
        }

        this.conversationKey = nextConversationKey;
        this.storageKey = this.getStorageKey(this.conversationKey);
        this.profile = this.loadProfile();
        this.lastAcceptedCharacterSheetMessageId = "";
        this.isEditing = false;
        this.editorFocusField = null;
        this.renderPanel();

        if (this.isDashboardPopupOpen) {
            this.renderDashboardPopup();
        }

        if (this.isMessagePopupOpen) {
            this.renderMessagePopup();
        }

        return true;
    }

    injectCSS() {
        const css = `
            :root {
                --rp-panel-width: 380px;
                --rp-panel-top-gap: 16px;
            }
            #rp-assistant-panel {
                position: fixed;
                top: var(--rp-panel-top-gap);
                right: calc(-1 * var(--rp-panel-width));
                width: var(--rp-panel-width);
                height: calc(100vh - (var(--rp-panel-top-gap) * 2));
                background:
                    radial-gradient(circle at top right, rgba(88, 101, 242, 0.18), transparent 34%),
                    linear-gradient(180deg, rgba(35, 37, 41, 0.98), rgba(24, 25, 29, 0.98));
                color: var(--text-normal, #dbdee1);
                z-index: 1000;
                box-shadow: -18px 0 44px rgba(0, 0, 0, 0.35);
                transition: right 0.28s ease;
                display: flex;
                flex-direction: column;
                font-family: var(--font-primary);
                border-left: 1px solid var(--background-modifier-accent);
                border-radius: 18px 0 0 18px;
                overflow: hidden;
                backdrop-filter: blur(14px);
            }
            #rp-assistant-panel.open {
                right: 0;
            }
            .rp-header {
                position: sticky;
                top: 0;
                z-index: 2;
                background: linear-gradient(180deg, rgba(35, 37, 41, 0.98), rgba(35, 37, 41, 0.92));
                padding: 18px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                font-weight: 800;
                font-size: 16px;
                letter-spacing: 0.01em;
            }
            .rp-header-controls {
                display: flex;
                gap: 6px;
                align-items: center;
            }
            .rp-header-button {
                width: 34px;
                height: 34px;
                border: 1px solid transparent;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.03);
                color: var(--text-muted, #949ba4);
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                font: inherit;
                transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
            }
            .rp-header-button:hover {
                color: var(--text-normal, #dbdee1);
                background: rgba(255, 255, 255, 0.08);
                transform: translateY(-1px);
            }
            .rp-quick-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
                padding: 0 18px 16px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }
            .rp-quick-action-btn {
                min-height: 42px;
                background: rgba(255, 255, 255, 0.04);
                color: var(--text-normal, #dbdee1);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 14px;
                padding: 8px 10px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 700;
                white-space: nowrap;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
            }
            .rp-quick-action-btn:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(88, 101, 242, 0.35);
                transform: translateY(-1px);
            }
            .rp-content {
                padding: 16px 18px 18px;
                overflow-y: auto;
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            .rp-card {
                margin-bottom: 0;
                background: linear-gradient(180deg, rgba(49, 51, 56, 0.96), rgba(43, 45, 49, 0.98));
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 18px;
                padding: 14px;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
            }
            .rp-card-title {
                font-size: 11px;
                font-weight: 800;
                color: var(--text-muted, #949ba4);
                text-transform: uppercase;
                letter-spacing: 0.08em;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
                gap: 10px;
                align-items: center;
            }
            .rp-card-content {
                font-size: 14px;
                line-height: 1.45;
            }
            .rp-dashboard-layout {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .rp-profile-summary {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                margin-bottom: 0;
            }
            .rp-profile-stack {
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .rp-avatar-placeholder {
                width: 52px;
                height: 52px;
                border-radius: 50%;
                background: radial-gradient(circle at 30% 30%, rgba(88, 101, 242, 0.28), rgba(43, 45, 49, 0.92));
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-muted, #949ba4);
                font-size: 18px;
                font-weight: 800;
                flex-shrink: 0;
                border: 1px solid rgba(255, 255, 255, 0.06);
            }
            .rp-avatar-media {
                position: relative;
                width: 52px;
                height: 52px;
                flex-shrink: 0;
                cursor: pointer;
                overflow: hidden;
                border-radius: 50%;
                border: 1px solid rgba(255, 255, 255, 0.08);
                background: rgba(255, 255, 255, 0.03);
            }
            .rp-avatar-image {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
                display: block;
            }
            .rp-avatar-fallback {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                background: inherit;
            }
            .rp-profile-name {
                font-weight: 800;
                font-size: 17px;
                line-height: 1.15;
            }
            .rp-profile-status {
                font-size: 12px;
                color: var(--text-muted, #949ba4);
                margin-top: 2px;
            }
            .rp-profile-badges {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                min-height: 24px;
            }
            .rp-profile-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                border-radius: 999px;
                padding: 4px 10px;
                border: 1px solid rgba(255, 255, 255, 0.06);
                font-size: 11px;
                font-weight: 700;
                line-height: 1.2;
                background: rgba(255, 255, 255, 0.05);
                color: var(--text-normal, #dbdee1);
            }
            .rp-profile-badge-status {
                background: rgba(35, 165, 89, 0.14);
                color: var(--status-positive-text, #23a559);
                border-color: rgba(35, 165, 89, 0.25);
            }
            .rp-profile-badge-mood {
                background: rgba(250, 166, 26, 0.14);
                color: #ffd27a;
                border-color: rgba(250, 166, 26, 0.25);
            }
            .rp-stat-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }
            .rp-stat {
                display: flex;
                flex-direction: column;
                gap: 4px;
                min-width: 0;
                padding: 10px 12px;
                border-radius: 14px;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.04);
            }
            .rp-stat-label {
                font-size: 11px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                color: var(--text-muted, #949ba4);
            }
            .rp-stat-value {
                font-size: 13px;
                font-weight: 600;
                color: var(--text-normal, #dbdee1);
                overflow-wrap: anywhere;
            }
            .rp-row {
                display: flex;
                justify-content: space-between;
                gap: 16px;
                padding: 4px 0;
            }
            .rp-row span:last-child {
                text-align: right;
            }
            .rp-message-card {
                min-height: 0;
                border-left: 4px solid var(--text-link, #00a8fc);
                box-shadow: inset 4px 0 0 rgba(88, 101, 242, 0.45);
            }
            .rp-scene-card {
                border-left: 4px solid var(--rp-scene-accent, var(--background-modifier-accent));
            }
            .rp-scene-card.is-active {
                box-shadow: inset 4px 0 0 rgba(35, 165, 89, 0.45);
            }
            .rp-scene-body {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .rp-scene-title {
                font-size: 15px;
                font-weight: 800;
                line-height: 1.25;
            }
            .rp-scene-location {
                display: flex;
                align-items: flex-start;
                gap: 6px;
                font-size: 13px;
                color: var(--text-muted, #949ba4);
            }
            .rp-scene-note {
                padding: 12px;
                border-radius: 14px;
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.04);
                font-size: 13px;
                line-height: 1.4;
            }
            .rp-scene-action {
                margin-top: 2px;
            }
            .rp-scene-card.is-active .rp-scene-action {
                background: linear-gradient(180deg, #df575d, #b63a45);
                box-shadow: 0 10px 20px rgba(182, 58, 69, 0.28);
            }
            .rp-message-composer {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            #rp-assistant-panel .rp-message-card .rp-message-composer {
                gap: 10px;
            }
            .rp-message-textarea {
                min-height: 110px;
                resize: vertical;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.06);
                background: rgba(255, 255, 255, 0.03);
                color: var(--text-normal, #dbdee1);
                padding: 12px;
                font: inherit;
                line-height: 1.45;
            }
            #rp-assistant-panel .rp-message-card .rp-message-textarea {
                min-height: 92px;
            }
            .rp-message-popup .rp-message-textarea {
                min-height: 180px;
            }
            .rp-message-actions {
                display: flex;
                gap: 10px;
                align-items: flex-end;
                flex-wrap: wrap;
            }
            .rp-message-delay {
                flex: 1 1 auto;
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                font-size: 12px;
                color: var(--text-muted, #949ba4);
            }
            .rp-send-delay-input {
                width: 128px;
                border-radius: 10px;
                border: 1px solid rgba(255, 255, 255, 0.06);
                background: rgba(255, 255, 255, 0.03);
                color: var(--text-normal, #dbdee1);
                padding: 7px 9px;
                font: inherit;
            }
            .rp-message-send-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
            }
            .rp-send-button {
                width: 48px;
                height: 48px;
                border: none;
                border-radius: 16px;
                cursor: pointer;
                background: linear-gradient(180deg, #6270ff, #4b57e8);
                color: white;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                flex-shrink: 0;
                box-shadow: 0 10px 20px rgba(75, 87, 232, 0.28);
                transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
            }
            .rp-send-button:hover {
                transform: translateY(-1px);
                filter: brightness(1.04);
                box-shadow: 0 12px 22px rgba(75, 87, 232, 0.34);
            }
            .rp-send-later-button {
                width: 48px;
                height: 48px;
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 16px;
                cursor: pointer;
                background: rgba(255, 255, 255, 0.05);
                color: var(--text-normal, #dbdee1);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                flex-shrink: 0;
                transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease, background 0.15s ease, border-color 0.15s ease;
            }
            .rp-send-later-button:hover {
                transform: translateY(-1px);
                filter: brightness(1.04);
                background: rgba(250, 166, 26, 0.12);
                border-color: rgba(250, 166, 26, 0.28);
                box-shadow: 0 10px 18px rgba(250, 166, 26, 0.16);
            }
            .rp-message-status {
                font-size: 12px;
                color: var(--text-muted, #949ba4);
                min-height: 16px;
            }
            .rp-dashboard-popup {
                position: fixed;
                inset: 0;
                z-index: 1001;
                background: rgba(12, 12, 14, 0.76);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                backdrop-filter: blur(8px) saturate(110%);
            }
            .rp-dashboard-popup-dialog {
                width: min(760px, 100%);
                max-height: calc(100vh - 40px);
                overflow: auto;
                border-radius: 20px;
                border: 1px solid rgba(255, 255, 255, 0.06);
                background: linear-gradient(180deg, rgba(35, 37, 41, 0.98), rgba(26, 28, 32, 0.98));
                box-shadow: 0 24px 50px rgba(0, 0, 0, 0.42);
            }
            .rp-dashboard-popup-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 16px 18px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                background: linear-gradient(180deg, rgba(35, 37, 41, 0.98), rgba(35, 37, 41, 0.94));
                font-weight: 800;
            }
            .rp-dashboard-popup-title {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .rp-dashboard-popup-close {
                width: 32px;
                height: 32px;
                border: 1px solid transparent;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.03);
                color: var(--text-muted, #949ba4);
                cursor: pointer;
                font: inherit;
                font-size: 18px;
                line-height: 1;
                padding: 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
            }
            .rp-dashboard-popup-close:hover {
                color: var(--text-normal, #dbdee1);
                background: rgba(255, 255, 255, 0.08);
                transform: translateY(-1px);
            }
            .rp-dashboard-popup-body {
                padding: 18px;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            .rp-dashboard-popup-body .rp-card {
                margin-bottom: 0;
            }
            .rp-message-popup {
                position: fixed;
                inset: 0;
                z-index: 1001;
                background: rgba(12, 12, 14, 0.76);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                backdrop-filter: blur(8px) saturate(110%);
            }
            .rp-message-popup-dialog {
                width: min(960px, 100%);
                max-height: calc(100vh - 40px);
                overflow: auto;
                border-radius: 20px;
                border: 1px solid rgba(255, 255, 255, 0.06);
                background: linear-gradient(180deg, rgba(35, 37, 41, 0.98), rgba(26, 28, 32, 0.98));
                box-shadow: 0 24px 50px rgba(0, 0, 0, 0.42);
            }
            .rp-message-popup-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 16px 18px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                background: linear-gradient(180deg, rgba(35, 37, 41, 0.98), rgba(35, 37, 41, 0.94));
                font-weight: 800;
            }
            .rp-message-popup-body {
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            .rp-message-popup-body .rp-card {
                margin-bottom: 0;
            }
            .rp-character-sheet-card {
                border-left: 4px solid rgba(255, 196, 61, 0.65);
            }
            .rp-character-sheet-composer {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .rp-character-sheet-textarea {
                min-height: 220px;
                resize: vertical;
            }
            .rp-character-sheet-note {
                font-size: 12px;
                line-height: 1.45;
                color: var(--text-muted, #949ba4);
            }
            .rp-character-sheet-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }
            .rp-character-sheet-actions .rp-btn-secondary,
            .rp-character-sheet-actions .rp-btn-primary {
                width: auto;
                flex: 1;
                margin-top: 0;
            }
            .rp-ideas-card {
                border-left: 4px solid rgba(255, 196, 61, 0.65);
            }
            .rp-ideas-list {
                margin: 0;
                padding-left: 20px;
                display: grid;
                gap: 8px;
            }
            .rp-ideas-list li {
                line-height: 1.45;
            }
            .rp-btn-primary,
            .rp-btn-secondary {
                width: 100%;
                min-height: 42px;
                border: 1px solid transparent;
                border-radius: 14px;
                padding: 10px 14px;
                cursor: pointer;
                margin-top: 8px;
                font-weight: 700;
                transition: transform 0.15s ease, filter 0.15s ease, background 0.15s ease, border-color 0.15s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .rp-btn-primary {
                background: linear-gradient(180deg, #6270ff, #4b57e8);
                color: white;
                box-shadow: 0 10px 20px rgba(75, 87, 232, 0.26);
            }
            .rp-btn-primary:hover {
                transform: translateY(-1px);
                filter: brightness(1.04);
            }
            .rp-btn-secondary {
                background: rgba(255, 255, 255, 0.04);
                border-color: rgba(255, 255, 255, 0.05);
                color: var(--text-normal, #dbdee1);
            }
            .rp-btn-secondary:hover {
                transform: translateY(-1px);
                background: rgba(255, 255, 255, 0.08);
            }
            .rp-link-btn {
                background: none;
                border: none;
                padding: 0;
                color: var(--text-link, #00a8fc);
                cursor: pointer;
                font-size: 12px;
                font-weight: 700;
            }
            .rp-link-btn:hover {
                text-decoration: underline;
            }
            .rp-empty-block,
            .rp-empty-value {
                color: var(--text-muted, #949ba4);
            }
            .rp-empty-block {
                padding: 8px 0;
            }
            .rp-list {
                padding-left: 20px;
                margin: 0;
                display: grid;
                gap: 6px;
            }
            .rp-list li {
                margin-bottom: 0;
                line-height: 1.4;
            }
            .rp-editor {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .rp-editor-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 12px;
            }
            .rp-editor-field {
                display: flex;
                flex-direction: column;
                gap: 6px;
                font-size: 12px;
                color: var(--text-muted, #949ba4);
            }
            .rp-editor-field input,
            .rp-editor-field textarea,
            .rp-editor-field select {
                width: 100%;
                box-sizing: border-box;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.06);
                background: rgba(255, 255, 255, 0.03);
                color: var(--text-normal, #dbdee1);
                padding: 10px 12px;
                font: inherit;
                font-size: 13px;
                line-height: 1.4;
                transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
            }
            .rp-editor-field input:focus,
            .rp-editor-field textarea:focus,
            .rp-editor-field select:focus {
                outline: none;
                border-color: rgba(88, 101, 242, 0.6);
                box-shadow: 0 0 0 3px rgba(88, 101, 242, 0.12);
                background: rgba(255, 255, 255, 0.05);
            }
            .rp-editor-field textarea {
                min-height: 72px;
                resize: vertical;
            }
            .rp-editor-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }
            .rp-editor-actions .rp-btn-secondary,
            .rp-editor-actions .rp-btn-primary {
                width: auto;
                flex: 1;
                margin-top: 0;
            }
            .rp-settings-panel {
                display: flex;
                flex-direction: column;
                gap: 14px;
                padding: 16px;
                color: var(--text-normal, #dbdee1);
                font-family: var(--font-primary);
            }
            .rp-settings-header {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .rp-settings-title {
                font-size: 18px;
                font-weight: 800;
            }
            .rp-settings-description,
            .rp-settings-note {
                font-size: 13px;
                line-height: 1.45;
                color: var(--text-muted, #949ba4);
            }
            .rp-settings-note {
                margin-top: -4px;
            }
            #rp-toggle-btn {
                position: fixed;
                top: 16px;
                right: calc(var(--rp-panel-width) - 30px);
                width: 36px;
                height: 36px;
                z-index: 999;
                background: rgba(35, 37, 41, 0.92);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 12px;
                color: var(--text-muted, #949ba4);
                cursor: pointer;
                font-size: 18px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
                transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease;
            }
            #rp-toggle-btn:hover {
                color: var(--text-normal, #dbdee1);
                background: rgba(255, 255, 255, 0.06);
                transform: translateY(-1px);
            }
        `;

        if (BdApi?.DOM?.addStyle) {
            BdApi.DOM.addStyle(this.cssId, css);
            return;
        }

        const existingStyle = document.getElementById(this.cssId);
        if (existingStyle) existingStyle.remove();

        const style = document.createElement("style");
        style.id = this.cssId;
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    removeCSS() {
        if (BdApi?.DOM?.removeStyle) {
            BdApi.DOM.removeStyle(this.cssId);
            return;
        }

        const style = document.getElementById(this.cssId);
        if (style) style.remove();
    }

    createToggleButton() {
        const toggleBtn = document.createElement("button");
        toggleBtn.id = this.toggleButtonId;
        toggleBtn.innerText = "🎭";
        toggleBtn.title = "Ouvrir RP Assistant";
        toggleBtn.onclick = () => this.togglePanel();

        const mountNode = this.getMountNode();
        if (mountNode) mountNode.appendChild(toggleBtn);
    }

    removeToggleButton() {
        const btn = document.getElementById(this.toggleButtonId);
        if (btn) btn.remove();
    }

    buildPanel() {
        this.renderPanel();
    }

    renderPanel() {
        const mountNode = this.getMountNode();
        if (!mountNode) return;

        let panel = this.getPanelNode();
        const isNewPanel = !panel;

        if (!panel) {
            panel = document.createElement("div");
            panel.id = this.panelId;
        }

        panel.classList.toggle("open", this.isOpen);
        panel.innerHTML = this.getPanelMarkup();

        if (isNewPanel) {
            mountNode.appendChild(panel);
        }

        this.bindPanelEvents(panel);

        if (this.isDashboardPopupOpen) {
            this.renderDashboardPopup();
        }

        if (this.isMessagePopupOpen) {
            this.renderMessagePopup();
        }
    }

    getPanelMarkup() {
        return `
            <div class="rp-header">
                <div>🎭 RP Assistant</div>
                <div class="rp-header-controls">
                    <button class="rp-header-button" type="button" id="rp-close-btn" title="Fermer">✕</button>
                </div>
            </div>

            <div class="rp-quick-actions">
                <button class="rp-quick-action-btn" type="button" data-rp-open-dashboard>🔄 Statut</button>
                <button class="rp-quick-action-btn" type="button" data-rp-open-message>✉️ Message</button>
                <button class="rp-quick-action-btn" type="button" data-rp-open-editor="rp-location">📍 Lieu</button>
                <button class="rp-quick-action-btn" type="button" data-rp-focus-character-sheet>📄 ${this.escapeHtml(this.labels.characterSheetCardTitle)}</button>
            </div>

            <div class="rp-content">
                ${this.renderDashboardCard()}
                ${this.renderMessageCard()}
                ${this.renderCharacterSheetCard()}
                ${this.renderRemindersCard()}
                ${this.renderNotesCard()}
            </div>
        `;
    }

    renderDashboardCard() {
        const profile = this.profile;
        const name = this.cleanText(profile.characterName);
        const imageUrl = this.cleanText(profile.imageUrl);
        const initials = name ? this.escapeHtml(name.charAt(0).toUpperCase()) : "?";
        const avatarMarkup = imageUrl
            ? `
                <div class="rp-avatar-media" data-rp-open-editor="rp-image-url" title="Modifier l'image">
                    <img class="rp-avatar-image" src="${this.escapeHtml(imageUrl)}" alt="Image du tableau">
                    <div class="rp-avatar-placeholder rp-avatar-fallback" style="display:none;">${initials}</div>
                </div>
            `
            : `
                <div class="rp-avatar-media rp-avatar-placeholder" data-rp-open-editor="rp-image-url" title="Modifier l'image">${initials}</div>
            `;

        return `
            <div class="rp-card">
                <div class="rp-card-title">
                    <span>👤 Tableau de bord</span>
                    <button class="rp-link-btn" type="button" data-rp-open-editor>Changer</button>
                </div>
                <div class="rp-card-content rp-dashboard-layout">
                    <div class="rp-profile-summary">
                        ${avatarMarkup}
                        <div class="rp-profile-stack">
                            <div class="rp-profile-name">${this.textOrPlaceholder(name, "Aucun personnage")}</div>
                            <div class="rp-profile-badges">
                                ${this.renderProfileBadges(profile)}
                            </div>
                        </div>
                    </div>
                    <div class="rp-stat-grid">
                        ${this.renderProfileStat("📍 Lieu", profile.location, "Vide")}
                        ${this.renderProfileStat("🩸 État", profile.state, "Vide")}
                    </div>
                    <button class="rp-btn-primary" type="button" data-rp-open-editor>✏️ Modifier</button>
                </div>
            </div>
        `;
    }

    getDashboardPopupMarkup() {
        return `
            <div class="rp-dashboard-popup" data-rp-dashboard-backdrop>
                <div class="rp-dashboard-popup-dialog" role="dialog" aria-modal="true" aria-labelledby="rp-dashboard-popup-title">
                    <div class="rp-dashboard-popup-header">
                        <div class="rp-dashboard-popup-title" id="rp-dashboard-popup-title">👤 Tableau de bord</div>
                        <button class="rp-dashboard-popup-close" type="button" data-rp-close-dashboard title="Fermer">✕</button>
                    </div>
                    <div class="rp-dashboard-popup-body">
                        ${this.renderDashboardCard()}
                        ${this.isEditing ? this.renderEditorCard() : ""}
                    </div>
                </div>
            </div>
        `;
    }

    renderDashboardPopup() {
        if (!this.isDashboardPopupOpen) {
            this.removeDashboardPopup();
            return;
        }

        const mountNode = this.getMountNode();
        if (!mountNode) return;

        let popup = this.getDashboardPopupNode();
        const isNewPopup = !popup;

        if (!popup) {
            popup = document.createElement("div");
            popup.id = this.dashboardPopupId;
        }

        popup.innerHTML = this.getDashboardPopupMarkup();

        if (isNewPopup) {
            mountNode.appendChild(popup);
        }

        this.bindDashboardPopupEvents(popup);

        if (this.isEditing && this.editorFocusField) {
            this.focusFieldInContainer(popup, this.editorFocusField);
        }
    }

    bindDashboardPopupEvents(popup) {
        const backdrop = popup.querySelector("[data-rp-dashboard-backdrop]");
        if (backdrop) {
            backdrop.addEventListener("click", event => {
                if (event.target === backdrop) {
                    this.closeDashboardPopup();
                }
            });
        }

        const closeButtons = popup.querySelectorAll("[data-rp-close-dashboard]");
        closeButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                this.closeDashboardPopup();
            });
        });

        this.bindPanelEvents(popup);
    }

    renderProfileBadges(profile) {
        const badges = [];
        const status = this.cleanText(profile?.status);
        const mood = this.cleanText(profile?.mood);

        if (status) {
            badges.push(`<span class="rp-profile-badge rp-profile-badge-status">⚡ ${this.escapeHtml(status)}</span>`);
        }

        if (mood) {
            badges.push(`<span class="rp-profile-badge rp-profile-badge-mood">✨ ${this.escapeHtml(mood)}</span>`);
        }

        if (!badges.length) {
            badges.push(`<span class="rp-empty-value">Aucun statut renseigné</span>`);
        }

        return badges.join("");
    }

    renderProfileStat(label, value, placeholder) {
        return `
            <div class="rp-stat">
                <span class="rp-stat-label">${this.escapeHtml(label)}</span>
                <span class="rp-stat-value">${this.textOrPlaceholder(value, placeholder)}</span>
            </div>
        `;
    }

    focusFieldInContainer(container, fieldId) {
        if (!container || !fieldId) {
            return false;
        }

        const field = container.querySelector(`#${fieldId}`);
        if (field && typeof field.focus === "function") {
            field.focus();
            if (typeof field.scrollIntoView === "function") {
                field.scrollIntoView({ block: "center", behavior: "smooth" });
            }

            this.editorFocusField = null;
            return true;
        }

        return false;
    }

    openDashboardPopup() {
        this.closeMessagePopup(true);
        this.isDashboardPopupOpen = true;
        this.renderDashboardPopup();
    }

    closeDashboardPopup(skipRender = false) {
        this.isDashboardPopupOpen = false;
        this.isEditing = false;
        this.editorFocusField = null;
        this.removeDashboardPopup();

        if (!skipRender) {
            this.renderPanel();
        }
    }

    removeDashboardPopup() {
        const popup = this.getDashboardPopupNode();
        if (popup) popup.remove();
    }

    getMessagePopupMarkup() {
        return `
            <div class="rp-message-popup" data-rp-message-backdrop>
                <div class="rp-message-popup-dialog" role="dialog" aria-modal="true" aria-labelledby="rp-message-popup-title">
                    <div class="rp-message-popup-header">
                        <div class="rp-dashboard-popup-title" id="rp-message-popup-title">✉️ Message RP</div>
                        <button class="rp-dashboard-popup-close" type="button" data-rp-close-message title="Fermer">✕</button>
                    </div>
                    <div class="rp-message-popup-body">
                        ${this.renderMessageCard()}
                    </div>
                </div>
            </div>
        `;
    }

    renderMessagePopup() {
        if (!this.isMessagePopupOpen) {
            this.removeMessagePopup();
            return;
        }

        const mountNode = this.getMountNode();
        if (!mountNode) return;

        let popup = this.getMessagePopupNode();
        const isNewPopup = !popup;

        if (!popup) {
            popup = document.createElement("div");
            popup.id = this.messagePopupId;
        }

        popup.innerHTML = this.getMessagePopupMarkup();

        if (isNewPopup) {
            mountNode.appendChild(popup);
        }

        this.bindMessagePopupEvents(popup);

        if (this.isMessagePopupOpen) {
            window.requestAnimationFrame(() => {
                this.focusMessageComposer(popup);
            });
        }
    }

    bindMessagePopupEvents(popup) {
        const backdrop = popup.querySelector("[data-rp-message-backdrop]");
        if (backdrop) {
            backdrop.addEventListener("click", event => {
                if (event.target === backdrop) {
                    this.closeMessagePopup();
                }
            });
        }

        const closeButtons = popup.querySelectorAll("[data-rp-close-message]");
        closeButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                this.closeMessagePopup();
            });
        });

        this.bindPanelEvents(popup);
    }

    openMessagePopup() {
        this.closeDashboardPopup(true);
        this.isMessagePopupOpen = true;
        this.renderMessagePopup();
    }

    closeMessagePopup(skipRender = false) {
        this.isMessagePopupOpen = false;
        this.removeMessagePopup();

        if (!skipRender) {
            this.renderPanel();
        }
    }

    removeMessagePopup() {
        const popup = this.getMessagePopupNode();
        if (popup) popup.remove();
    }

    renderMessageCard() {
        const messageDraft = this.profile.messageDraft;
        const scheduleValue = this.getMessageScheduleValue();

        return `
            <div class="rp-card rp-message-card">
                <div class="rp-card-title">
                    <span>✉️ ${this.escapeHtml(this.labels.messageCardTitle)}</span>
                    <button class="rp-link-btn" type="button" data-rp-focus-message>${this.escapeHtml(this.labels.composeLink)}</button>
                </div>
                <div class="rp-card-content rp-message-composer">
                    <label class="rp-editor-field">
                        <span>${this.escapeHtml(this.labels.messageDraftLabel)}</span>
                        <textarea id="rp-message-draft" class="rp-message-textarea" placeholder="${this.escapeHtml(this.labels.messageDraftPlaceholder)}">${this.escapeHtml(messageDraft)}</textarea>
                    </label>
                    <div class="rp-message-actions">
                        <label class="rp-message-delay" for="rp-message-schedule">
                            <span>${this.escapeHtml(this.labels.scheduleLabel)}</span>
                            <input id="rp-message-schedule" class="rp-send-delay-input" type="text" value="${this.escapeHtml(scheduleValue)}" placeholder="${this.escapeHtml(this.labels.schedulePlaceholder)}" spellcheck="false" autocomplete="off">
                        </label>
                        <div class="rp-message-send-actions">
                            <button class="rp-send-button" type="button" data-rp-send-message title="${this.escapeHtml(this.labels.sendNowTitle)}" aria-label="${this.escapeHtml(this.labels.sendNowTitle)}">➤</button>
                            <button class="rp-send-later-button" type="button" data-rp-send-later title="${this.escapeHtml(this.labels.sendLaterTitle)}" aria-label="${this.escapeHtml(this.labels.sendLaterTitle)}">🕒</button>
                        </div>
                    </div>
                    <div class="rp-message-status" data-rp-send-status>${this.renderMessageStatus()}</div>
                </div>
            </div>
        `;
    }

    renderCharacterSheetCard() {
        const sheetDraft = this.getCharacterSheetDraft();

        return `
            <div class="rp-card rp-character-sheet-card">
                <div class="rp-card-title">
                    <span>📄 ${this.escapeHtml(this.labels.characterSheetCardTitle)}</span>
                    <button class="rp-link-btn" type="button" data-rp-focus-character-sheet>${this.escapeHtml(this.labels.characterSheetComposeLink)}</button>
                </div>
                <div class="rp-card-content rp-character-sheet-composer">
                    <label class="rp-editor-field">
                        <span>${this.escapeHtml(this.labels.characterSheetDraftLabel)}</span>
                        <textarea id="rp-character-sheet-draft" class="rp-message-textarea rp-character-sheet-textarea" placeholder="${this.escapeHtml(this.labels.characterSheetDraftPlaceholder)}">${this.escapeHtml(sheetDraft)}</textarea>
                    </label>
                    <div class="rp-character-sheet-note">${this.escapeHtml(this.labels.characterSheetNote)}</div>
                    <div class="rp-character-sheet-actions">
                        <button class="rp-btn-secondary" type="button" data-rp-reset-character-sheet>${this.escapeHtml(this.labels.characterSheetResetTitle)}</button>
                        <button class="rp-btn-secondary" type="button" data-rp-apply-character-sheet>${this.escapeHtml(this.labels.characterSheetApplyTitle)}</button>
                        <button class="rp-btn-primary" type="button" data-rp-send-character-sheet>${this.escapeHtml(this.labels.characterSheetSendTitle)}</button>
                    </div>
                </div>
            </div>
        `;
    }

    renderSceneCard() {
        const hasScene = this.cleanText(this.profile.sceneTitle) || this.cleanText(this.profile.sceneLocation) || this.cleanText(this.profile.sceneNote);
        const sceneButtonAttribute = hasScene ? "data-rp-clear-scene" : "data-rp-open-editor=\"rp-scene-title\"";
        const sceneLocationMarkup = this.cleanText(this.profile.sceneLocation)
            ? `📍 ${this.escapeHtml(this.profile.sceneLocation)}`
            : `<span class="rp-empty-value">📍 Lieu non renseigné</span>`;

        return `
            <div class="rp-card rp-scene-card ${hasScene ? "is-active" : ""}" style="--rp-scene-accent: ${hasScene ? "var(--status-positive-background, #23a559)" : "var(--background-modifier-accent)"};">
                <div class="rp-card-title">
                    <span>🎬 Scène en cours</span>
                </div>
                <div class="rp-card-content rp-scene-body">
                    ${hasScene ? `
                        <strong class="rp-scene-title">${this.textOrPlaceholder(this.profile.sceneTitle, "Sans titre")}</strong>
                        <div class="rp-scene-location">${sceneLocationMarkup}</div>
                        <div class="rp-scene-note">${this.textOrPlaceholder(this.profile.sceneNote, "Aucune description")}</div>
                    ` : `
                        <div class="rp-empty-block">Aucune scène active pour le moment.</div>
                    `}
                    <button class="rp-btn-primary rp-scene-action" type="button" ${sceneButtonAttribute}>
                        ${hasScene ? "🛑 Clore la scène" : "🎬 Définir une scène"}
                    </button>
                </div>
            </div>
        `;
    }

    renderRemindersCard() {
        const reminders = this.profile.reminders;

        return `
            <div class="rp-card">
                <div class="rp-card-title">
                    <span>⚠️ Rappels importants</span>
                    <button class="rp-link-btn" type="button" data-rp-open-editor="rp-reminders">Modifier</button>
                </div>
                <div class="rp-card-content">
                    ${reminders.length ? `
                        <ul class="rp-list">
                            ${reminders.map(reminder => `<li>${this.escapeHtml(reminder)}</li>`).join("")}
                        </ul>
                    ` : `
                        <div class="rp-empty-block">Aucun rappel enregistré.</div>
                    `}
                </div>
            </div>
        `;
    }

    renderNotesCard() {
        const notes = this.profile.notes;

        return `
            <div class="rp-card">
                <div class="rp-card-title">
                    <span>📝 Notes rapides</span>
                    <button class="rp-link-btn" type="button" data-rp-open-editor="rp-notes">Modifier</button>
                </div>
                <div class="rp-card-content">
                    ${notes.length ? `
                        <ul class="rp-list" style="font-size: 13px;">
                            ${notes.map(note => `<li>${this.escapeHtml(note)}</li>`).join("")}
                        </ul>
                    ` : `
                        <div class="rp-empty-block">Aucune note enregistrée.</div>
                    `}
                </div>
            </div>
        `;
    }

    getCharacterSheetDraft(panel = null) {
        const container = panel || this.getMessagePopupNode() || this.getPanelNode();
        const draftField = container?.querySelector?.("#rp-character-sheet-draft");
        const fieldValue = this.cleanText(draftField?.value);
        if (fieldValue) {
            return fieldValue;
        }

        const storedDraft = this.cleanText(this.profile.characterSheetDraft);
        return storedDraft || this.buildCharacterSheetText();
    }

    buildCharacterSheetText(profile = this.profile) {
        const sourceProfile = profile && typeof profile === "object" ? profile : this.createEmptyProfile();
        const reminders = Array.isArray(sourceProfile.reminders) ? sourceProfile.reminders : [];
        const notes = Array.isArray(sourceProfile.notes) ? sourceProfile.notes : [];

        return [
            this.labels.characterSheetHeading,
            "",
            `${this.labels.sheetNameLabel}: ${this.cleanText(sourceProfile.characterName)}`,
            `${this.labels.sheetImageLabel}: ${this.cleanText(sourceProfile.imageUrl)}`,
            `${this.labels.sheetStatusLabel}: ${this.cleanText(sourceProfile.status)}`,
            `${this.labels.sheetMoodLabel}: ${this.cleanText(sourceProfile.mood)}`,
            `${this.labels.sheetLocationLabel}: ${this.cleanText(sourceProfile.location)}`,
            `${this.labels.sheetStateLabel}: ${this.cleanText(sourceProfile.state)}`,
            "",
            `${this.labels.sheetSceneTitleLabel}: ${this.cleanText(sourceProfile.sceneTitle)}`,
            `${this.labels.sheetSceneLocationLabel}: ${this.cleanText(sourceProfile.sceneLocation)}`,
            `${this.labels.sheetSceneNoteLabel}:`,
            this.cleanText(sourceProfile.sceneNote),
            "",
            `${this.labels.sheetRemindersLabel}:`,
            ...(reminders.length ? reminders.map(reminder => `- ${this.cleanText(reminder)}`) : ["-"]),
            "",
            `${this.labels.sheetNotesLabel}:`,
            ...(notes.length ? notes.map(note => `- ${this.cleanText(note)}`) : ["-"])
        ].join("\n").trim();
    }

    parseCharacterSheetText(text) {
        const cleanedText = this.cleanText(text);
        if (!cleanedText) {
            return null;
        }

        const parsedProfile = this.createEmptyProfile();
        const sceneNoteLines = [];
        let currentSection = "";
        const fieldPatterns = [
            ["characterName", /^(?:nom|name)\s*:\s*(.*)$/i],
            ["imageUrl", /^(?:image|avatar|url de l'image|image url)\s*:\s*(.*)$/i],
            ["status", /^(?:statut|status)\s*:\s*(.*)$/i],
            ["mood", /^(?:humeur|mood)\s*:\s*(.*)$/i],
            ["location", /^(?:lieu|location)\s*:\s*(.*)$/i],
            ["state", /^(?:état|etat|state)\s*:\s*(.*)$/i],
            ["sceneTitle", /^(?:titre de la scène|titre de scene|scene title)\s*:\s*(.*)$/i],
            ["sceneLocation", /^(?:lieu de la scène|lieu de scene|scene location)\s*:\s*(.*)$/i]
        ];
        const sectionPatterns = [
            ["sceneNote", /^(?:description de la scène|description de scene|scene description|description)\s*:\s*(.*)$/i],
            ["reminders", /^(?:rappels|reminders)\s*:\s*(.*)$/i],
            ["notes", /^(?:notes)\s*:\s*(.*)$/i]
        ];

        const pushListItem = (targetList, value) => {
            const cleanedValue = this.cleanText(value.replace(/^[-*•]\s*/, ""));
            if (cleanedValue) {
                targetList.push(cleanedValue);
            }
        };

        for (const rawLine of cleanedText.split(/\r?\n/)) {
            const line = rawLine.trim();

            if (!line) {
                if (currentSection === "sceneNote" && sceneNoteLines.length) {
                    sceneNoteLines.push("");
                }
                continue;
            }

            let matched = false;
            for (const [fieldName, pattern] of fieldPatterns) {
                const fieldMatch = line.match(pattern);
                if (fieldMatch) {
                    parsedProfile[fieldName] = this.cleanText(fieldMatch[1]);
                    currentSection = "";
                    matched = true;
                    break;
                }
            }

            if (matched) {
                continue;
            }

            for (const [sectionName, pattern] of sectionPatterns) {
                const sectionMatch = line.match(pattern);
                if (sectionMatch) {
                    currentSection = sectionName;
                    if (sectionName === "sceneNote") {
                        sceneNoteLines.length = 0;
                        const inlineValue = this.cleanText(sectionMatch[1]);
                        if (inlineValue) {
                            sceneNoteLines.push(inlineValue);
                        }
                    } else if (sectionName === "reminders") {
                        parsedProfile.reminders.length = 0;
                        pushListItem(parsedProfile.reminders, sectionMatch[1]);
                    } else if (sectionName === "notes") {
                        parsedProfile.notes.length = 0;
                        pushListItem(parsedProfile.notes, sectionMatch[1]);
                    }

                    matched = true;
                    break;
                }
            }

            if (matched) {
                continue;
            }

            if (currentSection === "sceneNote") {
                sceneNoteLines.push(rawLine);
                continue;
            }

            if (currentSection === "reminders") {
                pushListItem(parsedProfile.reminders, line);
                continue;
            }

            if (currentSection === "notes") {
                pushListItem(parsedProfile.notes, line);
            }
        }

        parsedProfile.sceneNote = this.cleanText(sceneNoteLines.join("\n"));
        parsedProfile.characterSheetDraft = this.cleanText(text);

        const hasAnyValue = [
            parsedProfile.characterName,
            parsedProfile.imageUrl,
            parsedProfile.status,
            parsedProfile.mood,
            parsedProfile.location,
            parsedProfile.state,
            parsedProfile.sceneTitle,
            parsedProfile.sceneLocation,
            parsedProfile.sceneNote,
            parsedProfile.reminders.length,
            parsedProfile.notes.length
        ].some(value => Boolean(value));

        return hasAnyValue ? parsedProfile : null;
    }

    async sendCharacterSheetToDiscord(panel = this.getMessagePopupNode() || this.getPanelNode()) {
        const sheetText = this.getCharacterSheetDraft(panel);
        const targetChannelId = this.getCurrentConversationChannelId();

        if (!sheetText) {
            BdApi?.UI?.showToast?.(this.labels.characterSheetInvalidToast, { type: "error" });
            return false;
        }

        if (!targetChannelId) {
            BdApi?.UI?.showToast?.(this.labels.invalidTarget, { type: "error" });
            return false;
        }

        const sent = await this.sendMessageChunksToDiscord(sheetText, targetChannelId);
        if (sent) {
            BdApi?.UI?.showToast?.(this.labels.characterSheetSentToast, { type: "success" });
        } else {
            BdApi?.UI?.showToast?.(this.labels.sendFailed, { type: "error" });
        }

        return sent;
    }

    applyCharacterSheetText(sheetText, toastMessage = "") {
        const parsedProfile = this.parseCharacterSheetText(sheetText);

        if (!parsedProfile) {
            return false;
        }

        this.profile = this.normalizeProfile({
            ...this.profile,
            ...parsedProfile,
            characterSheetDraft: this.buildCharacterSheetText(parsedProfile)
        });
        this.saveProfile();

        if (toastMessage) {
            BdApi?.UI?.showToast?.(toastMessage, { type: "success" });
        }

        if (this.isDashboardPopupOpen) {
            this.renderDashboardPopup();
        } else {
            this.renderPanel();
        }

        return true;
    }

    applyCharacterSheetDraft(panel = this.getMessagePopupNode() || this.getPanelNode()) {
        const sheetText = this.getCharacterSheetDraft(panel);
        if (!this.applyCharacterSheetText(sheetText, this.labels.characterSheetAppliedToast)) {
            BdApi?.UI?.showToast?.(this.labels.characterSheetInvalidToast, { type: "error" });
            return false;
        }

        return true;
    }

    resetCharacterSheetDraft(panel = this.getMessagePopupNode() || this.getPanelNode()) {
        this.profile.characterSheetDraft = this.buildCharacterSheetText(this.profile);
        this.scheduleProfileSave();

        const draftField = panel?.querySelector?.("#rp-character-sheet-draft");
        if (draftField) {
            draftField.value = this.profile.characterSheetDraft;
        }

        this.refreshMessageComposer(panel);
        return true;
    }

    startCharacterSheetReactionWatcher() {
        if (this.characterSheetReactionWatcherId) {
            return;
        }

        this.characterSheetReactionWatcherId = window.setInterval(() => {
            this.syncAcceptedCharacterSheetReactions();
        }, 1800);

        this.syncAcceptedCharacterSheetReactions();
    }

    stopCharacterSheetReactionWatcher() {
        if (this.characterSheetReactionWatcherId) {
            window.clearInterval(this.characterSheetReactionWatcherId);
        }

        this.characterSheetReactionWatcherId = null;
    }

    syncAcceptedCharacterSheetReactions() {
        const channelId = this.getCurrentConversationChannelId();
        if (!channelId) {
            return false;
        }

        const currentUserId = this.getCurrentDiscordUserId();
        const messageNodes = Array.from(document.querySelectorAll('[data-list-item-id^="chat-messages___"]'));
        if (!messageNodes.length) {
            return false;
        }

        for (let index = messageNodes.length - 1; index >= 0; index -= 1) {
            const node = messageNodes[index];
            const messageId = this.getMessageIdFromNode(node);
            if (!messageId) {
                continue;
            }

            if (messageId === this.lastAcceptedCharacterSheetMessageId) {
                return false;
            }

            const message = this.getDiscordMessageById(channelId, messageId, node);
            const messageText = this.getDiscordMessageContent(message);
            const parsedSheet = this.parseCharacterSheetText(messageText);
            if (!parsedSheet) {
                continue;
            }

            const authorId = this.getEntityId(message?.author);
            if (currentUserId && authorId && authorId !== currentUserId) {
                continue;
            }

            if (!this.hasCheckmarkReaction(message, currentUserId)) {
                continue;
            }

            if (this.applyCharacterSheetText(messageText, this.labels.characterSheetAcceptedToast)) {
                this.lastAcceptedCharacterSheetMessageId = messageId;
                return true;
            }
        }

        return false;
    }

    getDiscordUserStore() {
        try {
            return BdApi?.Webpack?.getStore?.("UserStore") || BdApi?.Webpack?.getByKeys?.("getCurrentUser") || null;
        } catch {
            return null;
        }
    }

    getCurrentDiscordUserId() {
        const userStore = this.getDiscordUserStore();
        const currentUser = userStore?.getCurrentUser?.() || null;
        return this.cleanText(currentUser?.id || userStore?.getCurrentUserId?.() || "");
    }

    getDiscordMessageStore() {
        try {
            return BdApi?.Webpack?.getStore?.("MessageStore") || BdApi?.Webpack?.getStore?.("MessagesStore") || BdApi?.Webpack?.getByKeys?.("getMessage", "getMessages") || null;
        } catch {
            return null;
        }
    }

    getMessageIdFromNode(node) {
        const listItemId = this.cleanText(node?.getAttribute?.("data-list-item-id") || node?.dataset?.listItemId);
        const match = listItemId.match(/^chat-messages___(.+)$/);
        return match ? match[1] : "";
    }

    getDiscordMessageById(channelId, messageId, node = null) {
        const messageStore = this.getDiscordMessageStore();
        if (messageStore && messageId) {
            const collectionCandidates = [
                messageStore.getMessage?.(channelId, messageId),
                messageStore.getMessage?.(messageId),
                messageStore.getMessageById?.(messageId),
                messageStore.getMessages?.(channelId),
                messageStore.getMessagesForChannel?.(channelId),
                messageStore.getMessagesByChannel?.(channelId)
            ];

            for (const candidate of collectionCandidates) {
                if (!candidate) {
                    continue;
                }

                if (candidate?.id === messageId) {
                    return candidate;
                }

                for (const message of this.normalizeArrayLike(candidate)) {
                    if (this.getEntityId(message?.id) === messageId) {
                        return message;
                    }
                }
            }
        }

        if (!node) {
            return null;
        }

        return {
            id: messageId,
            content: this.cleanText(node.textContent),
            reactions: [],
            __rpFallbackNode: node
        };
    }

    normalizeArrayLike(value) {
        if (!value) {
            return [];
        }

        if (Array.isArray(value)) {
            return value;
        }

        if (value instanceof Map || value instanceof Set) {
            return Array.from(value.values());
        }

        if (Array.isArray(value.items)) {
            return value.items;
        }

        if (Array.isArray(value.messages)) {
            return value.messages;
        }

        if (Array.isArray(value._array)) {
            return value._array;
        }

        if (value._map instanceof Map) {
            return Array.from(value._map.values());
        }

        if (typeof value === "object") {
            return Object.values(value).filter(item => item && typeof item === "object");
        }

        return [];
    }

    getDiscordMessageContent(message) {
        return this.cleanText(
            message?.content ||
            message?.body ||
            message?.text ||
            message?.message?.content ||
            message?.message?.body ||
            message?.message?.text ||
            message?.__rpFallbackNode?.textContent
        );
    }

    getDiscordMessageReactions(message) {
        return this.normalizeArrayLike(
            message?.reactions ||
            message?.reaction ||
            message?.message?.reactions ||
            message?.message?.reaction
        );
    }

    getEntityId(value) {
        if (typeof value === "string") {
            return value;
        }

        if (value && typeof value === "object") {
            return this.cleanText(value.id || value.userId || value.user_id || value.reactorId || value.messageId || value.authorId);
        }

        return "";
    }

    isCheckmarkEmoji(value) {
        const emojiText = this.cleanText(
            value?.name ||
            value?.originalName ||
            value?.shortName ||
            value?.unicode ||
            value?.emojiName ||
            value?.text ||
            value?.id ||
            value
        ).toLowerCase();

        return emojiText === "✅" || emojiText.includes("white_check_mark") || emojiText.includes("check mark") || emojiText.includes("checkmark");
    }

    reactionHasCurrentUser(reaction, currentUserId) {
        if (!reaction) {
            return false;
        }

        if (reaction.me === true || reaction.isMe === true || reaction.reactionMe === true || reaction.hasReacted === true) {
            return true;
        }

        const countDetails = reaction.countDetails;
        if (countDetails && (countDetails.me || countDetails.hasMe || countDetails.currentUser || countDetails.self)) {
            return true;
        }

        if (!currentUserId) {
            return false;
        }

        const userCollections = [
            reaction.userIds,
            reaction.users,
            reaction.reactors,
            reaction.reactorIds,
            reaction.meUserIds,
            reaction.usersList
        ];

        for (const collection of userCollections) {
            if (this.normalizeArrayLike(collection).some(user => this.getEntityId(user) === currentUserId)) {
                return true;
            }
        }

        const userCandidates = [reaction.user, reaction.currentUser, reaction.meUser, reaction.author];
        return userCandidates.some(user => this.getEntityId(user) === currentUserId);
    }

    nodeHasCheckmarkReaction(node) {
        if (!node) {
            return false;
        }

        const text = Array.from(node.querySelectorAll("[aria-label], [data-tooltip], [title], button, [role='button']"))
            .map(element => `${element.getAttribute("aria-label") || ""} ${element.getAttribute("data-tooltip") || ""} ${element.getAttribute("title") || ""} ${element.textContent || ""}`.toLowerCase())
            .join(" ");

        return text.includes("✅") || text.includes("white check mark") || text.includes("check mark") || text.includes("checkmark");
    }

    hasCheckmarkReaction(message, currentUserId) {
        const reactions = this.getDiscordMessageReactions(message);
        for (const reaction of reactions) {
            const emoji = reaction?.emoji || reaction?.reaction || reaction;
            if (!this.isCheckmarkEmoji(emoji)) {
                continue;
            }

            if (this.reactionHasCurrentUser(reaction, currentUserId)) {
                return true;
            }
        }

        const fallbackNode = message?.__rpFallbackNode;
        return Boolean(fallbackNode && this.nodeHasCheckmarkReaction(fallbackNode));
    }

    renderEditorCard() {
        return `
            <div class="rp-card">
                <div class="rp-card-title">
                    <span>✏️ Modifier les informations</span>
                    <button class="rp-link-btn" type="button" data-rp-close-editor>Fermer</button>
                </div>
                <div class="rp-card-content rp-editor">
                    <div class="rp-editor-grid">
                        <label class="rp-editor-field">
                            <span>Nom du personnage</span>
                            <input id="rp-character-name" type="text" value="${this.escapeHtml(this.profile.characterName)}" placeholder="Ex: Elias Vance">
                        </label>
                        <label class="rp-editor-field">
                            <span>Image du tableau</span>
                            <input id="rp-image-url" type="text" value="${this.escapeHtml(this.profile.imageUrl)}" placeholder="https://...">
                        </label>
                        <label class="rp-editor-field">
                            <span>Statut</span>
                            <input id="rp-status" type="text" value="${this.escapeHtml(this.profile.status)}" placeholder="Ex: En recherche de RP">
                        </label>
                        <label class="rp-editor-field">
                            <span>Humeur</span>
                            <input id="rp-mood" type="text" value="${this.escapeHtml(this.profile.mood)}" placeholder="Ex: Calme, tendu, enthousiaste">
                        </label>
                        <label class="rp-editor-field">
                            <span>Lieu</span>
                            <input id="rp-location" type="text" value="${this.escapeHtml(this.profile.location)}" placeholder="Ex: Bar de l'Aube">
                        </label>
                        <label class="rp-editor-field">
                            <span>État</span>
                            <input id="rp-state" type="text" value="${this.escapeHtml(this.profile.state)}" placeholder="Ex: Blessé">
                        </label>
                        <label class="rp-editor-field">
                            <span>Titre de la scène</span>
                            <input id="rp-scene-title" type="text" value="${this.escapeHtml(this.profile.sceneTitle)}" placeholder="Ex: Négociations nocturnes">
                        </label>
                        <label class="rp-editor-field">
                            <span>Lieu de la scène</span>
                            <input id="rp-scene-location" type="text" value="${this.escapeHtml(this.profile.sceneLocation)}" placeholder="Ex: Ruelles du Secteur 4">
                        </label>
                        <label class="rp-editor-field">
                            <span>Description de la scène</span>
                            <textarea id="rp-scene-note" placeholder="Décris la scène en cours">${this.escapeHtml(this.profile.sceneNote)}</textarea>
                        </label>
                        <label class="rp-editor-field">
                            <span>Rappels, un par ligne</span>
                            <textarea id="rp-reminders" placeholder="Balle épaule (-2 Agi)\nDette 500 Cr (J-2)">${this.escapeHtml(this.profile.reminders.join("\n"))}</textarea>
                        </label>
                        <label class="rp-editor-field">
                            <span>Notes, une par ligne</span>
                            <textarea id="rp-notes" placeholder="Code porte labo : 4902\nNe pas faire confiance au barman">${this.escapeHtml(this.profile.notes.join("\n"))}</textarea>
                        </label>
                    </div>
                    <div class="rp-editor-actions">
                        <button class="rp-btn-secondary" type="button" data-rp-reset-profile>Vider tout</button>
                        <button class="rp-btn-secondary" type="button" data-rp-close-editor>Annuler</button>
                        <button class="rp-btn-primary" type="button" data-rp-save-profile>Enregistrer</button>
                    </div>
                </div>
            </div>
        `;
    }

    bindPanelEvents(panel) {
        const dashboardButtons = panel.querySelectorAll("[data-rp-open-dashboard]");
        dashboardButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                this.openDashboardPopup();
            });
        });

        const messageButtons = panel.querySelectorAll("[data-rp-open-message]");
        messageButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                this.openMessagePopup();
            });
        });

        const openEditorElements = panel.querySelectorAll("[data-rp-open-editor]");
        openEditorElements.forEach(element => {
            element.addEventListener("click", event => {
                event.preventDefault();
                const focusField = element.dataset.rpOpenEditor || null;

                if (focusField === "rp-scene-title") {
                    this.openEditor("rp-scene-title");
                    return;
                }

                if (focusField === "rp-reminders") {
                    this.openEditor("rp-reminders");
                    return;
                }

                if (focusField === "rp-notes") {
                    this.openEditor("rp-notes");
                    return;
                }

                if (focusField === "rp-status") {
                    this.openEditor("rp-status");
                    return;
                }

                if (focusField === "rp-image-url") {
                    this.openEditor("rp-image-url");
                    return;
                }

                if (focusField === "rp-message-draft") {
                    this.focusMessageComposer(panel);
                    return;
                }

                if (focusField === "rp-mood") {
                    this.openEditor("rp-mood");
                    return;
                }

                if (focusField === "rp-location") {
                    this.openEditor("rp-location");
                    return;
                }

                this.openEditor();
            });
        });

        const avatarImage = panel.querySelector(".rp-avatar-image");
        if (avatarImage) {
            const avatarFallback = panel.querySelector(".rp-avatar-fallback");
            const showFallback = () => {
                avatarImage.style.display = "none";
                if (avatarFallback) {
                    avatarFallback.style.display = "flex";
                }
            };

            const showImage = () => {
                avatarImage.style.display = "block";
                if (avatarFallback) {
                    avatarFallback.style.display = "none";
                }
            };

            avatarImage.addEventListener("error", showFallback);
            avatarImage.addEventListener("load", showImage);

            if (avatarImage.complete) {
                if (avatarImage.naturalWidth === 0) {
                    showFallback();
                } else {
                    showImage();
                }
            }
        }

        const messageDraft = panel.querySelector("#rp-message-draft");
        const scheduleInput = panel.querySelector("#rp-message-schedule");
        if (messageDraft || scheduleInput) {
            const syncMessageComposer = () => {
                if (messageDraft) {
                    this.profile.messageDraft = this.cleanText(messageDraft.value);
                }

                if (scheduleInput) {
                    this.profile.messageScheduleValue = this.cleanText(scheduleInput.value);
                }

                if (this.pendingSendTimerId && this.pendingSendConversationKey === this.conversationKey) {
                    this.pendingSendMessage = this.profile.messageDraft;
                }

                this.scheduleProfileSave();
                this.refreshMessageComposer(panel);
            };

            if (messageDraft) {
                messageDraft.addEventListener("input", syncMessageComposer);
            }

            if (scheduleInput) {
                scheduleInput.addEventListener("input", syncMessageComposer);
            }
        }

        const focusMessageButtons = panel.querySelectorAll("[data-rp-focus-message]");
        focusMessageButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                this.focusMessageComposer(panel);
            });
        });

        const sendMessageButtons = panel.querySelectorAll("[data-rp-send-message]");
        sendMessageButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                void this.queueMessageSend();
            });
        });

        const sendLaterButtons = panel.querySelectorAll("[data-rp-send-later]");
        sendLaterButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                void this.queueMessageSend({ schedule: true });
            });
        });

        const characterSheetDraft = panel.querySelector("#rp-character-sheet-draft");
        if (characterSheetDraft) {
            characterSheetDraft.addEventListener("input", () => {
                this.profile.characterSheetDraft = this.cleanText(characterSheetDraft.value);
                this.scheduleProfileSave();
            });
        }

        const focusCharacterSheetButtons = panel.querySelectorAll("[data-rp-focus-character-sheet]");
        focusCharacterSheetButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                this.focusFieldInContainer(panel, "rp-character-sheet-draft");
            });
        });

        const sendCharacterSheetButtons = panel.querySelectorAll("[data-rp-send-character-sheet]");
        sendCharacterSheetButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                void this.sendCharacterSheetToDiscord(panel);
            });
        });

        const applyCharacterSheetButtons = panel.querySelectorAll("[data-rp-apply-character-sheet]");
        applyCharacterSheetButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                this.applyCharacterSheetDraft(panel);
            });
        });

        const resetCharacterSheetButtons = panel.querySelectorAll("[data-rp-reset-character-sheet]");
        resetCharacterSheetButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                this.resetCharacterSheetDraft(panel);
            });
        });

        const closeBtn = panel.querySelector("#rp-close-btn");
        if (closeBtn) {
            closeBtn.addEventListener("click", () => this.togglePanel());
        }

        const closeEditorButtons = panel.querySelectorAll("[data-rp-close-editor]");
        closeEditorButtons.forEach(button => {
            button.addEventListener("click", event => {
                event.preventDefault();
                this.closeEditor();
            });
        });

        const saveButton = panel.querySelector("[data-rp-save-profile]");
        if (saveButton) {
            saveButton.addEventListener("click", event => {
                event.preventDefault();
                this.saveProfileFromEditor();
            });
        }

        const resetButton = panel.querySelector("[data-rp-reset-profile]");
        if (resetButton) {
            resetButton.addEventListener("click", event => {
                event.preventDefault();
                this.resetProfile();
            });
        }

        const clearSceneButton = panel.querySelector("[data-rp-clear-scene]");
        if (clearSceneButton) {
            clearSceneButton.addEventListener("click", event => {
                event.preventDefault();
                this.clearScene();
            });
        }

        this.refreshMessageComposer(panel);
    }

    openEditor(focusField = null) {
        const targetField = focusField;
        this.closeMessagePopup(true);
        this.isDashboardPopupOpen = true;
        this.isEditing = true;
        this.editorFocusField = focusField;
        this.renderDashboardPopup();
        this.focusFieldInContainer(this.getDashboardPopupNode(), targetField);
    }

    closeEditor() {
        this.isEditing = false;
        this.editorFocusField = null;

        if (this.isDashboardPopupOpen) {
            this.renderDashboardPopup();
            return;
        }

        this.renderPanel();
    }

    saveProfileFromEditor() {
        const container = this.getDashboardPopupNode() || this.getPanelNode();
        if (!container) return;

        this.profile = this.collectProfileFromEditor(container);

        this.saveProfile();
        this.isEditing = false;
        this.editorFocusField = null;

        if (this.isDashboardPopupOpen) {
            this.renderDashboardPopup();
            return;
        }

        this.renderPanel();
    }

    collectProfileFromEditor(panel) {
        const readValue = id => this.cleanText(panel.querySelector(`#${id}`)?.value);

        return this.normalizeProfile({
            ...this.profile,
            characterName: readValue("rp-character-name"),
            imageUrl: readValue("rp-image-url"),
            status: readValue("rp-status"),
            location: readValue("rp-location"),
            state: readValue("rp-state"),
            sceneTitle: readValue("rp-scene-title"),
            sceneLocation: readValue("rp-scene-location"),
            sceneNote: readValue("rp-scene-note"),
            reminders: this.normalizeLines(panel.querySelector("#rp-reminders")?.value),
            notes: this.normalizeLines(panel.querySelector("#rp-notes")?.value)
        });
    }

    resetProfile() {
        this.profile = this.createEmptyProfile();
        this.cancelPendingSend();
        this.saveProfile();
        const targetField = "rp-character-name";
        this.closeMessagePopup(true);
        this.isDashboardPopupOpen = true;
        this.isEditing = true;
        this.editorFocusField = targetField;
        this.renderDashboardPopup();
        this.focusFieldInContainer(this.getDashboardPopupNode(), targetField);
    }

    clearScene() {
        this.profile.sceneTitle = "";
        this.profile.sceneLocation = "";
        this.profile.sceneNote = "";
        this.saveProfile();

        if (this.isDashboardPopupOpen) {
            this.renderDashboardPopup();
            return;
        }

        this.renderPanel();
    }

    renderMessageStatus() {
        if (this.pendingSendTimerId && this.pendingSendConversationKey === this.conversationKey) {
            const chunkCount = this.pendingSendMessage ? this.splitMessageForDiscord(this.pendingSendMessage).length : 0;
            const chunkSuffix = this.labels.chunkSuffix(chunkCount);
            const remainingText = this.formatCountdownText(this.pendingSendDueAt || (Date.now() + (this.pendingSendDelayMinutes * 60000)));
            return `⏱ ${this.labels.statusScheduled} ${remainingText}${chunkSuffix}`;
        }

        if (this.cleanText(this.profile.messageDraft)) {
            const schedulePreview = this.parseMessageScheduleValue(this.getMessageScheduleValue());
            return schedulePreview ? `🕒 ${this.labels.statusReadyScheduled} ${schedulePreview.label}` : `💬 ${this.labels.statusReady}`;
        }

        return this.labels.statusEmpty;
    }

    refreshMessageComposer(panel) {
        const statusNode = panel.querySelector("[data-rp-send-status]");
        if (statusNode) {
            statusNode.textContent = this.renderMessageStatus();
        }
    }

    focusMessageComposer(panel) {
        const messageField = panel.querySelector("#rp-message-draft");
        if (messageField && typeof messageField.focus === "function") {
            messageField.focus();
            if (typeof messageField.scrollIntoView === "function") {
                messageField.scrollIntoView({ block: "center", behavior: "smooth" });
            }
        }
    }

    async queueMessageSend({ schedule = false } = {}) {
        const panel = this.getPanelNode();
        if (!panel) {
            return;
        }

        const messageField = panel.querySelector("#rp-message-draft");
        const scheduleField = panel.querySelector("#rp-message-schedule");
        const message = this.cleanText(messageField?.value || this.profile.messageDraft);
        const scheduleValue = this.cleanText(scheduleField?.value || this.getMessageScheduleValue());
        const targetChannelId = this.getCurrentConversationChannelId();

        if (!message) {
            BdApi?.UI?.showToast?.(this.labels.invalidMessage, { type: "error" });
            return;
        }

        if (!targetChannelId) {
            BdApi?.UI?.showToast?.(this.labels.invalidTarget, { type: "error" });
            return;
        }

        this.profile.messageDraft = message;
        if (scheduleField) {
            this.profile.messageScheduleValue = scheduleValue;
        }
        this.saveProfile();

        if (schedule) {
            const scheduleInfo = this.parseMessageScheduleValue(scheduleValue);
            if (!scheduleInfo) {
                BdApi?.UI?.showToast?.(this.labels.invalidSchedule, { type: "error" });
                return;
            }

            const chunkCount = this.splitMessageForDiscord(message).length;

            this.cancelPendingSend();
            this.pendingSendConversationKey = this.conversationKey;
            this.pendingSendStorageKey = this.storageKey;
            this.pendingSendMessage = message;
            this.pendingSendDelayMinutes = scheduleInfo.delayMinutes;
            this.pendingSendScheduleLabel = scheduleInfo.label;
            this.pendingSendDueAt = scheduleInfo.dueAt || (Date.now() + (scheduleInfo.delayMinutes * 60000));
            this.pendingSendScheduleType = scheduleInfo.type;
            this.pendingSendTargetChannelId = targetChannelId;
            this.pendingSendTimerId = window.setTimeout(() => {
                void this.executePendingSend();
            }, scheduleInfo.delayMinutes * 60000);
            this.startPendingSendCountdown();

            BdApi?.UI?.showToast?.(this.labels.scheduledToast(scheduleInfo.label, this.labels.chunkSuffix(chunkCount)), { type: "success" });
            this.renderPanel();
            return;
        }

        const sent = await this.sendMessageChunksToDiscord(message, targetChannelId);
        if (sent) {
            const chunkCount = this.splitMessageForDiscord(message).length;
            this.profile.messageDraft = "";
            this.saveProfile();
            BdApi?.UI?.showToast?.(this.labels.sentToast(chunkCount), { type: "success" });
            this.renderPanel();
        } else {
            BdApi?.UI?.showToast?.(this.labels.sendFailed, { type: "error" });
        }
    }

    async executePendingSend() {
        const scheduledMessage = this.cleanText(this.profile.messageDraft) || this.pendingSendMessage;
        const scheduledChannelId = this.pendingSendTargetChannelId;
        const scheduledStorageKey = this.pendingSendStorageKey;
        const chunkCount = this.splitMessageForDiscord(scheduledMessage).length;

        if (!scheduledMessage || !scheduledChannelId) {
            this.cancelPendingSend();
            return;
        }

        const sent = await this.sendMessageChunksToDiscord(scheduledMessage, scheduledChannelId);
        if (sent) {
            if (scheduledStorageKey) {
                const scheduledProfile = this.loadProfile(scheduledStorageKey);
                if (scheduledProfile && typeof scheduledProfile === "object") {
                    const currentDraft = this.cleanText(scheduledProfile.messageDraft);
                    if (currentDraft === scheduledMessage) {
                        scheduledProfile.messageDraft = "";
                        this.saveProfile(scheduledStorageKey, scheduledProfile);
                    }

                    if (scheduledStorageKey === this.storageKey) {
                        this.profile = scheduledProfile;
                    }
                }
            }

            this.cancelPendingSend();
            BdApi?.UI?.showToast?.(this.labels.sentToast(chunkCount), { type: "success" });
            this.renderPanel();
        } else {
            this.cancelPendingSend();
            BdApi?.UI?.showToast?.(this.labels.sendFailed, { type: "error" });
        }
    }

    cancelPendingSend() {
        if (this.pendingSendTimerId) {
            window.clearTimeout(this.pendingSendTimerId);
        }

        this.stopPendingSendCountdown();

        this.pendingSendTimerId = null;
        this.pendingSendConversationKey = "";
        this.pendingSendMessage = "";
        this.pendingSendDelayMinutes = 0;
        this.pendingSendScheduleLabel = "";
        this.pendingSendTargetChannelId = "";
        this.pendingSendStorageKey = "";
        this.pendingSendDueAt = 0;
        this.pendingSendScheduleType = "";
    }

    dispatchMessageToDiscord(message, channelId = this.getCurrentConversationChannelId()) {
        const directSendResult = this.sendMessageViaDiscordApi(message, channelId);
        if (directSendResult) {
            return true;
        }

        const currentSelectedChannelId = this.getCurrentSelectedChannelId();
        if (channelId && currentSelectedChannelId && channelId !== currentSelectedChannelId) {
            return false;
        }

        const composer = this.findDiscordComposer();
        if (!composer) {
            return false;
        }

        if (!this.setDiscordComposerValue(composer, message)) {
            return false;
        }

        composer.focus?.();

        if (this.clickDiscordSendButton()) {
            return true;
        }

        return this.pressEnterOnComposer(composer);
    }

    getDiscordMessageActions() {
        try {
            return BdApi?.Webpack?.getByKeys?.("sendMessage", "editMessage") || null;
        } catch {
            return null;
        }
    }

    getDiscordSelectedChannelStore() {
        try {
            return BdApi?.Webpack?.getStore?.("SelectedChannelStore") || null;
        } catch {
            return null;
        }
    }

    sendMessageViaDiscordApi(message, channelId = this.getCurrentConversationChannelId()) {
        const messageActions = this.getDiscordMessageActions();
        const selectedChannelStore = this.getDiscordSelectedChannelStore();
        const targetChannelId = channelId || selectedChannelStore?.getChannelId?.();

        if (!messageActions || typeof messageActions.sendMessage !== "function" || !targetChannelId) {
            return false;
        }

        try {
            messageActions.sendMessage(targetChannelId, {
                content: message,
                invalidEmojis: [],
                tts: false,
                validNonShortcutEmojis: []
            }, true, {});
            return true;
        } catch {
            return false;
        }
    }

    findDiscordComposer() {
        const candidates = Array.from(document.querySelectorAll('textarea, div[role="textbox"][contenteditable="true"]'))
            .filter(element => !this.isInsidePluginUi(element))
            .filter(element => this.isElementVisible(element));

        if (!candidates.length) {
            return null;
        }

        candidates.sort((first, second) => second.getBoundingClientRect().top - first.getBoundingClientRect().top);
        return candidates[0] || null;
    }

    isElementVisible(element) {
        if (!element) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }

    isInsidePluginUi(element) {
        return Boolean(
            element?.closest?.(`#${this.panelId}`) ||
            element?.closest?.(`#${this.dashboardPopupId}`) ||
            element?.closest?.(`#${this.messagePopupId}`)
        );
    }

    setDiscordComposerValue(composer, message) {
        if (!composer) {
            return false;
        }

        if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {
            composer.value = message;
            composer.dispatchEvent(new Event("input", { bubbles: true }));
            composer.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        }

        composer.focus?.();
        composer.textContent = message;
        composer.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: message
        }));
        return true;
    }

    clickDiscordSendButton() {
        const buttons = Array.from(document.querySelectorAll("button")).filter(button => !this.isInsidePluginUi(button) && this.isElementVisible(button));
        const sendButton = buttons.find(button => {
            const label = `${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`.toLowerCase();
            return label.includes("send") || label.includes("envoyer");
        });

        if (!sendButton) {
            return false;
        }

        sendButton.click();
        return true;
    }

    pressEnterOnComposer(composer) {
        const events = ["keydown", "keypress", "keyup"];
        for (const eventName of events) {
            composer.dispatchEvent(new KeyboardEvent(eventName, {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
        }

        return true;
    }

    removePanel() {
        const panel = this.getPanelNode();
        if (panel) panel.remove();
    }

    togglePanel() {
        this.isOpen = !this.isOpen;
        this.renderPanel();
    }

    escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => {
            switch (character) {
                case "&":
                    return "&amp;";
                case "<":
                    return "&lt;";
                case ">":
                    return "&gt;";
                case '"':
                    return "&quot;";
                case "'":
                    return "&#39;";
                default:
                    return character;
            }
        });
    }

    textOrPlaceholder(value, placeholder) {
        const text = this.cleanText(value);
        return text ? this.escapeHtml(text) : `<span class="rp-empty-value">${this.escapeHtml(placeholder)}</span>`;
    }
};