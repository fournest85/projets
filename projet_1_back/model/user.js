class User {
    constructor({ name, email, phone, githubData = {} }) {
        this.name = name;
        this.email = email;
        this.phone = phone;


        // Renommer le champ 'id' de GitHub en 'githubId'
        if (githubData.id) {
            this.githubId = githubData.id;
        }

        // Stocker toutes les métadonnées GitHub
        Object.assign(this, githubData);
    }

    // Méthode pour afficher uniquement les champs utiles
    getPublicProfile() {
        return {
            githubId: this.githubId,
            login: this.login,
            html_url: this.html_url
        };
    }
}

module.exports = { User };