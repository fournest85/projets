const { fetchAndStorePRsRaw } = require('../scripts/prService');
const { migrateUsersFromPRs } = require('../controller/user');
const { exportPRsToJson, generateWeeklyReport } = require('../scripts/export-prs');
const { generateRapportMarkdown, generateWeeklyMarkdownReport } = require("../scripts/generateRapport");
const cron = require('node-cron');
const schedule = require('node-schedule');
const dayjs = require('dayjs');

/**
 * Initialise le cron pour récupérer les PRs modifiées chaque jour à 1h du matin.
 */
function initGithubCron() {
    // 🔁 Tâche quotidienne
    cron.schedule('0 1 * * *', async () => {
        console.log('⏰ Cron lancé pour récupérer les PRs modifiées...');
        try {
            const message = await fetchAndStorePRsRaw();
            console.log('✅', message);

            await exportPRsToJson({ enrichWithUsers: true });
            console.log('📤 exportPRsToJson lancé');
            console.log('📁 Export JSON terminé.');

            await migrateUsersFromPRs({
                body: {},
                query: {},
                params: {},
                status: () => ({ json: console.log })
            });
            console.log('👥 Migration des utilisateurs GitHub terminée.');


            // 📝 Génération du rapport Markdown
            const dateStr = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
            await generateRapportMarkdown(dateStr);
            console.log('📝 generateRapportMarkdown lancé');
            console.log('📄 Rapport Markdown généré.');


        } catch (error) {
            console.error('❌ Erreur dans le cron :', error.message);
        }
    });


    // 📅 Tâche spéciale lundi : export des PRs du week-end
    schedule.scheduleJob('0 1 * * 1', async () => {
        console.log('📅 Tâche cron spéciale lundi : export des PRs du week-end');

        const friday = dayjs().subtract(3, 'day').startOf('day'); // Vendredi
        const sunday = dayjs().subtract(1, 'day').endOf('day');   // Dimanche

        const allPRs = await fetchAndStorePRsRaw() 

        const weekendPRs = allPRs.filter(pr => {
            const created = dayjs(pr.created_at);
            const updated = dayjs(pr.updated_at || pr.created_at);
            return (
                (created.isAfter(friday.subtract(1, 'second')) && created.isBefore(sunday.add(1, 'second'))) ||
                (updated.isAfter(friday.subtract(1, 'second')) && updated.isBefore(sunday.add(1, 'second')))
            );
        });

        const exportDateStr = friday.format('YYYY-MM-DD');
        const exportPath = path.join(__dirname, '../exports', `export_prs_${exportDateStr}.json`);
        fs.writeFileSync(exportPath, JSON.stringify(weekendPRs, null, 2), 'utf-8');
        console.log(`✅ Export des PRs du week-end terminé : ${weekendPRs.length} PRs`);

        // 📄 Rapport Markdown du week-end avec le même nom
        await generateRapportMarkdown(exportDateStr);
        console.log(`📄 Rapport Markdown du week-end généré : rapport_${exportDateStr}.md`);
    });

    // 🕐 Tâche hebdomadaire : chaque lundi à 01h00
    schedule.scheduleJob('0 1 * * 1', async () => {
        console.log('📅 Tâche cron : génération du rapport hebdomadaire enrichi');
        await generateWeeklyReport({ enrichWithUsers: true });

        console.log('📄 Tâche cron : génération du rapport Markdown hebdomadaire');
        await generateWeeklyMarkdownReport();
    });


}

module.exports = { initGithubCron };
