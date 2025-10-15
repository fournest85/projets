
# Projets

Ce dépôt regroupe l'ensemble du projet de Sébastien FOURNEST, fusionnant les anciens dépôts `projet_1_back` et `projet_1_front`.

## Structure du projet

- **Backend** (`projet_1_back`) :
  - Développé avec **Node.js**
  - Utilise **MongoDB** pour la base de données
  - Requêtes HTTP gérées avec **Axios**
  - Démarrage : `npm start`

- **Frontend** (`projet_1_front`) :
  - Développé avec **HTML**, **CSS** et **JavaScript**
  - Interface utilisateur simple et responsive
  - Démarrage : ouvrir le fichier `index.html` dans un navigateur

## Objectif

Ce projet vise à fournir une application web complète avec une interface utilisateur (frontend) connectée à une API REST (backend).

## Installation des dépendances

### Backend
> ℹ️ **Prérequis** : Node.js et npm doivent être installés sur votre machine.
> Vous pouvez les télécharger depuis nodejs.org


## Démarrage rapide
cd backend
npm install

### Démarrage du backend seul
node server.js

### Démarrage du backend + frontend ensemble
npm start
## Fonctionnalités

- 🔍 **Récupération des métadonnées GitHub** :
  - Utilisateurs (auteurs, reviewers, etc.)
  - Pull Requests (titres, dates, fichiers modifiés...)

- ⚙️ **Enrichissement automatique des données** :
  - Ajout d'informations complémentaires (statuts, dates, liens...)

- 📦 **Exports JSON** :
  - Générés automatiquement chaque jour et chaque semaine
  - Contiennent les données brutes et enrichies

- 📝 **Rapports Markdown** :
  - Synthèse des PRs modifiées
  - Regroupement par auteur, date, ou projet

- ⏱️ **Exécution via tâches cron** :
  - Automatisation des exports et rapports à intervalles réguliers

- 🌐 **Interface HTML** :
  - Visualisation des données collectées
  - Accès rapide aux rapports et fichiers
``

## 📁 Schéma de la structure du projet
Ce diagramme représente l’organisation actuelle des dossiers et fichiers du projet projet_1, incluant les parties backend et frontend, ainsi que les principaux scripts, utilitaires et fichiers de configuration.
![Structure du projet](projets/docs/mermaid-diagram-2025-10-15-170214.png)


## FAQ

### Que faire si les exports ne se génèrent pas ?
Vérifiez que les tâches cron sont bien configurées et que le serveur backend est en cours d'exécution. Consultez les logs pour détecter d'éventuelles erreurs.

### Comment ajouter un nouvel utilisateur GitHub à la base ?
Ajoutez son identifiant GitHub dans le fichier ou la collection MongoDB dédiée aux utilisateurs, puis relancez le script d'importation.

### Peut-on lancer manuellement les scripts d'export ?
Oui, les scripts peuvent être exécutés manuellement via la ligne de commande en lançant les fichiers correspondants dans le dossier backend.

### Où trouver les rapports Markdown générés ?
L📁 Rapports Markdown
Les rapports sont enregistrés dans le dossier scripts/exports/ du projet. Ils sont nommés selon la date et le type de rapport :

Rapports quotidiens : générés chaque matin, ils regroupent les PRs modifiées ou fusionnées la veille.
Rapports hebdomadaires : générés chaque lundi, ils regroupent les PRs de toute la semaine précédente.
Rapports du week-end : les fichiers datés du vendredi incluent automatiquement les PRs du vendredi, samedi et dimanche précédents, afin de ne rien manquer dans le rapport hebdomadaire.
## Auteur
Sébastien FOURNEST