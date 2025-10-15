const axios = require('axios');
const { GITHUB_TOKEN } = process.env;

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

module.exports = { getReposForUser,getAllPRsForAllUsers, getPRsForRepo };