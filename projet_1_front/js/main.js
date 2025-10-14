
let API_URL = '';
let PR_API_URL = '';
const USERS_PER_PAGE = 10;
const PRS_PER_PAGE = 10;
let currentUserPage = 1;
let currentPRPage = 1;
let allUsers = [];
let allPRs = [];

const BACKEND_PORT = 3000; // ou le port réel si dynamique
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;



async function fetchBackendConfig() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/config`);
        const config = await res.json();
        API_URL = config.apiUrl;
        PR_API_URL = API_URL.replace('/users', '/github/prs/list');

        console.log("✅ API_URL récupérée du backend :", API_URL);

        loadUsers();
        loadPRs();
    } catch (err) {
        console.error("❌ Impossible de récupérer la config du backend :", err);
    }
}



document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('userId').value;
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;

    const user = { name, email, phone };

    try {
        if (id) {
            await axios.put(`${API_URL}/${id}`, user);
            alert('Utilisateur modifié');
        } else {
            await axios.post(API_URL, user);
            alert('Utilisateur créé');
        }
        loadUsers();
    } catch (err) {
        alert('Erreur : ' + (err.response?.data?.error || err.message));
    }
});

async function deleteUser() {
    const id = document.getElementById('userId').value;
    if (!id) return alert('Veuillez entrer un ID à supprimer');

    try {
        await axios.delete(`${API_URL}/${id}`);
        alert('Utilisateur supprimé');
        loadUsers();
    } catch (err) {
        alert('Erreur : ' + (err.response?.data?.error || err.message));
    }
}

async function loadUsers() {
    try {
        const res = await axios.get(`${API_URL}?page=${currentUserPage}&limit=${USERS_PER_PAGE}`);
        allUsers = res.data.users;
        console.log('Données reçues du backend :', allUsers);
        displayUsers(currentUserPage);
        renderUserPagination(res.data.totalPages);
    } catch (err) {
        console.error('Erreur chargement utilisateurs', err);
    }
}


function displayUsers(page) {
    const list = document.getElementById('userList');
    list.innerHTML = '';

    allUsers.forEach(user => {
        const li = document.createElement('li');

        if (user.login) {
            // Utilisateur GitHub
            li.innerHTML = `<a href="${user.html_url}" target="_blank">${user.html_url}</a> <strong>${user.login}</strong>  - ID GitHub: ${user.githubId}`;
        } else {
            // Utilisateur local
            li.innerHTML = `<strong>${user.name}</strong> [${user.email}] (${user.phone}) - ID: ${user._id}`;
        }

        list.appendChild(li);
    });
}

function renderUserPagination(totalPages) {
    const container = document.getElementById('userPagination');
    container.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.onclick = () => {
            currentUserPage = i;
            loadUsers();
        };
        container.appendChild(btn);
    }
}


function getYesterdayDateString() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = String(yesterday.getDate()).padStart(2, '0');
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const year = yesterday.getFullYear();
    return `${year}-${month}-${day}`;
}


document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('prDateFilter');
    const selectedDate = dateInput.value || getYesterdayDateString();
    dateInput.value = selectedDate;

    fetchBackendConfig();
    console.log('📦 Appel à loadPRsByDate() ou loadPRs() selon la date sélectionnée');

    if (selectedDate) {
        loadPRsByDate();
    } else {
        loadPRs();
    }
});


async function loadPRs() {
    const yesterday = getYesterdayDateString();
    try {
        const res = await axios.get(`${PR_API_URL}?date=${yesterday}&sort=titleAndDate&page=${currentPRPage}&limit=${PRS_PER_PAGE}`);
        allPRs = res.data.prs;
        console.log('📦 PRs reçues :', res.data.prs);
        displayPRs(currentPRPage);
        renderPRPagination(res.data.totalPages);
    } catch (err) {
        console.error('Erreur chargement des PR :', err);
    }
}

async function loadPRsByDate() {
    const selectedDate = document.getElementById('prDateFilter').value;
    console.log('📅 Date sélectionnée :', selectedDate); // Ajoute ce log

    if (!selectedDate) {
        console.warn('⚠️ Aucune date sélectionnée');
        return;
    }

    try {
        const res = await axios.get(`${PR_API_URL}?date=${selectedDate}&page=${currentPRPage}&limit=${PRS_PER_PAGE}`);
        allPRs = Array.isArray(res.data?.prs) ? res.data.prs : [];
        console.log('📦 PRs datées reçues :', allPRs);
        displayPRs(currentPRPage);
        renderPRPagination(res.data.totalPages);
    } catch (err) {
        console.error('Erreur chargement des PR filtrées :', err);
    }
}

function displayPRs(page) {
    const list = document.getElementById('prList');
    list.innerHTML = '';

    if (!Array.isArray(allPRs)) {
        console.warn('⚠️ Impossible d’afficher les PRs : allPRs est invalide', allPRs);
        return;
    }
    // Regrouper les PRs par titre
    const groupedPRs = {};
    allPRs.forEach(pr => {
        if (!groupedPRs[pr.title]) {
            groupedPRs[pr.title] = [];
        }
        groupedPRs[pr.title].push(pr);
    });


    // Trier les titres alphabétiquement
    const sortedTitles = Object.keys(groupedPRs).sort();

    sortedTitles.forEach(title => {
        const group = groupedPRs[title].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)); // tri par date décroissante

        const li = document.createElement('li');
        li.innerHTML = `<strong>${title}</strong> (${group.length} PR${group.length > 1 ? 's' : ''})`;

        const subList = document.createElement('ul');
        group.forEach(pr => {
            console.log('PR affichée :', pr);
            const dateText = pr.updated_at ? new Date(pr.updated_at).toLocaleDateString('fr-FR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) : 'Date inconnue';

            const subLi = document.createElement('li');
            const login = pr.user?.login || (pr.user?.githubUrl ? pr.user.githubUrl.split('/').pop() : 'Utilisateur inconnu');
            subLi.innerHTML = `#${pr.number} - ${login} (${pr.state})<br><em>Enregistrée le : ${dateText}</em>`;
            subLi.style.cursor = 'pointer';
            subLi.onclick = () => {
                window.location.href = `/pr-details.html?number=${pr.number}`;
            };
            subList.appendChild(subLi);
        });

        li.appendChild(subList);
        list.appendChild(li);
    });
}

function renderPRPagination(totalPages) {
    const container = document.getElementById('prPagination');
    container.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.onclick = () => {
            currentPRPage = i;
            loadPRs();
        };
        container.appendChild(btn);
    }
}
