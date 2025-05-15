const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');
const fs = require('fs');
const chalk = require('chalk');
const config = require('./config.json');

// Après les imports existants, ajoutons une structure pour stocker les conversations et les messages de l'IA
const conversations = {};
// Stockage des IDs de messages envoyés par l'IA pour reconnaître les réponses
const aiMessageIds = new Set();
// Stockage des pseudos par utilisateur
const userNicknames = {};

// Fonction pour mettre à jour le cache des utilisateurs
function updateUserCache(user) {
    if (!user || !user.id) return;
    
    // Ne pas mettre en cache le selfbot lui-même
    if (client.user && user.id === client.user.id) return;
    
    // Mettre à jour l'utilisateur uniquement s'il n'est pas déjà dans le cache
    // ou si les informations ont changé
    const username = user.displayName || user.username || `user_${user.id}`;
    if (!userNicknames[user.id] || userNicknames[user.id] !== username) {
        userNicknames[user.id] = username;
    }
}

// Afficher le banner de démarrage
console.log('\n');
console.log(chalk.cyan('══════════════════════════════════════════════════════════'));
console.log(chalk.cyan('║                                                        ║'));
console.log(chalk.cyan('║  ') + chalk.bold.white('Discord Selfbot with Together AI') + chalk.cyan('                      ║'));
console.log(chalk.cyan('║  ') + chalk.gray('v1.0.0') + chalk.cyan('                                                ║'));
console.log(chalk.cyan('║                                                        ║'));
console.log(chalk.cyan('══════════════════════════════════════════════════════════'));
console.log(chalk.cyan('║  ') + chalk.yellow('Modèle: ') + chalk.white(config.model) + chalk.cyan('  ║'));
console.log(chalk.cyan('║  ') + chalk.yellow('Préfixe: ') + chalk.white(config.prefix) + chalk.cyan('                                            ║'));
console.log(chalk.cyan('══════════════════════════════════════════════════════════\n'));

// Patch pour l'erreur friend_source_flags
// Monkey patch la méthode qui cause l'erreur
try {
  const ClientUserSettingManager = require('discord.js-selfbot-v13/src/managers/ClientUserSettingManager');
  const originalPatch = ClientUserSettingManager.prototype._patch;
  
  ClientUserSettingManager.prototype._patch = function(data) {
    try {
      // Si friend_source_flags est null, on crée un objet vide
      if (data && data.friend_source_flags === null) {
        data.friend_source_flags = { all: false };
      }
      return originalPatch.call(this, data);
    } catch (error) {
      console.warn(chalk.yellow('[AVERTISSEMENT] Erreur ignorée dans ClientUserSettingManager:'), error.message);
      return this;
    }
  };
  console.log(chalk.green('Patch ClientUserSettingManager appliqué'));
} catch (error) {
  console.warn(chalk.yellow('Impossible d\'appliquer le patch:'), error);
}

// Initialisation du client Discord avec options avancées
const client = new Client({
    checkUpdate: false,
    patchVoice: false,
    syncStatus: false,
    captchaService: null,
    // Ces options aident à éviter d'autres erreurs
    partials: ['CHANNEL', 'MESSAGE'],
    intents: [],
    // Désactive certaines fonctionnalités problématiques
    readyStatus: false,
    DMSync: false,
    userAgentOverride: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    // Options de connexion pour éviter les détections
    ws: {
        properties: {
            browser: 'Chrome',
            browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            os: 'Windows',
            device: '',
        }
    }
});

// Ajout d'un gestionnaire d'erreur global
client.on('error', (error) => {
    console.error(chalk.red('Erreur client Discord:'), error);
});

client.on('ready', () => {
    console.log(chalk.green(`Connecté en tant que ${client.user.tag}`));
    console.log(chalk.blue('Selfbot Together AI actif'));
    console.log(chalk.yellow(`Commande: ${config.prefix}ai [prompt]`));
});

// Fonction pour appeler l'API Together AI avec mémoire de conversation
async function callTogetherAI(prompt, channelId, context = null, authorInfo = null, mentionedUsers = null) {
    try {
        // Récupérer ou initialiser la conversation pour ce canal
        if (!conversations[channelId]) {
            conversations[channelId] = [
                { role: "system", content: "Tu es un assistant IA utile et convivial. Dans cette conversation, différentes personnes peuvent participer. Pour chaque message humain, tu auras des informations sur la personne qui parle sous forme 'AUTEUR: [pseudo]'. Tu peux mentionner des utilisateurs en utilisant la syntaxe @nom_utilisateur. Adapte ton message pour répondre directement à cette personne quand c'est approprié." }
            ];
        }
        
        // Si un contexte est fourni, l'ajouter au prompt
        let finalPrompt = prompt;
        if (context) {
            finalPrompt = `En réponse à: "${context}"\n\nMa question ou commentaire: ${prompt}`;
            console.log(chalk.cyan(`Ajout du contexte au prompt: "${context.substring(0, 30)}..."`));
        }
        
        // Ajouter les informations sur l'auteur si disponibles
        if (authorInfo) {
            // Stocker le pseudo de l'utilisateur pour les futures références
            if (authorInfo.id && authorInfo.username) {
                const displayName = authorInfo.displayName || authorInfo.username;
                userNicknames[authorInfo.id] = displayName;
                console.log(chalk.cyan(`Utilisateur mis en cache: ${displayName} (${authorInfo.id})`));
            }
            
            const authorName = authorInfo.displayName || authorInfo.username || "Utilisateur";
            finalPrompt = `AUTEUR: ${authorName}\n\n${finalPrompt}`;
            console.log(chalk.cyan(`Ajout des informations d'auteur: ${authorName}`));
        } else {
            finalPrompt = `AUTEUR: Utilisateur\n\n${finalPrompt}`;
        }
        
        // Si des utilisateurs sont mentionnés, ajouter cette information
        if (mentionedUsers && mentionedUsers.length > 0) {
            // Mettre à jour notre cache d'utilisateurs avec les utilisateurs mentionnés
            mentionedUsers.forEach(user => {
                if (user.id && (user.username || user.displayName)) {
                    const displayName = user.displayName || user.username;
                    userNicknames[user.id] = displayName;
                }
            });
            
            const mentionsText = mentionedUsers.map(user => {
                const displayName = user.displayName || user.username || user.id;
                return `@${displayName}`;
            }).join(', ');
            
            finalPrompt = `${finalPrompt}\n\nUTILISATEURS MENTIONNÉS: ${mentionsText}`;
            console.log(chalk.cyan(`Utilisateurs mentionnés: ${mentionsText}`));
        }
        
        // Ajouter le nouveau message à l'historique
        conversations[channelId].push({ role: "user", content: finalPrompt });
        
        console.log(chalk.cyan(`Envoi du prompt à Together AI: "${finalPrompt.substring(0, 30)}${finalPrompt.length > 30 ? '...' : ''}"`));
        console.log(chalk.blue(`Modèle utilisé: ${config.model}`));
        console.log(chalk.gray(`Historique: ${conversations[channelId].length} messages`));
        
        const response = await axios({
            method: 'POST',
            url: 'https://api.together.xyz/v1/chat/completions',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.together_ai_api_key}`
            },
            data: {
                model: config.model,
                messages: conversations[channelId],
                max_tokens: 1024,
                temperature: 0.7,
                top_p: 0.9,
                top_k: 40,
                repetition_penalty: 1.1
            }
        });

        console.log(chalk.green('Réponse reçue de Together AI'));
        
        // Format de réponse pour l'API chat/completions
        if (response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
            const content = response.data.choices[0].message.content.trim();
            console.log(chalk.gray(`Réponse (premiers caractères): ${content.substring(0, 30)}...`));
            
            // Ajouter la réponse à l'historique de la conversation
            conversations[channelId].push({ role: "assistant", content: content });
            
            // Limiter la taille de l'historique pour éviter d'atteindre les limites de tokens
            if (conversations[channelId].length > 10) {
                // Garder le message système et les 9 derniers messages
                const systemMessage = conversations[channelId][0];
                conversations[channelId] = [
                    systemMessage,
                    ...conversations[channelId].slice(-9)
                ];
            }
            
            return content;
        }
        
        // Fallback pour l'ancien format de l'API
        if (response.data.choices && response.data.choices[0] && response.data.choices[0].text) {
            const content = response.data.choices[0].text.trim();
            console.log(chalk.gray(`Réponse (premiers caractères): ${content.substring(0, 30)}...`));
            
            // Ajouter la réponse à l'historique
            conversations[channelId].push({ role: "assistant", content: content });
            
            return content;
        }
        
        console.error(chalk.red('Format de réponse inattendu:'), JSON.stringify(response.data).substring(0, 500));
        return 'Erreur: Format de réponse inattendu de l\'API Together AI.';
    } catch (error) {
        console.error(chalk.red('Erreur lors de l\'appel à Together AI:'), error.message);
        if (error.response) {
            console.error(chalk.red('Détails de l\'erreur:'), JSON.stringify(error.response.data).substring(0, 500));
        }
        return `Erreur lors de la communication avec l'API Together AI: ${error.message}`;
    }
}

// Fonction pour récupérer le contenu d'un message
async function getMessageContent(channelId, messageId) {
    try {
        const response = await axios({
            method: 'GET',
            url: `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}`,
            headers: {
                'Authorization': config.discord_token
            }
        });
        
        return response.data.content;
    } catch (error) {
        console.error(chalk.red('Erreur lors de la récupération du message:'), error.message);
        return null;
    }
}

// Fonction pour récupérer les détails d'un message (pour le mode alternatif)
async function getMessageDetails(channelId, messageId) {
    try {
        const response = await axios({
            method: 'GET',
            url: `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}`,
            headers: {
                'Authorization': config.discord_token
            }
        });
        
        return response.data;
    } catch (error) {
        console.error(chalk.red('Erreur lors de la récupération des détails du message:'), error.message);
        return null;
    }
}

// Fonction pour récupérer plusieurs messages d'un canal
async function getMessages(channelId, before = null, limit = 100) {
    try {
        // Construire l'URL avec les paramètres
        let url = `https://discord.com/api/v9/channels/${channelId}/messages?limit=${limit}`;
        if (before) {
            url += `&before=${before}`;
        }
        
        const response = await axios({
            method: 'GET',
            url: url,
            headers: {
                'Authorization': config.discord_token
            }
        });
        
        return response.data;
    } catch (error) {
        console.error(chalk.red('Erreur lors de la récupération des messages:'), error.message);
        return [];
    }
}

// Fonction pour extraire les mentions d'utilisateurs d'un message Discord
function extractUserMentions(message) {
    const mentionedUsers = [];
    
    // Vérifier si le message a des mentions
    if (!message || !message.content) return mentionedUsers;
    
    // Regex pour capturer les mentions d'utilisateurs: <@ID> ou <@!ID>
    const mentionRegex = /<@!?(\d+)>/g;
    let match;
    
    // Trouver toutes les mentions dans le message
    while ((match = mentionRegex.exec(message.content)) !== null) {
        const userId = match[1];
        
        // Si nous avons accès aux objets utilisateurs via le client Discord
        if (client.users && client.users.cache) {
            const user = client.users.cache.get(userId);
            if (user) {
                const displayName = message.guild?.members.cache.get(userId)?.displayName || user.username;
                
                // Mettre à jour le cache utilisateur
                updateUserCache({
                    id: userId,
                    username: user.username,
                    displayName: displayName
                });
                
                mentionedUsers.push({
                    id: userId,
                    username: user.username,
                    displayName: displayName
                });
                continue;
            }
        }
        
        // Fallback: si l'utilisateur est déjà connu dans notre cache local
        if (userNicknames[userId]) {
            mentionedUsers.push({
                id: userId,
                username: userNicknames[userId],
                displayName: userNicknames[userId]
            });
            continue;
        }
        
        // Si l'utilisateur mentionné est dans les mentions du message
        if (message.mentions && message.mentions.users) {
            const mentionedUser = message.mentions.users.get(userId);
            if (mentionedUser) {
                const displayName = message.guild?.members.cache.get(userId)?.displayName || mentionedUser.username;
                
                // Mettre à jour le cache utilisateur
                updateUserCache({
                    id: userId,
                    username: mentionedUser.username,
                    displayName: displayName
                });
                
                mentionedUsers.push({
                    id: userId,
                    username: mentionedUser.username,
                    displayName: displayName
                });
                continue;
            }
        }
        
        // Si nous ne pouvons pas résoudre l'utilisateur, ajoutons juste l'ID
        mentionedUsers.push({
            id: userId
        });
    }
    
    return mentionedUsers;
}

// Fonction pour convertir les mentions Discord en format lisible pour l'IA
function formatMentionsForAI(content, mentionedUsers) {
    if (!content || !mentionedUsers || mentionedUsers.length === 0) return content;
    
    let formattedContent = content;
    
    // Remplacer les mentions <@ID> par @username
    mentionedUsers.forEach(user => {
        const username = user.displayName || user.username || `utilisateur_${user.id}`;
        const mentionRegex = new RegExp(`<@!?${user.id}>`, 'g');
        formattedContent = formattedContent.replace(mentionRegex, `@${username}`);
    });
    
    return formattedContent;
}

// Fonction pour convertir les @mentions du texte en mentions Discord <@ID>
function formatMentionsForDiscord(content, channelId) {
    if (!content) return content;
    
    let formattedContent = content;
    
    // Rechercher les mentions au format @username
    const mentionRegex = /@([a-zA-Z0-9_][a-zA-Z0-9_\s-]*[a-zA-Z0-9_])/g;
    const mentions = content.match(mentionRegex);
    
    if (mentions && mentions.length > 0) {
        // Obtenir les utilisateurs impliqués dans la conversation actuelle
        const channelParticipants = {};
        
        // Si nous avons une conversation dans ce canal, regardons quels utilisateurs y ont participé
        if (conversations[channelId] && conversations[channelId].length > 0) {
            conversations[channelId].forEach(msg => {
                // Chercher des identifiants dans le contenu comme "AUTEUR: [pseudo]"
                const authorMatch = msg.content.match(/AUTEUR: ([^\n]+)/);
                if (authorMatch && authorMatch[1]) {
                    const authorName = authorMatch[1].trim();
                    
                    // Vérifier si cet auteur est associé à un ID connu
                    for (const [userId, nickname] of Object.entries(userNicknames)) {
                        if (nickname === authorName) {
                            channelParticipants[authorName.toLowerCase()] = userId;
                            break;
                        }
                    }
                }
            });
        }
        
        // Traiter chaque mention trouvée
        mentions.forEach(mention => {
            const username = mention.substring(1).trim(); // Enlever le @ du début
            
            // D'abord essayer de trouver l'utilisateur par correspondance exacte dans notre cache
            let userId = null;
            
            // Chercher parmi les participants récents du canal (plus probable)
            if (channelParticipants[username.toLowerCase()]) {
                userId = channelParticipants[username.toLowerCase()];
            }
            // Sinon chercher dans le cache global
            else {
                for (const [id, nickname] of Object.entries(userNicknames)) {
                    if (nickname.toLowerCase() === username.toLowerCase()) {
                        userId = id;
                        break;
                    }
                }
            }
            
            // Si on a trouvé l'ID, faire le remplacement directement avec le format <@userID>
            if (userId) {
                formattedContent = formattedContent.replace(
                    new RegExp(`@${username}\\b`, 'g'), 
                    `<@${userId}>`
                );
                console.log(chalk.gray(`Mention convertie: @${username} -> <@${userId}>`));
            }
        });
    }
    return formattedContent;
}

// Fonction pour extraire les mentions d'utilisateurs pour la méthode alternative
function extractUserMentionsAlternative(message) {
    const mentionedUsers = [];
    
    // Vérifier si le message a des mentions
    if (!message || !message.content) return mentionedUsers;
    
    // Regex pour capturer les mentions d'utilisateurs: <@ID> ou <@!ID>
    const mentionRegex = /<@!?(\d+)>/g;
    let match;
    
    // Trouver toutes les mentions dans le message
    while ((match = mentionRegex.exec(message.content)) !== null) {
        const userId = match[1];
        
        // Fallback: si l'utilisateur est déjà connu dans notre cache local
        if (userNicknames[userId]) {
            mentionedUsers.push({
                id: userId,
                username: userNicknames[userId]
            });
            continue;
        }
        
        // Si nous ne pouvons pas résoudre l'utilisateur, ajoutons juste l'ID
        mentionedUsers.push({
            id: userId
        });
    }
    
    return mentionedUsers;
}

// Gestionnaire de messages
client.on('messageCreate', async (message) => {
    // Mettre à jour le cache uniquement avec l'auteur du message si c'est une réponse à l'IA
    if (message.reference && message.reference.messageId && aiMessageIds.has(message.reference.messageId)) {
        if (message.author) {
            updateUserCache({
                id: message.author.id,
                username: message.author.username,
                displayName: message.member?.displayName || message.author.username
            });
        }
    }

    // Traiter les réponses aux messages de l'IA (de n'importe quel utilisateur)
    if (message.reference && message.reference.messageId) {
        try {
            // Récupérer le message auquel l'utilisateur répond
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            
            // Vérifier si le message est une réponse à un message de l'IA
            if (aiMessageIds.has(message.reference.messageId)) {
                console.log(chalk.blue(`Réponse détectée à un message de l'IA par ${message.author.tag || 'utilisateur inconnu'}`));
                
                // Extraire le contenu du message
                const prompt = message.content.trim();
                
                if (!prompt) return; // Ignorer les réponses vides
                
                // Préparer les infos sur l'auteur du message
                const authorInfo = {
                    id: message.author.id,
                    username: message.author.username,
                    displayName: message.member?.displayName || message.author.username,
                    isBot: message.author.bot
                };
                
                // Extraire les mentions d'utilisateurs
                const mentionedUsers = extractUserMentions(message);
                
                // Formater le prompt avec les mentions lisibles
                const formattedPrompt = formatMentionsForAI(prompt, mentionedUsers);
                
                try {
                    // Indiquer que le bot traite la demande
                    const typingMessage = await message.channel.send('*Réflexion en cours...*');
                    
                    // Simuler l'écriture pour une expérience plus naturelle
                    message.channel.sendTyping().catch(() => {});
                    
                    // Appeler l'API Together AI avec l'ID du canal pour la mémoire
                    const aiResponse = await callTogetherAI(formattedPrompt, message.channel.id, repliedMessage.content, authorInfo, mentionedUsers);
                    
                    // Supprimer le message de traitement
                    typingMessage.delete().catch(err => console.error(chalk.red('Erreur lors de la suppression du message:'), err));
                    
                    // Convertir les @mentions en mentions Discord
                    const formattedResponse = formatMentionsForDiscord(aiResponse, message.channel.id);
                    
                    // Envoyer la réponse et garder une référence à l'ID du message
                    let sentMessage;
                    if (formattedResponse.length <= 2000) {
                        console.log(chalk.green('Envoi de la réponse (message unique)'));
                        sentMessage = await message.channel.send(formattedResponse);
                        // Enregistrer l'ID du message de l'IA
                        aiMessageIds.add(sentMessage.id);
                    } else {
                        // Découper la réponse si elle dépasse la limite de caractères Discord
                        console.log(chalk.green(`Envoi de la réponse (${Math.ceil(formattedResponse.length / 2000)} messages)`));
                        for (let i = 0; i < formattedResponse.length; i += 2000) {
                            const chunk = formattedResponse.substring(i, Math.min(formattedResponse.length, i + 2000));
                            sentMessage = await message.channel.send(chunk);
                            
                            // Enregistrer l'ID du message de l'IA (uniquement le dernier message)
                            if (i + 2000 >= formattedResponse.length) {
                                aiMessageIds.add(sentMessage.id);
                            }
                            
                            // Petite pause entre les messages pour éviter le rate limiting
                            if (i + 2000 < formattedResponse.length) {
                                await new Promise(resolve => setTimeout(resolve, 800));
                            }
                        }
                    }
                } catch (error) {
                    console.error(chalk.red('Erreur lors du traitement de la réponse:'), error);
                    message.channel.send('Une erreur est survenue lors du traitement de votre message.');
                }
                
                return; // Arrêter le traitement
            }
            // Si l'utilisateur répond à un message normal (non IA), mais en commençant par +ai
            else if (message.author.id === client.user.id && message.content.startsWith(`${config.prefix}ai`)) {
                console.log(chalk.blue(`Commande IA avec contexte détecté`));
                
                // Extraire le prompt (sans le préfixe ai)
                const prompt = message.content.slice(`${config.prefix}ai`.length).trim();
                
                if (!prompt) {
                    message.channel.send('Veuillez fournir un prompt après +ai');
                    return;
                }
                
                console.log(chalk.magenta(`Demande d'IA avec contexte: "${repliedMessage.content.substring(0, 30)}..."`));
                
                // Informations sur l'auteur du message original pour donner du contexte
                const originalAuthorInfo = {
                    id: repliedMessage.author.id,
                    username: repliedMessage.author.username,
                    displayName: repliedMessage.member?.displayName || repliedMessage.author.username,
                    isBot: repliedMessage.author.bot,
                    isOriginalAuthor: true
                };
                
                // Informations sur vous-même (l'utilisateur du selfbot)
                const selfAuthorInfo = {
                    id: client.user.id,
                    username: client.user.username,
                    displayName: message.member?.displayName || client.user.username
                };
                
                // Extraire les mentions d'utilisateurs du message
                const mentionedUsers = extractUserMentions(message);
                
                // Extraire les mentions d'utilisateurs du message original
                const originalMentionedUsers = extractUserMentions(repliedMessage);
                
                // Fusionner les deux listes d'utilisateurs mentionnés (en évitant les doublons)
                const allMentionedUsers = [...mentionedUsers];
                for (const user of originalMentionedUsers) {
                    if (!allMentionedUsers.some(u => u.id === user.id)) {
                        allMentionedUsers.push(user);
                    }
                }
                
                // Formater le prompt avec les mentions lisibles
                const formattedPrompt = formatMentionsForAI(prompt, allMentionedUsers);
                
                try {
                    // Indiquer que le bot traite la demande
                    const typingMessage = await message.channel.send('*Réflexion en cours...*');
                    
                    // Simuler l'écriture pour une expérience plus naturelle
                    message.channel.sendTyping().catch(() => {});
                    
                    // Créer un prompt enrichi qui inclut les informations sur les deux auteurs
                    const originalContent = formatMentionsForAI(repliedMessage.content, originalMentionedUsers);
                    const enrichedContext = `Message de ${originalAuthorInfo.displayName}: "${originalContent}"`;
                    
                    // Appeler l'API Together AI avec contexte du message répondu
                    const aiResponse = await callTogetherAI(formattedPrompt, message.channel.id, enrichedContext, selfAuthorInfo, allMentionedUsers);
                    
                    // Supprimer le message de traitement
                    typingMessage.delete().catch(err => console.error(chalk.red('Erreur lors de la suppression du message:'), err));
                    
                    // Convertir les @mentions en mentions Discord
                    const formattedResponse = formatMentionsForDiscord(aiResponse, message.channel.id);
                    
                    // Envoyer la réponse et garder une référence à l'ID du message
                    let sentMessage;
                    if (formattedResponse.length <= 2000) {
                        console.log(chalk.green('Envoi de la réponse (message unique)'));
                        sentMessage = await message.channel.send(formattedResponse);
                        // Enregistrer l'ID du message de l'IA
                        aiMessageIds.add(sentMessage.id);
                    } else {
                        // Découper la réponse si elle dépasse la limite de caractères Discord
                        console.log(chalk.green(`Envoi de la réponse (${Math.ceil(formattedResponse.length / 2000)} messages)`));
                        for (let i = 0; i < formattedResponse.length; i += 2000) {
                            const chunk = formattedResponse.substring(i, Math.min(formattedResponse.length, i + 2000));
                            sentMessage = await message.channel.send(chunk);
                            
                            // Enregistrer l'ID du message de l'IA (uniquement le dernier message)
                            if (i + 2000 >= formattedResponse.length) {
                                aiMessageIds.add(sentMessage.id);
                            }
                            
                            // Petite pause entre les messages pour éviter le rate limiting
                            if (i + 2000 < formattedResponse.length) {
                                await new Promise(resolve => setTimeout(resolve, 800));
                            }
                        }
                    }
                } catch (error) {
                    console.error(chalk.red('Erreur lors du traitement de la commande:'), error);
                    message.channel.send('Une erreur est survenue lors du traitement de votre demande.');
                }
                
                return; // Arrêter le traitement
            }
        } catch (error) {
            console.error(chalk.red('Erreur lors de la récupération du message référencé:'), error);
            // Continuer le traitement normal
        }
    }
    
    // Ignorer les messages des autres utilisateurs (pour les commandes directes)
    if (message.author.id !== client.user.id) return;

    // Vérifier le préfixe pour les commandes directes
    if (!message.content.startsWith(config.prefix)) return;

    // Extraire la commande et les arguments
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Commande d'IA
    if (command === 'ai') {
        const prompt = args.join(' ').trim();
        
        if (!prompt) {
            console.log(chalk.yellow('Prompt vide, demande d\'exemple envoyée'));
            message.channel.send('Veuillez fournir un prompt. Exemple: `+ai Raconte-moi une histoire`');
            return;
        }

        console.log(chalk.magenta(`Demande d'IA reçue dans #${message.channel.name || 'canal privé'}`));
        
        // Préparer les infos sur l'auteur du message (vous-même)
        const authorInfo = {
            id: client.user.id,
            username: client.user.username,
            displayName: message.member?.displayName || client.user.username
        };
        
        // Extraire les mentions d'utilisateurs
        const mentionedUsers = extractUserMentions(message);
        
        // Formater le prompt avec les mentions lisibles
        const formattedPrompt = formatMentionsForAI(prompt, mentionedUsers);

        try {
            // Indiquer que le bot traite la demande
            const typingMessage = await message.channel.send('*Réflexion en cours...*');
            
            // Simuler l'écriture pour une expérience plus naturelle
            message.channel.sendTyping().catch(() => {});
            
            // Appeler l'API Together AI avec l'ID du canal pour la mémoire
            const aiResponse = await callTogetherAI(formattedPrompt, message.channel.id, null, authorInfo, mentionedUsers);
            
            // Supprimer le message de traitement
            typingMessage.delete().catch(err => console.error(chalk.red('Erreur lors de la suppression du message:'), err));
            
            // Convertir les @mentions en mentions Discord
            const formattedResponse = formatMentionsForDiscord(aiResponse, message.channel.id);
            
            // Envoyer la réponse
            let sentMessage;
            if (formattedResponse.length <= 2000) {
                console.log(chalk.green('Envoi de la réponse (message unique)'));
                sentMessage = await message.channel.send(formattedResponse);
                // Enregistrer l'ID du message de l'IA
                aiMessageIds.add(sentMessage.id);
            } else {
                // Découper la réponse si elle dépasse la limite de caractères Discord
                console.log(chalk.green(`Envoi de la réponse (${Math.ceil(formattedResponse.length / 2000)} messages)`));
                for (let i = 0; i < formattedResponse.length; i += 2000) {
                    const chunk = formattedResponse.substring(i, Math.min(formattedResponse.length, i + 2000));
                    sentMessage = await message.channel.send(chunk);
                    
                    // Enregistrer l'ID du message de l'IA (uniquement le dernier message)
                    if (i + 2000 >= formattedResponse.length) {
                        aiMessageIds.add(sentMessage.id);
                    }
                    
                    // Petite pause entre les messages pour éviter le rate limiting
                    if (i + 2000 < formattedResponse.length) {
                        await new Promise(resolve => setTimeout(resolve, 800));
                    }
                }
            }
        } catch (error) {
            console.error(chalk.red('Erreur lors du traitement de la commande:'), error);
            message.channel.send('Une erreur est survenue lors du traitement de votre demande.');
        }
    }
    // Commande pour réinitialiser la mémoire
    else if (command === 'reset') {
        // Réinitialiser la conversation pour ce canal
        if (conversations[message.channel.id]) {
            conversations[message.channel.id] = [
                { role: "system", content: "Tu es un assistant IA utile et convivial." }
            ];
            console.log(chalk.yellow(`Mémoire réinitialisée pour le canal #${message.channel.name || 'privé'}`));
            message.channel.send('🔄 Mémoire de conversation réinitialisée.');
        } else {
            message.channel.send('Aucune conversation active dans ce canal.');
        }
    }
    // Commande pour afficher l'état de la mémoire
    else if (command === 'memory') {
        const channelId = message.channel.id;
        if (conversations[channelId]) {
            const nbMessages = conversations[channelId].length;
            const lastMessages = conversations[channelId]
                .slice(-3) // Montrer les 3 derniers messages seulement
                .map(msg => `**${msg.role}**: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`)
                .join('\n\n');
            
            message.channel.send(`📝 **État de la mémoire**\nMessages dans la conversation: ${nbMessages}\n\n**Derniers messages:**\n${lastMessages}`);
        } else {
            message.channel.send('Aucune conversation active dans ce canal.');
        }
    }

    // Commandes réservées à l'utilisateur du selfbot
    if (message.author.id === client.user.id && message.content.startsWith(config.prefix)) {
        // Extraire la commande et les arguments
        const args = message.content.slice(config.prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // Commande pour supprimer les messages
        if (command === 'clear') {
            // Obtenir le nombre de messages à supprimer
            const amount = parseInt(args[0]);

            // Vérifier que le nombre est valide
            if (isNaN(amount) || amount <= 0) {
                message.channel.send('Veuillez spécifier un nombre valide de messages à supprimer. Exemple: `+clear 10`');
                return;
            }

            try {
                // Message de confirmation
                const confirmMsg = await message.channel.send(`Suppression de ${amount} de vos messages en cours...`);
                
                // Compteur de messages supprimés
                let deletedCount = 0;
                let lastId = null;
                
                // Boucle pour récupérer les messages par lots (Discord limite à 100 messages par requête)
                while (deletedCount < amount) {
                    // Options pour la récupération des messages
                    const options = { limit: 100 };
                    if (lastId) options.before = lastId;
                    
                    // Récupérer les messages
                    const messages = await message.channel.messages.fetch(options);
                    if (messages.size === 0) break; // Plus de messages à récupérer
                    
                    // Conserver l'ID du dernier message pour la pagination
                    lastId = messages.last().id;
                    
                    // Filtrer pour ne garder que les messages de l'utilisateur
                    const userMessages = messages.filter(m => m.author.id === client.user.id);
                    if (userMessages.size === 0) continue; // Aucun message de l'utilisateur dans ce lot
                    
                    console.log(chalk.yellow(`Trouvé ${userMessages.size} messages de l'utilisateur`));
                    
                    // Supprimer les messages un par un (limitation de l'API Discord pour les selfbots)
                    for (const [id, msg] of userMessages) {
                        if (deletedCount >= amount) break;
                        
                        try {
                            await msg.delete();
                            deletedCount++;
                            
                            // Petite pause pour éviter le rate limiting
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                            // Mettre à jour le message de confirmation tous les 5 messages
                            if (deletedCount % 5 === 0) {
                                confirmMsg.edit(`Suppression en cours... ${deletedCount}/${amount} messages supprimés.`).catch(() => {});
                            }
                        } catch (error) {
                            console.error(chalk.red(`Erreur lors de la suppression du message ${id}:`), error.message);
                            // Continuer avec le message suivant
                        }
                    }
                }
                
                // Message final de confirmation
                if (deletedCount > 0) {
                    confirmMsg.edit(`✅ ${deletedCount} message${deletedCount > 1 ? 's' : ''} supprimé${deletedCount > 1 ? 's' : ''} avec succès.`).catch(() => {});
                    
                    // Supprimer le message de confirmation après 5 secondes
                    setTimeout(() => {
                        confirmMsg.delete().catch(() => {});
                    }, 5000);
                } else {
                    confirmMsg.edit('❌ Aucun message à supprimer trouvé.').catch(() => {});
                }
            } catch (error) {
                console.error(chalk.red('Erreur lors de la suppression des messages:'), error);
                message.channel.send('Une erreur est survenue lors de la suppression des messages.');
            }
            
            return;
        }
    }
});

// Connexion au compte Discord avec gestion d'erreur améliorée
console.log(chalk.blue('Tentative de connexion à Discord...'));

// Méthode principale de connexion
client.login(config.discord_token)
    .then(() => {
        console.log(chalk.green('Connecté avec succès à Discord'));
    })
    .catch(err => {
        console.error(chalk.red('Erreur de connexion à Discord:'), err.message);
        
        // Si l'erreur est due au token invalide
        if (err.message && err.message.includes('TOKEN_INVALID')) {
            console.log(chalk.red('Token invalide, veuillez vérifier votre token Discord'));
        } 
        // Si l'erreur est liée à friend_source_flags, essayez une méthode alternative
        else if (err.message && err.message.includes('friend_source_flags')) {
            console.log(chalk.yellow('Tentative de connexion alternative...'));
            
            // Méthode alternative de connexion (contournement direct)
            tryAlternativeLogin();
        } else {
            console.log(chalk.yellow('Tentative de connexion alternative...'));
            tryAlternativeLogin();
        }
    });

// Fonction de connexion alternative
function tryAlternativeLogin() {
    // Essayer d'utiliser directement la WebSocket API
    const { WebSocket } = require('ws');
    const { EventEmitter } = require('events');
    
    // Créer un émetteur d'événements pour gérer les messages
    const messageHandler = new EventEmitter();
    
    // Connexion au gateway Discord
    console.log(chalk.yellow('Connexion au gateway Discord...'));
    const ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');
    
    ws.on('open', () => {
        console.log(chalk.green('Connecté au gateway Discord'));
        
        // Identifie le client avec le token
        ws.send(JSON.stringify({
            op: 2, // Opcode 2: IDENTIFY
            d: {
                token: config.discord_token,
                properties: {
                    os: 'Windows',
                    browser: 'Chrome',
                    device: ''
                },
                presence: {
                    status: 'online',
                    afk: false
                }
            }
        }));
    });
    
    // Gestion des messages
    ws.on('message', (data) => {
        try {
            const payload = JSON.parse(data);
            
            // Traiter les différents types d'événements
            if (payload.op === 0) { // EVENT
                if (payload.t === 'READY') {
                    console.log(chalk.green(`Connecté en tant que ${payload.d.user.username}#${payload.d.user.discriminator}`));
                    console.log(chalk.blue('Selfbot Together AI actif en mode alternatif'));
                    console.log(chalk.yellow(`Commande: ${config.prefix}ai [prompt]`));
                }
                else if (payload.t === 'MESSAGE_CREATE') {
                    // Émettre l'événement pour le gestionnaire de messages
                    messageHandler.emit('message', payload.d);
                }
            } else if (payload.op === 10) { // HELLO
                // Maintenir la connexion active
                const { heartbeat_interval } = payload.d;
                setInterval(() => {
                    ws.send(JSON.stringify({ op: 1, d: null }));
                }, heartbeat_interval);
            }
        } catch (error) {
            console.error(chalk.red('Erreur lors du traitement du message:'), error);
        }
    });
    
    // Gestion des erreurs
    ws.on('error', (error) => {
        console.error(chalk.red('Erreur WebSocket:'), error);
    });
    
    ws.on('close', (code, reason) => {
        console.log(chalk.red(`Connexion fermée (${code}):`, reason.toString()));
    });
    
    // Gestionnaire simple pour les messages alternatif
    messageHandler.on('message', async (message) => {
        // Traiter les réponses aux messages de l'IA
        if (message.message_reference && message.message_reference.message_id) {
            // Vérifier si le message est une réponse à un message de l'IA
            if (aiMessageIds.has(message.message_reference.message_id)) {
                console.log(chalk.blue(`Réponse détectée à un message de l'IA par ${message.author.username || 'utilisateur inconnu'}`));
                
                // Extraire le contenu du message
                const prompt = message.content.trim();
                
                if (!prompt) return; // Ignorer les réponses vides
                
                // Préparer les infos sur l'auteur du message
                const authorInfo = {
                    id: message.author.id,
                    username: message.author.username,
                    displayName: message.author.username, // Pas d'accès aux displayName en mode alternatif
                    isBot: message.author.bot
                };
                
                try {
                    // Obtenir le contenu du message original
                    const originalMessageContent = await getMessageContent(message.channel_id, message.message_reference.message_id);
                    
                    // Extraire les mentions d'utilisateurs du message
                    const mentionedUsers = extractUserMentionsAlternative(message);
                    
                    // Formater le prompt avec les mentions lisibles
                    const formattedPrompt = formatMentionsForAI(prompt, mentionedUsers);
                    
                    // Indiquer que le bot traite la demande
                    const responseId = await sendMessage(message.channel_id, '*Réflexion en cours...*');
                    
                    // Appeler l'API Together AI avec ID du canal pour la mémoire et le contexte
                    const aiResponse = await callTogetherAI(formattedPrompt, message.channel_id, originalMessageContent, authorInfo, mentionedUsers);
                    
                    // Supprimer le message de traitement
                    deleteMessage(message.channel_id, responseId);
                    
                    // Convertir les @mentions en mentions Discord
                    const formattedResponse = formatMentionsForDiscord(aiResponse, message.channel_id);
                    
                    // Envoyer la réponse
                    let sentMessageId;
                    if (formattedResponse.length <= 2000) {
                        sentMessageId = await sendMessage(message.channel_id, formattedResponse);
                        // Enregistrer l'ID du message de l'IA
                        if (sentMessageId) aiMessageIds.add(sentMessageId);
                    } else {
                        // Découper la réponse si elle dépasse la limite de caractères Discord
                        for (let i = 0; i < formattedResponse.length; i += 2000) {
                            const chunk = formattedResponse.substring(i, Math.min(formattedResponse.length, i + 2000));
                            sentMessageId = await sendMessage(message.channel_id, chunk);
                            
                            // Enregistrer l'ID du message de l'IA (uniquement le dernier message)
                            if (i + 2000 >= formattedResponse.length && sentMessageId) {
                                aiMessageIds.add(sentMessageId);
                            }
                            
                            // Petite pause entre les messages
                            await new Promise(resolve => setTimeout(resolve, 800));
                        }
                    }
                } catch (error) {
                    console.error(chalk.red('Erreur lors du traitement de la réponse:'), error);
                    sendMessage(message.channel_id, 'Une erreur est survenue lors du traitement de votre message.');
                }
                
                return; // Arrêter le traitement
            }
            // Si l'utilisateur répond à un message normal avec +ai
            else if (message.author.id === message.application?.id && message.content.startsWith(`${config.prefix}ai`)) {
                console.log(chalk.blue(`Commande IA avec contexte détecté (mode alternatif)`));
                
                // Extraire le prompt (sans le préfixe ai)
                const prompt = message.content.slice(`${config.prefix}ai`.length).trim();
                
                if (!prompt) {
                    sendMessage(message.channel_id, 'Veuillez fournir un prompt après +ai');
                    return;
                }
                
                try {
                    // Obtenir le contenu du message original
                    const originalMessageContent = await getMessageContent(message.channel_id, message.message_reference.message_id);
                    console.log(chalk.magenta(`Demande d'IA avec contexte: "${originalMessageContent?.substring(0, 30) || ''}..."`));
                    
                    // Obtenir les informations sur l'auteur du message original
                    const originalMessage = await getMessageDetails(message.channel_id, message.message_reference.message_id);
                    
                    // Informations sur l'auteur du message original
                    const originalAuthorInfo = originalMessage ? {
                        id: originalMessage.author.id,
                        username: originalMessage.author.username,
                        displayName: originalMessage.author.username, // Pas d'accès aux displayName en mode alternatif
                        isBot: originalMessage.author.bot,
                        isOriginalAuthor: true
                    } : null;
                    
                    // Informations sur vous-même (l'utilisateur du selfbot)
                    const selfAuthorInfo = {
                        id: message.author.id,
                        username: message.author.username,
                        displayName: message.author.username // Pas d'accès aux displayName en mode alternatif
                    };
                    
                    // Extraire les mentions du message actuel
                    const mentionedUsers = extractUserMentionsAlternative(message);
                    
                    // Extraire les mentions du message original
                    const originalMentionedUsers = originalMessage ? 
                        extractUserMentionsAlternative({content: originalMessageContent}) : [];
                    
                    // Fusionner les deux listes d'utilisateurs mentionnés
                    const allMentionedUsers = [...mentionedUsers];
                    for (const user of originalMentionedUsers) {
                        if (!allMentionedUsers.some(u => u.id === user.id)) {
                            allMentionedUsers.push(user);
                        }
                    }
                    
                    // Formater le prompt avec les mentions lisibles
                    const formattedPrompt = formatMentionsForAI(prompt, allMentionedUsers);
                    
                    // Créer un prompt enrichi qui inclut les informations sur les deux auteurs
                    let enrichedContext = originalMessageContent || '';
                    if (originalAuthorInfo) {
                        const originalContentFormatted = formatMentionsForAI(originalMessageContent, originalMentionedUsers);
                        enrichedContext = `Message de ${originalAuthorInfo.username}: "${originalContentFormatted}"`;
                    }
                    
                    // Indiquer que le bot traite la demande
                    const responseId = await sendMessage(message.channel_id, '*Réflexion en cours...*');
                    
                    // Appeler l'API Together AI avec contexte
                    const aiResponse = await callTogetherAI(formattedPrompt, message.channel_id, enrichedContext, selfAuthorInfo, allMentionedUsers);
                    
                    // Supprimer le message de traitement
                    deleteMessage(message.channel_id, responseId);
                    
                    // Convertir les @mentions en mentions Discord
                    const formattedResponse = formatMentionsForDiscord(aiResponse, message.channel_id);
                    
                    // Envoyer la réponse
                    let sentMessageId;
                    if (formattedResponse.length <= 2000) {
                        sentMessageId = await sendMessage(message.channel_id, formattedResponse);
                        // Enregistrer l'ID du message de l'IA
                        if (sentMessageId) aiMessageIds.add(sentMessageId);
                    } else {
                        // Découper la réponse si elle dépasse la limite de caractères Discord
                        for (let i = 0; i < formattedResponse.length; i += 2000) {
                            const chunk = formattedResponse.substring(i, Math.min(formattedResponse.length, i + 2000));
                            sentMessageId = await sendMessage(message.channel_id, chunk);
                            
                            // Enregistrer l'ID du message de l'IA (uniquement le dernier message)
                            if (i + 2000 >= formattedResponse.length && sentMessageId) {
                                aiMessageIds.add(sentMessageId);
                            }
                            
                            // Petite pause entre les messages
                            await new Promise(resolve => setTimeout(resolve, 800));
                        }
                    }
                } catch (error) {
                    console.error(chalk.red('Erreur lors du traitement de la commande:'), error);
                    sendMessage(message.channel_id, 'Une erreur est survenue lors du traitement de votre demande.');
                }
                
                return; // Arrêter le traitement
            }
        }
        
        // Vérifier si c'est notre message et s'il commence par le préfixe
        if (message.author.id === message.application?.id && message.content.startsWith(config.prefix)) {
            // Extraire la commande et les arguments
            const args = message.content.slice(config.prefix.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            // Commande pour supprimer les messages
            if (command === 'clear') {
                // Obtenir le nombre de messages à supprimer
                const amount = parseInt(args[0]);

                // Vérifier que le nombre est valide
                if (isNaN(amount) || amount <= 0) {
                    sendMessage(message.channel_id, 'Veuillez spécifier un nombre valide de messages à supprimer. Exemple: `+clear 10`');
                    return;
                }

                try {
                    // Message de confirmation
                    const confirmMsgId = await sendMessage(message.channel_id, `Suppression de ${amount} de vos messages en cours...`);
                    
                    // Compteur de messages supprimés
                    let deletedCount = 0;
                    let lastMsgId = null;
            
                    // Boucle pour récupérer les messages par lots
                    while (deletedCount < amount) {
                        try {
                            // Récupérer les messages
                            const messages = await getMessages(message.channel_id, lastMsgId, 100);
                            if (!messages || messages.length === 0) break; // Plus de messages à récupérer
                            
                            // Conserver l'ID du dernier message pour la pagination
                            lastMsgId = messages[messages.length - 1].id;
                            
                            // Filtrer pour ne garder que les messages de l'utilisateur
                            const userMessages = messages.filter(m => m.author.id === message.author.id);
                            if (userMessages.length === 0) continue; // Aucun message de l'utilisateur dans ce lot
                            
                            console.log(chalk.yellow(`Trouvé ${userMessages.length} messages de l'utilisateur`));
                            
                            // Supprimer les messages un par un
                            for (const msg of userMessages) {
                                if (deletedCount >= amount) break;
                                
                                try {
                                    await deleteMessage(message.channel_id, msg.id);
                                    deletedCount++;
                                    
                                    // Petite pause pour éviter le rate limiting
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    
                                    // Mettre à jour le message de confirmation tous les 5 messages
                                    if (deletedCount % 5 === 0 && confirmMsgId) {
                                        sendMessage(message.channel_id, `Suppression en cours... ${deletedCount}/${amount} messages supprimés.`, confirmMsgId);
                                    }
                                } catch (error) {
                                    console.error(chalk.red(`Erreur lors de la suppression du message ${msg.id}:`), error.message);
                                    // Continuer avec le message suivant
                                }
                            }
                        } catch (error) {
                            console.error(chalk.red('Erreur lors de la récupération des messages:'), error.message);
                            break;
                        }
                    }
                    
                    // Message final de confirmation
                    if (deletedCount > 0) {
                        const finalMsg = `✅ ${deletedCount} message${deletedCount > 1 ? 's' : ''} supprimé${deletedCount > 1 ? 's' : ''} avec succès.`;
                        if (confirmMsgId) {
                            sendMessage(message.channel_id, finalMsg, confirmMsgId);
                            
                            // Supprimer le message de confirmation après 5 secondes
                            setTimeout(() => {
                                deleteMessage(message.channel_id, confirmMsgId);
                            }, 5000);
                        } else {
                            sendMessage(message.channel_id, finalMsg);
                        }
                    } else {
                        if (confirmMsgId) {
                            sendMessage(message.channel_id, '❌ Aucun message à supprimer trouvé.', confirmMsgId);
                        } else {
                            sendMessage(message.channel_id, '❌ Aucun message à supprimer trouvé.');
                        }
                    }
                } catch (error) {
                    console.error(chalk.red('Erreur lors de la suppression des messages:'), error);
                    sendMessage(message.channel_id, 'Une erreur est survenue lors de la suppression des messages.');
                }
                
                return;
            }
        }
    });
    
    // Fonction pour envoyer un message
    async function sendMessage(channelId, content) {
        try {
            const response = await axios({
                method: 'POST',
                url: `https://discord.com/api/v9/channels/${channelId}/messages`,
                headers: {
                    'Authorization': config.discord_token,
                    'Content-Type': 'application/json'
                },
                data: { content }
            });
            
            return response.data.id;
        } catch (error) {
            console.error(chalk.red('Erreur lors de l\'envoi du message:'), error.message);
            return null;
        }
    }

    // Fonction pour supprimer un message
    async function deleteMessage(channelId, messageId) {
        if (!messageId) return;
        
        try {
            await axios({
                method: 'DELETE',
                url: `https://discord.com/api/v9/channels/${channelId}/messages/${messageId}`,
                headers: {
                    'Authorization': config.discord_token
                }
            });
        } catch (error) {
            console.error(chalk.red('Erreur lors de la suppression du message:'), error.message);
        }
    }
}