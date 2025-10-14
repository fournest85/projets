
const express = require("express");
const { createUser, getAllUsers, getUser, updateUser, deleteUser, migrateUsersFromPRs } = require('../controller/user');
const { User } = require('../model/user');
const dbUser = require('../bd/connect');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const router = express.Router();


router.route('/users').post(createUser);
router.route('/users').get(getAllUsers);
router.route('/users/:id').get(getUser);
router.route('/users/:id').put(updateUser);
router.route('/users/:id').delete(deleteUser);
router.route('/users/migrate-from-prs').post(migrateUsersFromPRs);

const axios = require('axios');


router.post('/prs/sync-users', async (req, res) => {
    try {
        const prCollection = dbUser.bd().collection('pr_merge');
        const userCollection = dbUser.bd().collection('users');

        const prs = await prCollection.find().toArray();
        let insertedCount = 0;

        for (const pr of prs) {
            const githubUser = pr.user;


            const exists = await userCollection.findOne({ githubId: githubUser.id });
            if (!exists) {
                const headers = {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github.v3+json'
                };


                try {
                    const userDetails = await axios.get(`https://api.github.com/users/${githubUser.login}`, { headers });

                    const newUser = new User({
                        name: githubUser.login,
                        email: userDetails.data.email || '',
                        phone: '',
                        githubData: userDetails.data
                    });

                    await userCollection.insertOne({ ...newUser });

                    insertedCount++;

                } catch (err) {
                    console.warn(`Impossible de récupérer les détails pour ${githubUser.login}`, err.message);
                }
            }
        }
        res.status(200).json({ message: `${insertedCount} utilisateur(s) GitHub ajouté(s).` });
    } catch (err) {
        console.error('Erreur sync-users :', err);
        res.status(500).json({ error: 'Erreur lors de la synchronisation des utilisateurs GitHub.' });
    }
});



module.exports = router;