import { MessageType } from "./types";

export interface MessageHandlerCallbacks {
    onSettingsUpdate: (message: MessageType) => Promise<void>;
}

export class MessageHandler {
    private callbacks: MessageHandlerCallbacks;

    constructor(callbacks: MessageHandlerCallbacks) {
        this.callbacks = callbacks;
        this.initialize();
    }

    private initialize(): void {
        chrome.runtime.onMessage.addListener(
            (
                message: MessageType,
                _sender: chrome.runtime.MessageSender,
                sendResponse: (response?: any) => void
            ) => {
                if (message.type === "UPDATE_SETTINGS") {
                    console.log(
                        "Message: Received settings update:",
                        message.settings,
                        "Global:",
                        message.isGlobal,
                        "Mode:",
                        message.mode
                    );

                    (async () => {
                        try {
                            await this.callbacks.onSettingsUpdate(message);
                            sendResponse({ success: true });
                        } catch (error) {
                            console.error("Message: Error handling update:", error);
                            sendResponse({ success: false, error });
                        }
                    })();
                }
                return true;
            }
        );
    }
}
