const axios = require('axios');
const dbUser = require('../bd/connect');
const { PR } = require('../model/pr');
const { updatePRsWithUser } = require('./utils/update');

const {
    fetchFilesForPR,
    getBaseCommitSha,
    getFileAtCommit, fetchModifiedPRsFromYesterday
} = require('./githubService');

const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;

const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json'
};

const githubApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?state=all`;

const { diffLines } = require('./diffUtils');

async function fetchAndStorePRsRaw(date) {
    const response = await axios.get(githubApiUrl, { headers });
    const prs = response.data;
    const collection = dbUser.bd().collection('pr_merge');

    if (!prs || prs.length === 0) {
        return 'Aucune PR trouvée.';
    }

    let count = 0;

    // Définir les bornes de la veille
    let targetDate;
    if (date) {
        targetDate = new Date(date);
        console.log(`📅 Date de filtrage définie : ${targetDate.toDateString()}`);
    } else {
        targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - 1);
        console.log(`📅 Date de filtrage automatique (hier) : ${targetDate.toDateString()}`);
    }


    targetDate.setHours(0, 0, 0, 0);
    const targetStart = new Date(targetDate);
    const targetEnd = new Date(targetDate);
    targetEnd.setHours(23, 59, 59, 999);


    for (const pr of prs) {
        const files = await fetchFilesForPR(pr.number);
        const baseSha = await getBaseCommitSha(pr.number);

        for (const file of files) {
            if (file.status === 'modified') {
                try {
                    const newContentResponse = await axios.get(file.raw_url, {
                        headers: {
                            Authorization: `Bearer ${GITHUB_TOKEN}`,
                            Accept: 'application/vnd.github.v3.raw'
                        }
                    });

                    const newText = typeof newContentResponse.data === 'string'
                        ? newContentResponse.data
                        : JSON.stringify(newContentResponse.data, null, 2);

                    const oldTextRaw = await getFileAtCommit(
                        GITHUB_OWNER,
                        GITHUB_REPO,
                        file.filename,
                        baseSha,
                        GITHUB_TOKEN
                    );

                    const oldText = typeof oldTextRaw === 'string'
                        ? oldTextRaw
                        : JSON.stringify(oldTextRaw, null, 2);


                    const changes = diffLines(oldText, newText);

                    file.diff = changes
                        .filter(part => part.added || part.removed)
                        .map(part => ({
                            type: part.added ? 'added' : 'removed',
                            content: part.value
                        }));
                } catch (err) {
                    console.error(`❌ Erreur sur ${file.filename} :`, err.message);
                }
            }
        }

        const prInstance = new PR({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            user: {
                name: pr.user.name,
                email: pr.user.email,
                phone: pr.user.phone,
                githubId: pr.user.id,
                githubUrl: pr.user.html_url
            },

            state: pr.state,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            repo: GITHUB_REPO,
            files
        });


        await collection.updateOne(
            { number: pr.number },
            { $set: prInstance },
            { upsert: true }
        );

        count++;

        const updatedDate = new Date(pr.updated_at);
        const isModifiedOnTargetDate = updatedDate >= targetStart && updatedDate <= targetEnd;

        if (isModifiedOnTargetDate) {
            console.log(`🔍 Analyse de la PR #${pr.number} - ${pr.title}`);
            console.log(`🧪 updated_at: ${pr.updated_at}`);
        }
    }

    return `${count} PRs enregistrées et analysées.`;
}

async function fetchModifiedPRsFromYesterdayFromDB() {
    const collection = dbUser.bd().collection('pr_merge');

    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(now.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const query = {
        updated_at: {
            $gte: yesterdayStart,
            $lte: yesterdayEnd
        }
    };

    const prs = await collection.find(query).sort({ updated_at: -1 }).toArray();
    return prs;
}

async function fetchPRsBetweenDates(startDate, endDate) {
    const collection = dbUser.bd().collection('pr_merge');
    const query = {
        $or: [
            {
                created_at: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            },
            {
                updated_at: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            }
        ]
    };
    const prs = await collection.find(query).sort({ updated_at: -1 }).toArray();
    return prs;
}

async function showDiffsForModifiedPRsFromYesterday() {
    try {
        const prs = await fetchModifiedPRsFromYesterday();
        const collection = dbUser.bd().collection('pr_merge');
        const usersCollection = dbUser.bd().collection('users');

        for (const pr of prs) {
            console.log(`🔍 PR #${pr.number} - ${pr.title}`);

            for (const file of pr.files) {
                try {
                    const newContentResponse = await axios.get(file.raw_url, {
                        headers: {
                            Authorization: `Bearer ${GITHUB_TOKEN}`,
                            Accept: 'application/vnd.github.v3.raw'
                        }
                    });

                    const newText = newContentResponse.data;

                    const oldText = await getFileAtCommit(
                        GITHUB_OWNER,
                        GITHUB_REPO,
                        file.filename,
                        pr.baseSha,
                        GITHUB_TOKEN
                    );

                    console.log(`📄 Fichier : ${file.filename}`);
                    const changes = diffLines(oldText, newText);

                    file.diff = changes.map(part => ({
                        type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
                        content: part.value
                    }));


                    changes.forEach(part => {
                        const symbol = part.added ? '+' : part.removed ? '-' : ' ';
                        const color = part.added ? '\x1b[32m' : part.removed ? '\x1b[31m' : '\x1b[0m';
                        process.stdout.write(color + symbol + part.value + '\x1b[0m');
                    });

                } catch (err) {
                    console.error(`❌ Erreur sur ${file.filename} :`, err.message);
                }
            }
            console.log(`📦 Diff pour PR #${pr.number}:`, JSON.stringify(pr.files, null, 2));

            const userFromDB = await usersCollection.findOne({ githubId: pr.user.id });
            const enrichedUser = {
                name: userFromDB?.name || '',
                email: userFromDB?.email || '',
                phone: userFromDB?.phone || '',
                githubId: pr.user.id,
                githubUrl: pr.user.html_url
            };

            await collection.updateOne(
                { number: pr.number },
                {
                    $set: {
                        title: pr.title,
                        updated_at: pr.updated_at,
                        user: enrichedUser,
                        state: pr.state,
                        repo: GITHUB_REPO,
                        files: pr.files

                    }
                },
                { upsert: true }
            );

        }

    } catch (err) {
        console.error("❌ Erreur lors de l’analyse des PRs modifiées de la veille :", err.message);
    }
}

const updatePRs = async (req = null, res = null) => {
    try {
        const count = await updatePRsWithUser();

        const message = `${count} PR(s) mises à jour avec les données utilisateur.`;

        // Si res est fourni (appel via route Express)
        if (res && typeof res.status === 'function') {
            return res.status(200).json({ message });
        }

        // Sinon, appel interne (ex: server.js)
        // console.log(`✅ ${message}`);
        return count;
    } catch (error) {
        const errorMessage = 'Erreur lors de la mise à jour des PRs.';
        console.error('❌ Erreur updatePRs :', error.message);

        if (res && typeof res.status === 'function') {
            return res.status(500).json({ error: errorMessage });
        }

        return 0;
    }
};

module.exports = {
    fetchAndStorePRsRaw,
    fetchModifiedPRsFromYesterdayFromDB,
    showDiffsForModifiedPRsFromYesterday,
    updatePRs,
    fetchPRsBetweenDates
};
