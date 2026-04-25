const FIREBASE_SDK_VERSION = '10.12.0';

let firebaseReadyPromise = null;

window.planetenquizScoreboard = {
    scoreboardUrl: 'scoreboard/index.html',
    submitScore
};

loadScoreboardUrl();

async function submitScore(entry) {
    const firebase = await ensureFirebase();
    const cleanName = sanitizeName(entry.name);
    const score = Number(entry.score);
    const maxScore = Number(entry.maxScore) || 160;

    if (!cleanName || !Number.isFinite(score)) {
        throw new Error('invalid-score-entry');
    }

    const payload = {
        name: cleanName,
        score: Math.max(0, Math.min(maxScore, Math.round(score))),
        maxScore,
        percent: Math.round((score / maxScore) * 100),
        lang: entry.lang === 'en' ? 'en' : 'de',
        quizId: firebase.options.quizId || 'astroclub-planetenquiz',
        durationSeconds: Math.max(0, Math.round(Number(entry.durationSeconds) || 0)),
        createdAt: firebase.serverTimestamp()
    };

    const ref = await firebase.addDoc(
        firebase.collection(firebase.db, firebase.options.collectionName || 'scores'),
        payload
    );

    return { id: ref.id };
}

async function ensureFirebase() {
    if (!firebaseReadyPromise) {
        firebaseReadyPromise = loadFirebase();
    }
    return firebaseReadyPromise;
}

async function loadFirebase() {
    const configModule = await import('./firebase-config.js').catch(() => null);
    const firebaseConfig = configModule?.firebaseConfig;
    const options = configModule?.scoreboardOptions || {};

    if (!options.enabled || !hasRealConfig(firebaseConfig)) {
        throw new Error('firebase-not-configured');
    }

    const [{ initializeApp }, firestoreModule, authModule] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`)
    ]);

    const app = initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);
    await authModule.signInAnonymously(auth);

    return {
        db: firestoreModule.getFirestore(app),
        addDoc: firestoreModule.addDoc,
        collection: firestoreModule.collection,
        serverTimestamp: firestoreModule.serverTimestamp,
        options
    };
}

function hasRealConfig(config) {
    if (!config || typeof config !== 'object') return false;
    const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
    return required.every(key => {
        const value = String(config[key] || '');
        return value.length > 0 && !value.includes('PASTE_');
    });
}

function sanitizeName(name) {
    return String(name || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 30);
}

async function loadScoreboardUrl() {
    const configModule = await import('./firebase-config.js').catch(() => null);
    const url = configModule?.scoreboardOptions?.scoreboardUrl;
    if (url) {
        window.planetenquizScoreboard.scoreboardUrl = url;
    }
}
