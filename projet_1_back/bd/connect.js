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

                    await collection.createIndex({ number: 1 }, { unique: true });
                    console.log('✅ Index unique sur "number" créé dans pr_merge');
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