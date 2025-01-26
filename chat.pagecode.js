import { initializeChat, startMessage, pollRunStatus, getChatHistory, resetChat } from 'backend/chat.web';

// Debug-Schalter für Frontend-Logging
const ENABLE_FRONTEND_DEBUG = false;

// Debug-Logging Funktion
const debugLog = (...args) => ENABLE_FRONTEND_DEBUG && console.log('[Frontend]', ...args);
const debugError = (...args) => ENABLE_FRONTEND_DEBUG && console.error('[Frontend]', ...args);

$w.onReady(() => {
    $w('#chatRepeater').data = [];
    $w("#submitMessageButton").disable();
    $w("#resetButton").disable(); // Initial deaktivieren
    
    // Chat initialisieren
    initializeChat()
        .then(initResult => {
            if (!initResult.success) {
                debugError('Chat konnte nicht initialisiert werden:', initResult.error);
                return;
            }
            
            return getChatHistory();
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
                    const startResponse = await startMessage(userMessage);
                    
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
                        
                        const pollResponse = await pollRunStatus(runId);
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
                            const historyResponse = await getChatHistory();
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
                    // Chat zurücksetzen und neue Historie abrufen
                    const resetResult = await resetChat();
                    
                    if (!resetResult.success) {
                        throw new Error(resetResult.error || 'Fehler beim Zurücksetzen des Chats');
                    }
                    
                    // Nachrichten in Frontend-Format konvertieren
                    const initialData = resetResult.messages.reverse().map((message, index) => ({
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