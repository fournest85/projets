const axios = require('axios');
const { GITHUB_TOKEN } = process.env;
const { Octokit } = require('octokit');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const headers = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  Accept: 'application/vnd.github.v3+json'
};

async function getReposForUser(username) {
  const url = `https://api.github.com/users/${username}/repos`;
  const response = await axios.get(url, { headers });
  return response.data.map(repo => repo.full_name);
}

async function getAllPRsForAllUsers(usersCollection) {
  const allUsers = await usersCollection.find().toArray();
  for (const user of allUsers) {
    const repos = await getReposForUser(user.login);
    for (const repo of repos) {
      const prs = await getPRsForRepo(repo);
      // Traitement ou insertion MongoDB ici
    }
  }
}

async function getPRsForRepo(repoFullName) {
  const url = `https://api.github.com/repos/${repoFullName}/pulls?state=all`;
  const response = await axios.get(url, { headers });
  return response.data;
}


async function getPRDetailsFromGitHub(owner, repo, number) {
  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', { owner, repo, pull_number: number });
    return data;
  } catch (err) {
    console.error(`❌ Erreur GitHub PR #${number} :`, err.message);
    return null;
  }
}

module.exports = { getReposForUser, getAllPRsForAllUsers, getPRsForRepo, getPRDetailsFromGitHub };