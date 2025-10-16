const e = require('express');
const { MongoClient } = require('mongodb');


const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME;


// 🔍 Extraire owner/repo/number depuis une PR
function extractRepoInfo(pr) {
    const repoUrl = pr.base?.repo?.html_url || pr.head?.repo?.html_url;
    let owner, repo;

    if (repoUrl) {
        const parts = repoUrl.split('/');
        owner = parts[3];
        repo = parts[4];
        console.log("DEBUG repo:", pr.repo);
    } else if (pr.repo?.name) {
        const parts = pr.repo.name.split('/');
        console.log("repo.name:", pr.repo.name, "parts:", parts);
        if (parts.length === 2) {
            owner = parts[0];
            repo = parts[1];
        }
    }

    const info = {
        owner,
        repo,
        number: pr.number
    };
    console.log("Extracted info:", info);
    return info;
}


const updatePRsWithUser = async () => {

    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const prCollection = db.collection('pr_merge');
        const userCollection = db.collection('users');

        const prs = await prCollection.find().toArray();
        let updatedCount = 0;

        for (const pr of prs) {
            let login = pr.user?.login;
            if (!login && pr.user?.githubUrl) {
                login = pr.user.githubUrl.split('/').pop();
                // console.log(`🔍 Login extrait depuis githubUrl : ${login}`);
            }
            if (!login) {
                console.warn(`⚠️ PR #${pr.number} ignorée : login utilisateur manquant`);
                continue;
            }

            const userMeta = await userCollection.findOne({ login });
            if (!userMeta || !userMeta.html_url) {
                console.warn(`⚠️ Métadonnées incomplètes pour l'utilisateur : ${login}`);
                continue;
            }

            const filteredUser = {
                githubId: userMeta.githubId,
                githubUrl: userMeta.html_url
            };
            // console.log(`👤 Utilisateur trouvé : ${login} → githubId: ${userMeta.githubId}`)
            await prCollection.updateOne(
                { _id: pr._id },
                { $set: { user: filteredUser } }
            );

            updatedCount++;
            // console.log(`🔄 PR #${pr.number} mise à jour avec githubId et githubUrl`);
        }

        console.log(`✅ ${updatedCount} PR(s) mises à jour.`);
        return updatedCount;
    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour des PRs :', error.message);
        return 0;
    } finally {
        await client.close();
    }
};



module.exports = { updatePRsWithUser, extractRepoInfo };