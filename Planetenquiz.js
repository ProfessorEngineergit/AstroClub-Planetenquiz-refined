// Dynamische Quizdaten aus quizData.json mit Mehrsprachigkeit
let quizData;
let currentLang = 'de';
let globalJokerUsed = false;
let draggedElement = null;

function detectInitialLang() {
    const saved = localStorage.getItem('quiz_lang');
    if (saved === 'de' || saved === 'en') return saved;
    const nav = (navigator.language || 'de').toLowerCase();
    return nav.startsWith('de') ? 'de' : 'en';
}

function setLang(lang) {
    currentLang = (lang === 'en') ? 'en' : 'de';
    localStorage.setItem('quiz_lang', currentLang);
    document.documentElement.setAttribute('lang', currentLang);
    // Reset states that depend on language rendering
    globalJokerUsed = false;
    // Re-render
    if (quizData) {
        applyLanguageToStaticUI();
        renderQuiz();
        initDragAndDrop();
    }
}

function applyLanguageToStaticUI() {
    const titleEl = document.getElementById('titleText');
    if (titleEl && quizData?.ui?.title) titleEl.textContent = quizData.ui.title[currentLang] || quizData.ui.title['de'];
    const evalBtn = document.getElementById('evaluateBtn');
    if (evalBtn && quizData?.ui?.submitButtonLabel) evalBtn.value = quizData.ui.submitButtonLabel[currentLang] || quizData.ui.submitButtonLabel['de'];
}

document.addEventListener('DOMContentLoaded', function() {
    currentLang = detectInitialLang();
    document.documentElement.setAttribute('lang', currentLang);
    const sel = document.getElementById('langSelect');
    if (sel) {
        sel.value = currentLang;
        sel.addEventListener('change', (e) => setLang(e.target.value));
    }
    fetch('quizData.json')
        .then(response => response.json())
        .then(data => {
            quizData = data;
            applyLanguageToStaticUI();
            renderQuiz();
            initDragAndDrop();
        });
});

function renderQuiz() {
    const quizContent = document.getElementById('quizContent');
    const dragDropContent = document.getElementById('dragDropContent');
    quizContent.innerHTML = '';
    if (dragDropContent) dragDropContent.innerHTML = '';
    // Stale Result-Anzeigen entfernen, falls Sprache während laufendem Quiz gewechselt wird
    const resultEl = document.getElementById('result');
    const antwortEl = document.getElementById('antwort');
    if (resultEl) resultEl.innerHTML = '';
    if (antwortEl) antwortEl.innerHTML = '';

    const totalQuestions = quizData.questions.length;
    const dragDropAfter = Number.isInteger(quizData.dragDrop.afterQuestionIndex)
        ? quizData.dragDrop.afterQuestionIndex
        : totalQuestions;

    quizData.questions.forEach((q, idx) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'text-box';
        const questionHtml = `<div class="question"><h2>${q.question[currentLang]}</h2>` +
            q.answers[currentLang].map((a, i) => `
                <label class="option">
                    <input type="radio" name="${q.id}" value="${i}" id="${q.id}${String.fromCharCode(97+i)}"> ${String.fromCharCode(97+i)}) ${a}
                </label>`).join('') +
            `</div>
            <button type="button" class="joker-button" onclick="useFiftyFifty('${q.id}', 'joker${idx+1}')" id="joker${idx+1}">${quizData.ui.jokerButtonLabel[currentLang]}</button>`;
        questionDiv.innerHTML = questionHtml;
        quizContent.appendChild(questionDiv);

        // Sortier-Aufgabe genau nach der konfigurierten Anzahl Fragen einschieben
        if (idx + 1 === dragDropAfter) {
            renderDragDropBlock(quizContent);
        }
    });

    // Fallback: wenn afterQuestionIndex außerhalb der Range war, ans Ende hängen
    if (dragDropAfter < 1 || dragDropAfter > totalQuestions) {
        renderDragDropBlock(dragDropContent || quizContent);
    }
}

function renderDragDropBlock(container) {
    const dragDropDiv = document.createElement('div');
    dragDropDiv.className = 'text-box';
    dragDropDiv.innerHTML = `<h2>${quizData.dragDrop.title[currentLang]}</h2>` +
        `<p class="instruction">${quizData.dragDrop.instruction[currentLang]}</p>` +
        `<div id="planetButtons" class="planet-buttons-container"></div>` +
        `<div id="dropZones" class="drop-zones-container"></div>`;
    container.appendChild(dragDropDiv);

    const planetButtonsContainer = document.getElementById('planetButtons');
    quizData.dragDrop.planets[currentLang].forEach(planet => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'planet-button';
        btn.draggable = true;
        btn.setAttribute('data-planet', planet);
        btn.textContent = planet;
        planetButtonsContainer.appendChild(btn);
    });
    const dropZonesContainer = document.getElementById('dropZones');
    for (let i = 1; i <= quizData.dragDrop.planets[currentLang].length; i++) {
        const zone = document.createElement('div');
        zone.className = 'drop-zone';
        zone.setAttribute('data-position', i);
        zone.innerHTML = `<span class="position-number">${i}.</span><input type="text" id="Text${i}" name="planetName${i}" readonly>`;
        dropZonesContainer.appendChild(zone);
    }
}

function initDragAndDrop() {
    const planetButtons = document.querySelectorAll('.planet-button');
    const dropZones = document.querySelectorAll('.drop-zone');

    // Drag-Events für Planeten-Buttons
    planetButtons.forEach(button => {
        button.addEventListener('dragstart', handleDragStart);
        button.addEventListener('dragend', handleDragEnd);
    });

    // Drop-Events für Drop-Zonen
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('dragenter', handleDragEnter);
        zone.addEventListener('dragleave', handleDragLeave);
        zone.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    e.preventDefault();

    this.classList.remove('drag-over');

    if (draggedElement) {
        const planetName = draggedElement.getAttribute('data-planet');
        const input = this.querySelector('input[type="text"]');
        
        if (input) {
            // Prüfe ob das Feld bereits einen Wert hat
            const existingValue = input.value;
            
            if (existingValue && existingValue !== '') {
                // Erstelle einen neuen Button für den vorherigen Planet und füge ihn zurück
                const planetButtonsContainer = document.getElementById('planetButtons');
                const newButton = document.createElement('button');
                newButton.type = 'button';
                newButton.className = 'planet-button';
                newButton.draggable = true;
                newButton.setAttribute('data-planet', existingValue);
                newButton.textContent = existingValue;
                
                // Füge Event-Listener hinzu
                newButton.addEventListener('dragstart', handleDragStart);
                newButton.addEventListener('dragend', handleDragEnd);
                
                // Füge den Button zurück zum Container
                planetButtonsContainer.appendChild(newButton);
            }
            
            // Setze den neuen Wert
            input.value = planetName;
        }

        // Entferne den gezogenen Button aus der Liste
        draggedElement.remove();
    }

    return false;
}

function useFiftyFifty(question, buttonId) {
    if (globalJokerUsed) {
        alert(quizData.questions.find(q => q.id === question).jokerText[currentLang]);
        return;
    }
    globalJokerUsed = true;
    let options = document.getElementsByName(question);
    let correctIdx = quizData.questions.find(q => q.id === question).correct;
    let wrongOptions = [];
    options.forEach(option => {
        if (parseInt(option.value) !== correctIdx) {
            wrongOptions.push(option);
        }
    });
    if (wrongOptions.length >= 2) {
        let shuffled = wrongOptions.sort(() => 0.5 - Math.random());
        shuffled[0].parentElement.style.opacity = '0.3';
        shuffled[1].parentElement.style.opacity = '0.3';
        shuffled[0].parentElement.style.pointerEvents = 'none';
        shuffled[1].parentElement.style.pointerEvents = 'none';
        shuffled[0].disabled = true;
        shuffled[1].disabled = true;
    }
    for (let i = 1; i <= quizData.questions.length; i++) {
        let jokerButton = document.getElementById('joker' + i);
        if (jokerButton) {
            jokerButton.disabled = true;
            jokerButton.textContent = quizData.ui.jokerUsedText[currentLang];
        }
    }
}

function checkAnswers() {
    // Vor jeder Auswertung beide Anzeige-Balken leeren, damit keine alten
    // Hinweise oder Ergebnisse stehenbleiben (Glitch-Fix).
    document.getElementById("antwort").innerHTML = '';
    document.getElementById("result").innerHTML = '';

    let unanswered = quizData.questions.filter(q => !document.querySelector(`input[name='${q.id}']:checked`));
    if (unanswered.length > 0) {
        document.getElementById("antwort").innerHTML = quizData.resultTexts[currentLang][1];
        return;
    }
    let score = 0;
    quizData.questions.forEach(q => {
        let answer = document.querySelector(`input[name='${q.id}']:checked`);
        if (answer !== null && parseInt(answer.value) === q.correct) {
            score += 2;
            answer.parentElement.style.color = "green";
        } else if (answer !== null) {
            answer.parentElement.style.color = "red";
            document.querySelector(`input[name='${q.id}'][value='${q.correct}']`).parentElement.style.color = "green";
        }
    });
    // Drag & Drop
    quizData.dragDrop.correctOrder[currentLang].forEach((planet, idx) => {
        let input = document.getElementById(`Text${idx+1}`);
        if (input.value === planet) {
            score++;
            input.classList.add('correct-answer');
        } else {
            input.classList.add('incorrect-answer');
        }
    });
    let Newscore = 5 * score;
    let feedback = pickFeedback(Newscore);
    let result = document.getElementById('result');
    result.innerHTML = quizData.resultTexts[currentLang][0]
        .replace('{score}', Newscore)
        .replace('{feedback}', feedback)
        .replace('{restartUrl}', window.location.href);
}

function pickFeedback(score) {
    const tiers = quizData.scoreFeedback?.[currentLang];
    if (!Array.isArray(tiers) || tiers.length === 0) return '';
    // tiers werden absteigend nach `min` durchsucht; erste passende Stufe gewinnt
    const sorted = [...tiers].sort((a, b) => b.min - a.min);
    for (const tier of sorted) {
        if (score >= tier.min) return tier.text;
    }
    return '';
}


