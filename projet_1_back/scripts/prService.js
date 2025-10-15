const axios = require('axios');
const dbUser = require('../bd/connect');
const { PR } = require('../model/pr');
const { updatePRsWithUser } = require('./utils/update');
const { diffLines } = require('./diffUtils');

const {
    getFileAtCommit, fetchModifiedPRsFromYesterday
} = require('./githubService');
const { getReposForUser, getPRsForRepo } = require('./utils/githubUtils');

const { GITHUB_TOKEN } = process.env;

const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json'
};


async function fetchAndStorePRsRaw(date) {
    const collection = dbUser.bd().collection('pr_merge');
    const usersCollection = dbUser.bd().collection('users');
    const allUsers = await usersCollection.find().toArray();

    const targetDate = date ? new Date(date) : new Date(Date.now() - 86400000);
    targetDate.setHours(0, 0, 0, 0);
    const targetStart = new Date(targetDate);
    const targetEnd = new Date(targetDate);
    targetEnd.setHours(23, 59, 59, 999);

    let count = 0;
    for (const user of allUsers) {
        const repos = await getReposForUser(user.login);
        for (const repoFullName of repos) {
            try {
                const prs = await getPRsForRepo(repoFullName);

                for (const pr of prs) {
                    const createdAt = new Date(pr.created_at);
                    const updatedAt = new Date(pr.updated_at);

                    if (createdAt >= targetStart && createdAt <= targetEnd || updatedAt >= targetStart && updatedAt <= targetEnd) {
                        const prRecord = {
                            number: pr.number,
                            title: pr.title,
                            user: pr.user,
                            repo: { name: repoFullName },
                            created_at: createdAt,
                            updated_at: updatedAt,
                            url: pr.html_url
                        };

                        await collection.updateOne(
                            { number: pr.number, 'repo.name': repoFullName },
                            { $set: prRecord },
                            { upsert: true }
                        );

                        count++;
                    }
                }
            } catch (err) {
                console.error(`❌ Erreur pour le repo ${repoFullName} : ${err.message}`);
            }
        }

    }
    console.log(`✅ Récupération des PRs terminée. Total : ${count}`);
    return count;
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
                        pr.owner,
                        pr.repo.name,
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
                        repo: pr.repo,
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
