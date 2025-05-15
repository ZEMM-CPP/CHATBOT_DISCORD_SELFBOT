# Discord Selfbot avec Together AI

Ce selfbot Discord permet d'interagir avec l'API Together AI directement depuis vos conversations Discord, avec une mémoire de conversation, une réponse automatique aux messages et une identification des participants, le tout en préservant le contexte.

## ⚠️ Avertissement

L'utilisation de selfbots est contraire aux Conditions d'Utilisation de Discord. Utilisez ce code à vos propres risques. Votre compte Discord pourrait être banni.

## Configuration

1. Clonez ce dépôt
2. Installez les dépendances:
   ```
   npm install
   ```
3. Modifiez le fichier `config.json`:
   - Remplacez `VOTRE_TOKEN_DISCORD_ICI` par votre token Discord personnel
   - Remplacez `VOTRE_API_KEY_TOGETHER_AI_ICI` par votre clé API Together AI

## Obtenir votre token Discord

1. Ouvrez Discord dans votre navigateur
2. Appuyez sur F12 pour ouvrir les outils de développeur
3. Allez dans l'onglet "Application" > "Local Storage" > "discordapp.com"
4. Recherchez "token" et copiez la valeur (sans les guillemets)

## Obtenir une clé API Together AI

1. Créez un compte sur [Together AI](https://together.ai)
2. Allez dans les paramètres de votre profil
3. Générez une nouvelle clé API et copiez-la

## Démarrage

1. Pour éviter les erreurs, utilisez le script de démarrage:
   ```
   start.bat
   ```
   
   Ou lancez manuellement:
   ```
   node fix-discord.js
   node index.js
   ```

## Commandes

Le selfbot supporte les commandes suivantes:

- `+ai [prompt]` - Envoie un prompt à l'IA et affiche sa réponse
- `+reset` - Réinitialise la mémoire de conversation dans le canal actuel
- `+memory` - Affiche l'état de la mémoire et les derniers messages échangés
- `+clear [nombre]` - Supprime le nombre spécifié de vos propres messages dans le canal

## Fonctionnalité de mémoire

Le selfbot garde en mémoire la conversation pour chaque canal. Cela permet d'avoir des conversations cohérentes avec l'IA qui se souvient du contexte précédent.

**Exemple de conversation:**

```
Vous: +ai Raconte-moi une histoire sur un robot
IA: [répond avec une histoire sur un robot]

Vous: +ai Comment s'appelle le robot dans l'histoire?
IA: [répond avec le nom du robot, en se basant sur l'histoire précédente]
```

Pour effacer la mémoire et recommencer une nouvelle conversation:
```
+reset
```

Pour voir l'état de la mémoire:
```
+memory
```

## Réponse automatique

Le selfbot est capable de répondre automatiquement lorsque quelqu'un répond à un message de l'IA:

1. Envoyez une commande `+ai` pour obtenir une réponse de l'IA
2. N'importe qui (vous ou un autre utilisateur) peut répondre à ce message de l'IA
3. L'IA répondra automatiquement à cette réponse, en gardant le contexte de la conversation

Cette fonctionnalité permet d'avoir des conversations naturelles avec l'IA en utilisant simplement la fonction "Répondre" de Discord, sans avoir à taper le préfixe `+ai` à chaque fois.

## Contexte de réponse

Le selfbot prend en compte le contenu du message auquel vous répondez, permettant une interaction plus naturelle et contextuelle:

### Répondre à un message IA

Lorsque quelqu'un répond à un message de l'IA, le selfbot inclut automatiquement le contenu du message original dans le prompt envoyé à l'IA, permettant une réponse plus pertinente.

### Répondre à n'importe quel message avec +ai

Vous pouvez répondre à n'importe quel message Discord (pas seulement ceux de l'IA) avec une commande `+ai [prompt]` pour demander à l'IA de traiter votre prompt dans le contexte du message auquel vous répondez.

**Exemple:**
1. Quelqu'un poste un message technique sur Discord
2. Vous pouvez y répondre avec `+ai Peux-tu m'expliquer ça simplement?`
3. L'IA répondra en tenant compte du contenu du message auquel vous avez répondu

Cette fonctionnalité permet de traiter des informations spécifiques sans avoir à les copier-coller.

## Identification des participants

Le selfbot transmet désormais à l'IA les informations sur les différents participants de la conversation :

### Reconnaissance des auteurs

L'IA reçoit pour chaque message le pseudo Discord de l'auteur, lui permettant de savoir qui dit quoi dans la conversation.

### Réponses personnalisées

Grâce à cette information, l'IA peut adapter ses réponses et s'adresser directement à la personne qui lui parle.

**Exemple:**
- Si "Alice" répond à un message de l'IA, l'IA pourra commencer sa réponse par "Bonjour Alice, ..."
- Si plusieurs personnes participent à la conversation, l'IA peut distinguer chaque participant et répondre de manière appropriée

Cette fonctionnalité rend les conversations encore plus naturelles et personnalisées.

## Suppression de messages

Pour nettoyer vos conversations, utilisez la commande `+clear [nombre]` :

```
+clear 10
```

Cette commande va :
1. Rechercher vos messages dans le canal actuel
2. Supprimer le nombre spécifié de messages (10 dans cet exemple)
3. Afficher une confirmation avec le nombre de messages effectivement supprimés

La commande ne supprime que vos propres messages, pas ceux des autres utilisateurs.

## Personnalisation

Vous pouvez modifier les paramètres suivants dans `config.json`:
- `prefix`: Changer le préfixe de commande (par défaut: "+")
- `model`: Changer le modèle Together AI utilisé

## Exemple

```
+ai Raconte-moi une histoire courte sur un robot qui devient conscient
```

L'IA répondra directement dans votre conversation Discord. 