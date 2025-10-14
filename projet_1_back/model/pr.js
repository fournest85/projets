// model/pr.js

class PR {
    constructor({ id, number, title, user, state, created_at, updated_at, repo, files }) {
        this.id = id;
        this.number = number;
        this.title = title;
        this.user = user;
        this.state = state;
        this.created_at = new Date(created_at);
        this.updated_at = new Date(updated_at);
        this.repo = repo;
        this.files = files;
        this.date = new Date(); // date d'enregistrement
    }
}

module.exports = { PR };