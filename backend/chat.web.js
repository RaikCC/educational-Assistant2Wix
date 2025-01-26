import { fetch } from 'wix-fetch';
import { Permissions, webMethod } from 'wix-web-module';
import { secrets } from "wix-secrets-backend.v2";
import { elevate } from "wix-auth";

// Debug-Schalter für Backend-Logging
const ENABLE_BACKEND_DEBUG = false;

// Debug-Logging Funktion
const debugLog = (...args) => ENABLE_BACKEND_DEBUG && console.log('[Backend]', ...args);
const debugError = (...args) => ENABLE_BACKEND_DEBUG && console.error('[Backend]', ...args);

// Konfiguration für Retry-Mechanismus
// Exponentielles Backoff: 500ms -> 1s -> 2s
// Moderate Wartezeiten um API-Limits zu respektieren aber User-Experience zu verbessern
const RETRY_DELAYS = [500, 1000, 2000]; // Verzögerungen in Millisekunden
const RETRYABLE_STATUS_CODES = [504, 503, 502]; // Status Codes, die einen Retry rechtfertigen

/**
 * Führt eine Fetch-Operation mit automatischen Wiederholungsversuchen aus
 * @param {Function} fetchOperation - Async Funktion, die den Fetch-Aufruf durchführt
 * @param {string} operationName - Name/Beschreibung der Operation für Logging
 * @returns {Promise} - Ergebnis der Fetch-Operation
 */
async function retryableFetch(fetchOperation, operationName = 'Unbekannte Operation') {
    let lastError;
    
    for (let i = 0; i <= RETRY_DELAYS.length; i++) {
        try {
            const response = await fetchOperation();
            
            // Wenn der Status Code einen Retry rechtfertigt und wir noch Versuche haben
            if (RETRYABLE_STATUS_CODES.includes(response.status) && i < RETRY_DELAYS.length) {
                lastError = new Error(`Request failed with status code ${response.status}`);
                debugLog(`[Retry ${i + 1}/${RETRY_DELAYS.length}] ${operationName}: Status ${response.status} empfangen. Warte ${RETRY_DELAYS[i]}ms vor nächstem Versuch...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i]));
                continue;
            }
            
            // Erfolgs-Logging
            if (i === 0) {
                debugLog(`[Success] ${operationName}: Erfolgreich beim ersten Versuch`);
            } else {
                debugLog(`[Success] ${operationName}: Erfolgreich nach ${i} Wiederholungen`);
            }
            
            return response;
        } catch (error) {
            lastError = error;
            
            // Wenn wir keine weiteren Versuche mehr haben, werfen wir den Fehler
            if (i === RETRY_DELAYS.length) {
                debugError(`[Retry] ${operationName}: Alle Versuche fehlgeschlagen nach ${i} Wiederholungen. Letzter Fehler:`, error);
                throw lastError;
            }
            
            debugLog(`[Retry ${i + 1}/${RETRY_DELAYS.length}] ${operationName}: Fehler aufgetreten: ${error.message}. Warte ${RETRY_DELAYS[i]}ms vor nächstem Versuch...`);
            // Warten vor dem nächsten Versuch
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[i]));
        }
    }
    
    throw lastError;
}

const elevatedGetSecretValue = elevate(secrets.getSecretValue);

let openAiApiKey = null;
let assistantId = null;

// Wichtig: Basis-URL ohne /beta
const OPENAI_API_URL = "https://api.openai.com/v1";

let currentThreadId = null;

/**
 * Initialisiert den Chat, indem ein neuer Thread erstellt wird.
 */
async function _initializeChat() {
    try {
        // Wenn bereits ein Thread existiert, diesen wiederverwenden
        if (currentThreadId) {
            debugLog('[Backend] Verwende existierenden Thread:', currentThreadId);
            return { success: true, threadId: currentThreadId };
        }

        openAiApiKey = (await elevatedGetSecretValue("OpenAI-API-KEY")).value;
        assistantId = (await elevatedGetSecretValue("Assistant-ID")).value;
        
        const response = await retryableFetch(() => 
            fetch(`${OPENAI_API_URL}/threads`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openAiApiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                }
            }), 'Thread erstellen'
        );

        const thread = await response.json();
        currentThreadId = thread.id;
        debugLog('[Backend] Neuer Thread erstellt:', currentThreadId);

        // Initial message hinzufügen
        await retryableFetch(() =>
            fetch(`${OPENAI_API_URL}/threads/${currentThreadId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openAiApiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                },
                body: JSON.stringify({
                    role: 'assistant',
                    content: 'Hallo, ich bin ein hilfreicher Assistent' // Das ist tatsächlich die erste Nachricht, auch aus Sicht des Modells, es sollte zu den restlichen System Instructions des Assistenten passen.
                })
            }), 'Initiale Nachricht senden'
        );

        return { success: true, threadId: thread.id };
    } catch (error) {
        debugError('Fehler beim Initialisieren des Chats:', error);
        return { success: false, error: error.message };
    }
}

async function _startMessage(message) {
    if (!currentThreadId) {
        const init = await _initializeChat();
        if (!init.success) {
            return { success: false, error: 'Chat konnte nicht initialisiert werden.' };
        }
    }

    try {
        // Nachricht zum Thread hinzufügen
        await retryableFetch(() =>
            fetch(`${OPENAI_API_URL}/threads/${currentThreadId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openAiApiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                },
                body: JSON.stringify({
                    role: 'user',
                    content: message
                })
            }), 'User-Nachricht senden'
        );

        // Run erstellen
        const runResponse = await retryableFetch(() =>
            fetch(`${OPENAI_API_URL}/threads/${currentThreadId}/runs`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openAiApiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                },
                body: JSON.stringify({
                    assistant_id: assistantId
                })
            }), 'Run erstellen'
        );

        const run = await runResponse.json();
        return { 
            success: true, 
            runId: run.id,
            threadId: currentThreadId 
        };
    } catch (error) {
        debugError('[Error] Fehler beim Starten der Nachricht:', error);
        return { 
            success: false, 
            error: error.message,
            details: error.stack
        };
    }
}

async function _pollRunStatus(runId) {
    if (!currentThreadId) {
        return { success: false, error: 'Kein aktiver Chat-Thread.' };
    }

    try {
        const statusResponse = await retryableFetch(() =>
            fetch(`${OPENAI_API_URL}/threads/${currentThreadId}/runs/${runId}`, {
                headers: {
                    'Authorization': `Bearer ${openAiApiKey}`,
                    'OpenAI-Beta': 'assistants=v2'
                }
            }), 'Run-Status abfragen'
        );
        const runStatus = await statusResponse.json();

        if (runStatus.status === 'completed') {
            // Antwort abrufen
            const messagesResponse = await retryableFetch(() =>
                fetch(`${OPENAI_API_URL}/threads/${currentThreadId}/messages`, {
                    headers: {
                        'Authorization': `Bearer ${openAiApiKey}`,
                        'OpenAI-Beta': 'assistants=v2'
                    }
                }), 'Antwort abrufen'
            );
            const messages = await messagesResponse.json();
            
            return { 
                success: true,
                status: 'completed',
                response: messages.data[0].content[0].text.value
            };
        } else if (runStatus.status === 'failed') {
            const errorMessage = `Run fehlgeschlagen: ${runStatus.last_error?.message || 'Unbekannter Fehler'}`;
            debugError('[Error] ' + errorMessage);
            return {
                success: false,
                status: 'failed',
                error: errorMessage
            };
        } else {
            return {
                success: true,
                status: runStatus.status
            };
        }
    } catch (error) {
        debugError('[Error] Fehler beim Abrufen des Run-Status:', error);
        return { 
            success: false, 
            error: error.message,
            details: error.stack
        };
    }
}

async function _getChatHistory() {
    if (!currentThreadId) {
        return { success: false, error: 'Kein aktiver Chat-Thread.' };
    }

    try {
        const response = await retryableFetch(() =>
            fetch(`${OPENAI_API_URL}/threads/${currentThreadId}/messages`, {
                headers: {
                    'Authorization': `Bearer ${openAiApiKey}`,
                    'OpenAI-Beta': 'assistants=v2'
                }
            }), 'Chat-Historie abrufen'
        );
        const messages = await response.json();
        return { success: true, messages: messages.data };
    } catch (error) {
        debugError('Fehler beim Abrufen der Chat-Historie:', error);
        return { success: false, error: error.message };
    }
}

// Öffentliche Funktionen mit Permissions
export const initializeChat = webMethod(Permissions.Anyone, () => _initializeChat());
export const startMessage = webMethod(Permissions.Anyone, (message) => _startMessage(message));
export const pollRunStatus = webMethod(Permissions.Anyone, (runId) => _pollRunStatus(runId));
export const getChatHistory = webMethod(Permissions.Anyone, () => _getChatHistory());

// Alte sendMessage-Funktion als Referenz behalten (auskommentiert)
// export const sendMessage = webMethod(Permissions.Anyone, (message) => _sendMessage(message));