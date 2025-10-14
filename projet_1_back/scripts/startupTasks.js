// scripts/startupTasks.js
const fs = require('fs');
const path = require('path');
const {
    fetchAndStorePRsRaw,
    showDiffsForModifiedPRsFromYesterday,
    fetchModifiedPRsFromYesterdayFromDB,
    updatePRs, fetchPRsBetweenDates
} = require('./prService');
const { fetchModifiedPRsFromYesterday } = require('./githubService');
const { migrateUsersFromPRsInternal } = require('../controller/user');
const { generateRapportMarkdown, generateWeeklyMarkdownReport } = require("./generateRapport");
const { exportPRsToJson, generateWeeklyReport } = require("./export-prs");
const axios = require('axios');
const dayjs = require('dayjs');

async function runStartupTasks(inputDate, API_URL) {
    try {
        inputDate = dayjs(inputDate).format('YYYY-MM-DD');
        console.log(`🗓️ Démarrage des tâches pour la date : ${inputDate}`);
        console.log('--- [Fetch PRs] ---');
        const message = await fetchAndStorePRsRaw(inputDate);
        console.log('✅ PRs récupérées :', message);


        // Vérification du fichier export
        const exportPath = path.join(__dirname, `../exports/export_prs_${inputDate}.json`);
        if (fs.existsSync(exportPath)) {
            console.log(`📁 Le fichier export_prs_${inputDate}.json existe déjà.`);
        }

        console.log('--- [Update PRs] ---');
        const updated = await updatePRs();
        console.log(`✅ ${updated} PR(s) mises à jour avec les données utilisateur.`);
        console.log(`✅ ${updated} PR(s) enrichies.`);

        console.log('--- [Migration utilisateurs] ---');
        const count = await migrateUsersFromPRsInternal();

        if (count.inserted > 0) {
            console.log(`✅ ${count.inserted} utilisateur(s) migré(s).`);
        }
        if (count.duplicates > 0) {
            console.log(`ℹ️ ${count.duplicates} utilisateur(s) déjà présents ignorés.`);
        }

        console.log('--- [Récupération utilisateurs externes] ---');
        const allUsers = [];
        let page = 1;
        let totalPages = 1;
        try {
            do {
                const response = await axios.get(`${API_URL}?page=${page}`);
                const users = response.data.users;
                totalPages = response.data.totalPages || 1;
                if (Array.isArray(users)) allUsers.push(...users);
                page++;
            } while (page <= totalPages);

            const uniqueUsers = Array.from(new Map(allUsers.map(u => [u._id, u])).values());
            console.log(`👥 Utilisateurs récupérés : ${uniqueUsers.length}`);
        } catch (err) {
            console.error('❌ Erreur lors de la récupération des utilisateurs externes :', err.stack || err.message || err);
        }

        console.log('--- [PRs modifiées hier] ---');
        try {
            const prsDB = await fetchModifiedPRsFromYesterdayFromDB();
            console.log(`📦 PRs modifiées : ${prsDB.length}`);
            prsDB.slice(0, 5).forEach(pr => {
                console.log(`🧾 PR #${pr.number} - updated_at: ${pr.updated_at}`);
            });

            const prs = await fetchModifiedPRsFromYesterday();
            await showDiffsForModifiedPRsFromYesterday(prs);
            console.log('✅ PRs enrichies avec les lignes modifiées');
        } catch (err) {
            console.error('❌ Erreur lors de l’analyse des PRs modifiées :', err.stack || err.message || err);
        }
        await exportPRsToJson({ enrichWithUsers: true, dateToUse: inputDate });
        console.log(`✅ exportPRsToJson terminé avec enrichWithUsers=true`);

        //  📅 Génération automatique du rapport du week - end(ven - dim)
        const today = dayjs();
        if (today.day() === 1) { // lundi
            const friday = today.subtract(today.day() + 2, 'day').startOf('day');
            const sunday = friday.add(2, 'day').endOf('day');
            const exportDateStr = friday.format('YYYY-MM-DD');
            const weekendExportPath = path.join(__dirname, `../exports/export_prs_${exportDateStr}.json`);
            if (!fs.existsSync(weekendExportPath)) {
                const weekendPRs = await fetchPRsBetweenDates(friday.toDate(), sunday.toDate());
                fs.writeFileSync(weekendExportPath, JSON.stringify(weekendPRs, null, 2), 'utf-8');
                console.log(`✅ Fichier export du week-end généré : ${weekendPRs.length} PRs`);
                await generateRapportMarkdown(exportDateStr);
                console.log(`📄 Rapport Markdown généré : rapport_${exportDateStr}.md`);
            } else {
                console.log(`📁 Fichier week-end déjà présent : ${weekendExportPath}`);
            }
        }

        // Log déplacé à la fin
        console.log(`📥 Traitement terminé pour la date d'analyse : ${inputDate}`);
        await generateRapportMarkdown(inputDate);
        const startOfWeek = dayjs(inputDate).subtract(dayjs(inputDate).day() - 1, 'day').format('YYYY-MM-DD');
        const endOfWeek = dayjs(startOfWeek).add(6, 'day').format('YYYY-MM-DD');

        const hebdoJsonPath = path.join(__dirname, `../exports/export_prs_hebdo_${startOfWeek}_au_${endOfWeek}.json`);
        const hebdoMdPath = path.join(__dirname, `../exports/rapport_hebdo_${startOfWeek}_au_${endOfWeek}.md`);

        if (!fs.existsSync(hebdoJsonPath) || !fs.existsSync(hebdoMdPath)) {
            console.log('📅 Lundi détecté ou fichiers manquants: génération des rapports hebdomadaires...');
            await generateWeeklyReport({ enrichWithUsers: true });
            await generateWeeklyMarkdownReport();
            console.log('✅ Rapports hebdomadaires générés.');
        } else {
            console.log('📁 Rapports hebdomadaires déjà présents. Génération ignorée.');
        }
    } catch (err) {
        console.error('❌ Erreur dans les tâches de démarrage :', err.stack || err.message || err);
    }




}



module.exports = { runStartupTasks };