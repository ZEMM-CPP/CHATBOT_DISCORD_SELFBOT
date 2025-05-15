const fs = require('fs');
const path = require('path');

// Chemins des fichiers à modifier
const files = [
  path.join(__dirname, 'node_modules', 'discord.js-selfbot-v13', 'src', 'managers', 'ClientUserSettingManager.js'),
  path.join(__dirname, 'node_modules', 'discord.js-selfbot-v13', 'src', 'client', 'websocket', 'handlers', 'READY.js')
];

// Vérifie et répare le fichier ClientUserSettingManager.js
function fixClientUserSettingManager() {
  const filePath = files[0];
  if (!fs.existsSync(filePath)) {
    console.error('Fichier ClientUserSettingManager.js non trouvé!');
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Remplacer toutes les occurrences de data.friend_source_flags par data.friend_source_flags || {}
  const safeContent = content.replace(/data\.friend_source_flags\./g, 'data.friend_source_flags?.');
  
  // Sauvegarder le fichier modifié
  fs.writeFileSync(filePath, safeContent, 'utf8');
  console.log('ClientUserSettingManager.js a été patché');
  return true;
}

// Vérifie et répare le fichier READY.js pour éviter l'initialisation de ClientUserSettingManager
function fixReadyHandler() {
  const filePath = files[1];
  if (!fs.existsSync(filePath)) {
    console.error('Fichier READY.js non trouvé!');
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Identifier la ligne qui utilise le UserSettingsManager
  const userSettingsLine = /client\.user\.settings\._patch\((?:.*?)\);/;
  
  // Si la ligne est trouvée, ajoutez une vérification conditionnelle
  if (userSettingsLine.test(content)) {
    const modifiedContent = content.replace(
      userSettingsLine,
      `// Patch pour éviter l'erreur friend_source_flags
try {
  if (data.user_settings && client.user.settings) {
    client.user.settings._patch(data.user_settings);
  }
} catch (err) {
  console.warn('Erreur ignorée dans user settings patch:', err.message);
}`
    );
    
    // Sauvegarder le fichier modifié
    fs.writeFileSync(filePath, modifiedContent, 'utf8');
    console.log('READY.js a été patché');
    return true;
  } else {
    console.log('Ligne client.user.settings._patch non trouvée dans READY.js');
    return false;
  }
}

// Exécution des correctifs
console.log('Application des correctifs pour discord.js-selfbot-v13...');
const fixed1 = fixClientUserSettingManager();
const fixed2 = fixReadyHandler();

if (fixed1 || fixed2) {
  console.log('Correctifs appliqués avec succès!');
  console.log('Redémarrez maintenant votre application avec: npm start');
} else {
  console.log('Aucun correctif n\'a pu être appliqué.');
} 