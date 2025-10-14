const axios = require('axios');
const dbUser = require('../bd/connect');

const path = require('path');
const exportDir = path.join(__dirname, 'exports');

const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json'
};

// Récupère les fichiers modifiés pour une PR donnée
async function fetchFilesForPR(prNumber) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${prNumber}/files`;
    const response = await axios.get(url, { headers });

    return response.data.map(file => {
        const changes = [];

        if (file.patch) {
            const lines = file.patch.split('\n');
            let currentLine = 0;

            for (const line of lines) {
                if (line.startsWith('@@')) {
                    const match = line.match(/\+(\d+)(?:,(\d+))?/);
                    if (match) {
                        currentLine = parseInt(match[1]);
                    }
                } else if (line.startsWith('+') && !line.startsWith('+++')) {
                    changes.push({ line: currentLine, type: 'added', content: line.slice(1) });
                    currentLine++;
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    changes.push({ line: null, type: 'removed', content: line.slice(1) });
                } else {
                    currentLine++;
                }
            }
        }
        return {
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            changes: file.changes,
            raw_url: file.raw_url,
            modifiedLines: changes
        };
    });
}

// Récupère le contenu d'un fichier à un commit spécifique
async function getFileAtCommit(owner, repo, filePath, commitSha, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${commitSha}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3.raw'
    };

    const response = await axios.get(url, { headers });
    return response.data; // contenu brut du fichier
}

// Récupère le SHA du commit de base d'une PR
async function getBaseCommitSha(prNumber) {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${prNumber}`;
    const response = await axios.get(url, { headers });
    return response.data.base.sha;
}

// Récupère les PR modifiées hier avec des fichiers modifiés
async function fetchModifiedPRsFromYesterday() {
    const usersCollection = dbUser.bd().collection('users');
    const githubApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls`;
    const headers = {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
    };

    const response = await axios.get(githubApiUrl, { headers });
    const prs = response.data;


    const yesterdayStart = new Date();
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);


    const modifiedPRs = [];

    for (const pr of prs) {

        const updatedDate = new Date(pr.updated_at);
        if (updatedDate >= yesterdayStart && updatedDate <= yesterdayEnd) {
            const filesResponse = await axios.get(pr.url + '/files', { headers });
            const modifiedFiles = filesResponse.data.filter(file => file.status === 'modified');

            if (modifiedFiles.length > 0) {

                const userFromDB = await usersCollection.findOne({ githubId: pr.user.id });
                const enrichedUser = {
                    name: userFromDB?.name || '',
                    email: userFromDB?.email || '',
                    phone: userFromDB?.phone || '',
                    githubId: pr.user.id,
                    githubUrl: pr.user.html_url
                };

                modifiedPRs.push({
                    number: pr.number,
                    title: pr.title,
                    baseSha: pr.base.sha,
                    files: modifiedFiles,
                    updated_at: pr.updated_at,
                    user: enrichedUser
                });
            }
        }
    }

    return modifiedPRs;
}


// Fonctions utilitaires pour enrichir les PRs avec les utilisateurs GitHub
function mapUsersByGithubId(users) {
    return Object.fromEntries(users.map(user => [user.githubId, user]));
}

function enrichPRsWithUsers(prs, usersByGithubId) {
    return prs.map(pr => {
        const githubId = Number(pr.user?.githubId);
        const userMeta = githubId ? usersByGithubId[githubId] : null;
        if (!userMeta) {
            console.warn(`⚠️ Utilisateur GitHub non trouvé pour PR #${pr.number} - githubId: ${githubId}`);
        }

        if (userMeta) {
            const {
                githubId,
                login,
                html_url,
                avatar_url,
                type,
                site_admin
            } = userMeta;

            return {
                ...pr,
                user: {
                    githubId,
                    login,
                    html_url,
                    avatar_url,
                    type,
                    site_admin
                }
            };
        }

        return pr;
    });
}


function getExportFilePath(prefix = 'export_prs', dateStr) {
    const fileName = `${prefix}_${dateStr}.json`;
    return path.join(exportDir, fileName);
}


module.exports = {
    fetchFilesForPR,
    getBaseCommitSha,
    getFileAtCommit,
    fetchModifiedPRsFromYesterday,
    mapUsersByGithubId,
    enrichPRsWithUsers,
    getExportFilePath
};
