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
// Exponentielles Backoff: 1ms -> 2ms -> 4ms -> 8ms -> 16ms -> 32ms -> 64ms -> 128ms -> 256ms
// Moderate Wartezeiten um API-Limits zu respektieren aber User-Experience zu verbessern
const RETRY_DELAYS = [1, 2, 4, 8, 16, 32, 64, 128, 256]; // Verzögerungen in Millisekunden
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

// Basis-URL ohne /beta
const OPENAI_API_URL = "https://api.openai.com/v1";

/**
 * Lädt die benötigten Secrets aus dem Backend
 * @returns {Promise<{apiKey: string, assistantId: string}>}
 */
async function loadSecrets() {
    const openAiApiKey = (await elevatedGetSecretValue("OpenAI-API-KEY")).value;
    const assistantId = (await elevatedGetSecretValue("Assistant-ID")).value;
    return { apiKey: openAiApiKey, assistantId };
}

/**
 * Initialisiert den Chat, indem ein neuer Thread erstellt wird.
 */
async function _initializeChat() {
    try {
        const { apiKey, assistantId } = await loadSecrets();
        
        const response = await retryableFetch(() => 
            fetch(`${OPENAI_API_URL}/threads`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'OpenAI-Beta': 'assistants=v2'
                }
            }), 'Thread erstellen'
        );

        const thread = await response.json();
        debugLog('[Backend] Neuer Thread erstellt:', thread.id);

        // Initial message hinzufügen
        await retryableFetch(() =>
            fetch(`${OPENAI_API_URL}/threads/${thread.id}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
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

async function _startMessage(message, threadId) {
    if (!threadId) {
        return { success: false, error: 'Keine ThreadID angegeben.' };
    }

    try {
        const { apiKey, assistantId } = await loadSecrets();

        // Nachricht zum Thread hinzufügen
        await retryableFetch(() =>
            fetch(`${OPENAI_API_URL}/threads/${threadId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
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
            fetch(`${OPENAI_API_URL}/threads/${threadId}/runs`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
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
            threadId: threadId 
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

async function _pollRunStatus(runId, threadId) {
    if (!threadId) {
        return { success: false, error: 'Keine ThreadID angegeben.' };
    }

    try {
        const { apiKey } = await loadSecrets();

        const statusResponse = await retryableFetch(() =>
            fetch(`${OPENAI_API_URL}/threads/${threadId}/runs/${runId}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'OpenAI-Beta': 'assistants=v2'
                }
            }), 'Run-Status abfragen'
        );
        const runStatus = await statusResponse.json();

        // Validiere, dass ein Status vorhanden ist
        if (!runStatus.status) {
            debugError('[Error] Kein Status in der API-Antwort:', runStatus);
            return {
                success: false,
                error: 'Ungültige API-Antwort: Kein Status vorhanden',
                details: JSON.stringify(runStatus)
            };
        }

        // Validiere, dass der Status ein bekannter Wert ist
        const validStatuses = ['queued', 'in_progress', 'completed', 'requires_action', 'failed', 'cancelled', 'expired'];
        if (!validStatuses.includes(runStatus.status)) {
            debugError('[Error] Unbekannter Status in der API-Antwort:', runStatus.status);
            return {
                success: false,
                error: `Ungültiger Status: ${runStatus.status}`,
                details: JSON.stringify(runStatus)
            };
        }

        // Immer den Status zurückgeben, egal welcher es ist
        const response = {
            success: true,
            status: runStatus.status
        };

        // Bei 'completed' die Antwort hinzufügen
        if (runStatus.status === 'completed') {
            const messagesResponse = await retryableFetch(() =>
                fetch(`${OPENAI_API_URL}/threads/${threadId}/messages?limit=99&order=desc`, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'OpenAI-Beta': 'assistants=v2'
                    }
                }), 'Antwort abrufen'
            );
            const messages = await messagesResponse.json();
            response.response = messages.data[0].content[0].text.value;
        } 
        // Bei 'failed' den Fehler hinzufügen
        else if (runStatus.status === 'failed') {
            const errorMessage = `Run fehlgeschlagen: ${runStatus.last_error?.message || 'Unbekannter Fehler'}`;
            debugError('[Error] ' + errorMessage);
            return {
                success: false,
                status: 'failed',
                error: errorMessage
            };
        }
        
        return response;
    } catch (error) {
        debugError('[Error] Fehler beim Abrufen des Run-Status:', error);
        return { 
            success: false, 
            error: error.message,
            details: error.stack
        };
    }
}

async function _getChatHistory(threadId) {
    if (!threadId) {
        return { success: false, error: 'Keine ThreadID angegeben.' };
    }

    try {
        const { apiKey } = await loadSecrets();

        const response = await retryableFetch(() =>
            fetch(`${OPENAI_API_URL}/threads/${threadId}/messages?limit=99`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
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
export const startMessage = webMethod(Permissions.Anyone, (message, threadId) => _startMessage(message, threadId));
export const pollRunStatus = webMethod(Permissions.Anyone, (runId, threadId) => _pollRunStatus(runId, threadId));
export const getChatHistory = webMethod(Permissions.Anyone, (threadId) => _getChatHistory(threadId));

// Alte sendMessage-Funktion als Referenz behalten (auskommentiert)
// export const sendMessage = webMethod(Permissions.Anyone, (message) => _sendMessage(message));