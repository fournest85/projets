require('dotenv').config();
const express = require("express");
const open = require('open').default;
const readline = require('readline');

const { connecter } = require("./bd/connect");
const routesUser = require('./route/user');
const prRoutes = require('./route/pr');
const { initGithubCron } = require('./jobs/githubCron');
const { runStartupTasks } = require('./scripts/startupTasks');
const { exportPRsToJson } = require('./scripts/export-prs');
const { generateRapportMarkdown } = require('./scripts/generateRapport');
const { getExportFilePath } = require('./scripts/githubService');
const { getReposForUser } = require('./scripts/prService');
const fs = require('fs');
const cors = require('cors');
const dayjs = require('dayjs');

const app = express();

const API_URL = process.env.API_URL;
const port = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

app.use('/api', routesUser);
app.use('/api/github/prs', prRoutes);

app.get('/api/config', async (req, res) => {
  console.log('✅ Route /api/config appelée');
  const backendPort = process.env.PORT || 3000;

  try {
    const apiUrl = `http://localhost:${backendPort}/api/users`;

    const owner = req.query.owner;
    let repos = [];
    if (owner) {
      repos = await getReposForUser(owner);
    }

    res.json({
      apiUrl,
      backendPort,
      dbName: process.env.DB_NAME,
      githubOwner: owner,
      githubRepos: repos
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la récupération des repos GitHub.' });
  }
});

app.get('/api/generate/:date', async (req, res) => {
  const dateStr = req.params.date; // format YYYY-MM-DD
  const force = req.query.force === 'true';


  try {
    const exportPath = getExportFilePath('export_prs', dateStr);
    if (force && fs.existsSync(exportPath)) {
      fs.unlinkSync(exportPath);
    }

    await exportPRsToJson({ enrichWithUsers: true, dateToUse: dateStr });
    await generateRapportMarkdown(dateStr);

    res.send(`✅ Export et rapport générés pour la date : ${dateStr}`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`❌ Erreur lors de la génération pour la date : ${dateStr}`);
  }
});


function demanderDate(callback) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('📅 Entrez une date (YYYY-MM-DD) ou appuyez sur Entrée pour utiliser la date d’hier : ', (input) => {
    rl.close();

    const rawDate = input.trim();
    const dateToUse = rawDate
      ? dayjs(rawDate).format('YYYY-MM-DD')
      : dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    callback(dateToUse);

  });
}


connecter(uri, async (err) => {
  if (err) {
    console.error('❌ Failed to connect to the database');
    process.exit(-1);
  } else {
    console.log('✅ Connected to the database');
    // Démarrage du serveur
    server = app.listen(port, async () => {
      const backendPort = port;
      console.log(`✅ Server is running on http://localhost:${backendPort}`);

      // Ouvre le navigateur sur le frontend (live-server)
      if (process.env.FROM_CONCURRENTLY === 'true') {
        await open('http://localhost:8080');
      }

      // Lancement des tâches
      initGithubCron();

      if (process.env.FROM_CONCURRENTLY === 'true') {
        const dateToUse = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
        console.log(`🚀 Lancement automatique des tâches de démarrage avec la date ${dateToUse}`);
        await runStartupTasks(dateToUse, API_URL);
      } else {
        demanderDate(async (inputDate) => {
          const dateToUse = inputDate || dayjs().subtract(1, 'day').format('YYYY-MM-DD');
          await runStartupTasks(dateToUse, API_URL);
        });
      }
    });
  }
});