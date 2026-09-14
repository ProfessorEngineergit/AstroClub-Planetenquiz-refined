// Lokaler Score-Client fuer den Offline-Build.
//
// Bietet dieselbe API wie firebase-score-client.js, speichert die Scores aber in
// localStorage statt in Firestore und bringt sein eigenes Leaderboard mit. Bewusst
// ein klassisches Script (kein ES-Modul), weil Module unter file:// blockiert werden.

(function () {
    'use strict';

    var STORAGE_KEY = 'planetenquiz_scores_v1';
    var MAX_ENTRIES = 200;
    var TOP_LIMIT = 50;

    var text = {
        de: {
            title: 'Lokales Leaderboard',
            hint: 'Diese Scores liegen nur auf diesem Rechner, in diesem Browser.',
            empty: 'Noch keine Scores gespeichert.',
            close: 'Schliessen',
            exportCsv: 'CSV exportieren',
            clear: 'Alle Scores loeschen',
            clearConfirm: 'Wirklich alle gespeicherten Scores auf diesem Rechner loeschen?',
            copyHint: 'Download nicht moeglich. Text markieren und kopieren:',
            points: 'P'
        },
        en: {
            title: 'Local leaderboard',
            hint: 'These scores live only on this computer, in this browser.',
            empty: 'No scores saved yet.',
            close: 'Close',
            exportCsv: 'Export CSV',
            clear: 'Delete all scores',
            clearConfirm: 'Really delete all scores saved on this computer?',
            copyHint: 'Download unavailable. Select and copy the text:',
            points: 'pts'
        }
    };

    window.planetenquizScoreboard = {
        submitScore: submitScore,
        openLeaderboard: openLeaderboard,
        readScores: readScores
    };

    function lang() {
        return document.documentElement.getAttribute('lang') === 'en' ? 'en' : 'de';
    }

    function t(key) {
        return text[lang()][key];
    }

    function submitScore(entry) {
        var cleanName = sanitizeName(entry && entry.name);
        var maxScore = Number(entry && entry.maxScore) || 160;
        var score = Number(entry && entry.score);

        if (!cleanName || !isFinite(score)) {
            return Promise.reject(new Error('invalid-score-entry'));
        }

        var clamped = Math.max(0, Math.min(maxScore, Math.round(score)));
        var record = {
            id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            name: cleanName,
            score: clamped,
            maxScore: maxScore,
            percent: Math.round((clamped / maxScore) * 100),
            lang: entry.lang === 'en' ? 'en' : 'de',
            durationSeconds: Math.max(0, Math.round(Number(entry.durationSeconds) || 0)),
            createdAt: new Date().toISOString()
        };

        var scores = readScores();
        scores.push(record);
        scores.sort(compareScores);

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(scores.slice(0, MAX_ENTRIES)));
        } catch (error) {
            return Promise.reject(new Error('storage-unavailable'));
        }

        return Promise.resolve({ id: record.id });
    }

    function readScores() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            var parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.sort(compareScores) : [];
        } catch (error) {
            return [];
        }
    }

    // Hoehere Punktzahl gewinnt, bei Gleichstand die schnellere Runde.
    function compareScores(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return (a.durationSeconds || 0) - (b.durationSeconds || 0);
    }

    function sanitizeName(name) {
        return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, 30);
    }

    function openLeaderboard() {
        ensureStyles();
        var existing = document.getElementById('localLeaderboardOverlay');
        if (existing) existing.remove();

        var overlay = document.createElement('div');
        overlay.id = 'localLeaderboardOverlay';
        overlay.className = 'local-board-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', t('title'));

        var panel = document.createElement('div');
        panel.className = 'local-board-panel';

        var heading = document.createElement('div');
        heading.className = 'local-board-heading';

        var headingTitle = document.createElement('h2');
        headingTitle.textContent = t('title');

        var headingHint = document.createElement('p');
        headingHint.className = 'local-board-hint';
        headingHint.textContent = t('hint');

        heading.append(headingTitle, headingHint);

        var scores = readScores().slice(0, TOP_LIMIT);
        var body;

        if (!scores.length) {
            body = document.createElement('p');
            body.className = 'local-board-empty';
            body.textContent = t('empty');
        } else {
            body = document.createElement('ol');
            body.className = 'local-board-list';
            scores.forEach(function (score, index) {
                body.appendChild(buildRow(score, index));
            });
        }

        var actions = document.createElement('div');
        actions.className = 'local-board-actions';
        actions.append(
            buildButton(t('exportCsv'), function () { exportCsv(panel); }),
            buildButton(t('clear'), function () { clearScores(); }),
            buildButton(t('close'), close, 'is-primary')
        );

        panel.append(heading, body, actions);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) close();
        });
        document.addEventListener('keydown', onKeydown);

        function onKeydown(event) {
            if (event.key === 'Escape') close();
        }

        function close() {
            document.removeEventListener('keydown', onKeydown);
            overlay.remove();
        }
    }

    function buildRow(score, index) {
        var item = document.createElement('li');
        item.className = 'local-board-item';

        var rank = document.createElement('span');
        rank.className = 'local-board-rank';
        rank.textContent = String(index + 1);

        var info = document.createElement('div');
        info.className = 'local-board-name';

        var name = document.createElement('strong');
        name.textContent = score.name || 'Gast';

        var meta = document.createElement('span');
        meta.textContent = formatMeta(score);

        info.append(name, meta);

        var points = document.createElement('div');
        points.className = 'local-board-points';
        points.textContent = Number(score.score || 0) + ' ' + t('points');

        item.append(rank, info, points);
        return item;
    }

    function formatMeta(score) {
        var language = score.lang === 'en' ? 'EN' : 'DE';
        var date = score.createdAt ? new Date(score.createdAt) : null;
        if (!date || isNaN(date.getTime())) return language;

        return language + ' · ' + new Intl.DateTimeFormat(lang() === 'en' ? 'en-GB' : 'de-DE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }

    function buildButton(label, onClick, extraClass) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'local-board-button' + (extraClass ? ' ' + extraClass : '');
        button.textContent = label;
        button.addEventListener('click', onClick);
        return button;
    }

    function clearScores() {
        if (!window.confirm(t('clearConfirm'))) return;
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            /* nichts zu tun: die Anzeige wird ohnehin neu aufgebaut */
        }
        openLeaderboard();
    }

    function exportCsv(panel) {
        var rows = [['rank', 'name', 'score', 'maxScore', 'percent', 'lang', 'durationSeconds', 'createdAt']];
        readScores().forEach(function (score, index) {
            rows.push([
                index + 1,
                score.name,
                score.score,
                score.maxScore,
                score.percent,
                score.lang,
                score.durationSeconds,
                score.createdAt
            ]);
        });

        var csv = rows.map(function (row) {
            return row.map(csvCell).join(',');
        }).join('\r\n');

        // BOM, damit Excel unter Windows die Umlaute richtig liest.
        var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });

        try {
            var url = URL.createObjectURL(blob);
            var link = document.createElement('a');
            link.href = url;
            link.download = 'planetenquiz-scores.csv';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } catch (error) {
            showCsvFallback(panel, csv);
        }
    }

    // Manche Browser blockieren Blob-Downloads unter file://. Dann bleibt der
    // Umweg ueber ein Textfeld zum Kopieren.
    function showCsvFallback(panel, csv) {
        var existing = panel.querySelector('.local-board-fallback');
        if (existing) existing.remove();

        var wrapper = document.createElement('div');
        wrapper.className = 'local-board-fallback';

        var hint = document.createElement('p');
        hint.textContent = t('copyHint');

        var area = document.createElement('textarea');
        area.readOnly = true;
        area.value = csv;

        wrapper.append(hint, area);
        panel.appendChild(wrapper);
        area.focus();
        area.select();
    }

    function csvCell(value) {
        var cell = String(value == null ? '' : value);
        return /[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
    }

    function ensureStyles() {
        if (document.getElementById('localBoardStyles')) return;
        var style = document.createElement('style');
        style.id = 'localBoardStyles';
        // Greift auf die Farbvariablen des Quiz zurueck, mit Fallbacks fuer den Fall,
        // dass der Client einmal ohne Planetenquiz.css eingebunden wird.
        style.textContent = [
            '.local-board-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(9,11,16,.82);backdrop-filter:blur(6px)}',
            '.local-board-panel{width:min(560px,100%);max-height:86vh;overflow-y:auto;padding:28px;border-radius:12px;border:1px solid var(--border-strong,rgba(255,255,255,.22));background:var(--surface-strong,rgba(14,18,24,.96));color:var(--text,#f4f2ea);font-family:var(--body-font,system-ui,sans-serif);box-shadow:var(--shadow,0 18px 45px rgba(0,0,0,.42))}',
            '.local-board-heading h2{margin:0 0 6px;font-family:var(--heading-font,system-ui,sans-serif);font-weight:400;font-size:1.6rem;letter-spacing:.02em}',
            '.local-board-hint{margin:0 0 20px;font-size:.85rem;color:var(--text-muted,#9f9b91)}',
            '.local-board-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}',
            '.local-board-item{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:var(--radius,8px);border:1px solid var(--border,rgba(255,255,255,.12));background:var(--surface,rgba(12,16,22,.76))}',
            '.local-board-item:nth-child(1){border-color:var(--primary,#5eead4);background:var(--primary-soft,rgba(94,234,212,.16))}',
            '.local-board-rank{min-width:2ch;font-variant-numeric:tabular-nums;font-weight:800;color:var(--text-muted,#9f9b91)}',
            '.local-board-item:nth-child(1) .local-board-rank{color:var(--primary,#5eead4)}',
            '.local-board-name{display:flex;flex-direction:column;flex:1;min-width:0}',
            '.local-board-name strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.local-board-name span{font-size:.78rem;color:var(--text-muted,#9f9b91)}',
            '.local-board-points{font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--text-soft,#d7d0c2)}',
            '.local-board-item:nth-child(1) .local-board-points{color:var(--primary,#5eead4)}',
            '.local-board-empty{margin:0;padding:24px 0;text-align:center;color:var(--text-muted,#9f9b91)}',
            '.local-board-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}',
            '.local-board-button{flex:1 1 auto;padding:11px 16px;border-radius:var(--radius-sm,6px);border:1px solid var(--border-strong,rgba(255,255,255,.22));background:transparent;color:var(--text-soft,#d7d0c2);font:800 .85rem var(--body-font,system-ui,sans-serif);cursor:pointer;transition:var(--transition,180ms ease)}',
            '.local-board-button:hover{background:var(--surface-hover,rgba(18,24,31,.92));color:var(--text,#f4f2ea)}',
            '.local-board-button.is-primary{background:var(--primary,#5eead4);border-color:var(--primary,#5eead4);color:#0b1017}',
            '.local-board-button.is-primary:hover{background:var(--primary-strong,#24b8aa);border-color:var(--primary-strong,#24b8aa);color:#0b1017}',
            '.local-board-button:focus-visible{outline:2px solid var(--primary,#5eead4);outline-offset:2px}',
            '.local-board-fallback{margin-top:18px}',
            '.local-board-fallback p{margin:0 0 8px;font-size:.85rem;color:var(--text-muted,#9f9b91)}',
            '.local-board-fallback textarea{width:100%;min-height:150px;padding:10px;border-radius:var(--radius-sm,6px);border:1px solid var(--border,rgba(255,255,255,.12));background:rgba(0,0,0,.35);color:var(--text-soft,#d7d0c2);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.78rem}',
            '@media (max-width:480px){.local-board-panel{padding:20px}.local-board-button{flex:1 1 100%}}'
        ].join('\n');
        document.head.appendChild(style);
    }
})();
