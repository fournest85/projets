const express = require('express');
const router = express.Router();
const { fetchAndStorePRs, getPRs, updatePRs } = require('../controller/pr');

router.get('/fetch', fetchAndStorePRs);

router.get('/list', getPRs);

router.put('/update', updatePRs);

router.get('/:number', async (req, res) => {
    const number = parseInt(req.params.number);
    const collection = require('../bd/connect').bd().collection('pr_merge');

    try {
        const pr = await collection.findOne({ number });
        if (pr) {
            res.status(200).json(pr);
        } else {
            res.status(404).json({ error: 'PR non trouvée' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});



module.exports = router;
