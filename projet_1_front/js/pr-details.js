function goBackToList() {
    window.location.href = '/index.html';
}

function getPRNumberFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('number');
}

function getRepoFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('repo');
}


async function loadPRDetails() {
    try {
        const prNumber = getPRNumberFromURL();
        if (!prNumber) return;

        const repo = getRepoFromURL();
        const res = await axios.get(`http://localhost:3000/api/github/prs/${repo}/${prNumber}`);

        const pr = res.data;
        console.log("🔍 PR reçue :", pr);
        console.log("👤 Auteur brut :", pr.user);

        const list = document.getElementById('prDetailsList');
        list.innerHTML = '';

        if (!pr || !pr.number) {
            list.innerHTML = '<li>PR non trouvée.</li>';
            return;
        }

        const li = document.createElement('li');
        li.style.cursor = 'pointer';

        const title = document.createElement('h3');
        title.textContent = `PR #${pr.number} - ${pr.title}`;
        li.appendChild(title);

        const user = document.createElement('p');
        let login = pr.user?.login;

        if (!login && typeof pr.user?.githubUrl === 'string') {
            const match = pr.user.githubUrl.match(/github\.com\/([^\/]+)/);
            if (match) {
                login = match[1];
            }
        }

        if (!login) {
            login = 'inconnu';
        }

        user.textContent = `Auteur : ${login ?? 'inconnu'} | État : ${pr.state}`;
        li.appendChild(user);

        const date = document.createElement('p');
        date.textContent = `Créée le : ${new Date(pr.created_at).toLocaleString()}`;
        li.appendChild(date);

        const toggleBtn = document.createElement('button');
        toggleBtn.textContent = 'Voir les fichiers modifiés';
        toggleBtn.onclick = () => {
            let fileList = li.querySelector('ul');

            if (fileList) {
                fileList.style.display = fileList.style.display === 'none' ? 'block' : 'none';
            } else {
                fileList = document.createElement('ul');

                if (pr.files && pr.files.length > 0) {
                    pr.files.forEach(file => {
                        const fileItem = document.createElement('li');
                        const link = document.createElement('a');
                        link.href = file.raw_url || '#';
                        link.textContent = `${file.filename} (${file.status}) [+${file.additions} / -${file.deletions}]`;

                        link.target = '_blank';
                        fileItem.appendChild(link);
                        fileList.appendChild(fileItem);
                    });
                } else {
                    const noFiles = document.createElement('li');
                    noFiles.textContent = 'Aucun fichier modifié.';
                    fileList.appendChild(noFiles);
                }

                li.appendChild(fileList);
            }
        };
        li.appendChild(toggleBtn);

        list.appendChild(li);

    } catch (error) {
        console.error('❌ Erreur lors du chargement des détails des PRs :', error);
    }
}

loadPRDetails();
