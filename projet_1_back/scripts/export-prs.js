const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { mapUsersByGithubId, enrichPRsWithUsers, getExportFilePath } = require('./githubService');

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
const collectionName = 'pr_merge';
const dayjs = require('dayjs');

const exportFolder = path.join(__dirname, 'exports');
if (!fs.existsSync(exportFolder)) {
    fs.mkdirSync(exportFolder, { recursive: true });
}



async function exportPRsToJson({ enrichWithUsers = false, dateToUse } = {}) {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        const selectedDate = dateToUse
            ? new Date(dateToUse)
            : dayjs().subtract(1, 'day').startOf('day').toDate();

        const nextDay = dayjs(selectedDate).add(1, 'day').startOf('day').toDate();


        const prs = await collection.find({
            $or: [
                { updated_at: { $gte: selectedDate, $lt: nextDay } },
                { created_at: { $gte: selectedDate, $lt: nextDay } }
            ]
        }).toArray();
        


        let finalPRs = prs;

        if (enrichWithUsers) {
            const userCollection = db.collection('users');
            const users = await userCollection.find({}).toArray();
            const usersByGithubId = mapUsersByGithubId(users);
            finalPRs = enrichPRsWithUsers(prs, usersByGithubId);
        }

        const dateStr = dayjs(selectedDate).format('YYYY-MM-DD');
        const filePath = getExportFilePath('export_prs', dateStr);
        console.log(`🔍 Vérification de l'existence du fichier : ${filePath}`);
        if (fs.existsSync(filePath)) {
            console.log(`📁 Le fichier ${path.basename(filePath)} existe déjà. Export ignoré.`);
            return;
        }


        fs.writeFileSync(filePath, JSON.stringify(finalPRs, null, 2), 'utf-8');
        console.log(`✅ Export ${enrichWithUsers ? 'enrichi ' : ''}terminé : ${filePath}`);
        console.log(`📁 Écriture du fichier JSON à : ${filePath}`);
    } catch (err) {
        console.error('❌ Erreur lors de l’export :', err.message);
    } finally {
        await client.close();
    }

}

// 📅 Obtenir les dates de début et fin de la semaine précédente
function getPreviousWeekRange() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi

    // Trouver le lundi de la semaine précédente
    const daysSinceMonday = (dayOfWeek + 6) % 7; // transforme dimanche (0) en 6, lundi (1) en 0, etc.
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - daysSinceMonday - 7); // lundi précédent
    lastMonday.setHours(0, 0, 0, 0);

    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6); // dimanche suivant
    lastSunday.setHours(23, 59, 59, 999);

    return { start: lastMonday, end: lastSunday };
}


// 📁 Lire tous les fichiers export_prs de la semaine
function getWeeklyExportFiles(startDate, endDate) {
    const files = fs.readdirSync(exportFolder);
    const filtered = files.filter(file => {
        if (!file.startsWith('export_prs_') || !file.endsWith('.json')) return false;
        const dateStr = file.slice(11, -5); // "YYYY-MM-DD"
        const [year, month, day] = dateStr.split('-');
        const fileDate = new Date(`${dateStr}T00:00:00`);
        return fileDate >= startDate && fileDate <= endDate;
    });

    if (filtered.length === 0) {
        console.warn('⚠️ Aucun fichier export trouvé pour la semaine précédente. Rapport hebdo ignoré.');
    }

    return filtered;
}

// 🔄 Fusionner les PRs sans doublons
function mergePRs(files, startDate, endDate) {
    const merged = {};

    files.forEach(file => {
        const fullPath = path.join(exportFolder, file);
        if (!fs.existsSync(fullPath)) return;

        const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

        const filteredPRs = content.filter(pr => {
            const createdAt = new Date(pr.created_at);
            return createdAt >= startDate && createdAt <= endDate;
        });
        filteredPRs.forEach(pr => {
            if (pr.number) merged[pr.number] = pr;
        });
    });

    return Object.values(merged);
}

// 📝 Générer le rapport hebdomadaire
async function generateWeeklyReport({ enrichWithUsers = false } = {}) {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(dbName);
        const userCollection = db.collection('users');

        const { start, end } = getPreviousWeekRange();
        const files = getWeeklyExportFiles(start, end);
        const mergedPRs = mergePRs(files, start, end);

        let finalPRs = mergedPRs;
        console.log(`📅 Plage hebdo : ${start.toISOString()} → ${end.toISOString()}`);
        console.log(`📦 PRs finales dans le rapport : ${finalPRs.length}`);

        if (enrichWithUsers) {
            const users = await userCollection.find({}).toArray();
            const usersByGithubId = mapUsersByGithubId(users);
            finalPRs = enrichPRsWithUsers(mergedPRs, usersByGithubId);
        }

        const startStr = start.toISOString().slice(0, 10);
        const endStr = end.toISOString().slice(0, 10);
        const outputName = `export_prs_hebdo_${startStr}_au_${endStr}.json`;
        const outputPath = path.join(exportFolder, outputName);

        fs.writeFileSync(outputPath, JSON.stringify(finalPRs, null, 2), 'utf-8');
        console.log(`✅ Export hebdomadaire ${enrichWithUsers ? 'enrichi ' : ''}généré : ${outputName}`);
    } catch (err) {
        console.error('❌ Erreur lors de l’export hebdo :', err.message);
    } finally {
        await client.close();
    }
}

module.exports = { exportPRsToJson, generateWeeklyReport };