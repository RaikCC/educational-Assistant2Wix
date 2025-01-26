import { initializeChat, startMessage, pollRunStatus, getChatHistory } from 'backend/chat.web';
import { session } from "wix-storage-frontend";

// Debug-Schalter für Frontend-Logging
const ENABLE_FRONTEND_DEBUG = true;

// Debug-Logging Funktion
const debugLog = (...args) => ENABLE_FRONTEND_DEBUG && console.log('[Frontend]', ...args);
const debugError = (...args) => ENABLE_FRONTEND_DEBUG && console.error('[Frontend]', ...args);

// Konstante für den Session Storage Key
const THREAD_ID_KEY = "chatThreadId";

// Konstanten für Retry-Mechanismus
const POLL_RETRY_DELAYS = [100, 200, 400, 800]; // Verzögerungen in Millisekunden
const RETRYABLE_STATUS_CODES = [504, 503, 502];

// Hilfsfunktion für das Warten
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

$w.onReady(() => {
    $w('#chatRepeater').data = [];
    $w("#submitMessageButton").disable();
    $w("#resetButton").disable(); // Initial deaktivieren
    
    // Funktion zum Initialisieren des Chats
    async function initializeChatSession() {
        const existingThreadId = session.getItem(THREAD_ID_KEY);
        
        if (existingThreadId) {
            debugLog('[Frontend] Verwende existierenden Thread:', existingThreadId);
            return { success: true, threadId: existingThreadId };
        }
        
        const initResult = await initializeChat();
        if (!initResult.success) {
            debugError('Chat konnte nicht initialisiert werden:', initResult.error);
            return initResult;
        }
        
        session.setItem(THREAD_ID_KEY, initResult.threadId);
        debugLog('[Frontend] Neuer Thread erstellt und gespeichert:', initResult.threadId);
        return initResult;
    }
    
    // Chat initialisieren
    initializeChatSession()
        .then(initResult => {
            if (!initResult.success) {
                debugError('Chat konnte nicht initialisiert werden:', initResult.error);
                return;
            }
            
            return getChatHistory(initResult.threadId);
        })
        .then(history => {
            if (!history.success) {
                debugError('Chat-Historie konnte nicht abgerufen werden:', history.error);
                return;
            }

            // Alle Nachrichten aus der Historie in das Frontend-Format konvertieren
            const initialData = history.messages.reverse().map((message, index) => ({
                _id: (index + 1).toString(),
                assistant: message.role === 'assistant' ? message.content[0].text.value : null,
                user: message.role === 'user' ? message.content[0].text.value : null
            }));

            // Reset-Button nur deaktivieren, wenn der Chat leer oder nur die Begrüßung vorhanden ist
            if (initialData.length <= 1) {
                $w("#resetButton").disable();
            } else {
                $w("#resetButton").enable();
            }

            debugLog('[Frontend] Initialisiere Chat mit Historie:', initialData);

            // Repeater konfigurieren
            $w('#chatRepeater').onItemReady(($item, itemData) => {
                $item('#assistantText').html = itemData.assistant || "";
                $item('#userText').text = itemData.user || "";
                if (itemData.user) {
                    $item('#userMessageBox').show();    
                }
            });

            // Daten an Repeater binden
            $w('#chatRepeater').data = initialData;

            $w('#establishingConnectionInfo').hide();

            // Eingabefeld beobachten und Button ein-/ausblenden
            $w("#userInputTextBox").onInput((event) => {
                const currentText = $w("#userInputTextBox").value.trim();
                if (currentText.length > 0) {
                    $w("#submitMessageButton").enable();
                } else {
                    $w("#submitMessageButton").disable();
                }
            });

            // Funktion zum Deaktivieren/Aktivieren der Eingabeelemente
            function setInputEnabled(enabled) {
                if (enabled) {
                    $w("#userInputTextBox").enable();
                    // Reset-Button nur aktivieren, wenn mehr als eine Nachricht vorhanden ist
                    const currentData = $w("#chatRepeater").data;
                    if (currentData.length > 1) {
                        $w("#resetButton").enable();
                    }
                    // Button nur aktivieren, wenn Text vorhanden
                    const currentText = $w("#userInputTextBox").value.trim();
                    if (currentText.length > 0) {
                        $w("#submitMessageButton").enable();
                    }
                } else {
                    $w("#userInputTextBox").disable();
                    $w("#submitMessageButton").disable();
                    $w("#resetButton").disable();
                }
            }

            // Funktion zum Senden der Nachricht
            async function handleSubmit() {
                const threadId = session.getItem(THREAD_ID_KEY);
                if (!threadId) {
                    debugError('[Frontend] Keine ThreadID gefunden');
                    return;
                }

                // Nochmals prüfen, ob Feld wirklich nicht leer ist
                const userMessage = $w("#userInputTextBox").value.trim();
                if (!userMessage) {
                    debugLog('[Frontend] Kein Text im Eingabefeld, Abbruch der Nachrichtensendung.');
                    return;
                }

                debugLog('[Frontend] Sende Nachricht:', userMessage);

                // Eingabeelemente während der Verarbeitung deaktivieren
                setInputEnabled(false);

                // Aktuelle Daten holen
                const currentData = $w("#chatRepeater").data;

                // Letzte ID im Array ermitteln (sofern numerisch)
                const lastIdNumeric = parseInt(currentData[currentData.length - 1]._id, 10);
                const newId = (lastIdNumeric + 1).toString();

                // Neues Objekt mit automatisch generierter ID und User-Eingabe anlegen
                const newMessage = {
                    _id: newId,
                    user: userMessage
                };

                // Repeater-Daten aktualisieren mit User-Nachricht
                $w("#chatRepeater").data = [...currentData, newMessage];

                // Eingabefeld leeren
                $w("#userInputTextBox").value = "";

                try {
                    // Thinking Indicator anzeigen bevor das Polling startet
                    $w('#isThinkingIndicator').show();
                    // Während des Nachdenkens alle Eingaben deaktivieren
                    setInputEnabled(false);

                    // Nachricht starten und Run ID erhalten
                    const startResponse = await startMessage(userMessage, threadId);
                    
                    if (!startResponse.success) {
                        throw new Error(startResponse.error || 'Fehler beim Starten der Nachricht');
                    }

                    const runId = startResponse.runId;
                    debugLog('[Frontend] Run gestartet mit ID:', runId);

                    // Polling starten
                    let isCompleted = false;
                    let retryCount = 0;
                    const maxRetries = 600; // 600 Versuche = 2 Minuten bei 2 Sekunden Intervall
                    const retryDelay = 200; // 0.2 Sekunden warten
                    
                    while (!isCompleted && retryCount < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, retryDelay)); // warten
                        
                        const pollResponse = await pollWithRetry(runId, threadId, userMessage);
                        debugLog('[Frontend] Poll Response:', pollResponse);
                        
                        if (!pollResponse.success) {
                            throw new Error(pollResponse.error || 'Fehler beim Abrufen des Status');
                        }

                        if (pollResponse.status === 'completed') {
                            isCompleted = true;
                            // Assistenten-Antwort zum Chat hinzufügen
                            const assistantId = (parseInt(newId) + 1).toString();
                            const assistantMessage = {
                                _id: assistantId,
                                assistant: pollResponse.response
                            };
                            $w('#isThinkingIndicator').hide(); // Thinking Indicator ausblenden bevor die Nachrichten gerendert werden für besseres UX
                            $w("#chatRepeater").data = [...$w("#chatRepeater").data, assistantMessage];
                            debugLog('[Frontend] Antwort hinzugefügt:', pollResponse.response);
                            
                            // Debug: Aktuelle Chat-Historie nach Assistenten-Antwort abrufen
                            const historyResponse = await getChatHistory(threadId);
                            if (historyResponse.success) {
                                debugLog('[Frontend] Aktuelle Chat-Historie nach Assistenten-Antwort:', historyResponse.messages);
                            } else {
                                debugError('[Frontend] Fehler beim Abrufen der Chat-Historie:', historyResponse.error);
                            }
                        } else if (pollResponse.status === 'failed') {
                            throw new Error(pollResponse.error || 'Verarbeitung fehlgeschlagen');
                        }
                        
                        retryCount++;
                    }

                    if (!isCompleted) {
                        throw new Error('Zeitüberschreitung bei der Verarbeitung');
                    }

                } catch (error) {
                    debugError('[Frontend] Fehler:', error);
                    // Fehlermeldung als Assistenten-Antwort anzeigen
                    const errorId = (parseInt(newId) + 1).toString();
                    const errorMessage = {
                        _id: errorId,
                        assistant: "Es ist ein technischer Fehler aufgetreten. Bitte versuchen Sie es später erneut."
                    };
                    $w("#chatRepeater").data = [...$w("#chatRepeater").data, errorMessage];
                } finally {
                    // Eingabeelemente wieder aktivieren
                    setInputEnabled(true);
                    // Sicherstellen, dass der Thinking Indicator ausgeblendet ist
                    $w('#isThinkingIndicator').hide();
                }
            }

            // =========================
            // Workaround-Block um das Hinzufügen von Zeilenumbrüchen zu verhindern beim Abschicken mit Enter:
            // =========================
            // Variable, um den Wert vor dem Tastendruck zu speichern
            let oldValue = "";

            // Vor jedem Tastendruck Wert merken (außer bei Enter selbst)
            $w("#userInputTextBox").onKeyPress((event) => {
                // Wir merken uns immer den "alten" Wert, falls nicht Enter gedrückt wurde
                // (Bei "Enter" – ob mit Shift oder ohne – speichern wir nicht erneut,
                //  weil es dann zu spät wäre)
                if (event.key !== "Enter") {
                    oldValue = $w("#userInputTextBox").value;
                }

                // Wenn Enter ohne Shift gedrückt wird:
                if (event.key === "Enter" && !event.shiftKey) {
                    // Damit wir den automatisch eingefügten Zeilenumbruch
                    // entfernen können, warten wir bis nach dem Tastendruck:
                    setTimeout(() => {
                        // Neuen Wert abfragen
                        let newValue = $w("#userInputTextBox").value;

                        // Nur wenn sich der Text (z.B. um genau 1 Zeichen) erweitert hat,
                        // checken wir auf einen möglichen einfachen Zeilenumbruch:
                        if (newValue.length === oldValue.length + 1) {
                            // Wir suchen die erste Stelle, an der sich alter und neuer Text unterscheiden
                            let diffIndex = 0;
                            while (
                                diffIndex < oldValue.length &&
                                oldValue.charAt(diffIndex) === newValue.charAt(diffIndex)
                            ) {
                                diffIndex++;
                            }

                            // Wenn das neue Zeichen ein "\n" oder "\r" ist, entfernen wir es
                            const insertedChar = newValue.charAt(diffIndex);
                            if (insertedChar === "\n" || insertedChar === "\r") {
                                newValue =
                                    newValue.substring(0, diffIndex) +
                                    newValue.substring(diffIndex + 1);

                                // Textfeld wieder mit dem bereinigten Wert füllen
                                $w("#userInputTextBox").value = newValue;
                            }
                        }

                        // Jetzt Nachricht abschicken
                        if ($w("#submitMessageButton").enabled) {
                            handleSubmit();
                        }
                    }, 0);
                }
            });
            // =========================
            // Ende Workaround-Block
            // =========================

            // Klick-Event für den "Senden"-Button
            $w("#submitMessageButton").onClick((event) => {
                handleSubmit();
            });

            // Reset-Button Funktionalität
            $w("#resetButton").onClick(async () => {
                debugLog('[Frontend] Starte Chat-Reset');
                
                // UI-Elemente deaktivieren während des Resets
                setInputEnabled(false);
                
                // Repeater leeren
                $w('#chatRepeater').data = [];
                
                // Verbindungsinfo anzeigen
                $w('#establishingConnectionInfo').show();
                
                try {
                    // ThreadID aus Session Storage löschen
                    session.removeItem(THREAD_ID_KEY);
                    
                    // Neuen Chat initialisieren
                    const initResult = await initializeChatSession();
                    if (!initResult.success) {
                        throw new Error(initResult.error || 'Fehler beim Initialisieren des Chats');
                    }
                    
                    // Chat-Historie abrufen
                    const history = await getChatHistory(initResult.threadId);
                    if (!history.success) {
                        throw new Error(history.error || 'Fehler beim Abrufen der Chat-Historie');
                    }
                    
                    // Nachrichten in Frontend-Format konvertieren
                    const initialData = history.messages.reverse().map((message, index) => ({
                        _id: (index + 1).toString(),
                        assistant: message.role === 'assistant' ? message.content[0].text.value : null,
                        user: message.role === 'user' ? message.content[0].text.value : null
                    }));
                    
                    // Daten an Repeater binden
                    $w('#chatRepeater').data = initialData;
                    
                    // Verbindungsinfo ausblenden
                    $w('#establishingConnectionInfo').hide();
                    
                    // Eingabefeld leeren
                    $w("#userInputTextBox").value = "";
                    
                    debugLog('[Frontend] Chat erfolgreich zurückgesetzt');
                    
                } catch (error) {
                    debugError('[Frontend] Fehler beim Zurücksetzen des Chats:', error);
                    // Fehlermeldung als Assistenten-Antwort anzeigen
                    const errorMessage = {
                        _id: "1",
                        assistant: "Es ist ein technischer Fehler beim Zurücksetzen aufgetreten. Bitte versuchen Sie es später erneut."
                    };
                    $w("#chatRepeater").data = [errorMessage];
                } finally {
                    // UI-Elemente wieder aktivieren
                    setInputEnabled(true);
                }
            });
        })
        .catch(error => {
            debugError('Fehler bei der Chat-Initialisierung:', error);
        });
});

// Modifizierte Polling-Funktion mit Retry-Logik
async function pollWithRetry(runId, threadId, originalMessage = null, retryAttempt = 0) {
    const MAX_RUN_RETRIES = 10; // Maximale Anzahl von Run-Neustarts
    
    for (let i = 0; i <= POLL_RETRY_DELAYS.length; i++) {
        try {
            const pollResponse = await pollRunStatus(runId, threadId);
            
            // Wenn die Antwort keinen Status hat oder einen ungültigen Status
            if (!pollResponse.status || !pollResponse.success) {
                debugError(`[Frontend] Ungültige oder leere Antwort beim ${retryAttempt + 1}. Versuch:`, pollResponse);
                
                // Wenn wir noch Versuche übrig haben und die Original-Nachricht haben
                if (retryAttempt < MAX_RUN_RETRIES && originalMessage) {
                    debugLog(`[Frontend] Starte neuen Run für die Nachricht (Versuch ${retryAttempt + 1}/${MAX_RUN_RETRIES})`);
                    
                    // Warten vor dem Neustart
                    await wait(1000); // 1 Sekunde warten vor dem Neustart
                    
                    // Neuen Run starten
                    const startResponse = await startMessage(originalMessage, threadId);
                    if (!startResponse.success) {
                        throw new Error(`Fehler beim Neustart des Runs: ${startResponse.error}`);
                    }
                    
                    // Rekursiv mit dem neuen Run weitermachen
                    return pollWithRetry(startResponse.runId, threadId, originalMessage, retryAttempt + 1);
                }
                
                // Wenn keine Versuche mehr übrig sind, Fehler werfen
                throw new Error('Maximale Anzahl von Neustarts erreicht');
            }
            
            return pollResponse;
        } catch (error) {
            // Prüfen ob es sich um einen Timeout-Fehler handelt
            const isTimeout = error.message?.includes('504') || 
                            error.message?.includes('503') || 
                            error.message?.includes('502');
            
            // Wenn es ein Timeout ist und wir noch Versuche haben
            if (isTimeout && i < POLL_RETRY_DELAYS.length) {
                debugLog(`[Frontend] Polling-Versuch ${i + 1} fehlgeschlagen, warte ${POLL_RETRY_DELAYS[i]}ms vor erneutem Versuch`);
                await wait(POLL_RETRY_DELAYS[i]);
                continue;
            }
            
            // Wenn es kein Timeout ist oder keine Versuche mehr übrig sind
            throw error;
        }
    }
}