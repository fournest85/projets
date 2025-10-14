const { User } = require('../model/user');
const { ObjectId } = require('mongodb');
const dbUser = require('../bd/connect');
const axios = require('axios');



const createUser = async (req, res) => {
    try {
        const { name, email, phone, githubData } = req.body;

        if (!name || !email || !phone) {
            return res.status(400).json({ error: 'Name, email and phone are required' });
        }

        const existingUser = await dbUser.bd().collection('users').findOne({ email });
        if (existingUser) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Création de l'utilisateur avec les métadonnées GitHub si présentes
        const user = new User({ name, email, phone, githubData });

        const result = await dbUser.bd().collection('users').insertOne(user);

        res.status(201).json({
            message: 'User created successfully',
            insertedId: result.insertedId,
            _id: result.insertedId
        });

        console.log("User created:", result.insertedId);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const collection = dbUser.bd().collection('users');

        // Projection complète pour les deux types d'utilisateurs
        const rawUsers = await collection.find({})
            .skip(skip)
            .limit(limit)
            .toArray();


        const total = await collection.countDocuments();

        // Optionnel : transformation pour le frontend
        const users = rawUsers.map(user => {
            if (user.login) {
                return {
                    type: 'github',
                    githubId: user.githubId,
                    login: user.login,
                    html_url: user.html_url
                };
            } else {
                return {
                    type: 'local',
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone
                };
            }
        });

        res.status(200).json({
            users,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


const getUser = async (req, res) => {
    try {
        const id = new ObjectId(req.params.id);
        const user = await dbUser.bd().collection('users').findOne(
            { _id: id },
            { projection: { id: 1, login: 1, html_url: 1, _id: 0 } }
        );

        if (user) {
            res.status(200).json(user);
        } else {
            res.status(404).json({ message: 'User doesn\'t exist' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const updateUser = async (req, res) => {
    try {
        const id = new ObjectId(req.params.id);
        const { name, email, phone } = req.body;


        const updateFields = {};
        if (name) updateFields.name = name;
        if (email) updateFields.email = email;
        if (phone) updateFields.phone = phone;

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
        }
        if (email) {

            const existingUser = await dbUser.bd().collection('users').findOne({ email: email, _id: { $ne: id } });
            if (existingUser) {
                return res.status(409).json({ error: 'Email already used by another user' });
            }
        }
        const result = await dbUser.bd().collection('users').updateOne({ _id: id }, { $set: updateFields });
        if (result.modifiedCount == 1) {
            res.status(200).json(
                {
                    message: 'User updated successfully',
                    modifiedCount: result.modifiedCount
                }
            );
            console.log("User updated");
        } else {
            res.status(404).json({ message: 'User doesn\'t exist' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


const deleteUser = async (req, res) => {
    try {
        let id = new ObjectId(req.params.id);
        let result = await dbUser.bd().collection('users').deleteOne({ _id: id });
        if (result.deletedCount == 1) {
            res.status(200).json(result);
            console.log("User deleted");
        } else {
            res.status(404).json({ message: 'User doesn\'t exist' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const migrateUsersFromPRsInternal = async () => {
    try {
        const prCollection = dbUser.bd().collection('pr_merge');
        const userCollection = dbUser.bd().collection('users');
        const prs = await prCollection.find().toArray();
        const fetchedUsersCache = new Set();

        let insertedCount = 0;
        let skippedCount = 0;
        let updatedCount = 0;

        for (const pr of prs) {

            const githubUser = pr.user;
            let login = githubUser?.login;

            // 🔄 Reconstruire le login à partir de githubUrl si absent
            if (!login && githubUser?.githubUrl) {
                // console.log(`🔧 Tentative reconstruction login depuis githubUrl : ${githubUser.githubUrl}`);
                const match = githubUser.githubUrl.match(/github\.com\/([^\/]+)/);
                // console.log(`🔍 Résultat regex :`, match);
                if (match) {
                    login = match[1];
                }
            }
            if (!login) {
                // console.log(`🔍 PR sans login détectée :`, pr);
                console.log(`⚠️ PR #${pr.number} ignorée : utilisateur GitHub invalide`);
                skippedCount++;
                continue;
            }

            if (fetchedUsersCache.has(login)) {
                skippedCount++;
                continue;
            }


            let fullUserData;
            try {
                const response = await axios.get(`https://api.github.com/users/${login}`);
                fullUserData = response.data;
                fetchedUsersCache.add(login);
            } catch (err) {
                console.error(`❌ Échec récupération API GitHub pour ${login} :`, err.message);
                skippedCount++;
                continue;
            }

            const githubId = fullUserData.id;

            const userDoc = {
                githubId,
                login: fullUserData.login,
                html_url: fullUserData.html_url,
                avatar_url: fullUserData.avatar_url ?? null,
                gravatar_id: fullUserData.gravatar_id ?? null,
                url: fullUserData.url ?? null,
                followers_url: fullUserData.followers_url ?? null,
                following_url: fullUserData.following_url ?? null,
                gists_url: fullUserData.gists_url ?? null,
                starred_url: fullUserData.starred_url ?? null,
                subscriptions_url: fullUserData.subscriptions_url ?? null,
                organizations_url: fullUserData.organizations_url ?? null,
                repos_url: fullUserData.repos_url ?? null,
                events_url: fullUserData.events_url ?? null,
                received_events_url: fullUserData.received_events_url ?? null,
                type: fullUserData.type ?? 'User',
                site_admin: fullUserData.site_admin ?? false
            };

            const existing = await userCollection.findOne({ githubId });

            if (existing) {
                const hasChanged = JSON.stringify(existing) !== JSON.stringify(userDoc);
                if (hasChanged) {
                    await userCollection.updateOne({ githubId }, { $set: userDoc });
                    console.log(`🔄 Utilisateur mis à jour : ${login}`);
                    updatedCount++;
                }
            } else {
                await userCollection.insertOne(userDoc);
                console.log(`✅ Utilisateur inséré : ${login}`);
                insertedCount++;
            }
        }

        return {
            inserted: insertedCount,
            updated: updatedCount,
            skipped: skippedCount
        };
    } catch (error) {
        console.error('❌ Erreur migration enrichie :', error.message);
        return { inserted: 0, updated: 0, skipped: 0 };
    }
};


const migrateUsersFromPRs = async (req = null, res = null) => {
    try {
        const count = await migrateUsersFromPRsInternal();
        const message = `${count} utilisateur(s) migré(s) depuis pr_merge.`;

        if (res && typeof res.status === 'function') {
            return res.status(200).json({ message });
        }

        console.log(`✅ ${message}`);
        return count;
    } catch (error) {
        console.error('❌ Erreur migration :', error.message);

        if (res && typeof res.status === 'function') {
            return res.status(500).json({ error: 'Erreur lors de la migration.' });
        }

        return 0;
    }
};
module.exports = { createUser, getAllUsers, getUser, updateUser, deleteUser, migrateUsersFromPRs, migrateUsersFromPRsInternal };