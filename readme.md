# README: KI-Chat-Assistent auf Wix integrieren

## Einleitung
Dieses Projekt ist im Rahmen eines KI-Grundkurses entstanden und stellt dir die notwendigen Ressourcen und Anleitungen bereit, um einen KI-gestützten Chat-Assistenten auf deiner Wix-Website zu implementieren. Der Assistent nutzt die OpenAI-API und ist für Bildungszwecke konzipiert. Diese Anleitung enthält detaillierte Informationen zu den benötigten Wix-Elementen, den erforderlichen Konfigurationsschritten und einen Haftungsausschluss.

---

## Voraussetzungen
- Ein Wix-Konto (idealerweise mit aktiviertem Dev-Modus)
- Zugriff auf die OpenAI-Plattform und einen API-Key
- Grundkenntnisse im Umgang mit Wix (kein Vorwissen in JavaScript erforderlich)

---

## Erforderliche Wix-Elemente

Für die korrekte Funktion des Chat-Assistenten musst du folgende Elemente in Wix erstellen:

1. **Repeater (#chatRepeater)**
   - Dieser dient der Darstellung des Chat-Verlaufs.
   - **Innerhalb jedes Repeater-Containers:**
     - Ein Textelement mit der ID `#assistantText` für Nachrichten des Assistenten.
     - Ein Textelement mit der ID `#userText` für Nachrichten des Benutzers.
     - Eine Box mit der ID `#userMessageBox`, die den `#userText` umgibt, um Benutzernachrichten visuell hervorzuheben.
     - **Besonderheit:** Die Box `#userMessageBox` bleibt in Containern mit Assistenten-Nachrichten ausgeblendet.

2. **Textbox für Benutzereingaben (#userInputTextBox)**
   - Diese Textbox ermöglicht es dir, deine Nachrichten einzugeben.

3. **Button zum Abschicken der Nachricht (#submitMessageButton)**
   - Dieser Button wird verwendet, um die eingegebene Nachricht zu senden. Der Button wird basierend auf dem Inhalt der Textbox aktiviert oder deaktiviert.

4. **Indikatoren**
   - **#establishingConnectionInfo**: Ein visuelles Element, das anzeigt, dass der Chat initialisiert wird. Dieses Element muss initial ausgeblendet sein.
   - **#isThinkingIndicator**: Ein visuelles Element, das signalisiert, dass der Assistent eine Antwort generiert. Auch dieses Element muss initial ausgeblendet sein.

> **Wichtig:** Die Element-IDs müssen exakt wie oben angegeben lauten, da der bereitgestellte Code diese IDs verwendet. Änderungen an den IDs erfordern entsprechende Anpassungen im Code.

---

## Schritte zur Einrichtung

1. **Aktiviere den Dev-Modus in Wix:**
   - Gehe in die Wix-Editor-Einstellungen und aktiviere den Dev-Modus, um auf den Code-Editor und Backend-Funktionen zuzugreifen.

2. **Erstelle die notwendigen Elemente:**
   - Füge die oben beschriebenen Elemente auf deiner Wix-Website ein und vergebe die entsprechenden IDs.

3. **Erstelle Backend-Code-Dateien:**
   - Erstelle eine Datei `chat.web.js` im Backend-Bereich und kopiere den bereitgestellten Code hinein.

4. **Füge den Frontend-Code hinzu:**
   - Füge den Code aus `chat.pagecode.js` in die Seitencode-Datei deiner Wix-Website ein.

5. **Hinterlege Secrets:**
   - Speichere den OpenAI-API-Key und die Assistant-ID als Secrets in der Wix-Secrets-Verwaltung.

6. **Teste die Integration:**
   - Teste die Funktionalität des Assistenten und behebe eventuelle Fehler.

---

## Minimal Systeminstruction für den KI-Assistenten

Der von dir erstellte Assistent benötigt klare Anweisungen, um die gewünschten Antworten zu generieren. Hier ist eine empfohlene minimale Systeminstruction:

```
Du bist ein KI-Assistent, der in einem Chat integriert ist. Deine Aufgabe ist es, freundlich und hilfreich auf Benutzeranfragen zu antworten. Halte deine Antworten kurz, klar und einfach verständlich. Alle Nachrichten müssen in HTML-Formatierung ausgegeben werden. Vermeide Markdown-Formatierungen. Nutze Inline-CSS für optische Anpassungen, da kein externes CSS unterstützt wird.
```

---

## Haftungsausschluss

- **Verwendung zu Bildungszwecken:**
  - Der bereitgestellte Code und die Anleitung dienen ausschließlich zu Lernzwecken. Sie sind nicht für den Einsatz in Produktivsystemen gedacht.

- **Haftungsauschluss:**
  - Es wird keine Haftung für Schäden oder Probleme übernommen, die aus der Nutzung dieses Codes entstehen. Die Nutzung erfolgt auf eigenes Risiko.

- **OpenAI-API-Beschränkungen:**
  - Die Funktionalität des Assistenten hängt von der Verfügbarkeit und den Richtlinien der OpenAI-API ab. Überprüfe die API-Nutzungsbedingungen, bevor du den Assistenten implementierst.

---

## Lizenz
Dieses Projekt steht unter der MIT-Lizenz. Lies die Lizenzbedingungen, bevor du den Code verwendest oder anpasst.

---

Viel Erfolg bei der Integration deines KI-Chat-Assistenten auf Wix!
