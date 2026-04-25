// Dynamische Quizdaten aus quizData.json mit Mehrsprachigkeit
let quizData;
let currentLang = 'de';
let globalJokerUsed = false;
let draggedElement = null;
let dragPreviewElement = null;
let invalidTargets = [];
let currentInvalidIndex = 0;
let quizStartedAt = Date.now();

const MAX_SCORE = 160;

const uiCopy = {
    de: {
        validationTitle: 'Bitte beantworte die markierten Bereiche.',
        validationHint: 'Nutze die Pfeile, um zwischen offenen Stellen zu wechseln.',
        questionLabel: 'Frage',
        planetLabel: 'Planet',
        missingCount: count => `${count} offen`,
        prevMissing: 'Vorherige offene Antwort',
        nextMissing: 'Nächste offene Antwort',
        resultEyebrow: 'Mission abgeschlossen',
        resultTitle: score => `Du hast ${score} von ${MAX_SCORE} Punkten im Planetenquiz erreicht.`,
        resultPercent: percent => `${percent}%`,
        resultScoreLabel: 'Gesamtscore',
        scoreboardName: 'Name für das Leaderboard',
        namePlaceholder: 'Dein Name',
        submitScore: 'Score senden',
        savingScore: 'Wird gespeichert ...',
        scoreSaved: 'Gespeichert. Dein Score ist im Leaderboard.',
        scoreNotReady: 'Firebase ist noch nicht verbunden. Trage zuerst die Konfiguration ein.',
        scoreFailed: 'Konnte nicht gespeichert werden. Prüfe Firebase-Konfiguration und Regeln.',
        scoreNameRequired: 'Bitte gib einen Namen ein.',
        restartQuiz: 'Quiz neu starten',
        openScoreboard: 'Leaderboard öffnen'
    },
    en: {
        validationTitle: 'Please answer the highlighted areas.',
        validationHint: 'Use the arrows to move between missing answers.',
        questionLabel: 'Question',
        planetLabel: 'Planet',
        missingCount: count => `${count} open`,
        prevMissing: 'Previous missing answer',
        nextMissing: 'Next missing answer',
        resultEyebrow: 'Mission complete',
        resultTitle: score => `You scored ${score} out of ${MAX_SCORE} points in the Planet Quiz.`,
        resultPercent: percent => `${percent}%`,
        resultScoreLabel: 'Total score',
        scoreboardName: 'Name for the leaderboard',
        namePlaceholder: 'Your name',
        submitScore: 'Send score',
        savingScore: 'Saving ...',
        scoreSaved: 'Saved. Your score is on the leaderboard.',
        scoreNotReady: 'Firebase is not connected yet. Add the configuration first.',
        scoreFailed: 'Could not save. Check Firebase configuration and rules.',
        scoreNameRequired: 'Please enter a name.',
        restartQuiz: 'Restart quiz',
        openScoreboard: 'Open leaderboard'
    }
};

function copy(key, ...args) {
    const value = uiCopy[currentLang]?.[key] || uiCopy.de[key];
    return typeof value === 'function' ? value(...args) : value;
}

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
    globalJokerUsed = false;
    quizStartedAt = Date.now();
    if (quizData) {
        applyLanguageToStaticUI();
        renderQuiz();
        initDragAndDrop();
    }
}

function applyLanguageToStaticUI() {
    const titleEl = document.getElementById('titleText');
    if (titleEl && quizData?.ui?.title) titleEl.textContent = quizData.ui.title[currentLang] || quizData.ui.title.de;

    const evalBtn = document.getElementById('evaluateBtn');
    if (evalBtn && quizData?.ui?.submitButtonLabel) evalBtn.value = quizData.ui.submitButtonLabel[currentLang] || quizData.ui.submitButtonLabel.de;
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

    clearValidationHighlights();
    clearScoringState();
    setPanelHtml('result', '');
    setPanelHtml('antwort', '');
    quizStartedAt = Date.now();

    const totalQuestions = quizData.questions.length;
    const dragDropAfter = Number.isInteger(quizData.dragDrop.afterQuestionIndex)
        ? quizData.dragDrop.afterQuestionIndex
        : totalQuestions;

    quizData.questions.forEach((q, idx) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'text-box quiz-card';
        questionDiv.id = `card-${q.id}`;
        questionDiv.setAttribute('data-question-id', q.id);

        const questionHtml = `<div class="question"><h2>${escapeHtml(q.question[currentLang])}</h2>` +
            q.answers[currentLang].map((a, i) => `
                <label class="option">
                    <input type="radio" name="${q.id}" value="${i}" id="${q.id}${String.fromCharCode(97+i)}">
                    <span>${String.fromCharCode(97+i)}) ${escapeHtml(a)}</span>
                </label>`).join('') +
            `</div>
            <button type="button" class="joker-button" onclick="useFiftyFifty('${q.id}', 'joker${idx+1}')" id="joker${idx+1}">${escapeHtml(quizData.ui.jokerButtonLabel[currentLang])}</button>`;
        questionDiv.innerHTML = questionHtml;
        quizContent.appendChild(questionDiv);

        if (idx + 1 === dragDropAfter) {
            renderDragDropBlock(quizContent);
        }
    });

    if (dragDropAfter < 1 || dragDropAfter > totalQuestions) {
        renderDragDropBlock(dragDropContent || quizContent);
    }

    attachAnswerChangeHandlers();
}

function renderDragDropBlock(container) {
    const dragDropDiv = document.createElement('div');
    dragDropDiv.className = 'text-box drag-drop-card';
    dragDropDiv.id = 'dragDropBlock';
    dragDropDiv.innerHTML = `<h2>${escapeHtml(quizData.dragDrop.title[currentLang])}</h2>` +
        `<p class="instruction">${escapeHtml(quizData.dragDrop.instruction[currentLang])}</p>` +
        `<div id="planetButtons" class="planet-buttons-container"></div>` +
        `<div id="dropZones" class="drop-zones-container"></div>`;
    container.appendChild(dragDropDiv);

    const planetButtonsContainer = document.getElementById('planetButtons');
    quizData.dragDrop.planets[currentLang].forEach(planet => {
        planetButtonsContainer.appendChild(createPlanetButton(planet));
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

function createPlanetButton(planetName) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'planet-button';
    btn.draggable = true;
    btn.setAttribute('data-planet', planetName);
    btn.textContent = planetName;
    btn.addEventListener('dragstart', handleDragStart);
    btn.addEventListener('dragend', handleDragEnd);
    return btn;
}

function initDragAndDrop() {
    const planetButtons = document.querySelectorAll('.planet-button');
    const dropZones = document.querySelectorAll('.drop-zone');

    planetButtons.forEach(button => {
        button.removeEventListener('dragstart', handleDragStart);
        button.removeEventListener('dragend', handleDragEnd);
        button.addEventListener('dragstart', handleDragStart);
        button.addEventListener('dragend', handleDragEnd);
    });

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
    e.dataTransfer.setData('text/plain', this.getAttribute('data-planet'));
    setDragPreview(e, this);
}

function handleDragEnd() {
    this.classList.remove('dragging');
    removeDragPreview();
    draggedElement = null;
}

function setDragPreview(e, sourceButton) {
    if (!e.dataTransfer?.setDragImage) return;
    removeDragPreview();

    dragPreviewElement = sourceButton.cloneNode(true);
    dragPreviewElement.className = 'planet-button drag-preview';
    dragPreviewElement.removeAttribute('id');
    dragPreviewElement.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dragPreviewElement);

    const rect = dragPreviewElement.getBoundingClientRect();
    e.dataTransfer.setDragImage(dragPreviewElement, rect.width / 2, rect.height / 2);
}

function removeDragPreview() {
    if (dragPreviewElement) {
        dragPreviewElement.remove();
        dragPreviewElement = null;
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter() {
    this.classList.add('drag-over');
}

function handleDragLeave() {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    this.classList.remove('drag-over');

    if (draggedElement) {
        const planetName = draggedElement.getAttribute('data-planet');
        const input = this.querySelector('input[type="text"]');

        if (input) {
            const existingValue = input.value;

            if (existingValue) {
                const planetButtonsContainer = document.getElementById('planetButtons');
                planetButtonsContainer.appendChild(createPlanetButton(existingValue));
            }

            input.value = planetName;
            this.classList.remove('needs-answer', 'invalid-focus');
            refreshValidationNavigator();
        }

        draggedElement.remove();
    }

    return false;
}

function attachAnswerChangeHandlers() {
    document.querySelectorAll("input[type='radio']").forEach(input => {
        input.addEventListener('change', () => {
            const card = input.closest('.quiz-card');
            if (card) card.classList.remove('needs-answer', 'invalid-focus');
            refreshValidationNavigator();
        });
    });
}

function useFiftyFifty(question, buttonId) {
    if (globalJokerUsed) {
        alert(quizData.questions.find(q => q.id === question).jokerText[currentLang]);
        return;
    }
    globalJokerUsed = true;
    const options = document.getElementsByName(question);
    const correctIdx = quizData.questions.find(q => q.id === question).correct;
    const wrongOptions = [];
    options.forEach(option => {
        if (parseInt(option.value, 10) !== correctIdx) {
            wrongOptions.push(option);
        }
    });
    if (wrongOptions.length >= 2) {
        const shuffled = wrongOptions.sort(() => 0.5 - Math.random());
        shuffled[0].parentElement.style.opacity = '0.3';
        shuffled[1].parentElement.style.opacity = '0.3';
        shuffled[0].parentElement.style.pointerEvents = 'none';
        shuffled[1].parentElement.style.pointerEvents = 'none';
        shuffled[0].disabled = true;
        shuffled[1].disabled = true;
    }
    for (let i = 1; i <= quizData.questions.length; i++) {
        const jokerButton = document.getElementById('joker' + i);
        if (jokerButton) {
            jokerButton.disabled = true;
            jokerButton.textContent = quizData.ui.jokerUsedText[currentLang];
        }
    }
}

function checkAnswers() {
    setPanelHtml('antwort', '');
    setPanelHtml('result', '');
    clearScoringState();

    const missing = collectMissingAnswers();
    if (missing.length > 0) {
        showMissingAnswers(missing);
        return;
    }

    clearValidationHighlights();

    let score = 0;
    quizData.questions.forEach(q => {
        const answer = document.querySelector(`input[name='${q.id}']:checked`);
        const correctOption = document.querySelector(`input[name='${q.id}'][value='${q.correct}']`);
        if (answer !== null && parseInt(answer.value, 10) === q.correct) {
            score += 2;
            answer.parentElement.classList.add('answer-correct');
        } else if (answer !== null) {
            answer.parentElement.classList.add('answer-wrong');
            correctOption?.parentElement.classList.add('answer-correct');
        }
    });

    quizData.dragDrop.correctOrder[currentLang].forEach((planet, idx) => {
        const input = document.getElementById(`Text${idx+1}`);
        if (input.value === planet) {
            score++;
            input.classList.add('correct-answer');
            input.closest('.drop-zone')?.classList.add('drop-correct');
        } else {
            input.classList.add('incorrect-answer');
            input.closest('.drop-zone')?.classList.add('drop-wrong');
        }
    });

    const finalScore = 5 * score;
    renderResult(finalScore, pickFeedback(finalScore));
}

function collectMissingAnswers() {
    clearValidationHighlights();
    const missing = [];

    quizData.questions.forEach((q, idx) => {
        if (!document.querySelector(`input[name='${q.id}']:checked`)) {
            const card = document.querySelector(`[data-question-id='${q.id}']`);
            if (card) {
                card.classList.add('needs-answer');
                missing.push({
                    element: card,
                    label: `${copy('questionLabel')} ${idx + 1}`
                });
            }
        }
    });

    document.querySelectorAll('.drop-zone').forEach(zone => {
        const input = zone.querySelector("input[type='text']");
        if (input && !input.value.trim()) {
            zone.classList.add('needs-answer');
            missing.push({
                element: zone,
                label: `${copy('planetLabel')} ${zone.getAttribute('data-position')}`
            });
        }
    });

    return missing;
}

function showMissingAnswers(missing) {
    invalidTargets = missing;
    currentInvalidIndex = 0;
    setPanelHtml('antwort', `
        <strong>${escapeHtml(copy('validationTitle'))}</strong>
        <span>${escapeHtml(copy('validationHint'))}</span>
    `);
    updateValidationNav();
    jumpToInvalid(0);
}

function ensureValidationNav() {
    let nav = document.getElementById('validationNav');
    if (nav) return nav;

    nav = document.createElement('div');
    nav.id = 'validationNav';
    nav.className = 'validation-nav';
    nav.innerHTML = `
        <button type="button" class="validation-arrow" data-direction="-1" aria-label="${escapeHtml(copy('prevMissing'))}">↑</button>
        <span class="validation-nav-label"></span>
        <button type="button" class="validation-arrow" data-direction="1" aria-label="${escapeHtml(copy('nextMissing'))}">↓</button>
    `;
    document.body.appendChild(nav);
    nav.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => jumpToInvalid(currentInvalidIndex + Number(button.dataset.direction)));
    });
    return nav;
}

function updateValidationNav() {
    const nav = ensureValidationNav();
    invalidTargets = invalidTargets.filter(target =>
        target.element?.isConnected && target.element.classList.contains('needs-answer')
    );

    if (invalidTargets.length === 0) {
        nav.classList.remove('is-visible');
        return;
    }

    currentInvalidIndex = Math.min(currentInvalidIndex, invalidTargets.length - 1);
    const current = invalidTargets[currentInvalidIndex];
    const label = nav.querySelector('.validation-nav-label');
    label.textContent = `${current.label} · ${currentInvalidIndex + 1}/${invalidTargets.length} · ${copy('missingCount', invalidTargets.length)}`;
    nav.classList.add('is-visible');
}

function jumpToInvalid(index) {
    if (invalidTargets.length === 0) return;

    currentInvalidIndex = (index + invalidTargets.length) % invalidTargets.length;
    document.querySelectorAll('.invalid-focus').forEach(el => el.classList.remove('invalid-focus'));

    const target = invalidTargets[currentInvalidIndex].element;
    target.classList.add('invalid-focus');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const focusTarget = target.querySelector('input, button') || target;
    if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1');
    window.setTimeout(() => focusTarget.focus({ preventScroll: true }), 220);

    updateValidationNav();
}

function refreshValidationNavigator() {
    updateValidationNav();
    if (invalidTargets.length === 0) {
        setPanelHtml('antwort', '');
    }
}

function clearValidationHighlights() {
    document.querySelectorAll('.needs-answer, .invalid-focus').forEach(el => {
        el.classList.remove('needs-answer', 'invalid-focus');
    });
    invalidTargets = [];
    currentInvalidIndex = 0;
    const nav = document.getElementById('validationNav');
    if (nav) nav.classList.remove('is-visible');
}

function clearScoringState() {
    document.querySelectorAll('.answer-correct, .answer-wrong').forEach(el => {
        el.classList.remove('answer-correct', 'answer-wrong');
        el.style.color = '';
    });
    document.querySelectorAll('.correct-answer, .incorrect-answer').forEach(el => {
        el.classList.remove('correct-answer', 'incorrect-answer');
    });
    document.querySelectorAll('.drop-correct, .drop-wrong').forEach(el => {
        el.classList.remove('drop-correct', 'drop-wrong');
    });
}

function renderResult(score, feedback) {
    const percent = Math.round((score / MAX_SCORE) * 100);
    const feedbackText = escapeHtml(feedback);
    const result = document.getElementById('result');
    result.innerHTML = `
        <section class="result-card" aria-live="polite">
            <p class="result-eyebrow">${escapeHtml(copy('resultEyebrow'))}</p>
            <h2>${escapeHtml(copy('resultTitle', score))}</h2>
            <div class="score-row">
                <span>${escapeHtml(copy('resultScoreLabel'))}</span>
                <strong>${escapeHtml(copy('resultPercent', percent))}</strong>
            </div>
            <div class="score-meter" style="--score-pct: ${percent}%">
                <span></span>
            </div>
            <p class="feedback">${feedbackText}</p>
            <form id="scoreSubmitForm" class="score-submit" autocomplete="off">
                <label for="playerName">${escapeHtml(copy('scoreboardName'))}</label>
                <div class="score-submit-row">
                    <input id="playerName" name="playerName" type="text" maxlength="30" placeholder="${escapeHtml(copy('namePlaceholder'))}" required>
                    <button type="submit">${escapeHtml(copy('submitScore'))}</button>
                </div>
                <p id="scoreSubmitStatus" class="score-submit-status" aria-live="polite"></p>
            </form>
            <div class="result-actions">
                <a class="result-link" href="${escapeHtml(getRestartUrl())}">${escapeHtml(copy('restartQuiz'))}</a>
                <a class="result-link" href="${escapeHtml(getScoreboardUrl())}">${escapeHtml(copy('openScoreboard'))}</a>
            </div>
        </section>
    `;

    result.querySelector('#scoreSubmitForm')?.addEventListener('submit', event => submitScore(event, score));
    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function submitScore(event, score) {
    event.preventDefault();

    const form = event.currentTarget;
    const nameInput = form.querySelector('#playerName');
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector('#scoreSubmitStatus');
    const name = nameInput.value.trim();

    if (!name) {
        status.textContent = copy('scoreNameRequired');
        nameInput.focus();
        return;
    }

    const scoreClient = window.planetenquizScoreboard;
    if (!scoreClient || typeof scoreClient.submitScore !== 'function') {
        status.textContent = copy('scoreNotReady');
        return;
    }

    button.disabled = true;
    status.textContent = copy('savingScore');

    try {
        await scoreClient.submitScore({
            name,
            score,
            maxScore: MAX_SCORE,
            lang: currentLang,
            durationSeconds: Math.round((Date.now() - quizStartedAt) / 1000)
        });
        status.textContent = copy('scoreSaved');
        form.classList.add('is-saved');
    } catch (error) {
        console.error(error);
        status.textContent = error?.message === 'firebase-not-configured'
            ? copy('scoreNotReady')
            : copy('scoreFailed');
    } finally {
        button.disabled = false;
    }
}

function pickFeedback(score) {
    const tiers = quizData.scoreFeedback?.[currentLang];
    if (!Array.isArray(tiers) || tiers.length === 0) return '';
    const sorted = [...tiers].sort((a, b) => b.min - a.min);
    for (const tier of sorted) {
        if (score >= tier.min) return tier.text;
    }
    return '';
}

function setPanelHtml(id, html) {
    const panel = document.getElementById(id);
    if (panel) panel.innerHTML = html;
}

function getRestartUrl() {
    return window.location.href.split('#')[0].split('?')[0];
}

function getScoreboardUrl() {
    return window.planetenquizScoreboard?.scoreboardUrl || 'scoreboard/index.html';
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
