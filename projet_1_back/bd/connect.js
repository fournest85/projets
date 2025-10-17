const { MongoClient } = require('mongodb');

let client = null;
let db = null;

function connecter(uri, callback) {
    if (!client) {
        client = new MongoClient(uri);
        client.connect()
            .then(async () => {
                const dbName = process.env.DB_NAME || "sebastienfournest_db_user";
                db = client.db(dbName);
                const collection = db.collection('pr_merge');

                try {
                    const duplicates = await collection.aggregate([
                        {
                            $group: {
                                _id: "$number",
                                ids: { $push: "$_id" },
                                count: { $sum: 1 }
                            }
                        },
                        { $match: { count: { $gt: 1 } } }
                    ]).toArray();

                    for (const dup of duplicates) {
                        const idsToDelete = dup.ids.slice(1);
                        await collection.deleteMany({ _id: { $in: idsToDelete } });
                        console.log(`🧹 Doublons supprimés pour number ${dup._id}`);
                    }


                    // 🧱 Suppression de l'ancien index
                    try {
                        await collection.dropIndex("number_1_repo.name_1");
                        console.log("✅ Index 'number_1_repo.name_1' supprimé.");
                    } catch (err) {
                        console.warn("⚠️ Index 'number_1_repo.name_1' introuvable ou déjà supprimé.");
                    }

                    // 🔍 Vérification de l'existence de l'index combiné
                    const indexes = await collection.indexes();
                    const indexExists = indexes.some(index =>
                        JSON.stringify(index.key) === JSON.stringify({ number: 1, repo: 1 })
                    );



                    if (!indexExists) {
                        await collection.createIndex({ number: 1, repo: 1 }, { unique: true });
                        console.log('✅ Index unique sur { number, repo } créé dans pr_merge');
                    } else {
                        console.log('ℹ️ Index { number, repo } déjà présent.');
                    }

                    // 🧹 Nettoyage des anciens champs repo.name (optionnel)
                    const prsWithRepoName = await collection.find({ "repo.name": { $exists: true } }).toArray();
                    for (const pr of prsWithRepoName) {
                        await collection.updateOne(
                            { _id: pr._id },
                            { $unset: { "repo.name": "" } }
                        );
                        console.log(`🧹 Champ repo.name supprimé pour PR #${pr.number}`);
                    }


                } catch (indexErr) {
                    console.warn('⚠️ Erreur lors du nettoyage ou de la création de l’index :', indexErr.message);
                }


                callback();
            })
            .catch(err => {
                client = null;
                db = null;
                callback(err);
            });
    } else {
        callback();
    }
}

function bd() {
    return db;
}

function fermerConnexion() {
    if (client) {
        client.close();
        client = null;
        db = null;
    }
}

module.exports = { connecter, bd, fermerConnexion };