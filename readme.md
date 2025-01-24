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
     - Eine Box mit der ID `#userMessageBox`, die den `#userText` umgibt, um Benutzernachrichten visuell hervorzuheben. **Sie muss initial im Editor ausgeblendet sein!**
     - **Besonderheit:** Die Box `#userMessageBox` bleibt in Containern mit Assistenten-Nachrichten ausgeblendet.

2. **Textbox für Benutzereingaben (#userInputTextBox)**
   - Diese Textbox ermöglicht es dir, deine Nachrichten einzugeben.

3. **Button zum Abschicken der Nachricht (#submitMessageButton)**
   - Dieser Button wird verwendet, um die eingegebene Nachricht zu senden. Der Button wird basierend auf dem Inhalt der Textbox aktiviert oder deaktiviert.

4. **Indikatoren**
   - **#establishingConnectionInfo**: Ein visuelles Element, das anzeigt, dass der Chat initialisiert wird. Dieses Element muss initial **ein**geblendet sein.
   - **#isThinkingIndicator**: Ein visuelles Element, das signalisiert, dass der Assistent eine Antwort generiert.Dieses Element muss initial **aus**geblendet sein.

> **Wichtig:** Die Element-IDs müssen exakt wie oben angegeben lauten, da der bereitgestellte Code diese IDs verwendet. Änderungen an den IDs erfordern entsprechende Anpassungen im Code.

---

## Schritte zur Einrichtung

1. **Aktiviere den Dev-Modus in Wix:**
   - Gehe in die Wix-Editor-Einstellungen und aktiviere den Dev-Modus, um auf den Code-Editor und Backend-Funktionen zuzugreifen.

2. **Erstelle die notwendigen Elemente:**
   - Füge die oben beschriebenen Elemente auf deiner Wix-Website ein und vergebe die entsprechenden IDs.

3. **Erstelle Backend-Code-Dateien:**
   - Erstelle eine Datei `chat.web.js` im Backend-Bereich und kopiere den bereitgestellten Code hinein.
   - suche die Zeile `content: 'Hallo, ich bin ein hilfreicher Assistent'` und ersetze sie mit einer inititalen Assistenten-Nachricht die zu deinem Projekt passt. Beachte, dass auch diese schon passende HTML Formatierung braucht. Passen zu den Beispiel Systeminstructions (unten) zum Beispeiel: `content: '<p class="wixui-rich-text__text" style="color:#F0F4FF;">Hallo, ich bin ein garstiger Hobbit... nein Scherz nur ein Bot, aber garstig.</p>'`


4. **Füge den Frontend-Code hinzu:**
   - Füge den Code aus `chat.pagecode.js` in die Seitencode-Datei deiner Wix-Website ein.

5. **Hinterlege Secrets:**
   - Speichere den OpenAI-API-Key und die Assistant-ID als Secrets in der Wix-Secrets-Verwaltung.
   - Der Code geht davon aus, dass die Secrets EXAKT "Assistant-ID" und "OpenAI-API-KEY" heißen

6. **Teste die Integration:**
   - Teste die Funktionalität des Assistenten und behebe eventuelle Fehler.

---

## Minimal Systeminstruction für den KI-Assistenten

Der von dir erstellte Assistent benötigt klare Anweisungen, um die gewünschten Antworten zu generieren. Hier ist eine empfohlene minimale Systeminstruction:

```
Du bist ein Spaßmacher und sagst immer etwas witziges auf jede Usereingabe.

* Bitte verwende für deine Antworten nur HTML (statt Markdown), also <strong>, <em>, <ul>, <li> usw., das ist sehr wichtig, da die Ausgabe sonst nicht richtig interpretiert werden kann!

* Du musst dabei jeden Absatz und jeden Listenpunkt, egal ob nummeriert oder nicht, in ein eigenen Paragraph legen.Der opening tag des Paragraphs muss immer(!) dieses inline-styling haben:

* <p class="wixui-rich-text__text" style="color:#F0F4FF;">

* Außerdem trenne diese Absätze bitte durch <br> voneinander. Am Anfang deiner Antworten und am Ende muss kein <br> stehen, nur zwischen den Paragraphen.
```

---
## Gute Ressourcen

* Es gibt extra für dieses Repo ein OpenAI GPT, der den ganzen Code kennt und bei der Integration helfen kann [Chat-Integrations-Sensei](https://chatgpt.com/g/g-679208fb84e8819184743841fc3f49aa-chat-integrations-sensei)
* Es lohnt sich auch immer zu Fragen nach Velo Code den "Velo Assistant" der Velo-Doku zu fragen (unten rechts, antwortete nur auf Englisch) [Wix Velo Doku](https://dev.wix.com/docs/velo)

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
