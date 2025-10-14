const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const { getExportFilePath } = require('./githubService');
const exportFolder = path.join(__dirname, 'exports');

async function generateRapportMarkdown(dateStr) {
    const exportPath = getExportFilePath('export_prs', dateStr);
    const rapportPath = path.join(__dirname, 'exports', `rapport_${dateStr}.md`);

    console.log(`🛠️ Génération du rapport pour la date : ${dateStr}`)

    if (!fs.existsSync(exportPath)) {
        console.warn(`Fichier d'export non trouvé : ${exportPath}`);
        return;
    }

    if (fs.existsSync(rapportPath)) {
        console.log(`📄 Le rapport ${path.basename(rapportPath)} existe déjà. Génération ignorée.`);
        return;
    }

    const prs = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));

    // 🔧 Calcul automatique si les champs sont absents
    prs.forEach(pr => {
        if (!pr.additions || !pr.deletions || !pr.changed_files) {
            pr.additions = pr.files?.reduce((sum, f) => sum + (f.additions || 0), 0);
            pr.deletions = pr.files?.reduce((sum, f) => sum + (f.deletions || 0), 0);
            pr.changed_files = pr.files?.length || 0;
        }
    });

    // Regroupement par utilisateur
    const prsByUserId = {};
    prs.forEach(pr => {
        const githubId = pr.user?.githubId || 'inconnu';
        if (!prsByUserId[githubId]) {
            prsByUserId[githubId] = [];
        }
        prsByUserId[githubId].push(pr);
    });


    const totalAdditions = prs.reduce((sum, pr) => sum + (pr.additions || 0), 0);
    const totalDeletions = prs.reduce((sum, pr) => sum + (pr.deletions || 0), 0);
    const totalFilesChanged = prs.reduce((sum, pr) => sum + (pr.changed_files || 0), 0);
    const contributors = [...new Set(prs.map(pr => pr.user?.login || 'inconnu'))];

    let markdown = `# Rapport des PRs - ${dateStr}\n\n`;
    markdown += `Nombre total de PRs : ${prs.length}\n\n`;


    markdown += `## 📊 Résumé global\n`;
    markdown += `- 👥 Contributeurs uniques : ${contributors.length}\n`;
    markdown += `- 📂 Fichiers modifiés (total) : ${totalFilesChanged}\n`;
    markdown += `- ➕ Lignes ajoutées (total) : ${totalAdditions}\n`;
    markdown += `- ➖ Lignes supprimées (total) : ${totalDeletions}\n\n`;

    // Points forts (à adapter selon ton projet)
    markdown += `## ✅ Points forts\n`;
    markdown += `- Bonne répartition des contributions.\n`;
    markdown += `- Plusieurs PRs fusionnées avec succès.\n\n`;

    // Analyse par utilisateur
    markdown += `## 👥 Analyse par utilisateur\n`;

    for (const [githubId, userPRs] of Object.entries(prsByUserId)) {
        const userMeta = userPRs[0]?.user || {};
        const { login, html_url: userUrl, avatar_url, type, site_admin } = userMeta;

        const totalFiles = userPRs.reduce((sum, pr) => sum + (pr.changed_files || 0), 0);
        const totalAdditions = userPRs.reduce((sum, pr) => sum + (pr.additions || 0), 0);
        const totalDeletions = userPRs.reduce((sum, pr) => sum + (pr.deletions || 0), 0);

        markdown += `### 🔹 ${login || 'inconnu'}\n`;
        if (userUrl) markdown += `- 👤 Profil GitHub : ${login}\n`;
        if (avatar_url) markdown += `- 🖼️ Avatar : !\n`;
        if (type) markdown += `- 🧬 Type : ${type}\n`;
        if (site_admin !== undefined) markdown += `- 🔐 Admin GitHub : ${site_admin ? 'Oui' : 'Non'}\n`;

        markdown += `- Nombre de PRs : ${userPRs.length}\n`;
        markdown += `- Fichiers modifiés : ${totalFiles}\n`;
        markdown += `- Lignes ajoutées : ${totalAdditions}\n`;
        markdown += `- Lignes supprimées : ${totalDeletions}\n\n`;


        userPRs.forEach(pr => {

            markdown += `#### PR #${pr.number} - ${pr.title}\n`;
            markdown += `- 🔗 [Lien vers la PR](${pr.html_url})  - 🕒 Créée le: ${dayjs(pr.created_at).format('YYYY-MM-DD HH:mm')} \n`;
            markdown += `- 📂 Fichiers modifiés: ${pr.changed_files} \n`;
            markdown += `- ➕ Additions: ${pr.additions}, ➖ Deletions: ${pr.deletions} \n`;
            markdown += `- 📌 Statut: ${pr.state} \n\n`;

        });
    }

    // Suggestions d'amélioration
    markdown += `## 🛠️ Améliorations recommandées\n`;
    markdown += `- Vérifier les PRs avec peu ou pas de description.\n`;
    markdown += `- Encourager des commits plus atomiques.\n`;
    markdown += `- Ajouter des reviewers pour les PRs critiques.\n`;


    // Nettoyage de code
    markdown += `## 🧹 Nettoyage de code\n`;
    markdown += `- Suppression de variables inutilisées : \`today\`, \`dateStr\`\n`;
    markdown += `- Suppression d’un import non utilisé : \`const os = require('os')\`\n`;

    fs.writeFileSync(rapportPath, markdown, 'utf-8');
    console.log(`Rapport généré: ${rapportPath} `);
}

function getPreviousWeekRange() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = dimanche
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - dayOfWeek - 6);
    lastMonday.setHours(0, 0, 0, 0);

    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    return { start: lastMonday, end: lastSunday };
}

function getWeeklyExportFiles(startDate, endDate) {
    const files = fs.readdirSync(exportFolder);
    return files.filter(file => {
        if (!file.startsWith('export_prs_') || !file.endsWith('.json')) return false;
        const dateStr = file.slice(11, -5);
        const [year, month, day] = dateStr.split('-');
        const fileDate = new Date(`${year}-${month}-${day}T00:00:00`);
        return fileDate >= startDate && fileDate <= endDate;
    });
}

function mergePRs(files, startDate, endDate) {
    const merged = {};
    files.forEach(file => {
        const content = JSON.parse(fs.readFileSync(path.join(exportFolder, file), 'utf-8'));
        content.forEach(pr => {
            const created = new Date(pr.created_at);
            const updated = new Date(pr.updated_at || pr.created_at); // fallback si updated_at absent

            const isInRange =
                (created >= startDate && created <= endDate) ||
                (updated >= startDate && updated <= endDate);

            if (isInRange && pr.number) {
                merged[pr.number] = pr;
            }
        });
    });
    return Object.values(merged);
}


async function generateWeeklyMarkdownReport() {
    const { start, end } = getPreviousWeekRange();
    const startStr = dayjs(start).format('YYYY-MM-DD');
    const endStr = dayjs(end).format('YYYY-MM-DD');
    const hebdoJsonPath = path.join(__dirname, `../exports/export_prs_hebdo_${startStr}_au_${endStr}.json`);

    let prs = [];

    if (fs.existsSync(hebdoJsonPath)) {
        const content = JSON.parse(fs.readFileSync(hebdoJsonPath, 'utf-8'));
        if (Array.isArray(content) && content.length > 0) {
            console.log(`✅ Fichier enrichi hebdo utilisé : ${hebdoJsonPath}`);
            prs = content;
        } else {
            console.warn(`⚠️ Fichier enrichi vide, fallback sur les exports journaliers.`);
        }
    }

    if (prs.length === 0) {
        const files = getWeeklyExportFiles(start, end);
        if (files.length === 0) {
            console.warn('⚠️ Aucun fichier export trouvé pour la semaine précédente. Rapport hebdo ignoré.');
            return;
        }
        prs = mergePRs(files, start, end);
    }

    const prsByUserId = {};
    prs.forEach(pr => {
        const githubId = pr.user?.githubId || 'inconnu';
        if (!prsByUserId[githubId]) prsByUserId[githubId] = [];
        prsByUserId[githubId].push(pr);
    });

    const totalAdditions = prs.reduce((sum, pr) => sum + (pr.additions || 0), 0);
    const totalDeletions = prs.reduce((sum, pr) => sum + (pr.deletions || 0), 0);
    const totalFilesChanged = prs.reduce((sum, pr) => sum + (pr.changed_files || 0), 0);
    const contributors = [...new Set(prs.map(pr => pr.user?.login || 'inconnu'))];

    let markdown = `# Rapport hebdomadaire des PRs\n\n`;
    markdown += `📅 Semaine du **${startStr}** au **${endStr}**\n\n`;

    markdown += `## 📊 Résumé global\n`;
    markdown += `- Nombre total de PRs : ${prs.length}\n`;
    markdown += `- 👥 Contributeurs uniques : ${contributors.length}\n`;
    markdown += `- 📂 Fichiers modifiés (total) : ${totalFilesChanged}\n`;
    markdown += `- ➕ Lignes ajoutées (total) : ${totalAdditions}\n`;
    markdown += `- ➖ Lignes supprimées (total) : ${totalDeletions}\n\n`;

    markdown += `## ✅ Points forts\n`;
    markdown += `- Bonne répartition des contributions.\n`;
    markdown += `- Plusieurs PRs fusionnées avec succès.\n\n`;

    markdown += `## 👥 Analyse par utilisateur\n`;

    for (const [githubId, userPRs] of Object.entries(prsByUserId)) {
        const userMeta = userPRs[0]?.user || {};
        const { login, html_url: userUrl, avatar_url, type, site_admin } = userMeta;

        const totalFiles = userPRs.reduce((sum, pr) => sum + (pr.changed_files || 0), 0);
        const totalAdditions = userPRs.reduce((sum, pr) => sum + (pr.additions || 0), 0);
        const totalDeletions = userPRs.reduce((sum, pr) => sum + (pr.deletions || 0), 0);

        markdown += `### 🔹 ${login || 'inconnu'}\n`;
        if (userUrl) markdown += `- 👤 Profil GitHub : ${login}\n`;
        if (avatar_url) markdown += `- 🖼️ Avatar : !\n`;
        if (type) markdown += `- 🧬 Type : ${type}\n`;
        if (site_admin !== undefined) markdown += `- 🔐 Admin GitHub : ${site_admin ? 'Oui' : 'Non'}\n`;

        markdown += `- Nombre de PRs : ${userPRs.length}\n`;
        markdown += `- Fichiers modifiés : ${totalFiles}\n`;
        markdown += `- Lignes ajoutées : ${totalAdditions}\n`;
        markdown += `- Lignes supprimées : ${totalDeletions}\n\n`;

        userPRs.forEach(pr => {
            markdown += `#### PR #${pr.number} - ${pr.title}\n`;
            markdown += `- 🔗 Lien vers la PR  - 🕒 Créée le: ${dayjs(pr.created_at).format('YYYY-MM-DD HH:mm')} \n`;
            markdown += `- 📂 Fichiers modifiés: ${pr.changed_files} \n`;
            markdown += `- ➕ Additions: ${pr.additions}, ➖ Deletions: ${pr.deletions} \n`;

            markdown += `- 📌 Statut: ${pr.state} \n\n`;
        });
    }

    markdown += `## 🛠️ Améliorations recommandées\n`;
    markdown += `- Vérifier les PRs avec peu ou pas de description.\n`;
    markdown += `- Encourager des commits plus atomiques.\n`;
    markdown += `- Ajouter des reviewers pour les PRs critiques.\n\n`;
    markdown += `## 🧹 Nettoyage de code\n`;
    markdown += `- Suppression de variables inutilisées : \`today\`, \`dateStr\`\n`;
    markdown += `- Suppression d’un import non utilisé : \`const os = require('os')\`\n`;

    const hebdoMdPath = path.join(exportFolder, `rapport_hebdo_${startStr}_au_${endStr}.md`);
    fs.writeFileSync(hebdoMdPath, markdown, 'utf-8');
    console.log(`✅ Rapport Markdown hebdomadaire généré : ${hebdoMdPath}`);

}

module.exports = { generateRapportMarkdown, generateWeeklyMarkdownReport };
